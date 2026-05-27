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
    const patterns: FeedbackPattern[] = [];

    for (const line of content.split('\n')) {
      if (line.trim().length === 0) continue;
      try {
        const raw = JSON.parse(line);
        patterns.push(FeedbackPatternSchema.parse(raw));
      } catch (err) {
        server.log.warn(
          { err, line: line.slice(0, 120) },
          'Skipping invalid feedback pattern line',
        );
      }
    }

    return { patterns };
  });
}
