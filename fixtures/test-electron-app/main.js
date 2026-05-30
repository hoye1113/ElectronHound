const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');

let mainWindow;
let secondaryWindow;

// ── In-memory app state (for IPC persistence tests) ─────────────────────
const appState = {
  counter: 0,
  tasks: [],
  theme: 'light',
  notifications: [],
};

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  mainWindow.loadFile('index.html');
}

function createSecondaryWindow() {
  secondaryWindow = new BrowserWindow({
    width: 600,
    height: 400,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  secondaryWindow.loadFile('settings.html');
}

// ── Core IPC handlers ────────────────────────────────────────────────────
ipcMain.handle('ping', () => 'pong');
ipcMain.handle('get-version', () => app.getVersion());
ipcMain.handle('show-settings', () => {
  if (secondaryWindow) secondaryWindow.show();
  return true;
});
ipcMain.handle('close-settings', () => {
  if (secondaryWindow) secondaryWindow.hide();
  return true;
});

// ── Counter IPC ──────────────────────────────────────────────────────────
ipcMain.handle('counter:get', () => appState.counter);
ipcMain.handle('counter:increment', () => {
  appState.counter++;
  return appState.counter;
});
ipcMain.handle('counter:decrement', () => {
  appState.counter--;
  return appState.counter;
});
ipcMain.handle('counter:reset', () => {
  appState.counter = 0;
  return appState.counter;
});

// ── Task list IPC ────────────────────────────────────────────────────────
ipcMain.handle('tasks:list', () => [...appState.tasks]);
ipcMain.handle('tasks:add', (_event, title) => {
  if (!title || typeof title !== 'string') return { error: 'Title is required' };
  const task = { id: Date.now().toString(), title, completed: false };
  appState.tasks.push(task);
  return task;
});
ipcMain.handle('tasks:toggle', (_event, taskId) => {
  const task = appState.tasks.find((t) => t.id === taskId);
  if (task) task.completed = !task.completed;
  return task ?? null;
});
ipcMain.handle('tasks:clear-completed', () => {
  appState.tasks = appState.tasks.filter((t) => !t.completed);
  return [...appState.tasks];
});

// ── Settings IPC ─────────────────────────────────────────────────────────
ipcMain.handle('settings:get', () => ({ theme: appState.theme }));
ipcMain.handle('settings:save', (_event, settings) => {
  if (settings.theme) appState.theme = settings.theme;
  return { success: true, theme: appState.theme };
});

// ── Notification IPC ─────────────────────────────────────────────────────
ipcMain.handle('notifications:list', () => [...appState.notifications]);
ipcMain.handle('notifications:add', (_event, message) => {
  const notification = { id: Date.now().toString(), message, read: false, timestamp: new Date().toISOString() };
  appState.notifications.push(notification);
  return notification;
});
ipcMain.handle('notifications:mark-read', (_event, notifId) => {
  const notif = appState.notifications.find((n) => n.id === notifId);
  if (notif) notif.read = true;
  return notif ?? null;
});

// Menu
const menuTemplate = [
  {
    label: 'File',
    submenu: [
      { label: 'Settings', click: () => { if (secondaryWindow) secondaryWindow.show(); } },
      { type: 'separator' },
      { role: 'quit' },
    ],
  },
];
const menu = Menu.buildFromTemplate(menuTemplate);
Menu.setApplicationMenu(menu);

// Dialog handler
ipcMain.handle('show-dialog', (event, options) => {
  return dialog.showMessageBox(mainWindow, options);
});

app.whenReady().then(() => {
  createMainWindow();
  createSecondaryWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
