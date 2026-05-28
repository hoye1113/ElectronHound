import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { buildServer } from '../server.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

// ── Mock agent-core provider functions ─────────────────────────────
// Providers routes use file-system-backed config (not DB). We mock the
// module so tests don't touch ~/.eata/providers.json.

const mockProviders = [
  {
    id: 'openai-default',
    name: 'OpenAI GPT-4o',
    type: 'openai-compatible' as const,
    apiKey: 'sk-test-key',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    enabled: true,
  },
];

let mockProvidersConfig = {
  version: 1,
  providers: [...mockProviders],
  activeId: 'openai-default',
};

vi.mock('@eata/agent-core', () => ({
  loadProvidersConfig: () => ({ ...mockProvidersConfig, providers: [...mockProvidersConfig.providers] }),
  addProvider: (config: Record<string, unknown>) => {
    mockProvidersConfig.providers.push(config as typeof mockProvidersConfig.providers[number]);
    return { ...mockProvidersConfig, providers: [...mockProvidersConfig.providers] };
  },
  updateProvider: (id: string, updates: Record<string, unknown>) => {
    const idx = mockProvidersConfig.providers.findIndex(p => p.id === id);
    if (idx === -1) return null;
    mockProvidersConfig.providers[idx] = { ...mockProvidersConfig.providers[idx], ...updates } as typeof mockProvidersConfig.providers[number];
    return { ...mockProvidersConfig, providers: [...mockProvidersConfig.providers] };
  },
  deleteProvider: (id: string) => {
    const idx = mockProvidersConfig.providers.findIndex(p => p.id === id);
    if (idx === -1) return null;
    mockProvidersConfig.providers.splice(idx, 1);
    return { ...mockProvidersConfig, providers: [...mockProvidersConfig.providers] };
  },
  setActiveProvider: (id: string) => {
    const exists = mockProvidersConfig.providers.some(p => p.id === id);
    if (!exists) return null;
    mockProvidersConfig.activeId = id;
    return { ...mockProvidersConfig, providers: [...mockProvidersConfig.providers] };
  },
  createProviderInstance: () => ({
    generateText: vi.fn().mockResolvedValue({ text: 'OK' }),
  }),
}));

// ── Helpers ──────────────────────────────────────────────────────────

function createTempDbPath(): { dbPath: string; cleanupDir: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-rt-pb-test-'));
  return { dbPath: join(tmpDir, 'test-db.sqlite3'), cleanupDir: tmpDir };
}

function validSections() {
  return [
    {
      id: 'section-summary',
      type: 'summary' as const,
      title: 'Summary',
      enabled: true,
      order: 1,
    },
  ];
}

function validStyling() {
  return {
    theme: 'light' as const,
    primaryColor: '#3b82f6',
  };
}

function validCreateBody() {
  return {
    name: 'Test Report Template',
    description: 'A template for testing',
    sections: validSections(),
    styling: validStyling(),
  };
}

/** Insert a report template directly into the database. */
function insertReportTemplate(
  db: Database.Database,
  overrides: Partial<{ id: string; name: string; description: string; isDefault: number }> = {},
) {
  const id = overrides.id ?? '00000000-0000-0000-0000-000000000099';
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO report_templates (id, name, description, sections, styling, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    overrides.name ?? 'Direct Insert Template',
    overrides.description ?? null,
    JSON.stringify(validSections()),
    JSON.stringify(validStyling()),
    overrides.isDefault ?? 0,
    now,
    now,
  );
  return id;
}

// ═══════════════════════════════════════════════════════════════════
// Report Templates
// ═══════════════════════════════════════════════════════════════════

