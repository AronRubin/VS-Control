'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function releaseNotes(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Release version must use major.minor.patch.');
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const heading = new RegExp(`^## ${version.replaceAll('.', '\\.')}[^\\S\\r\\n]*(?:[—-][^\\r\\n]*)?\\r?$`, 'm');
  const match = heading.exec(changelog);
  if (!match) throw new Error(`Missing CHANGELOG.md section for ${version}.`);
  const remainder = changelog.slice(match.index + match[0].length);
  const next = remainder.search(/^## /m);
  const body = (next === -1 ? remainder : remainder.slice(0, next)).trim();
  if (!body) throw new Error(`Empty CHANGELOG.md section for ${version}.`);
  return `# VS Control ${version}\n\n${body}\n`;
}

if (require.main === module) {
  const { version } = require('../package.json');
  const notes = releaseNotes(version);
  const file = path.join(root, 'dist', `release-notes-${version}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, notes);
  console.log(file);
}
module.exports = { releaseNotes };
