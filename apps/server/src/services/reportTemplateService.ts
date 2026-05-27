/**
 * Report Template Service — CRUD operations for report templates.
 */
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type {
  ReportTemplate,
  ReportTemplateRow,
} from '../types/report-template.js';
import type {
  CreateReportTemplateInput,
  UpdateReportTemplateInput,
} from '../schemas/report-template.js';
import { DEFAULT_TEMPLATE, DEFAULT_TEMPLATE_ID } from '../db/seeds/report-templates.js';
import { getLogger } from '@eata/agent-core/dx';

function rowToTemplate(row: ReportTemplateRow): ReportTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    sections: JSON.parse(row.sections),
    styling: JSON.parse(row.styling),
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ReportTemplateService {
  constructor(private db: Database.Database) {}

  listTemplates(): ReportTemplate[] {
    const rows = this.db
      .prepare('SELECT * FROM report_templates ORDER BY is_default DESC, name ASC')
      .all() as ReportTemplateRow[];
    return rows.map(rowToTemplate);
  }

  getTemplate(id: string): ReportTemplate | undefined {
    const row = this.db
      .prepare('SELECT * FROM report_templates WHERE id = ?')
      .get(id) as ReportTemplateRow | undefined;
    return row ? rowToTemplate(row) : undefined;
  }

  createTemplate(data: CreateReportTemplateInput): ReportTemplate {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO report_templates (id, name, description, sections, styling, is_default, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
      )
      .run(
        id,
        data.name,
        data.description ?? null,
        JSON.stringify(data.sections),
        JSON.stringify(data.styling),
        now,
        now,
      );

    return this.getTemplate(id)!;
  }

  updateTemplate(id: string, data: UpdateReportTemplateInput): ReportTemplate | undefined {
    const existing = this.getTemplate(id);
    if (!existing) return undefined;

    const now = new Date().toISOString();

    // If unsetting default on the only default template, reject
    if (data.isDefault === false && existing.isDefault) {
      const defaultCount = this.db
        .prepare('SELECT COUNT(*) as cnt FROM report_templates WHERE is_default = 1')
        .get() as { cnt: number };
      if (defaultCount.cnt <= 1) {
        throw new Error('Cannot remove default status: at least one template must be default');
      }
    }

    const name = data.name ?? existing.name;
    const description = data.description !== undefined ? data.description : existing.description;
    const sections = data.sections ? JSON.stringify(data.sections) : JSON.stringify(existing.sections);
    const styling = data.styling ? JSON.stringify(data.styling) : JSON.stringify(existing.styling);
    const isDefault = data.isDefault !== undefined ? (data.isDefault ? 1 : 0) : (existing.isDefault ? 1 : 0);

    // Wrap default-toggle + update in a transaction to prevent TOCTOU race
    this.db.transaction(() => {
      // If setting this as default, unset others first (inside the transaction)
      if (data.isDefault === true) {
        this.db.prepare('UPDATE report_templates SET is_default = 0 WHERE is_default = 1').run();
      }

      this.db
        .prepare(
          `UPDATE report_templates
           SET name = ?, description = ?, sections = ?, styling = ?, is_default = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(name, description ?? null, sections, styling, isDefault, now, id);
    })();

    return this.getTemplate(id);
  }

  deleteTemplate(id: string): boolean {
    const existing = this.getTemplate(id);
    if (!existing) return false;

    if (existing.isDefault) {
      throw new Error('Cannot delete the default template');
    }

    this.db.prepare('DELETE FROM report_templates WHERE id = ?').run(id);
    return true;
  }

  getDefaultTemplate(depth = 0): ReportTemplate {
    if (depth > 0) {
      throw new Error('Failed to resolve default report template after seeding attempt');
    }

    const row = this.db
      .prepare('SELECT * FROM report_templates WHERE is_default = 1 LIMIT 1')
      .get() as ReportTemplateRow | undefined;

    if (!row) {
      // Fallback: seed and return default (single retry only)
      this.seedDefaultTemplate();
      return this.getDefaultTemplate(depth + 1);
    }

    return rowToTemplate(row);
  }

  seedDefaultTemplate(): void {
    const logger = getLogger({ source: 'reportTemplateService' });
    const existing = this.db
      .prepare('SELECT id FROM report_templates WHERE id = ?')
      .get(DEFAULT_TEMPLATE_ID) as { id: string } | undefined;

    if (existing) {
      logger.debug('Default report template already seeded');
      return;
    }

    // Ensure no other template is marked as default
    this.db.prepare('UPDATE report_templates SET is_default = 0 WHERE is_default = 1').run();

    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO report_templates (id, name, description, sections, styling, is_default, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(
        DEFAULT_TEMPLATE.id,
        DEFAULT_TEMPLATE.name,
        DEFAULT_TEMPLATE.description,
        JSON.stringify(DEFAULT_TEMPLATE.sections),
        JSON.stringify(DEFAULT_TEMPLATE.styling),
        now,
        now,
      );

    logger.info('Default report template seeded');
  }
}
