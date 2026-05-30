/**
 * VLMFallbackService Tests
 *
 * Tests for the VLMFallbackService class that provides vision-based
 * UI analysis when AXTree is insufficient.
 *
 * Covers:
 * - analyze() with sufficient AXTree (returns null)
 * - analyze() with insufficient AXTree + screenshot + VLM
 * - analyze() when MCPClient returns no screenshot
 * - analyze() when MCPClient is not provided
 * - Custom threshold and prompt options
 * - Error handling in screenshot capture
 */
import { describe, it, expect, vi } from 'vitest';
import { VLMFallbackService } from '../observe/vlmFallback.js';
import type { AXNode } from '../observe/axtreeCompressor.js';
import type { VLMProvider } from '../llm/vlm-provider.js';
import type { MCPClient } from '../mcp/client.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function createAXNode(role: string, name?: string, children?: AXNode[]): AXNode {
  return { role, name, children };
}

function createMockVLMProvider(responseText: string): VLMProvider {
  return {
    generateWithVision: vi.fn().mockResolvedValue({ text: responseText }),
    generate: vi.fn().mockResolvedValue({ text: '' }),
  } as unknown as VLMProvider;
}

function createMockMCPClient(result: { success: boolean; result?: unknown }): MCPClient {
  return {
    callTool: vi.fn().mockResolvedValue(result),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
  } as unknown as MCPClient;
}

const SAMPLE_VLM_RESPONSE = JSON.stringify([
  {
    role: 'button',
    name: 'Submit',
    description: 'Blue submit button',
    bounds: { x: 100, y: 200, width: 120, height: 40 },
  },
  {
    role: 'textbox',
    name: 'Email',
    description: 'Email input field',
    bounds: { x: 100, y: 150, width: 200, height: 30 },
  },
]);

// ── Tests ───────────────────────────────────────────────────────────────────

