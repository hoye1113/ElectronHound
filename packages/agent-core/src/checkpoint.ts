import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function createCheckpointer(dbPath: string): SqliteSaver {
  const dir = dirname(dbPath);
  mkdirSync(dir, { recursive: true });
  return SqliteSaver.fromConnString(dbPath);
}
