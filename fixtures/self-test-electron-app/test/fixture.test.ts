import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const fixtureDir = join(import.meta.dirname || __dirname, '..');

describe('self-test-electron-app fixture', () => {
  describe('package.json', () => {
    it('has correct scoped name', () => {
      const pkg = JSON.parse(readFileSync(join(fixtureDir, 'package.json'), 'utf-8'));
      expect(pkg.name).toBe('@eata/self-test-electron-app');
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
      const major = parseInt(electronVersion.replace(/[^0-9]/g, '').slice(0, 2), 10);
      expect(major).toBeGreaterThanOrEqual(30);
    });
  });

  describe('main.js', () => {
    it('exists and is parseable as JavaScript', () => {
      const mainPath = join(fixtureDir, 'main.js');
      expect(existsSync(mainPath)).toBe(true);
      const content = readFileSync(mainPath, 'utf-8');
      expect(() => new Function(content)).not.toThrow();
    });

    it('uses contextIsolation and disables nodeIntegration', () => {
      const content = readFileSync(join(fixtureDir, 'main.js'), 'utf-8');
      expect(content).toContain('contextIsolation: true');
      expect(content).toContain('nodeIntegration: false');
    });

    it('creates a BrowserWindow', () => {
      const content = readFileSync(join(fixtureDir, 'main.js'), 'utf-8');
      expect(content).toContain('new BrowserWindow');
    });

    it('registers ping IPC handler', () => {
      const content = readFileSync(join(fixtureDir, 'main.js'), 'utf-8');
      expect(content).toContain("ipcMain.handle('ping'");
    });

    it('registers self-test IPC handlers', () => {
      const content = readFileSync(join(fixtureDir, 'main.js'), 'utf-8');
      expect(content).toContain("ipcMain.handle('self-test:create-task'");
      expect(content).toContain("ipcMain.handle('self-test:list-tasks'");
    });

    it('creates an HTTP server for API mocking', () => {
      const content = readFileSync(join(fixtureDir, 'main.js'), 'utf-8');
      expect(content).toContain('http.createServer');
      expect(content).toContain('.listen(');
    });

    it('serves dashboard build output', () => {
      const content = readFileSync(join(fixtureDir, 'main.js'), 'utf-8');
      expect(content).toContain('DASHBOARD_DIST');
      expect(content).toContain('dashboard/dist');
    });

    it('mocks task API endpoints', () => {
      const content = readFileSync(join(fixtureDir, 'main.js'), 'utf-8');
      expect(content).toContain('/api/tasks');
      expect(content).toContain('/api/health');
    });

    it('implements SSE streaming for task events', () => {
      const content = readFileSync(join(fixtureDir, 'main.js'), 'utf-8');
      expect(content).toContain('text/event-stream');
      expect(content).toContain('/api/stream/tasks/');
      expect(content).toContain('sseSend');
    });

    it('simulates OPEV phases in SSE stream', () => {
      const content = readFileSync(join(fixtureDir, 'main.js'), 'utf-8');
      expect(content).toContain("'observe'");
      expect(content).toContain("'plan'");
      expect(content).toContain("'execute'");
      expect(content).toContain("'verify'");
    });

    it('loads dashboard from local HTTP server', () => {
      const content = readFileSync(join(fixtureDir, 'main.js'), 'utf-8');
      expect(content).toContain('mainWindow.loadURL');
      expect(content).toContain('http://localhost:');
    });

    it('handles graceful shutdown', () => {
      const content = readFileSync(join(fixtureDir, 'main.js'), 'utf-8');
      expect(content).toContain("app.on('window-all-closed'");
      expect(content).toContain('httpServer.close');
    });
  });

  describe('preload.js', () => {
    it('exists and uses contextBridge', () => {
      const content = readFileSync(join(fixtureDir, 'preload.js'), 'utf-8');
      expect(content).toContain('contextBridge.exposeInMainWorld');
    });

    it('exposes ping method', () => {
      const content = readFileSync(join(fixtureDir, 'preload.js'), 'utf-8');
      expect(content).toContain('ping');
    });

    it('exposes quit method', () => {
      const content = readFileSync(join(fixtureDir, 'preload.js'), 'utf-8');
      expect(content).toContain('quit');
    });

    it('exposes self-test task methods', () => {
      const content = readFileSync(join(fixtureDir, 'preload.js'), 'utf-8');
      expect(content).toContain('createTask');
      expect(content).toContain('listTasks');
    });

    it('uses ipcRenderer.invoke for all methods', () => {
      const content = readFileSync(join(fixtureDir, 'preload.js'), 'utf-8');
      const invokeCount = (content.match(/ipcRenderer\.invoke/g) || []).length;
      expect(invokeCount).toBeGreaterThanOrEqual(4);
    });
  });

  describe('dashboard integration', () => {
    it('references the dashboard dist path', () => {
      const content = readFileSync(join(fixtureDir, 'main.js'), 'utf-8');
      expect(content).toContain('apps/dashboard/dist');
    });

    it('checks for dashboard build before starting', () => {
      const content = readFileSync(join(fixtureDir, 'main.js'), 'utf-8');
      expect(content).toContain('existsSync');
      expect(content).toContain('index.html');
    });
  });
});
