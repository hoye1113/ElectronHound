import { describe, it, expect, beforeEach } from 'vitest';
import { OperationHandler } from '../operation-handler.js';
import type { Operation } from '../operation-handler.js';

describe('OperationHandler', () => {
  let handler: OperationHandler;

  beforeEach(() => {
    handler = new OperationHandler();
  });

  // ── health_check ────────────────────────────────────────────────────────

  describe('health_check', () => {
    it('should return success with status ok', async () => {
      const result = await handler.handle({ type: 'health_check' });

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).status).toBe('ok');
      expect(result.error).toBeUndefined();
    });

    it('should report hasElectron as false in Node.js', async () => {
      const result = await handler.handle({ type: 'health_check' });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.hasElectron).toBe(false);
    });

    it('should report zero mock dialog count initially', async () => {
      const result = await handler.handle({ type: 'health_check' });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.mockDialogCount).toBe(0);
    });

    it('should reflect updated mock dialog count', async () => {
      await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'open', response: {} },
      });
      await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'save', response: {} },
      });

      const result = await handler.handle({ type: 'health_check' });
      const data = result.data as Record<string, unknown>;
      expect(data.mockDialogCount).toBe(2);
    });
  });

  // ── execute_main ────────────────────────────────────────────────────────

  describe('execute_main', () => {
    it('should return error when Electron is not available', async () => {
      const result = await handler.handle({
        type: 'execute_main',
        payload: { code: 'console.log("test")' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Electron module not available');
    });

    it('should return error for missing code', async () => {
      const result = await handler.handle({
        type: 'execute_main',
        payload: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('should return error for empty payload', async () => {
      const result = await handler.handle({ type: 'execute_main' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('should return error for empty string code', async () => {
      const result = await handler.handle({
        type: 'execute_main',
        payload: { code: '' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('should return error for non-string code', async () => {
      const result = await handler.handle({
        type: 'execute_main',
        payload: { code: 12345 },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('should return error for null code', async () => {
      const result = await handler.handle({
        type: 'execute_main',
        payload: { code: null },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('should return error for boolean code', async () => {
      const result = await handler.handle({
        type: 'execute_main',
        payload: { code: true },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty string');
    });
  });

  // ── send_ipc ────────────────────────────────────────────────────────────

  describe('send_ipc', () => {
    it('should return error when Electron is not available', async () => {
      const result = await handler.handle({
        type: 'send_ipc',
        payload: { channel: 'test', args: ['hello'] },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Electron module not available');
    });

    it('should return error for missing channel', async () => {
      const result = await handler.handle({
        type: 'send_ipc',
        payload: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('should return error for empty string channel', async () => {
      const result = await handler.handle({
        type: 'send_ipc',
        payload: { channel: '' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('should return error for non-string channel', async () => {
      const result = await handler.handle({
        type: 'send_ipc',
        payload: { channel: 123 },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('should return error for null channel', async () => {
      const result = await handler.handle({
        type: 'send_ipc',
        payload: { channel: null },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('should return error for empty payload', async () => {
      const result = await handler.handle({ type: 'send_ipc' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty string');
    });
  });

  // ── mock_dialog ─────────────────────────────────────────────────────────

  describe('mock_dialog', () => {
    it('should store open dialog mock and return success', async () => {
      const result = await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'open', response: { filePaths: ['/tmp/test'] } },
      });

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).mocked).toBe(true);
      expect((result.data as Record<string, unknown>).dialogType).toBe('open');
    });

    it('should store save dialog mock', async () => {
      const result = await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'save', response: { filePath: '/tmp/out.txt' } },
      });

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).dialogType).toBe('save');
    });

    it('should store message dialog mock', async () => {
      const result = await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'message', response: { response: 0 } },
      });

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).dialogType).toBe('message');
    });

    it('should reject invalid dialogType', async () => {
      const result = await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'invalid', response: {} },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('dialogType');
    });

    it('should reject missing response', async () => {
      const result = await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'save' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('response');
    });

    it('should reject when response is explicitly undefined', async () => {
      const result = await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'open', response: undefined },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('response');
    });

    it('should track active mock count', async () => {
      await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'open', response: {} },
      });
      const result = await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'save', response: {} },
      });

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).activeMockCount).toBe(2);
    });

    it('should overwrite existing mock for same dialogType', async () => {
      await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'open', response: { filePaths: ['/first'] } },
      });
      await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'open', response: { filePaths: ['/second'] } },
      });

      // Count should still be 1 since it overwrites
      const result = await handler.handle({ type: 'health_check' });
      const data = result.data as Record<string, unknown>;
      expect(data.mockDialogCount).toBe(1);
    });

    it('should reject for missing payload', async () => {
      const result = await handler.handle({ type: 'mock_dialog' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should accept falsy but defined response values', async () => {
      const result = await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'open', response: false },
      });

      expect(result.success).toBe(true);
    });

    it('should accept null response value', async () => {
      const result = await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'open', response: null },
      });

      expect(result.success).toBe(true);
    });

    it('should accept empty object response', async () => {
      const result = await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'save', response: {} },
      });

      expect(result.success).toBe(true);
    });
  });

  // ── get_menu_items ──────────────────────────────────────────────────────

  describe('get_menu_items', () => {
    it('should return error when Electron is not available', async () => {
      const result = await handler.handle({ type: 'get_menu_items' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Electron module not available');
    });
  });

  // ── unknown operation ───────────────────────────────────────────────────

  describe('unknown operation', () => {
    it('should return error for unknown operation type', async () => {
      const unknownOp = { type: 'unknown_op' } as unknown as Operation;
      const result = await handler.handle(unknownOp);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown operation type');
      expect(result.error).toContain('unknown_op');
    });

    it('should return error for completely empty type', async () => {
      const unknownOp = { type: '' } as unknown as Operation;
      const result = await handler.handle(unknownOp);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown operation type');
    });

    it('should return error for numeric type', async () => {
      const unknownOp = { type: 42 } as unknown as Operation;
      const result = await handler.handle(unknownOp);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown operation type');
    });
  });

  // ── result shape ────────────────────────────────────────────────────────

  describe('result shape', () => {
    it('should always return OperationResult shape for all operations', async () => {
      const operations: Operation[] = [
        { type: 'health_check' },
        { type: 'execute_main' },
        { type: 'send_ipc' },
        { type: 'mock_dialog' },
        { type: 'get_menu_items' },
      ];

      for (const op of operations) {
        const result = await handler.handle(op);
        expect(result).toHaveProperty('success');
        expect(typeof result.success).toBe('boolean');
        // error is either undefined or a string
        if (result.error !== undefined) {
          expect(typeof result.error).toBe('string');
        }
      }
    });

    it('should return data as object when present on success', async () => {
      const result = await handler.handle({ type: 'health_check' });
      expect(result.success).toBe(true);
      expect(typeof result.data).toBe('object');
      expect(result.data).not.toBeNull();
    });
  });

  // ── multiple sequential operations ──────────────────────────────────────

  describe('sequential operations', () => {
    it('should handle multiple health checks in sequence', async () => {
      const r1 = await handler.handle({ type: 'health_check' });
      const r2 = await handler.handle({ type: 'health_check' });
      const r3 = await handler.handle({ type: 'health_check' });

      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
      expect(r3.success).toBe(true);
    });

    it('should handle mixed operation types', async () => {
      const r1 = await handler.handle({ type: 'health_check' });
      const r2 = await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'open', response: {} },
      });
      const r3 = await handler.handle({
        type: 'execute_main',
        payload: { code: '1+1' },
      });
      const r4 = await handler.handle({ type: 'health_check' });

      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
      expect(r3.success).toBe(false); // No Electron
      expect(r4.success).toBe(true);
      // Mock count should reflect the one mock we added
      expect((r4.data as Record<string, unknown>).mockDialogCount).toBe(1);
    });
  });
});
