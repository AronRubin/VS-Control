#!/usr/bin/env node
'use strict';
const { createHash } = require('node:crypto');
const { BridgeClient } = require('./lib/client.cjs');
const { version } = require('./.claude-plugin/plugin.json');

const LOCAL = [
  { name: 'vscode_windows', description: 'List live VS Control windows and workspace paths. Does not reveal authentication tokens.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: 'vscode_select_window', description: 'Select the intended VS Code window by id from vscode_windows. Required when multiple windows match. Refresh tools after switching.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } },
  { name: 'vscode_connection', description: 'Diagnose the Claude Code to VS Code bridge connection, including when the companion extension is missing.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } }
];
const text = value => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });

function serve({ input = process.stdin, output = process.stdout, client = new BridgeClient() } = {}) {
  const active = new Map();
  let initialized = false;
  let fingerprint;
  let checking = false;
  let closed = false;
  let buffer = Buffer.alloc(0);
  const send = message => { if (!closed) output.write(`${JSON.stringify(message)}\n`); };
  async function list() { return [...LOCAL, ...await client.list().catch(() => [])]; }
  async function refresh() {
    if (!initialized || checking || closed) return;
    checking = true;
    try {
      const current = createHash('sha256').update(JSON.stringify(await list())).digest('hex');
      if (fingerprint !== current) { fingerprint = current; send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' }); }
    } finally { checking = false; }
  }
  async function dispatch(message) {
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      send({ jsonrpc: '2.0', id: message?.id ?? null, error: { code: -32600, message: 'Invalid JSON-RPC request.' } }); return;
    }
    if (!Object.hasOwn(message, 'id')) {
      if (message.method === 'notifications/initialized') { initialized = true; void refresh(); }
      if (message.method === 'notifications/cancelled') active.get(message.params?.requestId)?.abort();
      return;
    }
    const { id, method, params = {} } = message;
    const reply = result => send({ jsonrpc: '2.0', id, result });
    const error = (code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
    if (!(typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id)))) return error(-32600, 'Invalid request id.');
    if (active.has(id)) return error(-32600, 'Duplicate active request id.');
    if (active.size >= 32) return error(-32000, 'Too many active requests.');
    const controller = new AbortController();
    active.set(id, controller);
    try {
      if (method === 'initialize') {
        const supported = ['2024-11-05', '2025-03-26', '2025-06-18'];
        return reply({ protocolVersion: supported.includes(params.protocolVersion) ? params.protocolVersion : '2025-06-18', capabilities: { tools: { listChanged: true } }, serverInfo: { name: 'vs-control', version }, instructions: 'Use vscode_capabilities before IDE tasks. Prefer native VS Code browser tools for UI verification and native test tools for test execution. Use actual returned schemas and read outcomes before claiming success. If disconnected, use vscode_connection.' });
      }
      if (method === 'ping') return reply({});
      if (method === 'tools/list') {
        const tools = await list();
        fingerprint = createHash('sha256').update(JSON.stringify(tools)).digest('hex');
        return reply({ tools });
      }
      if (method !== 'tools/call') return error(-32601, `Unknown method: ${method}`);
      if (typeof params.name !== 'string' || (params.arguments !== undefined && (!params.arguments || typeof params.arguments !== 'object' || Array.isArray(params.arguments)))) return error(-32602, 'Invalid tool call.');
      const args = params.arguments || {};
      if (params.name === 'vscode_windows') return reply(text((await client.windows()).map(({ id, workspaces, vscodeVersion }) => ({ id, workspaces, vscodeVersion }))));
      if (params.name === 'vscode_select_window') {
        if (typeof args.id !== 'string' || !args.id) return error(-32602, 'Window id is required.');
        reply(text(await client.select(args.id))); await refresh(); return;
      }
      if (params.name === 'vscode_connection') {
        try {
          const instance = await client.instance();
          return reply(text({ connected: true, id: instance.id, workspaces: instance.workspaces, vscodeVersion: instance.vscodeVersion, cwd: client.cwd }));
        } catch (e) { return reply(text({ connected: false, reason: e.message, cwd: client.cwd, setup: 'Install the VS Control companion VSIX, open a trusted workspace, run VS Control: Show Connection and Tools. In SSH/WSL/containers, both the bridge extension and this MCP process must run on the same host.' })); }
      }
      reply(await client.call(params.name, args, controller.signal));
    } catch (e) {
      if (method === 'tools/call') reply({ isError: true, content: [{ type: 'text', text: e.message || String(e) }] });
      else error(-32603, e.message || String(e));
    } finally { active.delete(id); }
  }
  input.on('data', chunk => {
    buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
    let index;
    while ((index = buffer.indexOf(10)) >= 0) {
      const line = buffer.subarray(0, index); buffer = buffer.subarray(index + 1);
      if (!line.length) continue;
      if (line.length > 1024 * 1024) { send({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Message exceeds 1 MiB.' } }); close(); return; }
      try { void dispatch(JSON.parse(line.toString('utf8'))); }
      catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON.' } }); }
    }
    if (buffer.length > 1024 * 1024) { send({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Message exceeds 1 MiB.' } }); close(); }
  });
  const timer = setInterval(() => { void refresh(); }, 3000);
  timer.unref();
  function close() { closed = true; clearInterval(timer); for (const c of active.values()) c.abort(); input.pause(); }
  input.on('end', close); input.on('error', close); output.on('error', close);
  return { close };
}
if (require.main === module) serve();
module.exports = { serve, LOCAL };
