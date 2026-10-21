import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const project = fileURLToPath(new URL('../', import.meta.url));
const data = path.join(project, 'work', 'desktop-smoke');
await mkdir(data, { recursive: true });
const report = path.join(data, 'report.json');
const executable = path.resolve(
  project,
  '..',
  'star-snake-windows',
  'Star Snake-win32-x64',
  'StarSnake.exe',
);
const env = { ...process.env, CANDY_SNAKE_DATA: data };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(executable, [`--smoke-test=${report}`], {
  env,
  windowsHide: true,
  stdio: 'pipe',
});
let stderr = '';
child.stderr.on('data', (chunk) => {
  stderr += chunk;
});
const code = await new Promise((resolve, reject) => {
  child.on('error', reject);
  child.on('exit', resolve);
});
assert.equal(code, 0, stderr);
const result = JSON.parse(await readFile(report, 'utf8'));
assert(result.ok && result.sandbox && result.contextIsolation, '桌面启动检查失败');
console.log(JSON.stringify(result, null, 2));
