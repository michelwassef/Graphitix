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
  onOpenGraphFile: (handler) => {
    if (typeof handler !== 'function') {
      return () => {};
    }
    const listener = (_event, payload) => {
      handler(payload);
    };
    ipcRenderer.on('desktop:openGraphFile', listener);
    return () => ipcRenderer.removeListener('desktop:openGraphFile', listener);
  },
  onMenuCommand: (handler) => {
    if (typeof handler !== 'function') {
      return () => {};
    }
    const listener = (_event, payload) => {
      handler(payload);
    };
    ipcRenderer.on('desktop:menuCommand', listener);
    return () => ipcRenderer.removeListener('desktop:menuCommand', listener);
  },
  writeRecoverySnapshot: (payload) => ipcRenderer.invoke('desktop:writeRecoverySnapshot', payload),
  readRecoverySnapshot: () => ipcRenderer.invoke('desktop:readRecoverySnapshot'),
  clearRecoverySnapshot: () => ipcRenderer.invoke('desktop:clearRecoverySnapshot'),
  writeClipboard: (payload) => ipcRenderer.invoke('desktop:writeClipboard', payload),
  revealItem: (filePath) => ipcRenderer.invoke('desktop:revealItem', filePath),
  getPath: (name) => ipcRenderer.invoke('desktop:getPath', name)
});
