import { describe, it, expect, beforeEach } from 'vitest';
import { OperationHandler } from '../operation-handler.js';
import type { Operation, OperationResult } from '../operation-handler.js';

describe('OperationHandler', () => {
  let handler: OperationHandler;

  beforeEach(() => {
    handler = new OperationHandler();
  });

  describe('health_check', () => {
    it('should return success with status ok', async () => {
      const result = await handler.handle({ type: 'health_check' });

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).status).toBe('ok');
      expect(result.error).toBeUndefined();
    });
  });

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
  });

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
  });

  describe('mock_dialog', () => {
    it('should store mock config and return success', async () => {
      const result = await handler.handle({
        type: 'mock_dialog',
        payload: { dialogType: 'open', response: { filePaths: ['/tmp/test'] } },
      });

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).mocked).toBe(true);
      expect((result.data as Record<string, unknown>).dialogType).toBe('open');
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
  });

  describe('get_menu_items', () => {
    it('should return error when Electron is not available', async () => {
      const result = await handler.handle({ type: 'get_menu_items' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Electron module not available');
    });
  });

  describe('unknown operation', () => {
    it('should return error for unknown operation type', async () => {
      const unknownOp = { type: 'unknown_op' } as unknown as Operation;
      const result = await handler.handle(unknownOp);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown operation type');
    });
  });

  describe('result shape', () => {
    it('should always return OperationResult shape', async () => {
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
      }
    });
  });
});
