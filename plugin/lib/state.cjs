'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

function stateDirectory() {
  return process.env.VS_CONTROL_STATE_DIR || path.join(os.homedir(), '.vs-control', 'instances');
}
function contains(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
async function canonical(file) {
  return fs.realpath(file).catch(() => path.resolve(file));
}
async function readInstances(directory = stateDirectory()) {
  const names = await fs.readdir(directory).catch(() => []);
  const results = await Promise.all(names.filter(n => /^[a-f0-9-]+\.json$/.test(n)).map(async name => {
    try {
      const file = path.join(directory, name);
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384) return null;
      if (process.platform !== 'win32' && ((stat.mode & 0o077) || stat.uid !== process.getuid())) return null;
      const value = JSON.parse(await fs.readFile(file, 'utf8'));
      if (value.version !== 1 || !/^[a-f0-9-]+$/.test(value.id) || name !== `${value.id}.json` ||
          !Number.isInteger(value.port) || value.port < 1 || value.port > 65535 ||
          !/^[a-f0-9]{64}$/.test(value.token) || !Array.isArray(value.workspaces) ||
          value.workspaces.some(p => typeof p !== 'string')) return null;
      return value;
    } catch { return null; }
  }));
  return results.filter(Boolean);
}
async function selectInstance(instances, cwd, explicitId) {
  if (explicitId) {
    const selected = instances.find(i => i.id === explicitId);
    if (!selected) throw new Error(`VS Code window ${explicitId} is not available. Use vscode_windows.`);
    return selected;
  }
  const current = await canonical(cwd);
  const ranked = [];
  for (const instance of instances) {
    let score = -1;
    for (const folder of instance.workspaces) {
      const root = await canonical(folder);
      if (contains(root, current)) score = Math.max(score, root.length);
    }
    if (score >= 0) ranked.push({ instance, score });
  }
  ranked.sort((a, b) => b.score - a.score);
  if (!ranked.length) throw new Error('No VS Control window matches this working directory. Open the project in VS Code with the companion extension, or use vscode_windows and vscode_select_window.');
  if (ranked.length > 1 && ranked[0].score === ranked[1].score) throw new Error('Multiple VS Code windows match this workspace. Use vscode_windows, then vscode_select_window with the intended id.');
  return ranked[0].instance;
}
module.exports = { stateDirectory, contains, canonical, readInstances, selectInstance };