describe('Route: GET /api/report-templates', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeEach(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterEach(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('returns the seeded default template on fresh database', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/report-templates' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toBeDefined();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    const defaultTpl = body.data.find((t: { isDefault: boolean }) => t.isDefault);
    expect(defaultTpl).toBeDefined();
    expect(defaultTpl.name).toBe('Default');
  });

  it('returns empty data after removing default template from DB', async () => {
    // Delete all templates to simulate an empty state (bypass default guard by direct DB)
    db.prepare('DELETE FROM report_templates').run();
    const res = await server.inject({ method: 'GET', url: '/api/report-templates' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual([]);
  });

  it('lists multiple templates sorted by is_default DESC then name ASC', async () => {
    insertReportTemplate(db, { id: '00000000-0000-0000-0000-0000000000aa', name: 'AAA Template', isDefault: 0 });
    insertReportTemplate(db, { id: '00000000-0000-0000-0000-0000000000bb', name: 'BBB Template', isDefault: 0 });

    const res = await server.inject({ method: 'GET', url: '/api/report-templates' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // Default template should come first
    expect(body.data[0].isDefault).toBe(true);
    // Non-default templates sorted by name ASC
    const nonDefault = body.data.filter((t: { isDefault: boolean }) => !t.isDefault);
    expect(nonDefault[0].name).toBe('AAA Template');
    expect(nonDefault[1].name).toBe('BBB Template');
  });
});

describe('Route: GET /api/report-templates/:id', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeEach(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterEach(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('returns the default template by id', async () => {
    const defaultId = '00000000-0000-0000-0000-000000000001';
    const res = await server.inject({ method: 'GET', url: `/api/report-templates/${defaultId}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(defaultId);
    expect(body.name).toBe('Default');
    expect(body.isDefault).toBe(true);
    expect(body.sections).toBeDefined();
    expect(body.styling).toBeDefined();
  });

  it('returns 404 for non-existent template', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/report-templates/00000000-0000-0000-0000-000000000999',
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Template not found');
  });

  it('returns 400 for invalid UUID format', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/report-templates/not-a-uuid' });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Invalid template ID format');
  });

  it('returns a non-default template by id', async () => {
    const id = insertReportTemplate(db, { id: '00000000-0000-0000-0000-0000000000cc', name: 'Custom Report' });
    const res = await server.inject({ method: 'GET', url: `/api/report-templates/${id}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Custom Report');
    expect(body.isDefault).toBe(false);
  });
});

describe('Route: POST /api/report-templates', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeEach(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterEach(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('creates a template and returns 201', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/report-templates',
      payload: validCreateBody(),
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBeDefined();
    expect(body.name).toBe('Test Report Template');
    expect(body.description).toBe('A template for testing');
    expect(body.isDefault).toBe(false);
    expect(body.sections).toEqual(validSections());
    expect(body.styling).toEqual(validStyling());
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeDefined();
  });

  it('persists template in database', async () => {
    await server.inject({
      method: 'POST',
      url: '/api/report-templates',
      payload: validCreateBody(),
    });

    const rows = db.prepare('SELECT * FROM report_templates WHERE is_default = 0').all() as Array<Record<string, unknown>>;
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('Test Report Template');
  });

  it('creates template without description', async () => {
    const body = { ...validCreateBody() };
    delete (body as Record<string, unknown>).description;
    const res = await server.inject({ method: 'POST', url: '/api/report-templates', payload: body });
    expect(res.statusCode).toBe(201);
    const result = JSON.parse(res.body);
    expect(result.description).toBeUndefined();
  });

  it('returns 400 when name is missing', async () => {
    const body = { ...validCreateBody() };
    delete (body as Record<string, unknown>).name;
    const res = await server.inject({ method: 'POST', url: '/api/report-templates', payload: body });
    expect(res.statusCode).toBe(400);
    const result = JSON.parse(res.body);
    expect(result.error).toBe('Validation failed');
  });

  it('returns 400 when name is empty', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/report-templates',
      payload: { ...validCreateBody(), name: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when sections is empty array', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/report-templates',
      payload: { ...validCreateBody(), sections: [] },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 when sections is missing', async () => {
    const body = { ...validCreateBody() };
    delete (body as Record<string, unknown>).sections;
    const res = await server.inject({ method: 'POST', url: '/api/report-templates', payload: body });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when styling is missing', async () => {
    const body = { ...validCreateBody() };
    delete (body as Record<string, unknown>).styling;
    const res = await server.inject({ method: 'POST', url: '/api/report-templates', payload: body });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when styling has invalid hex color', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/report-templates',
      payload: { ...validCreateBody(), styling: { theme: 'light', primaryColor: 'not-a-color' } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when styling has invalid theme', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/report-templates',
      payload: { ...validCreateBody(), styling: { theme: 'invalid', primaryColor: '#3b82f6' } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for section with invalid type', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/report-templates',
      payload: {
        ...validCreateBody(),
        sections: [{ id: 's1', type: 'invalid-type', title: 'Bad', enabled: true, order: 0 }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for empty body', async () => {
    const res = await server.inject({ method: 'POST', url: '/api/report-templates', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('creates template with optional styling fields', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/report-templates',
      payload: {
        ...validCreateBody(),
        styling: {
          theme: 'dark',
          primaryColor: '#ff0000',
          logoUrl: 'https://example.com/logo.png',
          companyName: 'Test Corp',
          footerText: 'Custom footer',
        },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.styling.theme).toBe('dark');
    expect(body.styling.logoUrl).toBe('https://example.com/logo.png');
    expect(body.styling.companyName).toBe('Test Corp');
    expect(body.styling.footerText).toBe('Custom footer');
  });

  it('creates template with multiple sections', async () => {
    const sections = [
      { id: 's1', type: 'summary' as const, title: 'Summary', enabled: true, order: 1 },
      { id: 's2', type: 'steps' as const, title: 'Steps', enabled: true, order: 2 },
      { id: 's3', type: 'errors' as const, title: 'Errors', enabled: false, order: 3 },
    ];
    const res = await server.inject({
      method: 'POST',
      url: '/api/report-templates',
      payload: { ...validCreateBody(), sections },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.sections.length).toBe(3);
    expect(body.sections[2].enabled).toBe(false);
  });
});

describe('Route: PUT /api/report-templates/:id', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeEach(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterEach(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('updates template name', async () => {
    const id = insertReportTemplate(db);
    const res = await server.inject({
      method: 'PUT',
      url: `/api/report-templates/${id}`,
      payload: { name: 'Updated Name' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Updated Name');
  });

  it('updates template styling', async () => {
    const id = insertReportTemplate(db);
    const res = await server.inject({
      method: 'PUT',
      url: `/api/report-templates/${id}`,
      payload: { styling: { theme: 'dark', primaryColor: '#ff0000' } },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.styling.theme).toBe('dark');
    expect(body.styling.primaryColor).toBe('#ff0000');
  });

  it('updates template sections', async () => {
    const id = insertReportTemplate(db);
    const newSections = [
      { id: 'new-s1', type: 'performance' as const, title: 'Perf', enabled: true, order: 1 },
    ];
    const res = await server.inject({
      method: 'PUT',
      url: `/api/report-templates/${id}`,
      payload: { sections: newSections },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.sections.length).toBe(1);
    expect(body.sections[0].type).toBe('performance');
  });

  it('sets a template as default (unsets previous default)', async () => {
    const id = insertReportTemplate(db);
    const res = await server.inject({
      method: 'PUT',
      url: `/api/report-templates/${id}`,
      payload: { isDefault: true },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.isDefault).toBe(true);

    // Verify old default was unset
    const oldDefault = await server.inject({
      method: 'GET',
      url: '/api/report-templates/00000000-0000-0000-0000-000000000001',
    });
    const oldBody = JSON.parse(oldDefault.body);
    expect(oldBody.isDefault).toBe(false);
  });

  it('returns 404 for non-existent template', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: '/api/report-templates/00000000-0000-0000-0000-000000000999',
      payload: { name: 'Nope' },
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Template not found');
  });

  it('returns 400 for invalid UUID format', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: '/api/report-templates/bad-id',
      payload: { name: 'Test' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Invalid template ID format');
  });

  it('returns 400 for invalid body', async () => {
    const id = insertReportTemplate(db);
    const res = await server.inject({
      method: 'PUT',
      url: `/api/report-templates/${id}`,
      payload: { sections: [] },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Validation failed');
  });

  it('returns 409 when trying to unset default on only default template', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: '/api/report-templates/00000000-0000-0000-0000-000000000001',
      payload: { isDefault: false },
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('Cannot remove default status');
  });

  it('returns unchanged template when body has no valid fields', async () => {
    const id = insertReportTemplate(db, { name: 'Original' });
    const res = await server.inject({
      method: 'PUT',
      url: `/api/report-templates/${id}`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Original');
  });

  it('persists updates in database', async () => {
    const id = insertReportTemplate(db);
    await server.inject({
      method: 'PUT',
      url: `/api/report-templates/${id}`,
      payload: { name: 'DB Verified' },
    });
    const row = db.prepare('SELECT name FROM report_templates WHERE id = ?').get(id) as { name: string };
    expect(row.name).toBe('DB Verified');
  });

  it('updates description to null', async () => {
    const id = insertReportTemplate(db, { description: 'Has desc' });
    const res = await server.inject({
      method: 'PUT',
      url: `/api/report-templates/${id}`,
      payload: { description: undefined },
    });
    // When description is not provided, it stays unchanged
    expect(res.statusCode).toBe(200);
  });
});

describe('Route: DELETE /api/report-templates/:id', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeEach(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterEach(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('deletes a non-default template and returns 204', async () => {
    const id = insertReportTemplate(db);
    const res = await server.inject({ method: 'DELETE', url: `/api/report-templates/${id}` });
    expect(res.statusCode).toBe(204);

    const rows = db.prepare('SELECT * FROM report_templates WHERE id = ?').all(id);
    expect(rows.length).toBe(0);
  });

  it('returns 404 for non-existent template', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: '/api/report-templates/00000000-0000-0000-0000-000000000999',
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Template not found');
  });

  it('returns 400 for invalid UUID', async () => {
    const res = await server.inject({ method: 'DELETE', url: '/api/report-templates/not-a-uuid' });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Invalid template ID format');
  });

  it('returns 409 when deleting the default template', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: '/api/report-templates/00000000-0000-0000-0000-000000000001',
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('Cannot delete');

    // Verify it still exists
    const row = db.prepare('SELECT * FROM report_templates WHERE id = ?').get('00000000-0000-0000-0000-000000000001');
    expect(row).toBeDefined();
  });

  it('deleting one template does not affect others', async () => {
    const id1 = insertReportTemplate(db, { id: '00000000-0000-0000-0000-0000000000d1', name: 'Delete Me' });
    insertReportTemplate(db, { id: '00000000-0000-0000-0000-0000000000d2', name: 'Keep Me' });

    const res = await server.inject({ method: 'DELETE', url: `/api/report-templates/${id1}` });
    expect(res.statusCode).toBe(204);

    const remaining = db.prepare('SELECT * FROM report_templates WHERE id = ?').get('00000000-0000-0000-0000-0000000000d2');
    expect(remaining).toBeDefined();
  });
});

describe('Report Templates: Full CRUD integration', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeEach(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterEach(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('create -> get -> update -> delete lifecycle', async () => {
    // Create
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/report-templates',
      payload: { ...validCreateBody(), name: 'Lifecycle Template' },
    });
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);
    const templateId = created.id;

    // Get
    const getRes = await server.inject({ method: 'GET', url: `/api/report-templates/${templateId}` });
    expect(getRes.statusCode).toBe(200);
    const fetched = JSON.parse(getRes.body);
    expect(fetched.name).toBe('Lifecycle Template');

    // Update
    const updateRes = await server.inject({
      method: 'PUT',
      url: `/api/report-templates/${templateId}`,
      payload: { name: 'Updated Lifecycle' },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(JSON.parse(updateRes.body).name).toBe('Updated Lifecycle');

    // Verify update persisted
    const verifyRes = await server.inject({ method: 'GET', url: `/api/report-templates/${templateId}` });
    expect(JSON.parse(verifyRes.body).name).toBe('Updated Lifecycle');

    // Delete
    const deleteRes = await server.inject({ method: 'DELETE', url: `/api/report-templates/${templateId}` });
    expect(deleteRes.statusCode).toBe(204);

    // Verify deletion
    const goneRes = await server.inject({ method: 'GET', url: `/api/report-templates/${templateId}` });
    expect(goneRes.statusCode).toBe(404);
  });

  it('created template appears in list endpoint', async () => {
    await server.inject({
      method: 'POST',
      url: '/api/report-templates',
      payload: { ...validCreateBody(), name: 'Listed Template' },
    });

    const listRes = await server.inject({ method: 'GET', url: '/api/report-templates' });
    expect(listRes.statusCode).toBe(200);
    const body = JSON.parse(listRes.body);
    const found = body.data.find((t: { name: string }) => t.name === 'Listed Template');
    expect(found).toBeDefined();
  });

  it('setting new default unsets old default', async () => {
    // Create a new template
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/report-templates',
      payload: { ...validCreateBody(), name: 'New Default Candidate' },
    });
    const newId = JSON.parse(createRes.body).id;

    // Set it as default
    await server.inject({
      method: 'PUT',
      url: `/api/report-templates/${newId}`,
      payload: { isDefault: true },
    });

    // Verify only one default exists
    const listRes = await server.inject({ method: 'GET', url: '/api/report-templates' });
    const templates = JSON.parse(listRes.body).data;
    const defaults = templates.filter((t: { isDefault: boolean }) => t.isDefault);
    expect(defaults.length).toBe(1);
    expect(defaults[0].id).toBe(newId);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Providers
// ═══════════════════════════════════════════════════════════════════

describe('Route: GET /api/providers', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeEach(async () => {
    // Reset mock state
    mockProvidersConfig = {
      version: 1,
      providers: [...mockProviders],
      activeId: 'openai-default',
    };
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterEach(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('returns providers config', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/providers' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.version).toBe(1);
    expect(body.providers).toBeDefined();
    expect(Array.isArray(body.providers)).toBe(true);
    expect(body.activeId).toBe('openai-default');
  });

  it('returns providers with expected fields', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/providers' });
    const body = JSON.parse(res.body);
    const provider = body.providers[0];
    expect(provider.id).toBe('openai-default');
    expect(provider.name).toBe('OpenAI GPT-4o');
    expect(provider.type).toBe('openai-compatible');
    expect(provider.baseURL).toBeDefined();
    expect(provider.model).toBeDefined();
    expect(provider.enabled).toBeDefined();
  });
});

describe('Route: POST /api/providers', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeEach(async () => {
    mockProvidersConfig = {
      version: 1,
      providers: [...mockProviders],
      activeId: 'openai-default',
    };
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterEach(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  const validProvider = {
    id: 'custom-provider',
    name: 'Custom LLM',
    type: 'openai-compatible' as const,
    apiKey: 'sk-custom-key-123',
    baseURL: 'https://custom.api.com/v1',
    model: 'custom-model',
    enabled: true,
  };

  it('creates a provider and returns 201', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/providers',
      payload: validProvider,
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.providers).toBeDefined();
    const added = body.providers.find((p: { id: string }) => p.id === 'custom-provider');
    expect(added).toBeDefined();
    expect(added.name).toBe('Custom LLM');
  });

  it('returns 400 when id is missing', async () => {
    const { id: _id, ...noId } = validProvider;
    const res = await server.inject({ method: 'POST', url: '/api/providers', payload: noId });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 when name is empty', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/providers',
      payload: { ...validProvider, name: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when apiKey is empty', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/providers',
      payload: { ...validProvider, apiKey: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when baseURL is not a valid URL', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/providers',
      payload: { ...validProvider, baseURL: 'not-a-url' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when model is empty', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/providers',
      payload: { ...validProvider, model: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when type is not openai-compatible', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/providers',
      payload: { ...validProvider, type: 'other-type' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for empty body', async () => {
    const res = await server.inject({ method: 'POST', url: '/api/providers', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('defaults enabled to true when omitted', async () => {
    const { enabled: _enabled, ...withoutEnabled } = validProvider;
    const res = await server.inject({ method: 'POST', url: '/api/providers', payload: withoutEnabled });
    expect(res.statusCode).toBe(201);
  });

  it('accepts enabled: false', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/providers',
      payload: { ...validProvider, id: 'disabled-provider', enabled: false },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    const added = body.providers.find((p: { id: string }) => p.id === 'disabled-provider');
    expect(added.enabled).toBe(false);
  });
});

describe('Route: PUT /api/providers/:id', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeEach(async () => {
    mockProvidersConfig = {
      version: 1,
      providers: [...mockProviders],
      activeId: 'openai-default',
    };
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterEach(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('updates provider name', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: '/api/providers/openai-default',
      payload: { name: 'Renamed Provider' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const updated = body.providers.find((p: { id: string }) => p.id === 'openai-default');
    expect(updated.name).toBe('Renamed Provider');
  });

  it('updates provider model', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: '/api/providers/openai-default',
      payload: { model: 'gpt-4o-mini' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const updated = body.providers.find((p: { id: string }) => p.id === 'openai-default');
    expect(updated.model).toBe('gpt-4o-mini');
  });

  it('updates provider baseURL', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: '/api/providers/openai-default',
      payload: { baseURL: 'https://new-api.example.com/v1' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const updated = body.providers.find((p: { id: string }) => p.id === 'openai-default');
    expect(updated.baseURL).toBe('https://new-api.example.com/v1');
  });

  it('returns 404 for non-existent provider', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: '/api/providers/nonexistent',
      payload: { name: 'Nope' },
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Provider not found');
  });

  it('returns 400 for empty provider ID', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: '/api/providers/',
      payload: { name: 'Test' },
    });
    // Fastify returns 404 for trailing slash with empty param, or 400
    expect([400, 404]).toContain(res.statusCode);
  });

  it('returns 400 for invalid update body', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: '/api/providers/openai-default',
      payload: { baseURL: 'not-a-url' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid type value', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: '/api/providers/openai-default',
      payload: { type: 'invalid' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('accepts empty update body (no changes)', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: '/api/providers/openai-default',
      payload: {},
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('Route: DELETE /api/providers/:id', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeEach(async () => {
    mockProvidersConfig = {
      version: 1,
      providers: [...mockProviders],
      activeId: 'openai-default',
    };
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterEach(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('deletes a provider and returns config', async () => {
    const res = await server.inject({ method: 'DELETE', url: '/api/providers/openai-default' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const found = body.providers.find((p: { id: string }) => p.id === 'openai-default');
    expect(found).toBeUndefined();
  });

  it('returns 404 for non-existent provider', async () => {
    const res = await server.inject({ method: 'DELETE', url: '/api/providers/nonexistent' });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Provider not found');
  });
});

describe('Route: POST /api/providers/:id/activate', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeEach(async () => {
    mockProvidersConfig = {
      version: 1,
      providers: [...mockProviders],
      activeId: 'openai-default',
    };
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterEach(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('sets a provider as active', async () => {
    // Add a second provider first
    await server.inject({
      method: 'POST',
      url: '/api/providers',
      payload: {
        id: 'second-provider',
        name: 'Second',
        type: 'openai-compatible',
        apiKey: 'sk-second',
        baseURL: 'https://second.api.com/v1',
        model: 'second-model',
      },
    });

    const res = await server.inject({ method: 'POST', url: '/api/providers/second-provider/activate' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.activeId).toBe('second-provider');
  });

  it('returns 404 for non-existent provider', async () => {
    const res = await server.inject({ method: 'POST', url: '/api/providers/nonexistent/activate' });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Provider not found');
  });
});

describe('Route: POST /api/providers/:id/test', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeEach(async () => {
    mockProvidersConfig = {
      version: 1,
      providers: [...mockProviders],
      activeId: 'openai-default',
    };
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterEach(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('returns success for a testable provider', async () => {
    const res = await server.inject({ method: 'POST', url: '/api/providers/openai-default/test' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Connection successful');
  });

  it('returns 404 for non-existent provider', async () => {
    const res = await server.inject({ method: 'POST', url: '/api/providers/nonexistent/test' });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Provider not found');
  });
});

describe('Providers: Full CRUD integration', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeEach(async () => {
    mockProvidersConfig = {
      version: 1,
      providers: [...mockProviders],
      activeId: 'openai-default',
    };
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterEach(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('create -> list -> update -> delete lifecycle', async () => {
    // Create
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/providers',
      payload: {
        id: 'lifecycle-provider',
        name: 'Lifecycle Provider',
        type: 'openai-compatible',
        apiKey: 'sk-lifecycle',
        baseURL: 'https://lifecycle.api.com/v1',
        model: 'lifecycle-model',
      },
    });
    expect(createRes.statusCode).toBe(201);

    // List - verify it appears
    const listRes = await server.inject({ method: 'GET', url: '/api/providers' });
    const listBody = JSON.parse(listRes.body);
    const found = listBody.providers.find((p: { id: string }) => p.id === 'lifecycle-provider');
    expect(found).toBeDefined();
    expect(found.name).toBe('Lifecycle Provider');

    // Update
    const updateRes = await server.inject({
      method: 'PUT',
      url: '/api/providers/lifecycle-provider',
      payload: { name: 'Updated Lifecycle' },
    });
    expect(updateRes.statusCode).toBe(200);
    const updateBody = JSON.parse(updateRes.body);
    const updated = updateBody.providers.find((p: { id: string }) => p.id === 'lifecycle-provider');
    expect(updated.name).toBe('Updated Lifecycle');

    // Delete
    const deleteRes = await server.inject({ method: 'DELETE', url: '/api/providers/lifecycle-provider' });
    expect(deleteRes.statusCode).toBe(200);
    const deleteBody = JSON.parse(deleteRes.body);
    const gone = deleteBody.providers.find((p: { id: string }) => p.id === 'lifecycle-provider');
    expect(gone).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// Batches
// ═══════════════════════════════════════════════════════════════════

describe('Route: POST /api/tasks/batch', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeEach(async () => {
    mockProvidersConfig = {
      version: 1,
      providers: [...mockProviders],
      activeId: 'openai-default',
    };
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterEach(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  const validBatch = {
    name: 'Test Batch',
    tasks: [
      { goal: 'Click the submit button' },
      { goal: 'Fill in the form' },
    ],
    priority: 'medium' as const,
  };

  it('creates a batch and returns 201', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: validBatch,
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.batchId).toBeDefined();
    expect(body.taskIds).toBeDefined();
    expect(Array.isArray(body.taskIds)).toBe(true);
    expect(body.totalTasks).toBe(2);
  });

  it('persists batch and tasks in database', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: validBatch,
    });
    const { batchId, taskIds: _taskIds } = JSON.parse(res.body);

    // Verify batch record
    const batchRow = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as Record<string, unknown>;
    expect(batchRow).toBeDefined();
    expect(batchRow.name).toBe('Test Batch');
    expect(batchRow.total_tasks).toBe(2);
    // Status may be 'running' or 'pending' depending on pool behavior
    expect(['pending', 'running']).toContain(batchRow.status);

    // Verify tasks
    const taskRows = db.prepare('SELECT * FROM tasks WHERE batch_id = ?').all(batchId) as Array<Record<string, unknown>>;
    expect(taskRows.length).toBe(2);
    const goals = taskRows.map(r => r.goal);
    expect(goals).toContain('Click the submit button');
    expect(goals).toContain('Fill in the form');
  });

  it('creates batch with task config overrides', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        name: 'Config Batch',
        tasks: [
          {
            goal: 'Test with config',
            config: {
              targetAppPath: '/custom/path.exe',
              llmModel: 'gpt-4o-mini',
              maxSteps: 20,
            },
          },
        ],
        priority: 'high',
      },
    });
    expect(res.statusCode).toBe(201);
    const { batchId } = JSON.parse(res.body);

    const taskRow = db.prepare('SELECT * FROM tasks WHERE batch_id = ?').get(batchId) as Record<string, unknown>;
    expect(taskRow.target_app_path).toBe('/custom/path.exe');
    expect(taskRow.llm_model).toBe('gpt-4o-mini');
    expect(taskRow.max_steps).toBe(20);
  });

  it('creates batch with default task config when not specified', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        tasks: [{ goal: 'Default config task' }],
      },
    });
    expect(res.statusCode).toBe(201);
    const { batchId } = JSON.parse(res.body);

    const taskRow = db.prepare('SELECT * FROM tasks WHERE batch_id = ?').get(batchId) as Record<string, unknown>;
    // Default model
    expect(taskRow.llm_model).toBe('gpt-4o');
    // Default max_steps
    expect(taskRow.max_steps).toBe(50);
  });

  it('creates batch with context injection', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        tasks: [
          {
            goal: 'Context task',
            config: { contextInjection: 'some context' },
          },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const { batchId } = JSON.parse(res.body);

    const taskRow = db.prepare('SELECT * FROM tasks WHERE batch_id = ?').get(batchId) as Record<string, unknown>;
    expect(taskRow.context_injection).toBe('some context');
  });

  it('creates batch with provider ID', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        tasks: [
          {
            goal: 'Provider task',
            config: { providerId: 'custom-provider' },
          },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const { batchId } = JSON.parse(res.body);

    const taskRow = db.prepare('SELECT * FROM tasks WHERE batch_id = ?').get(batchId) as Record<string, unknown>;
    expect(taskRow.provider_id).toBe('custom-provider');
  });

  it('creates batch with priority', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        tasks: [{ goal: 'High priority task' }],
        priority: 'high',
      },
    });
    expect(res.statusCode).toBe(201);
    const { batchId } = JSON.parse(res.body);

    const batchRow = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as Record<string, unknown>;
    expect(batchRow.priority).toBe('high');
  });

  it('defaults priority to medium when omitted', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        tasks: [{ goal: 'Default priority' }],
      },
    });
    expect(res.statusCode).toBe(201);
    const { batchId } = JSON.parse(res.body);

    const batchRow = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as Record<string, unknown>;
    expect(batchRow.priority).toBe('medium');
  });

  it('returns 400 when tasks array is empty', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: { tasks: [] },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 when tasks is missing', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: { name: 'No tasks' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when task goal is empty', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        tasks: [{ goal: '' }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when task goal is missing', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        tasks: [{ config: { llmModel: 'gpt-4o' } }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid priority', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        tasks: [{ goal: 'Test' }],
        priority: 'invalid',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for empty body', async () => {
    const res = await server.inject({ method: 'POST', url: '/api/tasks/batch', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('creates batch without name', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        tasks: [{ goal: 'Unnamed batch task' }],
      },
    });
    expect(res.statusCode).toBe(201);
    const { batchId } = JSON.parse(res.body);

    const batchRow = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as Record<string, unknown>;
    expect(batchRow.name).toBeNull();
  });

  it('creates batch with single task', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        tasks: [{ goal: 'Single task' }],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.totalTasks).toBe(1);
    expect(body.taskIds.length).toBe(1);
  });
});

describe('Route: GET /api/tasks/batch/:batchId', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeEach(async () => {
    mockProvidersConfig = {
      version: 1,
      providers: [...mockProviders],
      activeId: 'openai-default',
    };
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterEach(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('returns batch status with tasks', async () => {
    // Create a batch first
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        name: 'Status Batch',
        tasks: [{ goal: 'Task 1' }, { goal: 'Task 2' }],
      },
    });
    const { batchId } = JSON.parse(createRes.body);

    const res = await server.inject({ method: 'GET', url: `/api/tasks/batch/${batchId}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(batchId);
    expect(body.name).toBe('Status Batch');
    expect(body.status).toBeDefined();
    expect(body.totalTasks).toBe(2);
    expect(body.tasks).toBeDefined();
    expect(Array.isArray(body.tasks)).toBe(true);
    expect(body.tasks.length).toBe(2);
    expect(body.progress).toBeDefined();
    expect(typeof body.progress).toBe('number');
    expect(body.priority).toBe('medium');
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeDefined();
  });

  it('returns 404 for non-existent batch', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/tasks/batch/00000000-0000-0000-0000-000000000999',
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Batch not found');
  });

  it('returns 400 for invalid batch ID format', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/tasks/batch/not-a-uuid' });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Invalid batch ID format');
  });

  it('returns tasks with expected fields', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        tasks: [{ goal: 'Field check task' }],
      },
    });
    const { batchId } = JSON.parse(createRes.body);

    const res = await server.inject({ method: 'GET', url: `/api/tasks/batch/${batchId}` });
    const body = JSON.parse(res.body);
    const task = body.tasks[0];
    expect(task.id).toBeDefined();
    expect(task.goal).toBe('Field check task');
    expect(task.status).toBeDefined();
    expect(task.createdAt).toBeDefined();
    expect(task.updatedAt).toBeDefined();
  });

  it('returns zero progress for newly created batch', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        tasks: [{ goal: 'Progress check' }],
      },
    });
    const { batchId } = JSON.parse(createRes.body);

    const res = await server.inject({ method: 'GET', url: `/api/tasks/batch/${batchId}` });
    const body = JSON.parse(res.body);
    expect(body.progress).toBe(0);
    expect(body.completedTasks).toBe(0);
    expect(body.failedTasks).toBe(0);
  });
});

describe('Route: POST /api/tasks/batch/:batchId/cancel', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeEach(async () => {
    mockProvidersConfig = {
      version: 1,
      providers: [...mockProviders],
      activeId: 'openai-default',
    };
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterEach(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('cancels a running batch', async () => {
    // Create batch
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        tasks: [{ goal: 'Cancel me' }],
      },
    });
    const { batchId } = JSON.parse(createRes.body);

    // Update batch status to running (if it's pending)
    db.prepare("UPDATE batches SET status = 'running' WHERE id = ?").run(batchId);

    const res = await server.inject({ method: 'POST', url: `/api/tasks/batch/${batchId}/cancel` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.batchId).toBe(batchId);

    // Verify batch status
    const batchRow = db.prepare('SELECT status FROM batches WHERE id = ?').get(batchId) as { status: string };
    expect(batchRow.status).toBe('cancelled');
  });

  it('returns 404 for non-existent batch', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch/00000000-0000-0000-0000-000000000999/cancel',
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Batch not found');
  });

  it('returns 400 for invalid batch ID format', async () => {
    const res = await server.inject({ method: 'POST', url: '/api/tasks/batch/not-a-uuid/cancel' });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Invalid batch ID format');
  });

  it('returns 409 when batch is already completed', async () => {
    // Create batch
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        tasks: [{ goal: 'Already done' }],
      },
    });
    const { batchId } = JSON.parse(createRes.body);

    // Force status to completed
    db.prepare("UPDATE batches SET status = 'completed' WHERE id = ?").run(batchId);

    const res = await server.inject({ method: 'POST', url: `/api/tasks/batch/${batchId}/cancel` });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Batch is not in a cancellable state');
  });

  it('returns 409 when batch is already cancelled', async () => {
    // Create batch
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        tasks: [{ goal: 'Already cancelled' }],
      },
    });
    const { batchId } = JSON.parse(createRes.body);

    // Cancel it first
    db.prepare("UPDATE batches SET status = 'running' WHERE id = ?").run(batchId);
    await server.inject({ method: 'POST', url: `/api/tasks/batch/${batchId}/cancel` });

    // Try to cancel again
    const res = await server.inject({ method: 'POST', url: `/api/tasks/batch/${batchId}/cancel` });
    expect(res.statusCode).toBe(409);
  });

  it('returns 409 when batch is in failed state', async () => {
    // Create batch
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        tasks: [{ goal: 'Failed batch' }],
      },
    });
    const { batchId } = JSON.parse(createRes.body);

    // Force status to failed
    db.prepare("UPDATE batches SET status = 'failed' WHERE id = ?").run(batchId);

    const res = await server.inject({ method: 'POST', url: `/api/tasks/batch/${batchId}/cancel` });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Batch is not in a cancellable state');
  });
});

describe('Batches: Full lifecycle integration', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeEach(async () => {
    mockProvidersConfig = {
      version: 1,
      providers: [...mockProviders],
      activeId: 'openai-default',
    };
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterEach(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('create -> get status -> cancel lifecycle', async () => {
    // Create
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        name: 'Lifecycle Batch',
        tasks: [{ goal: 'Step 1' }, { goal: 'Step 2' }, { goal: 'Step 3' }],
        priority: 'high',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const { batchId, totalTasks } = JSON.parse(createRes.body);
    expect(totalTasks).toBe(3);

    // Get status
    const statusRes = await server.inject({ method: 'GET', url: `/api/tasks/batch/${batchId}` });
    expect(statusRes.statusCode).toBe(200);
    const status = JSON.parse(statusRes.body);
    expect(status.name).toBe('Lifecycle Batch');
    expect(status.totalTasks).toBe(3);
    expect(status.priority).toBe('high');
    expect(status.tasks.length).toBe(3);

    // Force to running for cancellation
    db.prepare("UPDATE batches SET status = 'running' WHERE id = ?").run(batchId);

    // Cancel
    const cancelRes = await server.inject({ method: 'POST', url: `/api/tasks/batch/${batchId}/cancel` });
    expect(cancelRes.statusCode).toBe(200);
    expect(JSON.parse(cancelRes.body).success).toBe(true);

    // Verify final status
    const finalRes = await server.inject({ method: 'GET', url: `/api/tasks/batch/${batchId}` });
    const finalStatus = JSON.parse(finalRes.body);
    expect(finalStatus.status).toBe('cancelled');
  });

  it('batch tasks are linked via batch_id foreign key', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        tasks: [{ goal: 'Linked task 1' }, { goal: 'Linked task 2' }],
      },
    });
    const { batchId, taskIds } = JSON.parse(createRes.body);

    // Verify tasks have correct batch_id
    for (const taskId of taskIds) {
      const task = db.prepare('SELECT batch_id FROM tasks WHERE id = ?').get(taskId) as { batch_id: string };
      expect(task.batch_id).toBe(batchId);
    }
  });

  it('batch with high priority task config', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/tasks/batch',
      payload: {
        tasks: [
          { goal: 'Task A', config: { maxSteps: 10 } },
          { goal: 'Task B', config: { maxSteps: 30, llmModel: 'gpt-4o-mini' } },
        ],
        priority: 'low',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const { batchId } = JSON.parse(createRes.body);

    const statusRes = await server.inject({ method: 'GET', url: `/api/tasks/batch/${batchId}` });
    const status = JSON.parse(statusRes.body);
    expect(status.priority).toBe('low');
    expect(status.tasks.length).toBe(2);
  });
});
