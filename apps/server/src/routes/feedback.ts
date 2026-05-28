import type { FastifyInstance } from 'fastify';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FeedbackPatternSchema, type FeedbackPattern } from '@eata/shared-types';

const PATTERNS_FILE = join('data', 'feedback', 'patterns.jsonl');

export async function feedbackRoutes(server: FastifyInstance) {
  server.get('/feedback/patterns', async () => {
    let content: string;
    try {
      content = await readFile(PATTERNS_FILE, 'utf-8');
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { patterns: [] };
      throw err;
    }
    const patterns: FeedbackPattern[] = [];

    for (const line of content.split('\n')) {
      if (line.trim().length === 0) continue;
      try {
        const raw = JSON.parse(line);
        patterns.push(FeedbackPatternSchema.parse(raw));
      } catch (err: unknown) {
        server.log.warn(
          { err, line: line.slice(0, 120) },
          'Skipping invalid feedback pattern line',
        );
      }
    }

    return { patterns };
  });
}
