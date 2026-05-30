/**
 * Feedback Pattern Loader
 *
 * Loads historical failure patterns from the feedback JSONL store
 * and surfaces relevant ones for injection into the agent's recovery
 * planning prompt. Only triggered on verify FAIL — never on success.
 */

import { readFileSync, existsSync } from 'node:fs';

export interface FeedbackPattern {
  id: string;
  errorType: string;
  targetDescription: string;
  remediationHint: string;
  similarityKeywords: string[];
  frequency: number;
  lastSeen: string;
}

interface ScoredPattern {
  pattern: FeedbackPattern;
  score: number;
}

/**
 * Load feedback patterns relevant to the current goal.
 *
 * Reads the JSONL file, parses each line, scores patterns by keyword
 * overlap with the goal, and returns the top `maxPatterns` matches.
 *
 * @param patternsPath - Absolute path to the JSONL patterns file.
 * @param goal - The current task goal / prompt.
 * @param maxPatterns - Maximum patterns to return (default 3).
 * @returns Matched patterns sorted by relevance, empty if none match or file missing.
 */
export function loadRelevantPatterns(
  patternsPath: string,
  goal: string,
  maxPatterns: number = 3,
): FeedbackPattern[] {
  if (!existsSync(patternsPath)) {
    return [];
  }

  let raw: string;
  try {
    raw = readFileSync(patternsPath, 'utf-8');
  } catch {
    return [];
  }

  const lines = raw.split('\n').filter((line) => line.trim().length > 0);
  const patterns: FeedbackPattern[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as FeedbackPattern;
      // Basic shape validation
      if (
        parsed &&
        typeof parsed.id === 'string' &&
        typeof parsed.errorType === 'string' &&
        Array.isArray(parsed.similarityKeywords)
      ) {
        patterns.push(parsed);
      }
    } catch {
      // Skip malformed lines silently
    }
  }

  if (patterns.length === 0) {
    return [];
  }

  // Split goal into keywords (words > 2 chars, lowercased)
  const goalKeywords = goal
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (goalKeywords.length === 0) {
    return [];
  }

  // Score each pattern by keyword overlap with similarityKeywords
  const scored: ScoredPattern[] = patterns.map((pattern) => {
    const lowerKeywords = pattern.similarityKeywords.map((k) => k.toLowerCase());
    let score = 0;
    for (const kw of goalKeywords) {
      if (lowerKeywords.some((pk) => pk.includes(kw) || kw.includes(pk))) {
        score++;
      }
    }
    return { pattern, score };
  });

  return scored
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPatterns)
    .map(({ pattern }) => pattern);
}

/**
 * Format feedback patterns into a prompt section for injection
 * into the agent's recovery planning prompt.
 *
 * @param patterns - The patterns to format.
 * @returns A formatted string block, or empty string if no patterns.
 */
export function formatPatternsForPrompt(patterns: FeedbackPattern[]): string {
  if (patterns.length === 0) {
    return '';
  }

  const lines = patterns.map(
    (p) => `- [${p.errorType}] ${p.targetDescription}: ${p.remediationHint}`,
  );

  return `Previous failure patterns to avoid:\n${lines.join('\n')}`;
}
