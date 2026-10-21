import { packager } from '@electron/packager';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const project = fileURLToPath(new URL('../', import.meta.url));
const stage = path.join(project, 'work', 'desktop-stage');
const output = path.resolve(project, '..', 'star-snake-windows');
if (path.dirname(output) !== path.resolve(project, '..')) throw new Error('Invalid output path');
const pkg = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'));
await mkdir(path.join(stage, 'desktop'), { recursive: true });
await mkdir(path.join(stage, 'licenses'), { recursive: true });
const html = await readFile(path.join(project, 'dist', 'index.html'), 'utf8');
const csp =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data:; media-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'";
await writeFile(
  path.join(stage, 'index.html'),
  html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`),
);
await writeFile(
  path.join(stage, 'package.json'),
  JSON.stringify({
    name: pkg.name,
    version: pkg.version,
    main: 'desktop/main.cjs',
    description: '星蛇 · Star Snake 试玩版',
    author: 'AFE-C',
  }),
);
for (const name of ['main.cjs', 'preload.cjs', 'storage.cjs'])
  await copyFile(path.join(project, 'desktop', name), path.join(stage, 'desktop', name));
await copyFile(
  path.join(project, 'licenses', 'Press-Start-2P-OFL.txt'),
  path.join(stage, 'licenses', 'Press-Start-2P-OFL.txt'),
);
await copyFile(path.join(project, 'desktop', 'icon.png'), path.join(stage, 'icon.png'));
const paths = await packager({
  dir: stage,
  out: output,
  name: 'Star Snake',
  executableName: 'StarSnake',
  platform: 'win32',
  arch: 'x64',
  electronVersion: pkg.devDependencies.electron,
  asar: true,
  overwrite: true,
  icon: path.join(project, 'desktop', 'icon.ico'),
  appVersion: pkg.version,
  download: {
    cacheRoot:
      process.env.CANDY_SNAKE_ELECTRON_CACHE ?? path.join(project, 'work', 'electron-cache'),
  },
  win32metadata: {
    CompanyName: 'AFE-C',
    FileDescription: '星蛇 · Star Snake',
    ProductName: 'Star Snake',
  },
});
console.log(`Windows 试玩包：${paths.join(', ')}`);
