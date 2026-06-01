import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const fixtureDir = join(import.meta.dirname || __dirname, '..');

describe('test-electron-app fixture', () => {
  describe('package.json', () => {
    it('has correct name', () => {
      const pkg = JSON.parse(readFileSync(join(fixtureDir, 'package.json'), 'utf-8'));
      expect(pkg.name).toBe('@eata/test-electron-app');
    });

    it('has main entry pointing to main.js', () => {
      const pkg = JSON.parse(readFileSync(join(fixtureDir, 'package.json'), 'utf-8'));
      expect(pkg.main).toBe('main.js');
    });

    it('has start and test scripts', () => {
      const pkg = JSON.parse(readFileSync(join(fixtureDir, 'package.json'), 'utf-8'));
      expect(pkg.scripts.start).toBeDefined();
      expect(pkg.scripts.test).toBeDefined();
    });

    it('depends on electron v28+', () => {
      const pkg = JSON.parse(readFileSync(join(fixtureDir, 'package.json'), 'utf-8'));
      // Check all dependency types
      const electronVersion = pkg.dependencies?.electron || pkg.optionalDependencies?.electron || pkg.devDependencies?.electron;
      expect(electronVersion).toBeDefined();
      // Extract major version from semver range like "^35.0.0"
      // CI tests with electron 28, 30, 32, 39
      const major = parseInt(electronVersion.replace(/[^0-9]/g, '').slice(0, 2), 10);
      expect(major).toBeGreaterThanOrEqual(28);
    });
  });

  describe('main.js', () => {
    it('exists and is parseable as JavaScript', () => {
      const mainPath = join(fixtureDir, 'main.js');
      expect(existsSync(mainPath)).toBe(true);
      const content = readFileSync(mainPath, 'utf-8');
      // Verify it can be parsed (no syntax errors)
      expect(() => new Function(content)).not.toThrow();
    });

    it('uses contextIsolation and disables nodeIntegration', () => {
      const content = readFileSync(join(fixtureDir, 'main.js'), 'utf-8');
      expect(content).toContain('contextIsolation: true');
      expect(content).toContain('nodeIntegration: false');
    });

    it('creates two BrowserWindows', () => {
      const content = readFileSync(join(fixtureDir, 'main.js'), 'utf-8');
      expect(content).toContain('new BrowserWindow');
      // Count occurrences
      const matches = content.match(/new BrowserWindow/g);
      expect(matches?.length).toBe(2);
    });

    it('registers core IPC handlers', () => {
      const content = readFileSync(join(fixtureDir, 'main.js'), 'utf-8');
      expect(content).toContain("ipcMain.handle('ping'");
      expect(content).toContain("ipcMain.handle('get-version'");
      expect(content).toContain("ipcMain.handle('show-settings'");
      expect(content).toContain("ipcMain.handle('close-settings'");
    });

    it('registers counter IPC handlers', () => {
      const content = readFileSync(join(fixtureDir, 'main.js'), 'utf-8');
      expect(content).toContain("ipcMain.handle('counter:get'");
      expect(content).toContain("ipcMain.handle('counter:increment'");
      expect(content).toContain("ipcMain.handle('counter:decrement'");
      expect(content).toContain("ipcMain.handle('counter:reset'");
    });

    it('registers task IPC handlers', () => {
      const content = readFileSync(join(fixtureDir, 'main.js'), 'utf-8');
      expect(content).toContain("ipcMain.handle('tasks:list'");
      expect(content).toContain("ipcMain.handle('tasks:add'");
      expect(content).toContain("ipcMain.handle('tasks:toggle'");
      expect(content).toContain("ipcMain.handle('tasks:clear-completed'");
    });

    it('registers settings IPC handlers', () => {
      const content = readFileSync(join(fixtureDir, 'main.js'), 'utf-8');
      expect(content).toContain("ipcMain.handle('settings:get'");
      expect(content).toContain("ipcMain.handle('settings:save'");
    });

    it('registers notification IPC handlers', () => {
      const content = readFileSync(join(fixtureDir, 'main.js'), 'utf-8');
      expect(content).toContain("ipcMain.handle('notifications:list'");
      expect(content).toContain("ipcMain.handle('notifications:add'");
      expect(content).toContain("ipcMain.handle('notifications:mark-read'");
    });

    it('sets up application menu', () => {
      const content = readFileSync(join(fixtureDir, 'main.js'), 'utf-8');
      expect(content).toContain('Menu.buildFromTemplate');
      expect(content).toContain('Menu.setApplicationMenu');
    });

    it('registers dialog handler', () => {
      const content = readFileSync(join(fixtureDir, 'main.js'), 'utf-8');
      expect(content).toContain("ipcMain.handle('show-dialog'");
      expect(content).toContain('dialog.showMessageBox');
    });

    it('maintains in-memory app state', () => {
      const content = readFileSync(join(fixtureDir, 'main.js'), 'utf-8');
      expect(content).toContain('const appState');
      expect(content).toContain('counter:');
      expect(content).toContain('tasks:');
      expect(content).toContain('notifications:');
    });
  });

  describe('index.html', () => {
    it('exists and contains login form', () => {
      const content = readFileSync(join(fixtureDir, 'index.html'), 'utf-8');
      expect(content).toContain('id="login-btn"');
      expect(content).toContain('id="username"');
      expect(content).toContain('id="password"');
    });

    it('contains settings navigation button', () => {
      const content = readFileSync(join(fixtureDir, 'index.html'), 'utf-8');
      expect(content).toContain('id="settings-btn"');
    });

    it('contains dashboard navigation button', () => {
      const content = readFileSync(join(fixtureDir, 'index.html'), 'utf-8');
      expect(content).toContain('id="dashboard-btn"');
    });

    it('contains remember-me checkbox', () => {
      const content = readFileSync(join(fixtureDir, 'index.html'), 'utf-8');
      expect(content).toContain('id="remember-me"');
    });

    it('contains status area with aria-live', () => {
      const content = readFileSync(join(fixtureDir, 'index.html'), 'utf-8');
      expect(content).toContain('id="status"');
      expect(content).toContain('aria-live="polite"');
    });

    it('has input validation in login handler', () => {
      const content = readFileSync(join(fixtureDir, 'index.html'), 'utf-8');
      expect(content).toContain('Please fill in all fields');
    });
  });

  describe('dashboard.html', () => {
    it('exists and contains dashboard title', () => {
      const content = readFileSync(join(fixtureDir, 'dashboard.html'), 'utf-8');
      expect(content).toContain('Dashboard');
    });

    it('contains counter display and controls', () => {
      const content = readFileSync(join(fixtureDir, 'dashboard.html'), 'utf-8');
      expect(content).toContain('id="counter-value"');
      expect(content).toContain('id="counter-increment"');
      expect(content).toContain('id="counter-decrement"');
      expect(content).toContain('id="counter-reset"');
    });

    it('contains task list with input', () => {
      const content = readFileSync(join(fixtureDir, 'dashboard.html'), 'utf-8');
      expect(content).toContain('id="task-input"');
      expect(content).toContain('id="task-add-btn"');
      expect(content).toContain('id="task-list"');
      expect(content).toContain('id="task-clear-btn"');
    });

    it('contains notifications section', () => {
      const content = readFileSync(join(fixtureDir, 'dashboard.html'), 'utf-8');
      expect(content).toContain('id="notif-list"');
    });

    it('contains quick actions', () => {
      const content = readFileSync(join(fixtureDir, 'dashboard.html'), 'utf-8');
      expect(content).toContain('id="action-ping"');
      expect(content).toContain('id="action-version"');
      expect(content).toContain('id="action-dialog"');
    });

    it('contains navigation links', () => {
      const content = readFileSync(join(fixtureDir, 'dashboard.html'), 'utf-8');
      expect(content).toContain('id="nav-login"');
      expect(content).toContain('id="nav-settings"');
    });

    it('uses all electronAPI methods', () => {
      const content = readFileSync(join(fixtureDir, 'dashboard.html'), 'utf-8');
      expect(content).toContain('window.electronAPI.getCounter');
      expect(content).toContain('window.electronAPI.incrementCounter');
      expect(content).toContain('window.electronAPI.addTask');
      expect(content).toContain('window.electronAPI.toggleTask');
      expect(content).toContain('window.electronAPI.listNotifications');
      expect(content).toContain('window.electronAPI.markNotificationRead');
    });
  });

  describe('settings.html', () => {
    it('exists and contains settings title', () => {
      const content = readFileSync(join(fixtureDir, 'settings.html'), 'utf-8');
      expect(content).toContain('Settings');
    });

    it('contains theme dropdown with light/dark options', () => {
      const content = readFileSync(join(fixtureDir, 'settings.html'), 'utf-8');
      expect(content).toContain('id="theme"');
      expect(content).toContain('value="light"');
      expect(content).toContain('value="dark"');
    });

    it('contains language selector', () => {
      const content = readFileSync(join(fixtureDir, 'settings.html'), 'utf-8');
      expect(content).toContain('id="language"');
      expect(content).toContain('value="en"');
      expect(content).toContain('value="zh"');
      expect(content).toContain('value="ja"');
    });

    it('contains notification input', () => {
      const content = readFileSync(join(fixtureDir, 'settings.html'), 'utf-8');
      expect(content).toContain('id="notif-message"');
      expect(content).toContain('id="send-notif-btn"');
    });

    it('contains save and back buttons', () => {
      const content = readFileSync(join(fixtureDir, 'settings.html'), 'utf-8');
      expect(content).toContain('id="save-settings-btn"');
      expect(content).toContain('id="back-btn"');
    });

    it('uses IPC methods for settings persistence', () => {
      const content = readFileSync(join(fixtureDir, 'settings.html'), 'utf-8');
      expect(content).toContain('window.electronAPI.getSettings');
      expect(content).toContain('window.electronAPI.saveSettings');
      expect(content).toContain('window.electronAPI.addNotification');
    });
  });

  describe('preload.js', () => {
    it('exists and uses contextBridge', () => {
      const content = readFileSync(join(fixtureDir, 'preload.js'), 'utf-8');
      expect(content).toContain('contextBridge.exposeInMainWorld');
    });

    it('exposes core electronAPI methods', () => {
      const content = readFileSync(join(fixtureDir, 'preload.js'), 'utf-8');
      expect(content).toContain('ping');
      expect(content).toContain('getVersion');
      expect(content).toContain('showSettings');
      expect(content).toContain('closeSettings');
      expect(content).toContain('showDialog');
    });

    it('exposes counter API methods', () => {
      const content = readFileSync(join(fixtureDir, 'preload.js'), 'utf-8');
      expect(content).toContain('getCounter');
      expect(content).toContain('incrementCounter');
      expect(content).toContain('decrementCounter');
      expect(content).toContain('resetCounter');
    });

    it('exposes task API methods', () => {
      const content = readFileSync(join(fixtureDir, 'preload.js'), 'utf-8');
      expect(content).toContain('listTasks');
      expect(content).toContain('addTask');
      expect(content).toContain('toggleTask');
      expect(content).toContain('clearCompletedTasks');
    });

    it('exposes notification API methods', () => {
      const content = readFileSync(join(fixtureDir, 'preload.js'), 'utf-8');
      expect(content).toContain('listNotifications');
      expect(content).toContain('addNotification');
      expect(content).toContain('markNotificationRead');
    });

    it('exposes settings API methods', () => {
      const content = readFileSync(join(fixtureDir, 'preload.js'), 'utf-8');
      expect(content).toContain('getSettings');
      expect(content).toContain('saveSettings');
    });

    it('uses ipcRenderer.invoke for all methods', () => {
      const content = readFileSync(join(fixtureDir, 'preload.js'), 'utf-8');
      const invokeCount = (content.match(/ipcRenderer\.invoke/g) || []).length;
      expect(invokeCount).toBeGreaterThanOrEqual(16);
    });
  });

  // Skipped: actual Electron launch requires a display server
  describe.skip('Electron launch', () => {
    it('starts with CDP enabled', () => {
      // This test requires a display environment (X11/Wayland/Windows Desktop)
      // In CI/headless environments, Electron cannot launch without virtual framebuffer
      // Use xvfb-run or similar for headless CI testing
      expect(true).toBe(true);
    });
  });
});
