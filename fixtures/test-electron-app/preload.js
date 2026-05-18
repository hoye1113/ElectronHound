const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  getVersion: () => ipcRenderer.invoke('get-version'),
  showSettings: () => ipcRenderer.invoke('show-settings'),
  closeSettings: () => ipcRenderer.invoke('close-settings'),
  showDialog: (options) => ipcRenderer.invoke('show-dialog', options),
});
