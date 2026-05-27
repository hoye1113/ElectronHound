import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { CreateTemplateInput, UpdateTemplateInput, TemplateFilters } from '../schemas/template.js';

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  category: string;
  goal: string;
  config: string | null;
  variables: string | null;
  built_in: number;
  created_at: string;
  updated_at: string;
}

export interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string;
  goal: string;
  config: Record<string, unknown> | null;
  variables: string[] | null;
  builtIn: boolean;
  createdAt: string;
  updatedAt: string;
}

function mapRowToTemplate(row: TemplateRow): Template {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    goal: row.goal,
    config: row.config ? JSON.parse(row.config) : null,
    variables: row.variables ? JSON.parse(row.variables) : null,
    builtIn: row.built_in === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Escape LIKE wildcards (% and _) so user input is treated literally. */
function escapeLike(input: string): string {
  return input.replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export class TemplateService {
  constructor(private db: Database.Database) {}

  listTemplates(filters?: TemplateFilters): Template[] {
    let sql = 'SELECT * FROM templates WHERE 1=1';
    const params: Record<string, unknown> = {};

    if (filters?.category) {
      sql += ' AND category = @category';
      params.category = filters.category;
    }

    if (filters?.search) {
      sql += " AND (name LIKE @search ESCAPE '\\' OR description LIKE @search ESCAPE '\\' OR goal LIKE @search ESCAPE '\\')";
      params.search = `%${escapeLike(filters.search)}%`;
    }

    sql += ' ORDER BY built_in DESC, name ASC';

    const rows = this.db.prepare(sql).all(params) as TemplateRow[];
    return rows.map(mapRowToTemplate);
  }

  getTemplate(id: string): Template | null {
    const row = this.db
      .prepare('SELECT * FROM templates WHERE id = ?')
      .get(id) as TemplateRow | undefined;

    return row ? mapRowToTemplate(row) : null;
  }

  createTemplate(data: CreateTemplateInput): Template {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO templates (id, name, description, category, goal, config, variables, built_in, created_at, updated_at)
         VALUES (@id, @name, @description, @category, @goal, @config, @variables, 0, @createdAt, @updatedAt)`
      )
      .run({
        id,
        name: data.name,
        description: data.description ?? null,
        category: data.category,
        goal: data.goal,
        config: data.config ? JSON.stringify(data.config) : null,
        variables: data.variables ? JSON.stringify(data.variables) : null,
        createdAt: now,
        updatedAt: now,
      });

    return this.getTemplate(id)!;
  }

  updateTemplate(id: string, data: UpdateTemplateInput): Template | null {
    const existing = this.getTemplate(id);
    if (!existing) {
      return null;
    }

    if (existing.builtIn) {
      throw new Error('Cannot modify built-in templates');
    }

    const updates: string[] = [];
    const params: Record<string, unknown> = { id };

    if (data.name !== undefined) {
      updates.push('name = @name');
      params.name = data.name;
    }
    if (data.description !== undefined) {
      updates.push('description = @description');
      params.description = data.description;
    }
    if (data.category !== undefined) {
      updates.push('category = @category');
      params.category = data.category;
    }
    if (data.goal !== undefined) {
      updates.push('goal = @goal');
      params.goal = data.goal;
    }
    if (data.config !== undefined) {
      updates.push('config = @config');
      params.config = JSON.stringify(data.config);
    }
    if (data.variables !== undefined) {
      updates.push('variables = @variables');
      params.variables = JSON.stringify(data.variables);
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push("updated_at = datetime('now')");
    const sql = `UPDATE templates SET ${updates.join(', ')} WHERE id = @id`;
    this.db.prepare(sql).run(params);

    return this.getTemplate(id);
  }

  deleteTemplate(id: string): boolean {
    const existing = this.getTemplate(id);
    if (!existing) {
      return false;
    }

    if (existing.builtIn) {
      throw new Error('Cannot delete built-in templates');
    }

    this.db.prepare('DELETE FROM templates WHERE id = ?').run(id);
    return true;
  }
}
