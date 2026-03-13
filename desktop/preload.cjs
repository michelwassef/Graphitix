const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  },
  showOpenDialog: (options) => ipcRenderer.invoke('desktop:showOpenDialog', options),
  showSaveDialog: (options) => ipcRenderer.invoke('desktop:showSaveDialog', options),
  readFile: (filePath) => ipcRenderer.invoke('desktop:readFile', filePath),
  writeFile: (payload) => ipcRenderer.invoke('desktop:writeFile', payload),
  writeClipboard: (payload) => ipcRenderer.invoke('desktop:writeClipboard', payload),
  revealItem: (filePath) => ipcRenderer.invoke('desktop:revealItem', filePath),
  getPath: (name) => ipcRenderer.invoke('desktop:getPath', name)
});
