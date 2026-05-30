const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Core
  ping: () => ipcRenderer.invoke('ping'),
  getVersion: () => ipcRenderer.invoke('get-version'),
  showSettings: () => ipcRenderer.invoke('show-settings'),
  closeSettings: () => ipcRenderer.invoke('close-settings'),
  showDialog: (options) => ipcRenderer.invoke('show-dialog', options),

  // Counter
  getCounter: () => ipcRenderer.invoke('counter:get'),
  incrementCounter: () => ipcRenderer.invoke('counter:increment'),
  decrementCounter: () => ipcRenderer.invoke('counter:decrement'),
  resetCounter: () => ipcRenderer.invoke('counter:reset'),

  // Tasks
  listTasks: () => ipcRenderer.invoke('tasks:list'),
  addTask: (title) => ipcRenderer.invoke('tasks:add', title),
  toggleTask: (taskId) => ipcRenderer.invoke('tasks:toggle', taskId),
  clearCompletedTasks: () => ipcRenderer.invoke('tasks:clear-completed'),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),

  // Notifications
  listNotifications: () => ipcRenderer.invoke('notifications:list'),
  addNotification: (message) => ipcRenderer.invoke('notifications:add', message),
  markNotificationRead: (notifId) => ipcRenderer.invoke('notifications:mark-read', notifId),
});
