import { extractFile } from '@electron/asar';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.resolve(root, '..', 'star-snake-windows', 'Star Snake-win32-x64');
const archive = path.join(directory, 'resources', 'app.asar');
for (const file of [
  'StarSnake.exe',
  'LICENSE',
  'LICENSES.chromium.html',
  'resources/app.asar',
  'locales/en-US.pak',
])
  assert(statSync(path.join(directory, file)).isFile(), `Missing ${file}`);
const actual = extractFile(archive, 'index.html').toString();
assert(actual.includes('Content-Security-Policy'));
assert.equal(
  actual.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, ''),
  readFileSync(path.join(root, 'dist', 'index.html'), 'utf8'),
);
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(JSON.parse(extractFile(archive, 'package.json').toString()).version, pkg.version);
for (const file of ['main.cjs', 'preload.cjs', 'storage.cjs'])
  assert.equal(
    extractFile(archive, `desktop/${file}`).toString(),
    readFileSync(path.join(root, 'desktop', file), 'utf8'),
  );
assert(
  extractFile(archive, 'icon.png').equals(readFileSync(path.join(root, 'desktop', 'icon.png'))),
);
console.log(
  '桌面静态检查通过：运行文件完整，ASAR 内 HTML、图标、主进程、preload、存档代码与当前版本一致。此检查不代表应用已启动。',
);