describe('VLMFallbackService', () => {
  describe('analyze - AXTree sufficient', () => {
    it('returns null when AXTree has enough nodes (default threshold)', async () => {
      const tree = createAXNode('application', 'App', [
        createAXNode('button', 'Click'),
        createAXNode('textbox', 'Input'),
      ]);
      // 3 nodes >= default threshold of 3

      const vlmProvider = createMockVLMProvider(SAMPLE_VLM_RESPONSE);
      const mcpClient = createMockMCPClient({
        success: true,
        result: { data: 'base64data', mimeType: 'image/png' },
      });

      const service = new VLMFallbackService(vlmProvider, mcpClient);
      const report = await service.analyze(tree, 'test goal');

      expect(report).toBeNull();
      // VLM should not have been called
      expect(vlmProvider.generateWithVision).not.toHaveBeenCalled();
    });

    it('returns null when AXTree meets custom threshold', async () => {
      const tree = createAXNode('application', 'App', [
        createAXNode('button', 'Click'),
      ]);
      // 2 nodes >= threshold of 2

      const vlmProvider = createMockVLMProvider(SAMPLE_VLM_RESPONSE);
      const mcpClient = createMockMCPClient({
        success: true,
        result: { data: 'base64data', mimeType: 'image/png' },
      });

      const service = new VLMFallbackService(vlmProvider, mcpClient);
      const report = await service.analyze(tree, 'test goal', { threshold: 2 });

      expect(report).toBeNull();
    });
  });

  describe('analyze - AXTree insufficient', () => {
    it('triggers VLM fallback when AXTree has too few nodes', async () => {
      const tree = createAXNode('application', 'App'); // Only 1 node

      const vlmProvider = createMockVLMProvider(SAMPLE_VLM_RESPONSE);
      const mcpClient = createMockMCPClient({
        success: true,
        result: { data: 'base64data', mimeType: 'image/png' },
      });

      const service = new VLMFallbackService(vlmProvider, mcpClient);
      const report = await service.analyze(tree, 'test goal');

      expect(report).not.toBeNull();
      expect(report!.source).toBe('vlm');
      expect(report!.elements).toHaveLength(2);
      expect(report!.elements[0].role).toBe('button');
      expect(report!.elements[1].role).toBe('textbox');
    });

    it('calls VLM with screenshot and prompt', async () => {
      const tree = createAXNode('application', 'App');

      const vlmProvider = createMockVLMProvider(SAMPLE_VLM_RESPONSE);
      const mcpClient = createMockMCPClient({
        success: true,
        result: { data: 'base64image', mimeType: 'image/png' },
      });

      const service = new VLMFallbackService(vlmProvider, mcpClient);
      await service.analyze(tree, 'click login button');

      expect(vlmProvider.generateWithVision).toHaveBeenCalledTimes(1);
      const callArg = (vlmProvider.generateWithVision as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArg.prompt).toContain('click login button');
      expect(callArg.images).toHaveLength(1);
      expect(callArg.images[0].data).toBe('base64image');
      expect(callArg.images[0].mimeType).toBe('image/png');
    });

    it('uses custom prompt when provided', async () => {
      const tree = createAXNode('application', 'App');

      const vlmProvider = createMockVLMProvider(SAMPLE_VLM_RESPONSE);
      const mcpClient = createMockMCPClient({
        success: true,
        result: { data: 'base64data', mimeType: 'image/png' },
      });

      const service = new VLMFallbackService(vlmProvider, mcpClient);
      await service.analyze(tree, 'test goal', { prompt: 'Custom analysis prompt' });

      const callArg = (vlmProvider.generateWithVision as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArg.prompt).toBe('Custom analysis prompt');
    });

    it('returns report with summary containing element count', async () => {
      const tree = createAXNode('application', 'App');

      const vlmProvider = createMockVLMProvider(SAMPLE_VLM_RESPONSE);
      const mcpClient = createMockMCPClient({
        success: true,
        result: { data: 'base64data', mimeType: 'image/png' },
      });

      const service = new VLMFallbackService(vlmProvider, mcpClient);
      const report = await service.analyze(tree, 'test goal');

      expect(report).not.toBeNull();
      expect(report!.summary).toContain('2 UI elements');
      expect(report!.summary).toContain('button');
      expect(report!.summary).toContain('textbox');
    });
  });

  describe('analyze - no MCPClient', () => {
    it('returns null when MCPClient is not provided', async () => {
      const tree = createAXNode('application', 'App');

      const vlmProvider = createMockVLMProvider(SAMPLE_VLM_RESPONSE);

      const service = new VLMFallbackService(vlmProvider);
      const report = await service.analyze(tree, 'test goal');

      expect(report).toBeNull();
      // VLM should not be called without screenshot
      expect(vlmProvider.generateWithVision).not.toHaveBeenCalled();
    });
  });

  describe('analyze - screenshot failure', () => {
    it('returns null when screenshot fails (unsuccessful result)', async () => {
      const tree = createAXNode('application', 'App');

      const vlmProvider = createMockVLMProvider(SAMPLE_VLM_RESPONSE);
      const mcpClient = createMockMCPClient({
        success: false,
        result: null,
      });

      const service = new VLMFallbackService(vlmProvider, mcpClient);
      const report = await service.analyze(tree, 'test goal');

      expect(report).toBeNull();
    });

    it('returns null when screenshot has no data', async () => {
      const tree = createAXNode('application', 'App');

      const vlmProvider = createMockVLMProvider(SAMPLE_VLM_RESPONSE);
      const mcpClient = createMockMCPClient({
        success: true,
        result: { mimeType: 'image/png' }, // missing data field
      });

      const service = new VLMFallbackService(vlmProvider, mcpClient);
      const report = await service.analyze(tree, 'test goal');

      expect(report).toBeNull();
    });

    it('returns null when MCP callTool throws', async () => {
      const tree = createAXNode('application', 'App');

      const vlmProvider = createMockVLMProvider(SAMPLE_VLM_RESPONSE);
      const mcpClient = {
        callTool: vi.fn().mockRejectedValue(new Error('MCP connection failed')),
        connect: vi.fn(),
        disconnect: vi.fn(),
        isConnected: vi.fn().mockReturnValue(true),
      } as unknown as MCPClient;

      const service = new VLMFallbackService(vlmProvider, mcpClient);
      const report = await service.analyze(tree, 'test goal');

      expect(report).toBeNull();
      expect(vlmProvider.generateWithVision).not.toHaveBeenCalled();
    });
  });

  describe('analyze - VLM response parsing', () => {
    it('handles VLM response wrapped in markdown code block', async () => {
      const tree = createAXNode('application', 'App');

      const markdownResponse = '```json\n' + SAMPLE_VLM_RESPONSE + '\n```';
      const vlmProvider = createMockVLMProvider(markdownResponse);
      const mcpClient = createMockMCPClient({
        success: true,
        result: { data: 'base64data', mimeType: 'image/png' },
      });

      const service = new VLMFallbackService(vlmProvider, mcpClient);
      const report = await service.analyze(tree, 'test goal');

      expect(report).not.toBeNull();
      expect(report!.elements).toHaveLength(2);
    });

    it('handles unparseable VLM response gracefully', async () => {
      const tree = createAXNode('application', 'App');

      const vlmProvider = createMockVLMProvider('This is not JSON at all');
      const mcpClient = createMockMCPClient({
        success: true,
        result: { data: 'base64data', mimeType: 'image/png' },
      });

      const service = new VLMFallbackService(vlmProvider, mcpClient);
      const report = await service.analyze(tree, 'test goal');

      expect(report).not.toBeNull();
      expect(report!.elements).toHaveLength(0);
      expect(report!.summary).toBe('No UI elements detected');
    });

    it('filters out invalid elements from VLM response', async () => {
      const tree = createAXNode('application', 'App');

      const responseWithInvalid = JSON.stringify([
        { role: 'button', name: 'Valid', description: 'Valid button', bounds: { x: 0, y: 0, width: 10, height: 10 } },
        { invalid: 'element' },
        null,
        { role: 'textbox', name: 'Also Valid', description: 'Input', bounds: { x: 0, y: 0, width: 10, height: 10 } },
      ]);

      const vlmProvider = createMockVLMProvider(responseWithInvalid);
      const mcpClient = createMockMCPClient({
        success: true,
        result: { data: 'base64data', mimeType: 'image/png' },
      });

      const service = new VLMFallbackService(vlmProvider, mcpClient);
      const report = await service.analyze(tree, 'test goal');

      expect(report).not.toBeNull();
      expect(report!.elements).toHaveLength(2);
    });
  });

  describe('analyze - null AXTree', () => {
    it('triggers VLM fallback when AXTree is null', async () => {
      const vlmProvider = createMockVLMProvider(SAMPLE_VLM_RESPONSE);
      const mcpClient = createMockMCPClient({
        success: true,
        result: { data: 'base64data', mimeType: 'image/png' },
      });

      const service = new VLMFallbackService(vlmProvider, mcpClient);
      const report = await service.analyze(null, 'test goal');

      expect(report).not.toBeNull();
      expect(report!.source).toBe('vlm');
    });
  });
});
