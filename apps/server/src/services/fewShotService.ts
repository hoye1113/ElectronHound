import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { CreateFewShotInput, UpdateFewShotInput, FewShotFilters } from '../schemas/few-shot.js';

interface FewShotRow {
  id: string;
  goal: string;
  steps: string;
  expected_result: string;
  metadata: string;
  created_at: string;
  updated_at: string;
}

export interface FewShotExample {
  id: string;
  goal: string;
  steps: Array<{ action: string; observation: string }>;
  expectedResult: string;
  metadata: {
    tags: string[];
    domain: string;
    difficulty: 'easy' | 'medium' | 'hard';
  };
  createdAt: string;
  updatedAt: string;
}

function mapRowToExample(row: FewShotRow): FewShotExample {
  return {
    id: row.id,
    goal: row.goal,
    steps: JSON.parse(row.steps),
    expectedResult: row.expected_result,
    metadata: JSON.parse(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Escape LIKE wildcards (% and _) so user input is treated literally. */
function escapeLike(input: string): string {
  return input.replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export class FewShotService {
  constructor(private db: Database.Database) {}

  listExamples(filters?: FewShotFilters): FewShotExample[] {
    let sql = 'SELECT * FROM few_shot_examples WHERE 1=1';
    const params: Record<string, unknown> = {};

    if (filters?.search) {
      sql += " AND (goal LIKE @search ESCAPE '\\' OR expected_result LIKE @search ESCAPE '\\')";
      params.search = `%${escapeLike(filters.search)}%`;
    }

    if (filters?.domain) {
      sql += " AND json_extract(metadata, '$.domain') = @domain";
      params.domain = filters.domain;
    }

    if (filters?.difficulty) {
      sql += " AND json_extract(metadata, '$.difficulty') = @difficulty";
      params.difficulty = filters.difficulty;
    }

    sql += ' ORDER BY created_at DESC';

    const rows = this.db.prepare(sql).all(params) as FewShotRow[];
    return rows.map(mapRowToExample);
  }

  getExample(id: string): FewShotExample | null {
    const row = this.db
      .prepare('SELECT * FROM few_shot_examples WHERE id = ?')
      .get(id) as FewShotRow | undefined;

    return row ? mapRowToExample(row) : null;
  }

  createExample(data: CreateFewShotInput): FewShotExample {
    const id = data.id ?? randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO few_shot_examples (id, goal, steps, expected_result, metadata, created_at, updated_at)
         VALUES (@id, @goal, @steps, @expectedResult, @metadata, @createdAt, @updatedAt)`
      )
      .run({
        id,
        goal: data.goal,
        steps: JSON.stringify(data.steps),
        expectedResult: data.expectedResult,
        metadata: JSON.stringify(data.metadata),
        createdAt: now,
        updatedAt: now,
      });

    return this.getExample(id)!;
  }

  updateExample(id: string, data: UpdateFewShotInput): FewShotExample | null {
    const existing = this.getExample(id);
    if (!existing) {
      return null;
    }

    const updates: string[] = [];
    const params: Record<string, unknown> = { id };

    if (data.goal !== undefined) {
      updates.push('goal = @goal');
      params.goal = data.goal;
    }
    if (data.steps !== undefined) {
      updates.push('steps = @steps');
      params.steps = JSON.stringify(data.steps);
    }
    if (data.expectedResult !== undefined) {
      updates.push('expected_result = @expectedResult');
      params.expectedResult = data.expectedResult;
    }
    if (data.metadata !== undefined) {
      updates.push('metadata = @metadata');
      params.metadata = JSON.stringify(data.metadata);
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push("updated_at = datetime('now')");
    const sql = `UPDATE few_shot_examples SET ${updates.join(', ')} WHERE id = @id`;
    this.db.prepare(sql).run(params);

    return this.getExample(id);
  }

  deleteExample(id: string): boolean {
    const existing = this.getExample(id);
    if (!existing) {
      return false;
    }

    this.db.prepare('DELETE FROM few_shot_examples WHERE id = ?').run(id);
    return true;
  }

  migrateExamples(examples: CreateFewShotInput[]): { imported: number; skipped: number } {
    let imported = 0;
    let skipped = 0;

    const insertStmt = this.db.prepare(
      `INSERT OR REPLACE INTO few_shot_examples (id, goal, steps, expected_result, metadata, created_at, updated_at)
       VALUES (@id, @goal, @steps, @expectedResult, @metadata, @createdAt, @updatedAt)`
    );

    const transaction = this.db.transaction(() => {
      for (const example of examples) {
        const id = example.id ?? randomUUID();
        const now = new Date().toISOString();

        try {
          insertStmt.run({
            id,
            goal: example.goal,
            steps: JSON.stringify(example.steps),
            expectedResult: example.expectedResult,
            metadata: JSON.stringify(example.metadata),
            createdAt: now,
            updatedAt: now,
          });
          imported++;
        } catch {
          skipped++;
        }
      }
    });

    transaction();
    return { imported, skipped };
  }
}
