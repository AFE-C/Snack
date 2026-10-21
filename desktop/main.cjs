const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { FileStore } = require('./storage.cjs');

const smokeArgument = process.argv.find((value) => value.startsWith('--smoke-test='));
const smokeReport = smokeArgument?.slice('--smoke-test='.length);
if (process.env.CANDY_SNAKE_DATA)
  app.setPath('userData', path.resolve(process.env.CANDY_SNAKE_DATA));
app.enableSandbox();
let window;
app.whenReady().then(() => {
  const store = new FileStore(app.getPath('userData'));
  Menu.setApplicationMenu(null);
  window = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    title: '星蛇 · Star Snake',
    backgroundColor: '#10172f',
    show: !smokeReport,
    icon: path.join(app.getAppPath(), 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  const trusted = (event) => event.sender === window?.webContents;
  ipcMain.on('store:read', (event, key) => {
    event.returnValue = trusted(event) ? store.get(key) : null;
  });
  ipcMain.on('store:write', (event, key, value) => {
    event.returnValue = trusted(event) && store.set(key, value);
  });
  ipcMain.on('window:fullscreen', (event) => {
    if (trusted(event)) window.setFullScreen(!window.isFullScreen());
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.on('blur', () => window.webContents.send('platform:pause'));
  window.webContents.on('render-process-gone', (_event, details) => {
    if (smokeReport) {
      fs.writeFileSync(smokeReport, JSON.stringify({ ok: false, reason: details.reason }));
      app.exit(1);
    }
  });
  if (smokeReport) {
    const timeout = setTimeout(() => {
      fs.writeFileSync(smokeReport, JSON.stringify({ ok: false, reason: 'renderer timeout' }));
      app.exit(1);
    }, 20000);
    ipcMain.once('renderer:ready', (event, info) => {
      if (!trusted(event)) return;
      clearTimeout(timeout);
      const score = store.get('candySnakeHighScore');
      const writable = store.set('candySnakeHighScore', score ?? '7');
      const persisted =
        new FileStore(app.getPath('userData')).get('candySnakeHighScore') === (score ?? '7');
      const ok = info.title.includes('星蛇') && info.homeVisible && writable && persisted;
      fs.writeFileSync(
        smokeReport,
        JSON.stringify(
          {
            ok,
            ...info,
            writable,
            persisted,
            version: app.getVersion(),
            electron: process.versions.electron,
            sandbox: window.webContents.getLastWebPreferences().sandbox,
            contextIsolation: window.webContents.getLastWebPreferences().contextIsolation,
            userData: app.getPath('userData'),
          },
          null,
          2,
        ),
      );
      app.exit(ok ? 0 : 1);
    });
  }
  window.loadFile(path.join(app.getAppPath(), 'index.html'));
});
app.on('window-all-closed', () => app.quit());
