'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
// These paths contain generated files only. Clear them so renamed or
// removed source files cannot survive into a later release.
for (const name of ['lib', 'docs', 'CONTRIBUTING.md']) fs.rmSync(path.join(root, 'extension', name), { recursive: true, force: true });
fs.mkdirSync(path.join(root, 'extension', 'lib'), { recursive: true });
fs.copyFileSync(path.join(root, 'plugin', 'lib', 'state.cjs'), path.join(root, 'extension', 'lib', 'state.cjs'));
for (const name of ['LICENSE', 'CHANGELOG.md']) fs.copyFileSync(path.join(root, name), path.join(root, 'extension', name));
console.log('Built dependency-free VS Code extension and Claude Code plugin.');
