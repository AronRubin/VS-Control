'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
(async () => {
  const binary = process.env.VSCODE_EXECUTABLE || (process.platform === 'darwin' ? '/Applications/Visual Studio Code.app/Contents/MacOS/Code' : 'code');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vs-control-host-'));
  await fs.mkdir(path.join(directory, 'user-data', 'User'), { recursive: true });
  await fs.writeFile(path.join(directory, 'user-data', 'User', 'settings.json'), JSON.stringify({
    'telemetry.telemetryLevel': 'off', 'update.mode': 'none', 'extensions.autoUpdate': false,
    'extensions.autoCheckUpdates': false, 'workbench.startupEditor': 'none',
    'workbench.enableExperiments': false, 'chat.disableAIFeatures': false,
    'workbench.browser.enableChatTools': true
  }));
  await fs.mkdir(path.join(root, 'dist'), { recursive: true });
  const env = { ...process.env, VS_CONTROL_STATE_DIR: path.join(directory, 'instances'), VS_CONTROL_TEST_REPORT: path.join(root, 'dist', 'vscode-integration-report.json') };
  delete env.ELECTRON_RUN_AS_NODE;
  const args = [
    `--user-data-dir=${path.join(directory, 'user-data')}`, `--extensions-dir=${path.join(directory, 'extensions')}`,
    `--extensionDevelopmentPath=${path.join(root, 'extension')}`, `--extensionDevelopmentPath=${path.join(root, 'test', 'fixture-extension')}`,
    `--extensionTestsPath=${path.join(root, 'test', 'vscode-runner.cjs')}`,
    '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--new-window',
    path.join(root, 'test', 'fixtures')
  ];
  console.log(`Launching isolated VS Code extension tests; temporary profile: ${directory}`);
  const child = spawn(binary, args, { env, stdio: 'inherit' });
  const deadline = setTimeout(() => { console.error('VS Code integration test deadline exceeded.'); child.kill(); }, 90000);
  child.once('error', e => { clearTimeout(deadline); console.error(e); process.exitCode = 1; });
  child.once('exit', async code => {
    clearTimeout(deadline);
    process.exitCode = code ?? 1;
    // Preserve only failures for diagnosis; no user's real profile is touched.
    if (code === 0) await fs.rm(directory, { recursive: true, force: true });
    else console.error(`Failure logs retained in ${directory}`);
  });
})().catch(e => { console.error(e); process.exitCode = 1; });
