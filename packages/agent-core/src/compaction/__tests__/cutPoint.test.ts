import { describe, it, expect } from 'vitest';
import {
  isValidCutPoint,
  isToolResult,
  isToolCall,
  isTurnBoundary,
  findCutPoint,
  type CompactionMessage,
  type MessageWithTokens,
} from '../index.js';

describe('Cut Point Rules', () => {
  // ==========================================================================
  // isValidCutPoint Tests (6 cases)
  // ==========================================================================
  describe('isValidCutPoint', () => {
    it('accepts user messages as valid cut points', () => {
      expect(isValidCutPoint({ role: 'user', content: 'Hello' })).toBe(true);
    });

    it('accepts assistant messages as valid cut points', () => {
      expect(isValidCutPoint({ role: 'assistant', content: 'Hi there' })).toBe(true);
    });

    it('accepts custom messages (with messageType) as valid cut points', () => {
      const bashMsg: CompactionMessage = {
        role: 'assistant',
        content: 'Running bash command',
        messageType: 'bash_execution',
      };
      expect(isValidCutPoint(bashMsg)).toBe(true);
    });

    it('rejects toolResult messages (must stay with tool call)', () => {
      expect(isValidCutPoint({ role: 'toolResult', content: 'result' })).toBe(false);
    });

    it('rejects tool (tool call) messages', () => {
      expect(isValidCutPoint({ role: 'tool', content: 'tool call' })).toBe(false);
    });

    it('rejects system messages', () => {
      expect(isValidCutPoint({ role: 'system', content: 'system prompt' })).toBe(false);
    });
  });

  // ==========================================================================
  // isToolResult / isToolCall Tests (2 cases)
  // ==========================================================================
  describe('isToolResult', () => {
    it('returns true for toolResult messages', () => {
      expect(isToolResult({ role: 'toolResult', content: 'result data' })).toBe(true);
    });

    it('returns false for non-toolResult messages', () => {
      expect(isToolResult({ role: 'user', content: 'hello' })).toBe(false);
      expect(isToolResult({ role: 'assistant', content: 'response' })).toBe(false);
      expect(isToolResult({ role: 'tool', content: 'call' })).toBe(false);
    });
  });

  describe('isToolCall', () => {
    it('returns true for tool (tool call) messages', () => {
      expect(isToolCall({ role: 'tool', content: 'tool invocation' })).toBe(true);
    });

    it('returns false for non-tool messages', () => {
      expect(isToolCall({ role: 'user', content: 'hello' })).toBe(false);
      expect(isToolCall({ role: 'assistant', content: 'response' })).toBe(false);
      expect(isToolCall({ role: 'toolResult', content: 'result' })).toBe(false);
    });
  });

  // ==========================================================================
  // isTurnBoundary Test (1 case)
  // ==========================================================================
  describe('isTurnBoundary', () => {
    it('identifies user messages as turn boundaries', () => {
      expect(isTurnBoundary({ role: 'user', content: 'next task' })).toBe(true);
      expect(isTurnBoundary({ role: 'assistant', content: 'response' })).toBe(false);
      expect(isTurnBoundary({ role: 'toolResult', content: 'result' })).toBe(false);
    });
  });

  // ==========================================================================
  // findCutPoint Tests (4 cases)
  // ==========================================================================
  describe('findCutPoint', () => {
    const createMessages = (): MessageWithTokens[] => [
      { id: '1', role: 'user', content: 'Hello', tokenCount: 100 },
      { id: '2', role: 'assistant', content: 'Hi there!', tokenCount: 200 },
      { id: '3', role: 'user', content: 'Do something', tokenCount: 150 },
      { id: '4', role: 'assistant', content: 'Okay', tokenCount: 100 },
      { id: '5', role: 'tool', content: 'Tool call', tokenCount: 50 },
      { id: '6', role: 'toolResult', content: 'Result', tokenCount: 500 },
      { id: '7', role: 'assistant', content: 'Done', tokenCount: 100 },
      { id: '8', role: 'user', content: 'Next task', tokenCount: 150 },
      { id: '9', role: 'assistant', content: 'Working on it', tokenCount: 200 },
    ];

    it('returns empty summarize when all messages fit within keepRecentTokens', () => {
      const messages = createMessages();
      const result = findCutPoint(messages, { keepRecentTokens: 10000 });

      expect(result.messagesToSummarize).toHaveLength(0);
      expect(result.messagesToKeep).toHaveLength(messages.length);
    });

    it('prefers cutting at user message (turn boundary)', () => {
      const messages: MessageWithTokens[] = [
        { id: '1', role: 'user', content: 'Hello', tokenCount: 50 },
        { id: '2', role: 'assistant', content: 'Response 1', tokenCount: 50 },
        { id: '3', role: 'user', content: 'Task 2', tokenCount: 50 },
        { id: '4', role: 'assistant', content: 'Response 2', tokenCount: 50 },
        { id: '5', role: 'user', content: 'Task 3', tokenCount: 50 },
        { id: '6', role: 'assistant', content: 'Response 3', tokenCount: 50 },
      ];

      const result = findCutPoint(messages, { keepRecentTokens: 100 });

      // The first kept message should be a valid cut point
      if (result.messagesToKeep.length > 0) {
        const firstKept = result.messagesToKeep[0];
        expect(['user', 'assistant']).toContain(firstKept.role);
      }
      expect(result.cutIndex).toBeGreaterThan(0);
    });

    it('respects minMessagesToKeep', () => {
      const messages = createMessages();
      const result = findCutPoint(messages, {
        keepRecentTokens: 0,
        minMessagesToKeep: 4,
      });

      expect(result.messagesToKeep.length).toBeGreaterThanOrEqual(4);
    });

    it('handles empty messages array gracefully', () => {
      const result = findCutPoint([], { keepRecentTokens: 1000 });

      expect(result.cutIndex).toBe(0);
      expect(result.messagesToSummarize).toHaveLength(0);
      expect(result.messagesToKeep).toHaveLength(0);
      expect(result.isSplitTurn).toBe(false);
    });
  });
});
