'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const { once } = require('node:events');
const { serve } = require('../plugin/server.cjs');

function setup(t, overrides = {}) {
  const input = new PassThrough(); const output = new PassThrough();
  const client = { list: async () => [{ name: 'native_tool' }], windows: async () => [{ id: 'abc', workspaces: ['/workspace'], token: 'SECRET' }], instance: async () => ({ id: 'abc', workspaces: ['/workspace'] }), call: async (name, args) => ({ content: [{ type: 'text', text: args.text || name }] }), ...overrides };
  const server = serve({ input, output, client });
  t.after(() => { server.close(); input.destroy(); output.destroy(); });
  let id = 0;
  async function send(method, params) {
    const next = once(output, 'data');
    input.write(JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) + '\n');
    return JSON.parse((await next)[0].toString());
  }
  return { input, output, send };
}
test('MCP negotiates protocol and only advertises implemented tools capability', async t => {
  const { send } = setup(t);
  const response = await send('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.equal(response.result.protocolVersion, '2025-06-18');
  assert.deepEqual(response.result.capabilities, { tools: { listChanged: true } });
  assert.deepEqual((await send('ping')).result, {});
  assert.equal((await send('missing')).error.code, -32601);
});
test('MCP window results never leak bridge tokens', async t => {
  const { send } = setup(t);
  const response = await send('tools/call', { name: 'vscode_windows' });
  assert.ok(!JSON.stringify(response).includes('SECRET'));
  assert.match(response.result.content[0].text, /workspace/);
});
test('offline startup still exposes diagnostics and returns useful errors', async t => {
  const { send } = setup(t, { list: async () => { throw new Error('offline'); }, instance: async () => { throw new Error('No matching window'); } });
  assert.deepEqual((await send('tools/list')).result.tools.map(t => t.name), ['vscode_windows', 'vscode_select_window', 'vscode_connection']);
  const result = (await send('tools/call', { name: 'vscode_connection' })).result;
  assert.equal(JSON.parse(result.content[0].text).connected, false);
});
test('tool failures are MCP isError results, not fabricated success', async t => {
  const { send } = setup(t, { call: async () => { throw new Error('Native confirmation declined'); } });
  const result = (await send('tools/call', { name: 'native_tool' })).result;
  assert.equal(result.isError, true); assert.match(result.content[0].text, /declined/);
});
test('stdio framing accepts split multibyte Unicode and rejects malformed JSON', async t => {
  const { input, output } = setup(t);
  const message = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'native_tool', arguments: { text: '🚀' } } }) + '\n');
  const offset = message.indexOf(Buffer.from('🚀')) + 1;
  const next = once(output, 'data'); input.write(message.subarray(0, offset)); input.write(message.subarray(offset));
  assert.equal(JSON.parse((await next)[0]).result.content[0].text, '🚀');
  const error = once(output, 'data'); input.write('{invalid}\n');
  assert.equal(JSON.parse((await error)[0]).error.code, -32700);
});
test('MCP cancellation is propagated to the running invocation', async t => {
  let ready;
  const started = new Promise(resolve => { ready = resolve; });
  const { input, output } = setup(t, { call: async (name, args, signal) => new Promise((resolve, reject) => { signal.addEventListener('abort', () => reject(new Error('Cancelled'))); ready(); }) });
  input.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'slow' } }) + '\n');
  await started;
  const next = once(output, 'data');
  input.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1 } }) + '\n');
  assert.equal(JSON.parse((await next)[0]).result.isError, true);
});
