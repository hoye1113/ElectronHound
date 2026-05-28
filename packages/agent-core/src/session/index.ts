export { SessionManager } from './sessionManager.js';
export {
  initSessionDb,
  createSessionQueries,
  generateId,
  nowISO,
  DEFAULT_SESSIONS_DB_PATH,
} from './persistence.js';
export type { SessionQueries } from './persistence.js';
export type {
  SessionEntry,
  CompactionEntry,
  BranchSummaryEntry,
  SessionWithEntries,
} from './types.js';
