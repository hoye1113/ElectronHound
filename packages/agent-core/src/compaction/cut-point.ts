/**
 * EATA Compaction - Cut Point Rules
 *
 * Determines where to cut the conversation for compaction.
 * Based on Pi compaction architecture.
 *
 * Cut point rules:
 * - Valid cut points: user messages, assistant messages, bash execution messages, custom messages
 * - Never cut at tool results (they must stay with their tool call)
 * - Prefer cutting at turn boundaries (user message followed by assistant response)
 */

/**
 * Message role types for compaction.
 */
export type MessageRole = 'user' | 'assistant' | 'toolResult' | 'tool' | 'system';

/**
 * Base message type for compaction.
 */
export interface CompactionMessage {
  id?: string;
  role: MessageRole;
  content: string | unknown[];
  /**
   * For toolResult, the tool call ID this result belongs to.
   */
  toolCallId?: string;
  /**
   * Custom message type (for custom_message, branch_summary, etc.)
   */
  messageType?: string;
}

/**
 * Message with token count.
 */
export interface MessageWithTokens extends CompactionMessage {
  tokenCount: number;
}

/**
 * Cut point result.
 */
export interface CutPointResult {
  /**
   * Index of the first message to keep.
   */
  cutIndex: number;

  /**
   * Messages before the cut (to be summarized).
   */
  messagesToSummarize: CompactionMessage[];

  /**
   * Messages after the cut (to keep).
   */
  messagesToKeep: CompactionMessage[];

  /**
   * Whether this is a split turn (cut lands mid-turn).
   */
  isSplitTurn: boolean;

  /**
   * Messages from the split turn prefix (when isSplitTurn is true).
   */
  turnPrefixMessages?: CompactionMessage[];

  /**
   * ID of the first kept message (for entry tracking).
   */
  firstKeptMessageId?: string;
}

/**
 * Cut point configuration.
 */
export interface CutPointConfig {
  /**
   * Tokens to keep from recent messages.
   * @default 20000
   */
  keepRecentTokens?: number;

  /**
   * Minimum messages to always keep.
   * @default 4
   */
  minMessagesToKeep?: number;
}

/**
 * Default cut point configuration.
 */
export const DEFAULT_CUT_POINT_CONFIG: Required<CutPointConfig> = {
  keepRecentTokens: 20000,
  minMessagesToKeep: 4,
};

/**
 * Check if a message is a valid cut point.
 *
 * Valid cut points:
 * - User messages
 * - Assistant messages
 * - Custom messages (custom_message, branch_summary, etc.)
 *
 * Invalid cut points:
 * - Tool results (must stay with their tool call)
 * - System messages
 */
export function isValidCutPoint(message: CompactionMessage): boolean {
  // Never cut at tool results
  if (message.role === 'toolResult' || message.role === 'tool') {
    return false;
  }

  // System messages should not be cut points
  if (message.role === 'system') {
    return false;
  }

  // User, assistant, and custom messages are valid
  if (message.role === 'user' || message.role === 'assistant') {
    return true;
  }

  return false;
}

/**
 * Check if message is a user message (turn boundary).
 */
export function isTurnBoundary(message: CompactionMessage): boolean {
  return message.role === 'user';
}

/**
 * Find the best cut point in a conversation.
 *
 * Algorithm:
 * 1. Walk backwards from newest message, accumulating tokens
 * 2. Stop when keepRecentTokens is reached
 * 3. Find nearest valid cut point at turn boundary if possible
 * 4. Handle split turns when a single turn exceeds the budget
 */
export function findCutPoint(
  messages: MessageWithTokens[],
  config: CutPointConfig = {},
): CutPointResult {
  const { keepRecentTokens, minMessagesToKeep } = {
    ...DEFAULT_CUT_POINT_CONFIG,
    ...config,
  };

  if (messages.length <= minMessagesToKeep) {
    // Not enough messages to compact
    return {
      cutIndex: 0,
      messagesToSummarize: [],
      messagesToKeep: messages,
      isSplitTurn: false,
    };
  }

  // Calculate total tokens
  const totalTokens = messages.reduce((sum, msg) => sum + msg.tokenCount, 0);

  if (totalTokens <= keepRecentTokens) {
    // All messages fit within keep budget
    return {
      cutIndex: 0,
      messagesToSummarize: [],
      messagesToKeep: messages,
      isSplitTurn: false,
    };
  }

  // Walk backwards to find where to start cutting
  let accumulatedTokens = 0;
  const maxCutIndex = messages.length - minMessagesToKeep;
  let cutIndex = maxCutIndex;

  for (let i = messages.length - 1; i >= 0; i--) {
    accumulatedTokens += messages[i].tokenCount;

    // Only update cutIndex if it respects minMessagesToKeep
    if (i <= maxCutIndex) {
      cutIndex = i;
    }

    if (accumulatedTokens >= keepRecentTokens && i <= maxCutIndex) {
      break;
    }
  }

  // Find valid cut point (prefer turn boundaries)
  const { validCutIndex, isSplitTurn, turnPrefixIndex } = findValidCutPoint(
    messages,
    cutIndex,
    minMessagesToKeep,
  );

  // Use valid cut index, or fallback to maxCutIndex (respecting minMessagesToKeep)
  const finalCutIndex = validCutIndex ?? maxCutIndex;

  // Split the messages
  const messagesToSummarize = messages.slice(0, finalCutIndex);
  const messagesToKeep = messages.slice(finalCutIndex);

  const result: CutPointResult = {
    cutIndex: finalCutIndex,
    messagesToSummarize,
    messagesToKeep,
    isSplitTurn,
    firstKeptMessageId:
      messagesToKeep.length > 0 ? messages[finalCutIndex].id : undefined,
  };

  if (isSplitTurn && turnPrefixIndex !== undefined) {
    result.turnPrefixMessages = messages.slice(turnPrefixIndex, finalCutIndex);
  }

  return result;
}

