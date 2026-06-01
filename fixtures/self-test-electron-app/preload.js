const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /** Health-check endpoint used by test harnesses */
  ping: () => ipcRenderer.invoke('ping'),

  /** Gracefully quit the application */
  quit: () => ipcRenderer.invoke('quit'),

  /** Create a task via IPC (used by EATA agent for self-testing) */
  createTask: (title) => ipcRenderer.invoke('self-test:create-task', title),

  /** List current mock tasks via IPC */
  listTasks: () => ipcRenderer.invoke('self-test:list-tasks'),
});
