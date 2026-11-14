'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes, randomUUID, timingSafeEqual } = require('node:crypto');
const { stateDirectory } = require('../lib/state.cjs');
const MAX_REQUEST = 1024 * 1024;
const MAX_RESPONSE = 16 * 1024 * 1024;

async function startBridge(adapter, options = {}) {
  const directory = options.directory || stateDirectory();
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Bridge state directory must be a real directory.');
  if (process.platform !== 'win32') {
    if (stat.uid !== process.getuid()) throw new Error('Bridge state directory is owned by another user.');
    await fs.chmod(directory, 0o700);
  }
  const id = randomUUID();
  const token = randomBytes(32).toString('hex');
  const calls = new Map();
  let stopped = false;
  const server = http.createServer(async (req, res) => {
    const reply = (status, value) => {
      if (res.destroyed || res.writableEnded) return;
      let body = JSON.stringify(value);
      if (Buffer.byteLength(body) > MAX_RESPONSE) { status = 413; body = JSON.stringify({ error: 'Result exceeds 16 MiB. Narrow the request.' }); }
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(body);
    };
    // No CORS, no browser-origin requests, no DNS-rebinding Host aliases.
    if (req.headers.origin || req.headers.host !== `127.0.0.1:${server.address()?.port}`) return reply(403, { error: 'Forbidden origin or host.' });
    const auth = Buffer.from(req.headers.authorization || '');
    const expected = Buffer.from(`Bearer ${token}`);
    if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) return reply(401, { error: 'Unauthorized.' });
    if (stopped || !adapter.trusted()) return reply(403, { error: 'VS Control requires a trusted workspace.' });
    if (req.method !== 'POST' || req.url !== '/rpc') return reply(404, { error: 'Unknown endpoint.' });
    const chunks = [];
    let bytes = 0;
    try {
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > MAX_REQUEST) { reply(413, { error: 'Request too large.' }); req.resume(); return; }
        chunks.push(chunk);
      }
      const message = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (message.method === 'health') return reply(200, { id, version: 1 });
      if (message.method === 'cancel') { calls.get(message.id)?.abort(); return reply(200, { cancelled: true }); }
      if (message.method === 'tools/list') return reply(200, { tools: await adapter.list() });
      if (message.method !== 'tools/call' || typeof message.name !== 'string' || typeof message.id !== 'string') return reply(400, { error: 'Invalid bridge request.' });
      if (calls.has(message.id) || calls.size >= 32) return reply(429, { error: 'Too many calls or duplicate request ID.' });
      const controller = new AbortController();
      calls.set(message.id, controller);
      const disconnected = () => { if (!res.writableEnded) controller.abort(); };
      res.on('close', disconnected);
      const timeoutMs = adapter.timeoutMs();
      const timer = setTimeout(() => controller.abort(new Error(`Tool deadline exceeded (${timeoutMs} ms). Outcome may be incomplete; inspect before retrying.`)), timeoutMs);
      try {
        const cancelled = new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason || new Error('Cancelled; inspect outcome before retrying.')), { once: true }));
        const result = await Promise.race([adapter.call(message.name, message.arguments || {}, controller.signal), cancelled]);
        reply(200, result);
      } finally { clearTimeout(timer); res.off('close', disconnected); calls.delete(message.id); }
    } catch (error) { reply(200, { isError: true, content: [{ type: 'text', text: error.message || String(error) }] }); }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 1000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const descriptor = { version: 1, id, port: server.address().port, token, pid: process.pid, workspaces: options.workspaces || [], vscodeVersion: options.vscodeVersion };
  const file = path.join(directory, `${id}.json`);
  async function publish() {
    const temp = `${file}.tmp`;
    await fs.writeFile(temp, JSON.stringify(descriptor), { mode: 0o600 });
    await fs.rename(temp, file);
  }
  try { await publish(); } catch (error) { server.close(); throw error; }
  return {
    id, descriptor,
    async updateWorkspaces(workspaces) { descriptor.workspaces = workspaces; await publish(); },
    async stop() {
      if (stopped) return;
      stopped = true;
      for (const c of calls.values()) c.abort();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await fs.rm(file, { force: true });
    }
  };
}
module.exports = { startBridge };
