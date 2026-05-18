const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');

let mainWindow;
let secondaryWindow;

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

// IPC handlers
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
