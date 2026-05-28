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

    it('depends on electron v30+', () => {
      const pkg = JSON.parse(readFileSync(join(fixtureDir, 'package.json'), 'utf-8'));
      const electronVersion = pkg.dependencies?.electron ?? pkg.optionalDependencies?.electron;
      expect(electronVersion).toBeDefined();
      // Extract major version from semver range like "^35.0.0"
      const major = parseInt(electronVersion.replace(/[^0-9]/g, '').slice(0, 2), 10);
      expect(major).toBeGreaterThanOrEqual(30);
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

    it('registers IPC handlers', () => {
      const content = readFileSync(join(fixtureDir, 'main.js'), 'utf-8');
      expect(content).toContain("ipcMain.handle('ping'");
      expect(content).toContain("ipcMain.handle('get-version'");
      expect(content).toContain("ipcMain.handle('show-settings'");
      expect(content).toContain("ipcMain.handle('close-settings'");
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

    it('contains status area', () => {
      const content = readFileSync(join(fixtureDir, 'index.html'), 'utf-8');
      expect(content).toContain('id="status"');
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

    it('contains save and back buttons', () => {
      const content = readFileSync(join(fixtureDir, 'settings.html'), 'utf-8');
      expect(content).toContain('id="save-settings-btn"');
      expect(content).toContain('id="back-btn"');
    });
  });

  describe('preload.js', () => {
    it('exists and uses contextBridge', () => {
      const content = readFileSync(join(fixtureDir, 'preload.js'), 'utf-8');
      expect(content).toContain('contextBridge.exposeInMainWorld');
    });

    it('exposes electronAPI with expected methods', () => {
      const content = readFileSync(join(fixtureDir, 'preload.js'), 'utf-8');
      expect(content).toContain('ping');
      expect(content).toContain('getVersion');
      expect(content).toContain('showSettings');
      expect(content).toContain('closeSettings');
      expect(content).toContain('showDialog');
    });

    it('uses ipcRenderer.invoke for all methods', () => {
      const content = readFileSync(join(fixtureDir, 'preload.js'), 'utf-8');
      const invokeCount = (content.match(/ipcRenderer\.invoke/g) || []).length;
      expect(invokeCount).toBeGreaterThanOrEqual(5);
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
