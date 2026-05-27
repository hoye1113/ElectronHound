import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMigrations } from '../db/migrations.js';
import { seedBuiltInTemplates } from '../db/seeds/templates.js';
import { ReportTemplateService } from '../services/reportTemplateService.js';
import { DEFAULT_TEMPLATE_ID } from '../db/seeds/report-templates.js';

function createTestDb(): { db: Database.Database; tmpDir: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-seed-test-'));
  const db = new Database(join(tmpDir, 'test.sqlite3'));
  db.pragma('journal_mode = WAL');
  runMigrations(db);
  return { db, tmpDir };
}

describe('Seed Data', () => {
  describe('Built-in Templates', () => {
    let db: Database.Database;
    let tmpDir: string;

    beforeAll(() => {
      ({ db, tmpDir } = createTestDb());
      seedBuiltInTemplates(db);
    });

    afterAll(() => {
      db.close();
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('seeds 6 built-in templates', () => {
      const templates = db
        .prepare('SELECT * FROM templates WHERE built_in = 1')
        .all() as Array<Record<string, unknown>>;
      expect(templates).toHaveLength(6);
    });

    it('seeds Login Flow template', () => {
      const template = db
        .prepare('SELECT * FROM templates WHERE id = ?')
        .get('builtin-login-flow') as Record<string, unknown> | undefined;
      expect(template).toBeDefined();
      expect(template!.name).toBe('Login Flow');
      expect(template!.category).toBe('login');
      expect(template!.built_in).toBe(1);
    });

    it('seeds CRUD Operations template', () => {
      const template = db
        .prepare('SELECT * FROM templates WHERE id = ?')
        .get('builtin-crud-operations') as Record<string, unknown> | undefined;
      expect(template).toBeDefined();
      expect(template!.name).toBe('CRUD Operations');
      expect(template!.category).toBe('crud');
    });

    it('seeds Form Validation template', () => {
      const template = db
        .prepare('SELECT * FROM templates WHERE id = ?')
        .get('builtin-form-validation') as Record<string, unknown> | undefined;
      expect(template).toBeDefined();
      expect(template!.name).toBe('Form Validation');
      expect(template!.category).toBe('form');
    });

    it('seeds Navigation Test template', () => {
      const template = db
        .prepare('SELECT * FROM templates WHERE id = ?')
        .get('builtin-navigation-test') as Record<string, unknown> | undefined;
      expect(template).toBeDefined();
      expect(template!.name).toBe('Navigation Test');
      expect(template!.category).toBe('navigation');
    });

    it('seeds File Dialog template', () => {
      const template = db
        .prepare('SELECT * FROM templates WHERE id = ?')
        .get('builtin-file-dialog') as Record<string, unknown> | undefined;
      expect(template).toBeDefined();
      expect(template!.name).toBe('File Dialog');
      expect(template!.category).toBe('file');
    });

    it('seeds Settings Page template', () => {
      const template = db
        .prepare('SELECT * FROM templates WHERE id = ?')
        .get('builtin-settings-page') as Record<string, unknown> | undefined;
      expect(template).toBeDefined();
      expect(template!.name).toBe('Settings Page');
      expect(template!.category).toBe('settings');
    });

    it('each template has config and variables as JSON strings', () => {
      const templates = db
        .prepare('SELECT * FROM templates WHERE built_in = 1')
        .all() as Array<Record<string, unknown>>;

      for (const template of templates) {
        expect(typeof template.config).toBe('string');
        expect(() => JSON.parse(template.config as string)).not.toThrow();
        expect(typeof template.variables).toBe('string');
        expect(() => JSON.parse(template.variables as string)).not.toThrow();
      }
    });

    it('seed is idempotent — running twice does not duplicate templates', () => {
      const countBefore = db
        .prepare('SELECT COUNT(*) as cnt FROM templates WHERE built_in = 1')
        .get() as { cnt: number };

      seedBuiltInTemplates(db);

      const countAfter = db
        .prepare('SELECT COUNT(*) as cnt FROM templates WHERE built_in = 1')
        .get() as { cnt: number };

      expect(countAfter.cnt).toBe(countBefore.cnt);
      expect(countAfter.cnt).toBe(6);
    });
  });

  describe('Default Report Template', () => {
    let db: Database.Database;
    let tmpDir: string;

    beforeAll(() => {
      ({ db, tmpDir } = createTestDb());
      const service = new ReportTemplateService(db);
      service.seedDefaultTemplate();
    });

    afterAll(() => {
      db.close();
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('seeds a default report template', () => {
      const template = db
        .prepare('SELECT * FROM report_templates WHERE id = ?')
        .get(DEFAULT_TEMPLATE_ID) as Record<string, unknown> | undefined;
      expect(template).toBeDefined();
    });

    it('default template has correct name', () => {
      const template = db
        .prepare('SELECT * FROM report_templates WHERE id = ?')
        .get(DEFAULT_TEMPLATE_ID) as Record<string, unknown>;
      expect(template.name).toBe('Default');
    });

    it('default template is marked as default', () => {
      const template = db
        .prepare('SELECT * FROM report_templates WHERE id = ?')
        .get(DEFAULT_TEMPLATE_ID) as Record<string, unknown>;
      expect(template.is_default).toBe(1);
    });

    it('default template has sections as valid JSON', () => {
      const template = db
        .prepare('SELECT * FROM report_templates WHERE id = ?')
        .get(DEFAULT_TEMPLATE_ID) as Record<string, unknown>;
      expect(typeof template.sections).toBe('string');
      const sections = JSON.parse(template.sections as string);
      expect(Array.isArray(sections)).toBe(true);
      expect(sections.length).toBeGreaterThan(0);
    });

    it('default template has styling as valid JSON', () => {
      const template = db
        .prepare('SELECT * FROM report_templates WHERE id = ?')
        .get(DEFAULT_TEMPLATE_ID) as Record<string, unknown>;
      expect(typeof template.styling).toBe('string');
      const styling = JSON.parse(template.styling as string);
      expect(styling.theme).toBeDefined();
      expect(styling.primaryColor).toBeDefined();
    });

    it('default template includes expected section types', () => {
      const template = db
        .prepare('SELECT * FROM report_templates WHERE id = ?')
        .get(DEFAULT_TEMPLATE_ID) as Record<string, unknown>;
      const sections = JSON.parse(template.sections as string) as Array<{ type: string }>;
      const sectionTypes = sections.map((s) => s.type);
      expect(sectionTypes).toContain('summary');
      expect(sectionTypes).toContain('steps');
      expect(sectionTypes).toContain('screenshots');
      expect(sectionTypes).toContain('errors');
      expect(sectionTypes).toContain('performance');
      expect(sectionTypes).toContain('suggestions');
      expect(sectionTypes).toContain('raw');
    });

    it('seed is idempotent — running twice does not duplicate report template', () => {
      const service = new ReportTemplateService(db);
      service.seedDefaultTemplate();

      const templates = db
        .prepare('SELECT * FROM report_templates WHERE id = ?')
        .all(DEFAULT_TEMPLATE_ID) as Array<Record<string, unknown>>;
      expect(templates).toHaveLength(1);
    });

    it('seed is idempotent — total report_templates count remains 1', () => {
      const service = new ReportTemplateService(db);
      service.seedDefaultTemplate();
      service.seedDefaultTemplate();

      const count = db
        .prepare('SELECT COUNT(*) as cnt FROM report_templates')
        .get() as { cnt: number };
      expect(count.cnt).toBe(1);
    });
  });
});
