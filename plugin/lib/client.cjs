'use strict';
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { readInstances, selectInstance } = require('./state.cjs');

function request(instance, message, { signal, timeout = 610000 } = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(message);
    const req = http.request({ hostname: '127.0.0.1', port: instance.port, method: 'POST', path: '/rpc', signal,
      headers: { Authorization: `Bearer ${instance.token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      const chunks = [];
      let size = 0;
      res.on('data', chunk => {
        size += chunk.length;
        if (size > 16 * 1024 * 1024) { req.destroy(new Error('Bridge response exceeds 16 MiB.')); return; }
        chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => {
        try {
          const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (res.statusCode !== 200) throw new Error(value.error || `Bridge HTTP ${res.statusCode}`);
          resolve(value);
        } catch (error) { reject(error); }
      });
    });
    const timer = setTimeout(() => req.destroy(new Error('Bridge request timed out. Inspect the action outcome before retrying.')), timeout);
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
    req.end(body);
  });
}
class BridgeClient {
  constructor({ cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd(), directory, windowId = process.env.VS_CONTROL_WINDOW_ID } = {}) {
    this.cwd = cwd; this.directory = directory; this.windowId = windowId;
  }
  async windows() {
    const entries = await readInstances(this.directory);
    const live = await Promise.all(entries.map(async instance => {
      try { const health = await request(instance, { method: 'health' }, { timeout: 750 }); return health.id === instance.id ? instance : null; } catch { return null; }
    }));
    return live.filter(Boolean);
  }
  async instance() { return selectInstance(await this.windows(), this.cwd, this.windowId); }
  async select(id) {
    const instance = await selectInstance(await this.windows(), this.cwd, id);
    this.windowId = instance.id;
    return { id: instance.id, workspaces: instance.workspaces };
  }
  async list() { return (await request(await this.instance(), { method: 'tools/list' }, { timeout: 5000 })).tools; }
  async call(name, args, signal) {
    const instance = await this.instance();
    // Pin after the first actual IDE action: never silently move subsequent
    // mutations to a newly opened window of the same project.
    this.windowId = instance.id;
    return request(instance, { method: 'tools/call', id: randomUUID(), name, arguments: args }, { signal });
  }
}
module.exports = { BridgeClient, request };