/**
 * Find valid cut point, preferring turn boundaries.
 */
function findValidCutPoint(
  messages: MessageWithTokens[],
  initialCutIndex: number,
  minMessagesToKeep: number,
): {
  validCutIndex: number | undefined;
  isSplitTurn: boolean;
  turnPrefixIndex?: number;
} {
  const maxIndex = messages.length - minMessagesToKeep;

  // First, look backwards for a turn boundary (user message)
  for (let i = initialCutIndex; i >= 0 && i >= maxIndex; i--) {
    if (isValidCutPoint(messages[i]) && isTurnBoundary(messages[i])) {
      return { validCutIndex: i, isSplitTurn: false };
    }
  }

  // No turn boundary found, look for any valid cut point backwards
  for (let i = initialCutIndex; i >= 0 && i >= maxIndex; i--) {
    if (isValidCutPoint(messages[i])) {
      return { validCutIndex: i, isSplitTurn: false };
    }
  }

  // No valid cut point found within range - return undefined
  // (caller will need to handle this case)

  return { validCutIndex: undefined, isSplitTurn: false };
}

/**
 * Check if the cut at the given index results in a split turn.
 * A split turn occurs when the cut lands mid-turn (between tool calls and results).
 */
function checkIsSplitTurn(
  messages: MessageWithTokens[],
  cutIndex: number,
): boolean {
  if (cutIndex <= 0 || cutIndex >= messages.length) {
    return false;
  }

  const beforeCut = messages[cutIndex - 1];
  const atCut = messages[cutIndex];

  // Split turn: assistant message followed by tool result
  // (meaning we're cutting in the middle of a tool call sequence)
  if (beforeCut.role === 'assistant' && atCut.role === 'toolResult') {
    return true;
  }

  // Also check if we're in the middle of multiple tool calls
  if (
    atCut.role === 'assistant' &&
    cutIndex + 1 < messages.length &&
    messages[cutIndex + 1].role === 'toolResult'
  ) {
    // Check if previous message was also part of a tool exchange
    if (beforeCut.role === 'toolResult') {
      return true;
    }
  }

  return false;
}

/**
 * Find the start of the turn containing the message at the given index.
 */
function findTurnStart(messages: MessageWithTokens[], index: number): number {
  // Walk backwards to find the user message that started this turn
  for (let i = index - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return i;
    }
  }
  // If no user message found, start from the beginning
  return 0;
}

/**
 * Get all messages that belong to the same turn.
 * A turn starts with a user message and includes all assistant responses until the next user message.
 */
export function getTurnMessages(
  messages: CompactionMessage[],
  startIndex: number,
): { messages: CompactionMessage[]; endIndex: number } {
  if (startIndex >= messages.length) {
    return { messages: [], endIndex: startIndex };
  }

  const turnMessages: CompactionMessage[] = [messages[startIndex]];
  let endIndex = startIndex;

  for (let i = startIndex + 1; i < messages.length; i++) {
    if (messages[i].role === 'user') {
      break;
    }
    turnMessages.push(messages[i]);
    endIndex = i;
  }

  return { messages: turnMessages, endIndex };
}

/**
 * Group messages by turns.
 */
export function groupByTurns(messages: CompactionMessage[]): CompactionMessage[][] {
  const turns: CompactionMessage[][] = [];
  let currentTurn: CompactionMessage[] = [];

  for (const message of messages) {
    if (message.role === 'user' && currentTurn.length > 0) {
      turns.push(currentTurn);
      currentTurn = [];
    }
    currentTurn.push(message);
  }

  if (currentTurn.length > 0) {
    turns.push(currentTurn);
  }

  return turns;
}
