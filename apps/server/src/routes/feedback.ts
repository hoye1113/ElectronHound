import type { FastifyInstance } from 'fastify';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { FeedbackPatternSchema, type FeedbackPattern } from '@eata/shared-types';

const PATTERNS_FILE = join('data', 'feedback', 'patterns.jsonl');

export async function feedbackRoutes(server: FastifyInstance) {
  server.get('/feedback/patterns', async () => {
    if (!existsSync(PATTERNS_FILE)) {
      return { patterns: [] };
    }

    const content = readFileSync(PATTERNS_FILE, 'utf-8');
    const patterns: FeedbackPattern[] = content
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const raw = JSON.parse(line);
        return FeedbackPatternSchema.parse(raw);
      });

    return { patterns };
  });
}
