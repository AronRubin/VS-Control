'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { releaseNotes } = require('./release-notes.cjs');
const root = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const version = read('package.json').version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Project version must use major.minor.patch.');
for (const file of ['extension/package.json', 'plugin/.claude-plugin/plugin.json', 'test/fixture-extension/package.json']) {
  if (read(file).version !== version) throw new Error(`Version mismatch: ${file} must be ${version}.`);
}
const marketplace = read('.claude-plugin/marketplace.json');
const entry = marketplace.plugins.find(p => p.name === 'vs-control');
if (!entry || entry.version !== version || entry.source !== './plugin') throw new Error('Marketplace plugin version or source does not match the project.');
releaseNotes(version);
if (fs.existsSync(path.join(root, '.git'))) {
  const tracked = spawnSync('git', ['ls-files', '-z', '--', 'docs', 'dist', 'extension/docs'], { cwd: root, encoding: 'utf8' });
  if (tracked.status !== 0) throw new Error(tracked.stderr || 'Could not check tracked files.');
  if (tracked.stdout) throw new Error('Local docs and generated dist files must not be tracked by Git.');
}
let count = 0;
function check(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['dist', 'docs', 'node_modules', '.git', '__pycache__'].includes(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) check(file);
    else if (file.endsWith('.json')) { JSON.parse(fs.readFileSync(file, 'utf8')); count++; }
    else if (file.endsWith('.cjs')) {
      const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      if (result.status !== 0) throw new Error(`${file}: ${result.stderr}`);
      count++;
    }
  }
}
check(root);
console.log(`Validated ${count} JavaScript and JSON files; all project versions are ${version}.`);
