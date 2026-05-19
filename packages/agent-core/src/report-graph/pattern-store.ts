import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type { FeedbackPattern } from '@eata/shared-types';

export class PatternStore {
  private filePath: string;

  constructor(dataDir: string) {
    this.filePath = join(dataDir, 'feedback', 'patterns.jsonl');
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  readAll(): FeedbackPattern[] {
    if (!existsSync(this.filePath)) {
      return [];
    }
    const raw = readFileSync(this.filePath, 'utf-8');
    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as FeedbackPattern);
  }

  /**
   * Dedup by errorType + targetDescription similarity.
   * If a matching pattern exists, increment frequency and update lastSeen.
   * Otherwise, append the new pattern.
   * Returns the stored pattern (updated or new).
   */
  upsert(pattern: FeedbackPattern): FeedbackPattern {
    const existing = this.readAll();

    const matchIndex = existing.findIndex((p) =>
      p.errorType === pattern.errorType &&
      this.isSimilarDescription(p.targetDescription, pattern.targetDescription)
    );

    if (matchIndex >= 0) {
      const updated: FeedbackPattern = {
        ...existing[matchIndex],
        frequency: existing[matchIndex].frequency + (pattern.frequency || 1),
        lastSeen: pattern.lastSeen,
        similarityKeywords: Array.from(
          new Set([...existing[matchIndex].similarityKeywords, ...pattern.similarityKeywords])
        ).slice(0, 10),
        relatedGoalPatterns: Array.from(
          new Set([...existing[matchIndex].relatedGoalPatterns, ...pattern.relatedGoalPatterns])
        ),
      };
      existing[matchIndex] = updated;
      this.writeAll(existing);
      return updated;
    }

    this.append(pattern);
    return pattern;
  }

  /**
   * Load patterns relevant to the given goal for few-shot prompt injection.
   * Returns up to maxCount patterns, formatted as a string.
   */
  loadPatternsForPrompt(goal: string, maxCount: number = 50): string {
    const patterns = this.readAll();
    if (patterns.length === 0) return '';

    const lowerGoal = goal.toLowerCase();
    const relevant = patterns
      .filter((p) => {
        const keywords = p.similarityKeywords.join(' ').toLowerCase();
        const goalPatterns = p.relatedGoalPatterns.join(' ').toLowerCase();
        const desc = p.targetDescription.toLowerCase();
        const combined = `${keywords} ${goalPatterns} ${desc}`;
        return lowerGoal.split(/\s+/).some((word) => word.length > 3 && combined.includes(word));
      })
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, maxCount);

    if (relevant.length === 0) return '';

    return `\nRelevant failure patterns from past tests:\n${
      relevant
        .map((p) => `- ${p.errorType}: ${p.remediationHint} (keywords: ${p.similarityKeywords.join(', ')})`)
        .join('\n')
    }`;
  }

  private append(pattern: FeedbackPattern): void {
    const line = JSON.stringify(pattern) + '\n';
    appendFileSync(this.filePath, line);
  }

  private writeAll(patterns: FeedbackPattern[]): void {
    const content = patterns.map((p) => JSON.stringify(p)).join('\n') + '\n';
    writeFileSync(this.filePath, content);
  }

  private isSimilarDescription(a: string, b: string): boolean {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const na = normalize(a);
    const nb = normalize(b);
    if (na === nb) return true;
    // Check if either contains the other as substring
    return na.includes(nb) || nb.includes(na);
  }
}
