'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAdapter } = require('../extension/src/adapter.cjs');

function fixture(overrides = {}) {
  let cancelled = false;
  let options;
  const vscode = {
    version: 'test', workspace: { isTrusted: true, workspaceFolders: [], getConfiguration: () => ({ get: (key, fallback) => fallback }) },
    lm: { tools: [{ name: 'read_page', description: 'Read page', inputSchema: { type: 'object' } }], invokeTool: async (name, opts) => { options = opts; return { content: [{ value: 'actual page' }] }; } },
    tasks: {}, window: {},
    CancellationTokenSource: class { token = {}; cancel() { cancelled = true; } dispose() {} },
    ...overrides
  };
  return { adapter: createAdapter(vscode), vscode, options: () => options, cancelled: () => cancelled };
}
test('native invocation uses documented undefined chat token', async () => {
  const f = fixture();
  const result = await f.adapter.call('vscode_invoke_tool', { name: 'read_page', input: { pageId: '123' } }, new AbortController().signal);
  assert.equal(result.content[0].text, 'actual page');
  assert.deepEqual(f.options(), { input: { pageId: '123' }, toolInvocationToken: undefined });
});
test('bridge never dispatches unexposed native tools or arbitrary commands', async () => {
  const { adapter } = fixture();
  await assert.rejects(adapter.call('vscode_invoke_tool', { name: 'arbitrary_shell' }, new AbortController().signal), /not enabled/);
  await assert.rejects(adapter.call('vscode_command', { command: 'workbench.action.installExtension' }, new AbortController().signal), /not permitted/);
});
test('built-in schemas reject wrong types, negative positions and unknown options', async () => {
  const { adapter } = fixture();
  for (const args of [{ path: '/file', line: -1 }, { path: 3 }, { path: '/file', unknown: true }]) {
    await assert.rejects(adapter.call('vscode_open_file', args, new AbortController().signal));
  }
});
test('adapter independently rejects untrusted workspaces and cancellation', async () => {
  const { adapter, vscode } = fixture();
  const controller = new AbortController(); controller.abort();
  await assert.rejects(adapter.call('vscode_capabilities', {}, controller.signal), /Cancelled/);
  vscode.workspace.isTrusted = false;
  await assert.rejects(adapter.call('vscode_capabilities', {}, new AbortController().signal), /not trusted/);
});
