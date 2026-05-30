import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  detectElectronVersion,
  detectElectronVersionFromPackageJson,
  detectElectronVersionFromBinary,
  type VersionDetectOptions,
} from '../version-detect.js';

// Mock child_process module
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

// Mock node:fs/promises
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const mockExecFile = vi.mocked(execFile);
const mockReadFile = vi.mocked(readFile);

describe('Version Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseElectronVersion (from shared-types)', () => {
    // These tests are in shared-types, but we verify the import works
    it('should be importable', async () => {
      const { parseElectronVersion } = await import('@eata/shared-types');
      expect(parseElectronVersion).toBeDefined();
    });
  });

  describe('detectElectronVersionFromBinary', () => {
    it('should parse version from electron --version output', async () => {
      mockExecFile.mockImplementation((cmd, args, opts, cb) => {
        if (typeof cb === 'function') {
          cb(null, 'v32.1.2\n', '');
        }
        return {} as never;
      });

      const result = await detectElectronVersionFromBinary('/path/to/electron');

      expect(result).toBeDefined();
      expect(result?.version).toBe('32.1.2');
      expect(result?.source).toBe('binary');
      expect(result?.major).toBe(32);
    });

    it('should handle version without v prefix', async () => {
      mockExecFile.mockImplementation((cmd, args, opts, cb) => {
        if (typeof cb === 'function') {
          cb(null, '30.0.0\n', '');
        }
        return {} as never;
      });

      const result = await detectElectronVersionFromBinary('/path/to/electron');

      expect(result?.version).toBe('30.0.0');
      expect(result?.major).toBe(30);
    });

    it('should return null on exec error', async () => {
      mockExecFile.mockImplementation((cmd, args, opts, cb) => {
        if (typeof cb === 'function') {
          cb(new Error('command not found'), '', '');
        }
        return {} as never;
      });

      const result = await detectElectronVersionFromBinary('/nonexistent/electron');

      expect(result).toBeNull();
    });

    it('should handle empty output', async () => {
      mockExecFile.mockImplementation((cmd, args, opts, cb) => {
        if (typeof cb === 'function') {
          cb(null, '', '');
        }
        return {} as never;
      });

      const result = await detectElectronVersionFromBinary('/path/to/electron');

      expect(result).toBeNull();
    });
  });

  describe('detectElectronVersionFromPackageJson', () => {
    it('should read version from electron package.json', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({ version: '28.3.1' }));

      const result = await detectElectronVersionFromPackageJson('/app/node_modules/electron');

      expect(result).toBeDefined();
      expect(result?.version).toBe('28.3.1');
      expect(result?.source).toBe('package-json');
      expect(result?.major).toBe(28);
    });

    it('should return null if file not found', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      const result = await detectElectronVersionFromPackageJson('/nonexistent/path');

      expect(result).toBeNull();
    });

    it('should return null if version field missing', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({ name: 'electron' }));

      const result = await detectElectronVersionFromPackageJson('/app/node_modules/electron');

      expect(result).toBeNull();
    });
  });

  describe('detectElectronVersion', () => {
    it('should try package.json first, then binary', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({ version: '32.0.0' }));

      const result = await detectElectronVersion();

      expect(result).toBeDefined();
      expect(result?.version).toBe('32.0.0');
      expect(result?.source).toBe('package-json');
    });

    it('should fall back to binary if package.json fails', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      mockExecFile.mockImplementation((cmd, args, opts, cb) => {
        if (typeof cb === 'function') {
          cb(null, 'v30.0.0\n', '');
        }
        return {} as never;
      });

      const result = await detectElectronVersion();

      expect(result).toBeDefined();
      expect(result?.version).toBe('30.0.0');
      expect(result?.source).toBe('binary');
    });

    it('should return null if both methods fail', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      mockExecFile.mockImplementation((cmd, args, opts, cb) => {
        if (typeof cb === 'function') {
          cb(new Error('not found'), '', '');
        }
        return {} as never;
      });

      const result = await detectElectronVersion();

      expect(result).toBeNull();
    });

    it('should use custom electronPath when provided', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      mockExecFile.mockImplementation((cmd, args, opts, cb) => {
        if (typeof cb === 'function') {
          cb(null, 'v39.0.0\n', '');
        }
        return {} as never;
      });

      const options: VersionDetectOptions = {
        electronPath: '/custom/electron',
      };

      const result = await detectElectronVersion(options);

      expect(result?.version).toBe('39.0.0');
    });

    it('should include compatibility info in result', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({ version: '32.1.0' }));

      const result = await detectElectronVersion();

      expect(result).toBeDefined();
      expect(result?.isSupported).toBe(true);
      expect(result?.isKnownMajor).toBe(true);
    });

    it('should mark unsupported versions correctly', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({ version: '25.0.0' }));

      const result = await detectElectronVersion();

      expect(result).toBeDefined();
      expect(result?.isSupported).toBe(false);
      expect(result?.major).toBe(25);
    });
  });
});
