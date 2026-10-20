const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('candyDesktop', {
  getItem: (key) => ipcRenderer.sendSync('store:read', key),
  setItem: (key, value) => ipcRenderer.sendSync('store:write', key, value),
  toggleFullscreen: () => ipcRenderer.send('window:fullscreen'),
});
ipcRenderer.on('platform:pause', () => document.dispatchEvent(new CustomEvent('candy:pause')));
window.addEventListener('DOMContentLoaded', () => {
  ipcRenderer.send('renderer:ready', {
    title: document.title,
    homeVisible: !!document.querySelector('#homeScreen:not([hidden])'),
  });
});
