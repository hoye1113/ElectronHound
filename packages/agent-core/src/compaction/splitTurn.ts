/**
 * EATA Compaction - Split Turn Detection
 *
 * Handles cases where a single turn (user message to next user message)
 * exceeds the keepRecentTokens budget, requiring a split within the turn.
 *
 * When a split turn is detected, two summaries are generated:
 * 1. historySummary - summarizing all turns before the current one
 * 2. turnPrefixSummary - summarizing the prefix of the oversized turn
 * These are then merged into a single summary.
 */

import type { CompactionMessage, MessageWithTokens } from './cut-point.js';

/**
 * Default keepRecentTokens budget.
 */
const DEFAULT_KEEP_RECENT_TOKENS = 20000;

/**
 * Detect whether the most recent turn exceeds the keepRecentTokens budget.
 *
 * A turn starts with a user message and includes all subsequent messages
 * until the next user message (or end of conversation).
 *
 * @param messages - Messages with token counts, ordered chronologically
 * @param keepRecentTokens - Token budget to keep (default: 20000)
 * @returns true if the last turn's tokens exceed keepRecentTokens
 */
export function isSplitTurn(
  messages: MessageWithTokens[],
  keepRecentTokens: number = DEFAULT_KEEP_RECENT_TOKENS,
): boolean {
  if (messages.length === 0) {
    return false;
  }

  // Find the start of the last turn (last user message)
  const turnStart = findLastTurnStart(messages);

  // Calculate total tokens in the last turn
  let turnTokens = 0;
  for (let i = turnStart; i < messages.length; i++) {
    turnTokens += messages[i].tokenCount;
  }

  return turnTokens > keepRecentTokens;
}

/**
 * Find the start of the last turn.
 * Walks backwards to find the most recent user message.
 *
 * @returns Index of the last user message, or 0 if none found.
 */
function findLastTurnStart(messages: MessageWithTokens[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return i;
    }
  }
  return 0;
}

/**
 * Find the start of the turn containing the message at `messageIndex`.
 * Walks backwards from messageIndex to find the nearest user message.
 *
 * @returns Index of the user message that started the turn, or messageIndex if none.
 */
function findTurnStartForIndex(
  messages: CompactionMessage[],
  messageIndex: number,
): number {
  // Walk backwards from messageIndex to find the user message that starts this turn
  for (let i = messageIndex; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return i;
    }
  }
  return messageIndex;
}

/**
 * Find the end of the turn containing the message at `startIndex`.
 * The turn ends when the next user message is found (or end of array).
 *
 * @returns Index of the last message in the turn (exclusive end).
 */
function findTurnEndForStart(
  messages: CompactionMessage[],
  startIndex: number,
): number {
  for (let i = startIndex + 1; i < messages.length; i++) {
    if (messages[i].role === 'user') {
      return i; // exclusive: the user message starts a new turn
    }
  }
  return messages.length; // turn goes to the end
}

/**
 * Split a conversation at a specific message within a turn.
 *
 * Given a messageIndex that falls within a turn, splits the conversation into:
 * - `history`: All completed turns before the current turn
 * - `turnPrefix`: Messages from the start of the current turn up to (not including) messageIndex
 * - `turnSuffix`: Messages from messageIndex onward (within the current turn and beyond)
 *
 * The split point allows generating two separate summaries:
 * 1. A summary of `history` (previous conversation context)
 * 2. A summary of `turnPrefix` (the prefix of the current oversized turn)
 *
 * @param messages - Full message array
 * @param messageIndex - Index to split at (must be within the current turn, >= turnStart)
 * @returns Tuple of [history, turnPrefix, turnSuffix]
 */
export function splitTurnAtMessage(
  messages: CompactionMessage[],
  messageIndex: number,
): [CompactionMessage[], CompactionMessage[], CompactionMessage[]] {
  if (messages.length === 0 || messageIndex <= 0) {
    return [[], [], messages];
  }

  const clampedIndex = Math.min(messageIndex, messages.length);

  // If the message at the split point is a user message, it IS the turn boundary
  if (
    clampedIndex < messages.length &&
    messages[clampedIndex].role === 'user'
  ) {
    // Split exactly at this user message (turn start)
    const history = messages.slice(0, clampedIndex);
    const turnPrefix: CompactionMessage[] = [];
    const turnSuffix = messages.slice(clampedIndex);
    return [history, turnPrefix, turnSuffix];
  }

  // Otherwise, find the user message that started the current turn
  // by walking backwards from the message before the split point
  const turnStart = findTurnStartForIndex(messages, clampedIndex - 1);

  // History = everything before the current turn
  const history = messages.slice(0, turnStart);

  // Turn prefix = from turn start to split point (exclusive of split point)
  const turnPrefix = messages.slice(turnStart, clampedIndex);

  // Turn suffix = from split point onward
  const turnSuffix = messages.slice(clampedIndex);

  return [history, turnPrefix, turnSuffix];
}

/**
 * Merge a history summary and a turn prefix summary into a single summary.
 *
 * Format:
 * ```
 * ## History Summary
 * {historySummary}
 *
 * ## Current Turn Summary
 * {turnPrefixSummary}
 * ```
 *
 * If one summary is empty, only the non-empty one is returned.
 *
 * @param historySummary - Summary of conversation history before the current turn
 * @param turnPrefixSummary - Summary of the current turn's prefix
 * @returns Merged summary string
 */
export function mergeSummaries(
  historySummary: string,
  turnPrefixSummary: string,
): string {
  const hasHistory = historySummary.trim().length > 0;
  const hasPrefix = turnPrefixSummary.trim().length > 0;

  if (hasHistory && hasPrefix) {
    return [
      '## History Summary',
      historySummary.trim(),
      '',
      '## Current Turn Summary',
      turnPrefixSummary.trim(),
    ].join('\n');
  }

  if (hasHistory) {
    return [
      '## History Summary',
      historySummary.trim(),
    ].join('\n');
  }

  if (hasPrefix) {
    return [
      '## Current Turn Summary',
      turnPrefixSummary.trim(),
    ].join('\n');
  }

  return '';
}
