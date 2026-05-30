/**
 * Tests for few-shot store module (prompts/few-shot/store.ts)
 *
 * Covers:
 * - loadExamples: directory exists with examples, directory missing (returns empty),
 *   no matching examples, multiple matches sorted by score, maxExamples limit
 * - matchExamples indirectly via loadExamples: keyword matching, tag scoring,
 *   zero-score filtering, short keyword filtering
 *
 * Strategy: Mock `readdirSync` and `readFileSync` from `node:fs` to control
 * filesystem behavior without touching the real disk.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node:fs before importing the module under test
vi.mock('node:fs', () => ({
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { readdirSync, readFileSync } from 'node:fs';

const mockedReaddirSync = vi.mocked(readdirSync);
const mockedReadFileSync = vi.mocked(readFileSync);

// Import after mocks are set up
const { loadExamples } = await import('../prompts/few-shot/store.js');

// ── Test fixtures ──────────────────────────────────────────────────────

function makeExample(goal: string, tags: string[]) {
  return {
    goal,
    steps: [],
    expectedResult: 'ok',
    metadata: { tags },
  };
}

const loginExample = makeExample('Test login form', ['login', 'authentication', 'form']);
const uploadExample = makeExample('Test file upload', ['file', 'upload', 'document']);
const navExample = makeExample('Test navigation menu', ['navigation', 'menu', 'browser']);
const emptyTagsExample = makeExample('No tags example', []);

// ── Tests ──────────────────────────────────────────────────────────────

describe('few-shot store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadExamples', () => {
    it('returns empty array when directory does not exist', async () => {
      mockedReaddirSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const result = await loadExamples({ goal: 'test login' });

      expect(result).toEqual([]);
      expect(mockedReaddirSync).toHaveBeenCalledOnce();
    });

    it('returns empty array when readdirSync throws any error', async () => {
      mockedReaddirSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      const result = await loadExamples({ goal: 'anything' });

      expect(result).toEqual([]);
    });

    it('returns empty array when no JSON files exist in directory', async () => {
      mockedReaddirSync.mockReturnValue(['readme.txt', 'notes.md'] as unknown as ReturnType<typeof readdirSync>);

      const result = await loadExamples({ goal: 'test login' });

      expect(result).toEqual([]);
      expect(mockedReadFileSync).not.toHaveBeenCalled();
    });

    it('loads JSON files and returns matching examples', async () => {
      mockedReaddirSync.mockReturnValue(['login.json'] as unknown as ReturnType<typeof readdirSync>);
      mockedReadFileSync.mockReturnValue(JSON.stringify(loginExample));

      const result = await loadExamples({ goal: 'test login authentication' });

      expect(result).toHaveLength(1);
      expect(result[0].goal).toBe('Test login form');
      expect(mockedReadFileSync).toHaveBeenCalledOnce();
    });

    it('returns empty array when no examples match the goal keywords', async () => {
      mockedReaddirSync.mockReturnValue(['login.json'] as unknown as ReturnType<typeof readdirSync>);
      mockedReadFileSync.mockReturnValue(JSON.stringify(loginExample));

      // Goal keywords: ['xyz', 'abc', 'qwerty'] -- none match login/tags
      const result = await loadExamples({ goal: 'xyz abc qwerty' });

      expect(result).toEqual([]);
    });

    it('sorts matches by score in descending order', async () => {
      // uploadExample has tags ['file', 'upload', 'document']
      // loginExample has tags ['login', 'authentication', 'form']
      // Goal: 'test login form file upload' => keywords: ['test', 'login', 'form', 'file', 'upload']
      //   loginExample matches: 'login' (in tags), 'form' (in tags) => score 2
      //   uploadExample matches: 'file' (in tags), 'upload' (in tags) => score 2
      // Both score 2, but loginExample should be first (stable sort)
      mockedReaddirSync.mockReturnValue(['login.json', 'upload.json'] as unknown as ReturnType<typeof readdirSync>);
      mockedReadFileSync
        .mockReturnValueOnce(JSON.stringify(loginExample))
        .mockReturnValueOnce(JSON.stringify(uploadExample));

      const result = await loadExamples({ goal: 'test login form' });

      expect(result.length).toBeGreaterThanOrEqual(1);
      // loginExample matches 'login' and 'form' = 2
      expect(result[0].goal).toBe('Test login form');
    });

    it('ranks higher-scoring examples first', async () => {
      // navExample tags: ['navigation', 'menu', 'browser']
      // loginExample tags: ['login', 'authentication', 'form']
      // Goal: 'login authentication form' => keywords: ['login', 'authentication', 'form']
      //   loginExample matches all 3 => score 3
      //   navExample matches none => score 0 (filtered out)
      mockedReaddirSync.mockReturnValue(['login.json', 'nav.json'] as unknown as ReturnType<typeof readdirSync>);
      mockedReadFileSync
        .mockReturnValueOnce(JSON.stringify(loginExample))
        .mockReturnValueOnce(JSON.stringify(navExample));

      const result = await loadExamples({ goal: 'login authentication form' });

      expect(result).toHaveLength(1);
      expect(result[0].goal).toBe('Test login form');
    });

    it('filters out examples with zero score', async () => {
      mockedReaddirSync.mockReturnValue(['login.json', 'nav.json'] as unknown as ReturnType<typeof readdirSync>);
      mockedReadFileSync
        .mockReturnValueOnce(JSON.stringify(loginExample))
        .mockReturnValueOnce(JSON.stringify(navExample));

      // Goal keywords don't match navExample tags at all
      const result = await loadExamples({ goal: 'login form submit' });

      // navExample has no matching tags for 'login', 'form', 'submit'
      // loginExample matches 'login' and 'form'
      expect(result).toHaveLength(1);
      expect(result[0].goal).toBe('Test login form');
    });

    it('respects maxExamples limit', async () => {
      const example1 = makeExample('Ex1', ['login', 'form', 'web', 'test']);
      const example2 = makeExample('Ex2', ['login', 'auth', 'web', 'test']);
      const example3 = makeExample('Ex3', ['login', 'user', 'web', 'test']);

      mockedReaddirSync.mockReturnValue(['1.json', '2.json', '3.json'] as unknown as ReturnType<typeof readdirSync>);
      mockedReadFileSync
        .mockReturnValueOnce(JSON.stringify(example1))
        .mockReturnValueOnce(JSON.stringify(example2))
        .mockReturnValueOnce(JSON.stringify(example3));

      // All 3 match on 'login' and 'web' and 'test' => score 3 each
      const result = await loadExamples({ goal: 'login web test', maxExamples: 2 });

      expect(result).toHaveLength(2);
    });

    it('uses default max of 3 when maxExamples is not specified', async () => {
      const examples = Array.from({ length: 5 }, (_, i) =>
        makeExample(`Ex${i}`, ['login', 'web', 'test']),
      );

      mockedReaddirSync.mockReturnValue(
        ['1.json', '2.json', '3.json', '4.json', '5.json'] as unknown as ReturnType<typeof readdirSync>,
      );
      let callIndex = 0;
      mockedReadFileSync.mockImplementation(() => JSON.stringify(examples[callIndex++]));

      const result = await loadExamples({ goal: 'login web test' });

      expect(result).toHaveLength(3); // default max
    });

    it('ignores keywords of 2 characters or less', async () => {
      // Goal: 'go to the login page' => keywords filter: length > 2
      //   'go' (2 chars, skipped), 'to' (2 chars, skipped), 'the' (3 chars, kept),
      //   'login' (5 chars, kept), 'page' (4 chars, kept)
      // loginExample tags: ['login', 'authentication', 'form']
      //   matches: 'login' => score 1
      mockedReaddirSync.mockReturnValue(['login.json'] as unknown as ReturnType<typeof readdirSync>);
      mockedReadFileSync.mockReturnValue(JSON.stringify(loginExample));

      const result = await loadExamples({ goal: 'go to the login page' });

      expect(result).toHaveLength(1);
      expect(result[0].goal).toBe('Test login form');
    });

    it('matches tags case-insensitively', async () => {
      const example = makeExample('Case test', ['LOGIN', 'AUTH']);
      mockedReaddirSync.mockReturnValue(['case.json'] as unknown as ReturnType<typeof readdirSync>);
      mockedReadFileSync.mockReturnValue(JSON.stringify(example));

      // Goal keyword 'login' should match tag 'LOGIN' (case-insensitive via toLowerCase)
      const result = await loadExamples({ goal: 'login form' });

      expect(result).toHaveLength(1);
    });

    it('matches partial keyword within tags (tag includes keyword)', async () => {
      // The matching logic is: tag.toLowerCase().includes(kw)
      // So keyword 'log' should match tag 'login' because 'login'.includes('log')
      const example = makeExample('Partial match', ['login', 'auth']);
      mockedReaddirSync.mockReturnValue(['partial.json'] as unknown as ReturnType<typeof readdirSync>);
      mockedReadFileSync.mockReturnValue(JSON.stringify(example));

      const result = await loadExamples({ goal: 'log form' });

      // 'log' matches 'login' (partial), 'form' doesn't match any tag
      expect(result).toHaveLength(1);
      expect(result[0].goal).toBe('Partial match');
    });

    it('handles example with empty tags array', async () => {
      mockedReaddirSync.mockReturnValue(['empty.json'] as unknown as ReturnType<typeof readdirSync>);
      mockedReadFileSync.mockReturnValue(JSON.stringify(emptyTagsExample));

      const result = await loadExamples({ goal: 'anything test' });

      // Empty tags => no keyword matches => score 0 => filtered out
      expect(result).toEqual([]);
    });

    it('handles example with undefined tags', async () => {
      const noTagsExample = {
        goal: 'No tags at all',
        steps: [],
        expectedResult: 'ok',
        metadata: {}, // tags is undefined
      };
      mockedReaddirSync.mockReturnValue(['notags.json'] as unknown as ReturnType<typeof readdirSync>);
      mockedReadFileSync.mockReturnValue(JSON.stringify(noTagsExample));

      const result = await loadExamples({ goal: 'anything test' });

      // undefined tags || [] => empty => no matches => filtered out
      expect(result).toEqual([]);
    });

    it('reads only .json files, ignoring other extensions', async () => {
      mockedReaddirSync.mockReturnValue([
        'example.json',
        'notes.txt',
        'data.csv',
        'readme.md',
      ] as unknown as ReturnType<typeof readdirSync>);
      mockedReadFileSync.mockReturnValue(JSON.stringify(loginExample));

      await loadExamples({ goal: 'login form' });

      // readFileSync should be called exactly once (for the .json file)
      expect(mockedReadFileSync).toHaveBeenCalledOnce();
    });

    it('handles multiple JSON files with varying match scores', async () => {
      const lowScore = makeExample('Low', ['login']);
      const highScore = makeExample('High', ['login', 'authentication', 'form']);
      const midScore = makeExample('Mid', ['login', 'authentication']);

      mockedReaddirSync.mockReturnValue(
        ['low.json', 'high.json', 'mid.json'] as unknown as ReturnType<typeof readdirSync>,
      );
      mockedReadFileSync
        .mockReturnValueOnce(JSON.stringify(lowScore))
        .mockReturnValueOnce(JSON.stringify(highScore))
        .mockReturnValueOnce(JSON.stringify(midScore));

      const result = await loadExamples({ goal: 'login authentication form' });

      expect(result).toHaveLength(3);
      expect(result[0].goal).toBe('High');   // score 3
      expect(result[1].goal).toBe('Mid');    // score 2
      expect(result[2].goal).toBe('Low');    // score 1
    });

    it('handles JSON parse errors gracefully', async () => {
      mockedReaddirSync.mockReturnValue(['bad.json'] as unknown as ReturnType<typeof readdirSync>);
      mockedReadFileSync.mockReturnValue('not valid json {{{');

      // JSON.parse throws, which is caught by the outer try-catch in loadExamples
      const result = await loadExamples({ goal: 'test' });

      expect(result).toEqual([]);
    });

    it('returns empty for goal with only short words', async () => {
      mockedReaddirSync.mockReturnValue(['login.json'] as unknown as ReturnType<typeof readdirSync>);
      mockedReadFileSync.mockReturnValue(JSON.stringify(loginExample));

      // All words are <= 2 chars, so no keywords survive filtering
      const result = await loadExamples({ goal: 'is a go' });

      expect(result).toEqual([]);
    });
  });
});
