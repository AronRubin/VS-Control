'use strict';
// Produces a separate machine-local marketplace. It never edits Claude settings
// or the portable plugin. Run using the Node/Electron executable to embed.
const fs = require('node:fs');
const path = require('node:path');
if (process.platform === 'win32') throw new Error('This optional runtime helper currently supports POSIX shells only; use Node.js on Windows.');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'dist', 'local-marketplace');
fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
fs.cpSync(path.join(root, 'plugin'), path.join(target, 'plugin'), { recursive: true });
fs.mkdirSync(path.join(target, '.claude-plugin'), { recursive: true });
const marketplace = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'marketplace.json'), 'utf8'));
marketplace.name = 'vs-control-machine';
fs.writeFileSync(path.join(target, '.claude-plugin', 'marketplace.json'), JSON.stringify(marketplace, null, 2) + '\n');
const configPath = path.join(target, 'plugin', '.mcp.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
config.mcpServers['vs-control'].command = process.execPath;
const isElectron = !!process.versions.electron;
if (isElectron) config.mcpServers['vs-control'].env = { ELECTRON_RUN_AS_NODE: '1' };
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
const hooksPath = path.join(target, 'plugin', 'hooks', 'hooks.json');
const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
hooks.hooks.SessionStart[0].hooks[0].command = `${isElectron ? 'ELECTRON_RUN_AS_NODE=1 ' : ''}${quote(process.execPath)} "${'${CLAUDE_PLUGIN_ROOT}'}/scripts/session-start.cjs"`;
fs.writeFileSync(hooksPath, JSON.stringify(hooks, null, 2) + '\n');
console.log(`Created ${target}\nRuntime: ${process.execPath}\n/plugin marketplace add ${target}\n/plugin install vs-control@vs-control-machine`);
