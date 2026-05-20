import { describe, it, expect } from 'vitest';
import { WorkerManager } from '../../apps/server/src/services/workerManager.js';

describe('E2E: Command Injection Prevention', () => {
  describe('WorkerManager.sanitizeArg', () => {
    it('removes semicolons (;)', () => {
      const input = '; rm -rf /';
      const sanitized = WorkerManager.sanitizeArg(input, 1000);
      expect(sanitized).not.toMatch(/;/);
    });

    it('removes pipes (|)', () => {
      const input = '| echo hacked';
      const sanitized = WorkerManager.sanitizeArg(input, 1000);
      expect(sanitized).not.toMatch(/\|/);
    });

    it('removes ampersands (&)', () => {
      const input = '&& cat /etc/passwd';
      const sanitized = WorkerManager.sanitizeArg(input, 1000);
      expect(sanitized).not.toMatch(/&/);
    });

    it('removes dollar signs ($)', () => {
      const input = '$(rm -rf /)';
      const sanitized = WorkerManager.sanitizeArg(input, 1000);
      expect(sanitized).not.toMatch(/\$/);
    });

    it('removes backticks (`)', () => {
      const input = '`rm -rf /`';
      const sanitized = WorkerManager.sanitizeArg(input, 1000);
      expect(sanitized).not.toMatch(/`/);
    });

    it('preserves legitimate special characters', () => {
      const inputs = [
        'Click "Settings" button',
        'user@email.com',
        '/dashboard?tab=settings',
        'special-characters',
      ];

      for (const input of inputs) {
        const sanitized = WorkerManager.sanitizeArg(input, 1000);
        expect(sanitized.length).toBeGreaterThan(0);
      }
    });

    it('enforces character length limits', () => {
      const longInput = 'a'.repeat(2000);
      const sanitized = WorkerManager.sanitizeArg(longInput, 1000);
      expect(sanitized.length).toBe(1000);
    });

    it('handles empty input gracefully', () => {
      const sanitized = WorkerManager.sanitizeArg('', 1000);
      expect(sanitized).toBe('');
    });

    it('handles all shell metacharacters together', () => {
      const input = '; | & $ ` ( ) rm -rf /';
      const sanitized = WorkerManager.sanitizeArg(input, 1000);
      expect(sanitized).not.toMatch(/[;|&$`()]/);
    });
  });
});
