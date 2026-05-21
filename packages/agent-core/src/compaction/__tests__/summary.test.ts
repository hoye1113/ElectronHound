import { describe, it, expect } from 'vitest';
import {
  generateSummary,
  extractGoal,
  extractProgress,
  extractKeyDecisions,
  extractNextSteps,
  extractCriticalContext,
  extractFileOperations,
  buildSummaryMarkdown,
  type CompactionMessage,
  type SummaryData,
} from '../index.js';

describe('Summary Generation (Pi Format)', () => {

  // ==========================================================================
  // generateSummary (5 cases)
  // ==========================================================================
  describe('generateSummary', () => {
    it('produces all Pi sections in output', async () => {
      const messages: CompactionMessage[] = [
        { role: 'user', content: 'Goal: Build a REST API with authentication' },
        { role: 'assistant', content: 'Created the auth module' },
        { role: 'assistant', content: 'Decision: chose JWT tokens for auth' },
        { role: 'assistant', content: 'Next: implement the middleware' },
        { role: 'assistant', content: 'Note: API key rotation is critical' },
      ];

      const result = await generateSummary(messages);

      expect(result).toContain('## Goal');
      expect(result).toContain('## Progress');
      expect(result).toContain('### Done');
      expect(result).toContain('## Key Decisions');
      expect(result).toContain('## Next Steps');
      expect(result).toContain('## Critical Context');
    });

    it('includes file tracking sections with read and modified files', async () => {
      const messages: CompactionMessage[] = [
        { role: 'user', content: 'Implement the feature' },
        {
          role: 'assistant',
          content: [
            { type: 'toolCall', name: 'read', arguments: { path: 'src/api.ts' } },
            { type: 'toolCall', name: 'edit', arguments: { path: 'src/api.ts' } },
            { type: 'toolCall', name: 'read', arguments: { path: 'src/utils.ts' } },
          ],
        },
      ];

      const result = await generateSummary(messages);

      expect(result).toContain('<modified-files>');
      expect(result).toContain('src/api.ts');
      // utils.ts should be in read-files since it was only read
      expect(result).toContain('<read-files>');
      expect(result).toContain('src/utils.ts');
    });

    it('prepends customInstructions when provided', async () => {
      const messages: CompactionMessage[] = [
        { role: 'user', content: 'Work on feature' },
      ];

      const result = await generateSummary(messages, {
        customInstructions: 'Focus on API changes only',
      });

      expect(result).toContain('Focus on API changes only');
      expect(result).toContain('## Goal');
    });

    it('merges file tracking with previous summary (cumulative)', async () => {
      const previousSummary = `## Goal
Previous work

<read-files>
old/read.ts
</read-files>

<modified-files>
old/modified.ts
</modified-files>`;

      const messages: CompactionMessage[] = [
        { role: 'user', content: 'Continue work' },
        {
          role: 'assistant',
          content: [
            { type: 'toolCall', name: 'read', arguments: { path: 'new/read.ts' } },
            { type: 'toolCall', name: 'write', arguments: { path: 'new/written.ts' } },
          ],
        },
      ];

      const result = await generateSummary(messages, { previousSummary });

      // Should contain files from both previous and current
      expect(result).toContain('old/modified.ts');
      expect(result).toContain('new/read.ts');
      expect(result).toContain('new/written.ts');
    });

    it('handles empty messages array gracefully', async () => {
      const result = await generateSummary([]);

      expect(result).toContain('## Goal');
      expect(result).toContain('## Progress');
      expect(result).toContain('## Key Decisions');
      expect(result).toContain('## Next Steps');
      expect(result).toContain('## Critical Context');
    });
  });

  // ==========================================================================
  // extractGoal (2 cases)
  // ==========================================================================
  describe('extractGoal', () => {
    it('extracts explicit goal from user message', () => {
      const messages: CompactionMessage[] = [
        { role: 'user', content: 'Goal: Implement a dark mode toggle' },
      ];

      const goal = extractGoal(messages);
      expect(goal).toContain('Implement a dark mode toggle');
    });

    it('falls back to first user message content when no goal pattern matches', () => {
      const messages: CompactionMessage[] = [
        { role: 'user', content: 'Help me refactor the auth module' },
        { role: 'assistant', content: 'Sure, let me look at it.' },
      ];

      const goal = extractGoal(messages);
      expect(goal).toContain('Help me refactor the auth module');
    });
  });

  // ==========================================================================
  // extractProgress (1 case)
  // ==========================================================================
  describe('extractProgress', () => {
    it('categorizes done, in-progress, and blocked items', () => {
      const messages: CompactionMessage[] = [
        { role: 'user', content: 'What is the status?' },
        { role: 'assistant', content: 'Created the database schema.\nCurrently working on migrations.\nBlocked: missing migration tool.' },
      ];

      const progress = extractProgress(messages);

      expect(progress.done.length).toBeGreaterThan(0);
      expect(progress.done.some((d) => d.toLowerCase().includes('created'))).toBe(true);

      expect(progress.inProgress.length).toBeGreaterThan(0);
      expect(progress.inProgress.some((d) => d.toLowerCase().includes('working on'))).toBe(true);

      expect(progress.blocked.length).toBeGreaterThan(0);
      expect(progress.blocked.some((d) => d.toLowerCase().includes('blocked'))).toBe(true);
    });
  });

  // ==========================================================================
  // extractKeyDecisions (1 case)
  // ==========================================================================
  describe('extractKeyDecisions', () => {
    it('extracts lines containing decision keywords', () => {
      const messages: CompactionMessage[] = [
        { role: 'user', content: 'Which database?' },
        { role: 'assistant', content: 'We decided to use PostgreSQL because it supports JSONB.' },
        { role: 'assistant', content: 'We chose Redis for caching.' },
      ];

      const decisions = extractKeyDecisions(messages);

      expect(decisions.length).toBeGreaterThanOrEqual(2);
      expect(decisions.some((d) => d.includes('PostgreSQL'))).toBe(true);
      expect(decisions.some((d) => d.includes('Redis'))).toBe(true);
    });
  });

  // ==========================================================================
  // extractNextSteps (1 case)
  // ==========================================================================
  describe('extractNextSteps', () => {
    it('extracts next step patterns from messages', () => {
      const messages: CompactionMessage[] = [
        { role: 'assistant', content: 'Done with the API.\nNext: add rate limiting.\nTODO: write integration tests.\nRemaining: deploy to staging.' },
      ];

      const steps = extractNextSteps(messages);

      expect(steps.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ==========================================================================
  // extractCriticalContext (1 case)
  // ==========================================================================
  describe('extractCriticalContext', () => {
    it('extracts lines with critical context patterns', () => {
      const messages: CompactionMessage[] = [
        { role: 'assistant', content: 'Important: Use the v2 API endpoint.\nRemember: tests must pass before merge.\nWarning: legacy auth is still active in prod.' },
      ];

      const context = extractCriticalContext(messages);

      expect(context).toContain('Important');
      expect(context).toContain('Remember');
      expect(context).toContain('Warning');
    });
  });

  // ==========================================================================
  // extractFileOperations (1 case)
  // ==========================================================================
  describe('extractFileOperations', () => {
    it('correctly separates read-only from modified files', () => {
      const messages: CompactionMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'toolCall', name: 'read', arguments: { path: 'src/config.ts' } },
            { type: 'toolCall', name: 'read', arguments: { path: 'src/app.ts' } },
            { type: 'toolCall', name: 'edit', arguments: { path: 'src/app.ts' } },
            { type: 'toolCall', name: 'write', arguments: { path: 'src/new.ts' } },
          ],
        },
      ];

      const ops = extractFileOperations(messages);

      expect(ops.readFiles).toEqual(['src/config.ts']);
      expect(ops.modifiedFiles).toEqual(['src/app.ts', 'src/new.ts']);
    });
  });

  // ==========================================================================
  // buildSummaryMarkdown (2 cases)
  // ==========================================================================
  describe('buildSummaryMarkdown', () => {
    it('produces correct Pi format with all sections populated', () => {
      const data: SummaryData = {
        goal: 'Build a login page',
        progress: {
          done: ['Created layout component'],
          inProgress: ['Adding form validation'],
          blocked: ['Waiting for design specs'],
        },
        keyDecisions: ['Use React Hook Form for validation'],
        nextSteps: ['Implement error handling'],
        criticalContext: '- API endpoint is /auth/login',
        readFiles: ['src/api.ts'],
        modifiedFiles: ['src/login.tsx'],
      };

      const result = buildSummaryMarkdown(data);

      expect(result).toContain('## Goal\nBuild a login page');
      expect(result).toContain('### Done\n- Created layout component');
      expect(result).toContain('### In Progress\n- Adding form validation');
      expect(result).toContain('### Blocked\n- Waiting for design specs');
      expect(result).toContain('## Key Decisions\n- Use React Hook Form for validation');
      expect(result).toContain('## Next Steps\n1. Implement error handling');
      expect(result).toContain('## Critical Context\n- API endpoint is /auth/login');
      expect(result).toContain('<read-files>\nsrc/api.ts\n</read-files>');
      expect(result).toContain('<modified-files>\nsrc/login.tsx\n</modified-files>');
    });

    it('handles empty data with fallback text', () => {
      const data: SummaryData = {
        goal: 'No goal identified',
        progress: { done: [], inProgress: [], blocked: [] },
        keyDecisions: [],
        nextSteps: [],
        criticalContext: '- No critical context identified',
        readFiles: [],
        modifiedFiles: [],
      };

      const result = buildSummaryMarkdown(data);

      expect(result).toContain('## Goal\nNo goal identified');
      expect(result).toContain('- No completed tasks');
      expect(result).toContain('- No key decisions recorded');
      expect(result).toContain('Continue with current tasks');
      // No file sections when empty
      expect(result).not.toContain('<read-files>');
      expect(result).not.toContain('<modified-files>');
    });
  });
});
