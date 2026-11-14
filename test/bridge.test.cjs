'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { startBridge } = require('../extension/src/bridge.cjs');
const { BridgeClient, request } = require('../plugin/lib/client.cjs');

async function fixture(t, custom = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vs-control-bridge-'));
  const adapter = { trusted: () => true, timeoutMs: () => 1000, list: async () => [{ name: 'echo', inputSchema: { type: 'object' } }], call: async (name, args) => ({ content: [{ type: 'text', text: args.text }] }), ...custom };
  const bridge = await startBridge(adapter, { directory, workspaces: [directory] });
  t.after(async () => { await bridge.stop(); await fs.rm(directory, { recursive: true, force: true }); });
  return { directory, bridge, adapter, client: new BridgeClient({ directory, cwd: directory }) };
}
function raw(instance, headers, body = '{}') {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: instance.port, path: '/rpc', method: 'POST', headers }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.end(body);
  });
}
test('authenticated discovery and a real HTTP tool call round-trip Unicode', async t => {
  const { client, bridge } = await fixture(t);
  assert.equal((await client.windows())[0].id, bridge.id);
  assert.equal((await client.list())[0].name, 'echo');
  const result = await client.call('echo', { text: 'Hello £ € 🚀' }, new AbortController().signal);
  assert.equal(result.content[0].text, 'Hello £ € 🚀');
  assert.equal(client.windowId, bridge.id);
});
test('bridge rejects missing auth, web origins and DNS rebinding hostnames', async t => {
  const { bridge } = await fixture(t);
  assert.equal(await raw(bridge.descriptor, {}), 401);
  const headers = { Authorization: `Bearer ${bridge.descriptor.token}` };
  assert.equal(await raw(bridge.descriptor, { ...headers, Origin: 'https://example.com' }), 403);
  assert.equal(await raw(bridge.descriptor, { ...headers, Host: 'attacker.invalid' }), 403);
});
test('workspace trust is checked on every request', async t => {
  let trusted = true;
  const { bridge } = await fixture(t, { trusted: () => trusted });
  assert.equal((await request(bridge.descriptor, { method: 'health' })).id, bridge.id);
  trusted = false;
  await assert.rejects(request(bridge.descriptor, { method: 'tools/list' }), /trusted workspace/);
});
test('deadline cancels downstream work and reports incomplete outcome', async t => {
  let cancelled = false;
  const { client } = await fixture(t, { timeoutMs: () => 30, call: async (name, args, signal) => new Promise(() => signal.addEventListener('abort', () => { cancelled = true; })) });
  const result = await client.call('slow', {}, new AbortController().signal);
  assert.equal(result.isError, true); assert.match(result.content[0].text, /deadline exceeded/); assert.equal(cancelled, true);
});
test('client cancellation closes HTTP and cancels the VS Code operation', async t => {
  let started;
  let cancelled;
  const didStart = new Promise(resolve => { started = resolve; });
  const didCancel = new Promise(resolve => { cancelled = resolve; });
  const { client } = await fixture(t, { call: async (name, args, signal) => new Promise(() => { signal.addEventListener('abort', cancelled); started(); }) });
  const controller = new AbortController();
  const call = client.call('slow', {}, controller.signal);
  const rejection = assert.rejects(call, /abort/i);
  await didStart; controller.abort(); await rejection; await didCancel;
});
test('dead windows are excluded and shutdown removes the descriptor', async t => {
  const { client, bridge, directory } = await fixture(t);
  await bridge.stop();
  assert.deepEqual(await client.windows(), []);
  assert.equal((await fs.readdir(directory)).length, 0);
});
test('two live windows on the same workspace require a selection', async t => {
  const { client, adapter, directory, bridge } = await fixture(t);
  const second = await startBridge(adapter, { directory, workspaces: [directory] });
  t.after(() => second.stop());
  await assert.rejects(client.list(), /Multiple/);
  await client.select(bridge.id); assert.equal((await client.list())[0].name, 'echo');
  await bridge.stop(); await assert.rejects(client.list(), /not available/);
});
