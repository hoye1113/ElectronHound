import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadRelevantPatterns,
  formatPatternsForPrompt,
  type FeedbackPattern,
} from '../prompts/feedbackLoader.js';

describe('feedbackLoader', () => {
  let testDir: string;
  let patternsPath: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `feedback-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    patternsPath = join(testDir, 'patterns.jsonl');
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  function writePatterns(patterns: FeedbackPattern[]) {
    const lines = patterns.map((p) => JSON.stringify(p));
    writeFileSync(patternsPath, lines.join('\n') + '\n', 'utf-8');
  }

  const basePattern: FeedbackPattern = {
    id: '870c89b6-6230-4a81-b6b3-651a7bc68a1e',
    errorType: 'execute_main_failure',
    targetDescription: 'The IPC bridge is disconnected',
    remediationHint: 'Check the action parameters and retry.',
    similarityKeywords: ['execute_main', 'verify', 'failure'],
    frequency: 1,
    lastSeen: '2026-05-29T01:48:29.828Z',
  };

  const launchPattern: FeedbackPattern = {
    id: '6aaa5fb2-cefe-49da-9a89-293811f9db1d',
    errorType: 'electron_launch_failure',
    targetDescription: 'The app needs to be launched first',
    remediationHint: 'Use electron_launch before any other tools.',
    similarityKeywords: ['electron_launch', 'verify', 'failure', 'launch'],
    frequency: 2,
    lastSeen: '2026-05-29T01:57:57.054Z',
  };

  const closePattern: FeedbackPattern = {
    id: '01111247-160c-4581-9d68-1b2ab0ee8949',
    errorType: 'electron_close_failure',
    targetDescription: 'Failed to close the app',
    remediationHint: 'Check the PID is correct.',
    similarityKeywords: ['electron_close', 'verify', 'failure', 'close'],
    frequency: 1,
    lastSeen: '2026-05-29T02:10:44.289Z',
  };

  describe('loadRelevantPatterns', () => {
    it('loads patterns and scores by keyword overlap', () => {
      writePatterns([basePattern, launchPattern, closePattern]);

      // Goal contains "launch" which matches launchPattern
      const result = loadRelevantPatterns(patternsPath, 'Launch the Electron app and verify');
      expect(result.length).toBeGreaterThan(0);
      // launchPattern should rank highest due to "launch" keyword
      expect(result[0].errorType).toBe('electron_launch_failure');
    });

    it('returns empty when no patterns match the goal', () => {
      writePatterns([basePattern]);

      // Goal has no keywords overlapping with similarityKeywords
      const result = loadRelevantPatterns(patternsPath, 'Hello world');
      expect(result).toEqual([]);
    });

    it('limits results to maxPatterns', () => {
      writePatterns([basePattern, launchPattern, closePattern]);

      // All patterns share "verify" and "failure" keywords
      const result = loadRelevantPatterns(patternsPath, 'verify the failure', 2);
      expect(result.length).toBeLessThanOrEqual(2);
    });

    it('handles missing JSONL file gracefully', () => {
      const result = loadRelevantPatterns('/nonexistent/path/patterns.jsonl', 'test goal');
      expect(result).toEqual([]);
    });

    it('handles malformed JSONL lines gracefully', () => {
      writeFileSync(
        patternsPath,
        'not valid json\n' + JSON.stringify(basePattern) + '\n{broken\n',
        'utf-8',
      );

      const result = loadRelevantPatterns(patternsPath, 'execute_main verify failure');
      expect(result.length).toBe(1);
      expect(result[0].id).toBe(basePattern.id);
    });

    it('handles empty JSONL file', () => {
      writeFileSync(patternsPath, '', 'utf-8');
      const result = loadRelevantPatterns(patternsPath, 'test goal');
      expect(result).toEqual([]);
    });

    it('filters out patterns with missing required fields', () => {
      const invalidPattern = { id: '123', errorType: 'test' }; // missing similarityKeywords
      writePatterns([invalidPattern as unknown as FeedbackPattern, basePattern]);

      const result = loadRelevantPatterns(patternsPath, 'execute_main verify');
      expect(result.length).toBe(1);
      expect(result[0].id).toBe(basePattern.id);
    });

    it('scores by partial keyword match', () => {
      writePatterns([basePattern]);

      // "execute" should partially match "execute_main"
      const result = loadRelevantPatterns(patternsPath, 'execute the main process');
      expect(result.length).toBe(1);
      expect(result[0].errorType).toBe('execute_main_failure');
    });
  });

  describe('formatPatternsForPrompt', () => {
    it('produces readable output with header and pattern lines', () => {
      const patterns: FeedbackPattern[] = [basePattern, launchPattern];

      const result = formatPatternsForPrompt(patterns);

      expect(result).toContain('Previous failure patterns to avoid:');
      expect(result).toContain(`[${basePattern.errorType}]`);
      expect(result).toContain(basePattern.targetDescription);
      expect(result).toContain(basePattern.remediationHint);
      expect(result).toContain(`[${launchPattern.errorType}]`);
    });

    it('returns empty string for empty patterns array', () => {
      const result = formatPatternsForPrompt([]);
      expect(result).toBe('');
    });

    it('formats single pattern correctly', () => {
      const result = formatPatternsForPrompt([basePattern]);

      expect(result).toBe(
        `Previous failure patterns to avoid:\n- [${basePattern.errorType}] ${basePattern.targetDescription}: ${basePattern.remediationHint}`,
      );
    });
  });
});
