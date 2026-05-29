import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildServer } from '../server.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

function createTempDbPath(): { dbPath: string; cleanupDir: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-feedback-templates-test-'));
  return { dbPath: join(tmpDir, 'test-db.sqlite3'), cleanupDir: tmpDir };
}

// ─────────────────────────────────────────────────────────────
// Feedback: GET /api/feedback/patterns
// ─────────────────────────────────────────────────────────────

describe('Route: GET /api/feedback/patterns (extended)', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;
  let originalCwd: string;

  beforeAll(async () => {
    originalCwd = process.cwd();
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    process.chdir(dir);
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterAll(async () => {
    await server.close();
    db.close();
    process.chdir(originalCwd);
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  beforeEach(() => {
    const feedbackDir = join('data', 'feedback');
    try { rmSync(feedbackDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('returns multiple patterns from JSONL file', async () => {
    const feedbackDir = join('data', 'feedback');
    mkdirSync(feedbackDir, { recursive: true });
    const patterns = [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        errorType: 'timeout',
        targetDescription: 'Button not found',
        remediationHint: 'Wait longer',
        similarityKeywords: ['timeout'],
        frequency: 3,
        lastSeen: new Date().toISOString(),
        relatedGoalPatterns: ['click'],
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        errorType: 'crash',
        targetDescription: 'App crashed',
        remediationHint: 'Restart app',
        similarityKeywords: ['crash'],
        frequency: 7,
        lastSeen: new Date().toISOString(),
        relatedGoalPatterns: [],
      },
    ];
    const jsonl = patterns.map((p) => JSON.stringify(p)).join('\n') + '\n';
    writeFileSync(join(feedbackDir, 'patterns.jsonl'), jsonl);

    const res = await server.inject({ method: 'GET', url: '/api/feedback/patterns' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.patterns.length).toBe(2);
    expect(body.patterns[0].id).toBe('550e8400-e29b-41d4-a716-446655440001');
    expect(body.patterns[1].id).toBe('550e8400-e29b-41d4-a716-446655440002');
  });

  it('skips invalid JSON lines and continues parsing', async () => {
    const feedbackDir = join('data', 'feedback');
    mkdirSync(feedbackDir, { recursive: true });
    const validPattern = {
      id: '550e8400-e29b-41d4-a716-446655440010',
      errorType: 'timeout',
      targetDescription: 'Button not found',
      remediationHint: 'Wait longer',
      similarityKeywords: ['timeout'],
      frequency: 2,
      lastSeen: new Date().toISOString(),
      relatedGoalPatterns: [],
    };
    const content = 'not valid json\n' + JSON.stringify(validPattern) + '\n{broken\n';
    writeFileSync(join(feedbackDir, 'patterns.jsonl'), content);

    const res = await server.inject({ method: 'GET', url: '/api/feedback/patterns' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.patterns.length).toBe(1);
    expect(body.patterns[0].id).toBe('550e8400-e29b-41d4-a716-446655440010');
  });

  it('skips lines that fail schema validation', async () => {
    const feedbackDir = join('data', 'feedback');
    mkdirSync(feedbackDir, { recursive: true });
    // Missing required fields (no id, no errorType, etc.)
    const invalidPattern = { foo: 'bar' };
    const validPattern = {
      id: '550e8400-e29b-41d4-a716-446655440020',
      errorType: 'crash',
      targetDescription: 'App crashed',
      remediationHint: 'Restart',
      similarityKeywords: ['crash'],
      frequency: 1,
      lastSeen: new Date().toISOString(),
      relatedGoalPatterns: [],
    };
    const content = JSON.stringify(invalidPattern) + '\n' + JSON.stringify(validPattern) + '\n';
    writeFileSync(join(feedbackDir, 'patterns.jsonl'), content);

    const res = await server.inject({ method: 'GET', url: '/api/feedback/patterns' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.patterns.length).toBe(1);
    expect(body.patterns[0].id).toBe('550e8400-e29b-41d4-a716-446655440020');
  });

  it('returns empty patterns for empty JSONL file', async () => {
    const feedbackDir = join('data', 'feedback');
    mkdirSync(feedbackDir, { recursive: true });
    writeFileSync(join(feedbackDir, 'patterns.jsonl'), '');

    const res = await server.inject({ method: 'GET', url: '/api/feedback/patterns' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.patterns).toEqual([]);
  });

  it('returns empty patterns for file with only whitespace lines', async () => {
    const feedbackDir = join('data', 'feedback');
    mkdirSync(feedbackDir, { recursive: true });
    writeFileSync(join(feedbackDir, 'patterns.jsonl'), '\n\n  \n\n');

    const res = await server.inject({ method: 'GET', url: '/api/feedback/patterns' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.patterns).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────
// Templates: GET /api/templates
// ─────────────────────────────────────────────────────────────

describe('Route: GET /api/templates', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeAll(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterAll(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  beforeEach(() => {
    db.prepare('DELETE FROM templates WHERE built_in = 0').run();
  });

  it('returns built-in templates on fresh database', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/templates' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toBeDefined();
    expect(body.total).toBeDefined();
    // Built-in templates are seeded at startup (6 built-in templates)
    expect(body.data.length).toBeGreaterThanOrEqual(6);
    expect(body.total).toBe(body.data.length);
  });

  it('lists built-in templates sorted by builtIn DESC then name ASC', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/templates' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    // All seeded templates are built-in
    const allBuiltIn = body.data.every((t: { builtIn: boolean }) => t.builtIn === true);
    expect(allBuiltIn).toBe(true);

    // Verify name ordering among built-in templates
    const names = body.data.map((t: { name: string }) => t.name);
    const sortedNames = [...names].sort();
    expect(names).toEqual(sortedNames);
  });

  it('includes custom templates alongside built-in', async () => {
    // Insert a custom template directly
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO templates (id, name, description, category, goal, config, variables, built_in, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
    ).run('custom-1', 'My Custom', 'A custom template', 'custom', 'Do something', null, null, now, now);

    const res = await server.inject({ method: 'GET', url: '/api/templates' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const custom = body.data.find((t: { id: string }) => t.id === 'custom-1');
    expect(custom).toBeDefined();
    expect(custom.builtIn).toBe(false);
  });

  it('filters templates by category', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/templates?category=login' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    body.data.forEach((t: { category: string }) => {
      expect(t.category).toBe('login');
    });
  });

  it('returns empty result for non-existent category', async () => {
    // 'custom' category exists in the enum but no built-in templates use it
    const res = await server.inject({ method: 'GET', url: '/api/templates?category=custom' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(0);
  });

  it('filters templates by search term in name', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/templates?search=Login' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    const found = body.data.find((t: { name: string }) => t.name === 'Login Flow');
    expect(found).toBeDefined();
  });

  it('returns empty result for search with no matches', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/templates?search=zzz_nonexistent_zzz' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(0);
  });

  it('ignores invalid filter params gracefully', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/templates?category=invalid_cat' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // Invalid category is ignored; returns all templates
    expect(body.data.length).toBeGreaterThanOrEqual(6);
  });
});

// ─────────────────────────────────────────────────────────────
// Templates: GET /api/templates/:id
// ─────────────────────────────────────────────────────────────

describe('Route: GET /api/templates/:id', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeAll(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterAll(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  beforeEach(() => {
    db.prepare('DELETE FROM templates WHERE built_in = 0').run();
  });

  it('returns a built-in template by id', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/templates/builtin-login-flow' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe('builtin-login-flow');
    expect(body.name).toBe('Login Flow');
    expect(body.category).toBe('login');
    expect(body.builtIn).toBe(true);
    expect(body.config).toBeDefined();
    expect(body.variables).toBeDefined();
  });

  it('returns a custom template by id', async () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO templates (id, name, description, category, goal, config, variables, built_in, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
    ).run('custom-abc', 'Custom ABC', 'Test custom', 'custom', 'Test goal', '{"key":"val"}', '["a","b"]', now, now);

    const res = await server.inject({ method: 'GET', url: '/api/templates/custom-abc' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe('custom-abc');
    expect(body.name).toBe('Custom ABC');
    expect(body.builtIn).toBe(false);
    expect(body.config).toEqual({ key: 'val' });
    expect(body.variables).toEqual(['a', 'b']);
  });

  it('returns 404 for non-existent template', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/templates/nonexistent-id' });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Template not found');
  });

  it('returns template with null config and variables', async () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO templates (id, name, description, category, goal, config, variables, built_in, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
    ).run('minimal-1', 'Minimal', null, 'custom', 'Goal only', null, null, now, now);

    const res = await server.inject({ method: 'GET', url: '/api/templates/minimal-1' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.config).toBeNull();
    expect(body.variables).toBeNull();
    expect(body.description).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// Templates: POST /api/templates
// ─────────────────────────────────────────────────────────────

describe('Route: POST /api/templates', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeAll(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterAll(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  beforeEach(() => {
    db.prepare('DELETE FROM templates WHERE built_in = 0').run();
  });

  const validBody = {
    name: 'My Template',
    description: 'A test template',
    category: 'custom' as const,
    goal: 'Test something',
  };

  it('creates a template and returns 201', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/templates',
      payload: validBody,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBeDefined();
    expect(typeof body.id).toBe('string');
    expect(body.name).toBe('My Template');
    expect(body.description).toBe('A test template');
    expect(body.category).toBe('custom');
    expect(body.goal).toBe('Test something');
    expect(body.builtIn).toBe(false);
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeDefined();
  });

  it('creates a template with optional fields', async () => {
    const payload = {
      ...validBody,
      config: { steps: ['step1', 'step2'] },
      variables: ['var1', 'var2'],
    };
    const res = await server.inject({
      method: 'POST',
      url: '/api/templates',
      payload,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.config).toEqual({ steps: ['step1', 'step2'] });
    expect(body.variables).toEqual(['var1', 'var2']);
  });

  it('creates a template with minimal required fields (no description)', async () => {
    const minimal = { name: 'Minimal', category: 'form' as const, goal: 'Test form' };
    const res = await server.inject({
      method: 'POST',
      url: '/api/templates',
      payload: minimal,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.description).toBeNull();
    expect(body.config).toBeNull();
    expect(body.variables).toBeNull();
  });

  it('persists template in database', async () => {
    await server.inject({
      method: 'POST',
      url: '/api/templates',
      payload: validBody,
    });

    const rows = db.prepare('SELECT * FROM templates WHERE built_in = 0').all() as Array<Record<string, unknown>>;
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('My Template');
    expect(rows[0].category).toBe('custom');
    expect(rows[0].built_in).toBe(0);
  });

  it('returns 400 when name is missing', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/templates',
      payload: { category: 'custom', goal: 'Test' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Validation failed');
    expect(body.details).toBeDefined();
  });

  it('returns 400 when name is empty string', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/templates',
      payload: { name: '', category: 'custom', goal: 'Test' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when goal is missing', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/templates',
      payload: { name: 'Test', category: 'custom' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 when category is missing', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/templates',
      payload: { name: 'Test', goal: 'Test goal' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when category is invalid', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/templates',
      payload: { name: 'Test', category: 'not-a-valid-category', goal: 'Test goal' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 for empty body', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/templates',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 when name exceeds max length', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/templates',
      payload: { name: 'A'.repeat(101), category: 'custom', goal: 'Test' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('accepts name at exactly max length (100)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/templates',
      payload: { name: 'A'.repeat(100), category: 'custom', goal: 'Test' },
    });

    expect(res.statusCode).toBe(201);
  });

  it('accepts all valid category values', async () => {
    const categories = ['login', 'crud', 'form', 'navigation', 'file', 'settings', 'custom'];
    for (const category of categories) {
      const res = await server.inject({
        method: 'POST',
        url: '/api/templates',
        payload: { name: `Template ${category}`, category, goal: 'Test' },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.category).toBe(category);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Templates: PUT /api/templates/:id
// ─────────────────────────────────────────────────────────────

describe('Route: PUT /api/templates/:id', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeAll(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterAll(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  beforeEach(() => {
    db.prepare('DELETE FROM templates WHERE built_in = 0').run();
  });

  function insertCustomTemplate(id = 'custom-update') {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO templates (id, name, description, category, goal, config, variables, built_in, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
    ).run(id, 'Original Name', 'Original desc', 'custom', 'Original goal', '{"k":"v"}', '["a"]', now, now);
  }

  it('updates a custom template name', async () => {
    insertCustomTemplate();

    const res = await server.inject({
      method: 'PUT',
      url: '/api/templates/custom-update',
      payload: { name: 'Updated Name' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Updated Name');
    expect(body.goal).toBe('Original goal'); // unchanged
  });

  it('updates multiple fields at once', async () => {
    insertCustomTemplate();

    const res = await server.inject({
      method: 'PUT',
      url: '/api/templates/custom-update',
      payload: {
        name: 'New Name',
        description: 'New description',
        category: 'form',
        goal: 'New goal',
        config: { steps: ['new'] },
        variables: ['x', 'y'],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('New Name');
    expect(body.description).toBe('New description');
    expect(body.category).toBe('form');
    expect(body.goal).toBe('New goal');
    expect(body.config).toEqual({ steps: ['new'] });
    expect(body.variables).toEqual(['x', 'y']);
  });

  it('returns 404 for non-existent template', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: '/api/templates/nonexistent',
      payload: { name: 'Nope' },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Template not found');
  });

  it('returns 403 when updating a built-in template', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: '/api/templates/builtin-login-flow',
      payload: { name: 'Hacked Name' },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Cannot modify built-in templates');
  });

  it('returns 400 when update body has invalid category', async () => {
    insertCustomTemplate();

    const res = await server.inject({
      method: 'PUT',
      url: '/api/templates/custom-update',
      payload: { category: 'invalid-category' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 when update body has empty name', async () => {
    insertCustomTemplate();

    const res = await server.inject({
      method: 'PUT',
      url: '/api/templates/custom-update',
      payload: { name: '' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns unchanged template when update body has no valid fields', async () => {
    insertCustomTemplate();

    const res = await server.inject({
      method: 'PUT',
      url: '/api/templates/custom-update',
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Original Name');
  });

  it('persists updates in the database', async () => {
    insertCustomTemplate();

    await server.inject({
      method: 'PUT',
      url: '/api/templates/custom-update',
      payload: { name: 'DB Verified Name' },
    });

    const row = db.prepare('SELECT name FROM templates WHERE id = ?').get('custom-update') as { name: string };
    expect(row.name).toBe('DB Verified Name');
  });

  it('updates only goal leaving other fields unchanged', async () => {
    insertCustomTemplate();

    const res = await server.inject({
      method: 'PUT',
      url: '/api/templates/custom-update',
      payload: { goal: 'Only goal changed' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.goal).toBe('Only goal changed');
    expect(body.name).toBe('Original Name');
    expect(body.description).toBe('Original desc');
  });
});

// ─────────────────────────────────────────────────────────────
// Templates: DELETE /api/templates/:id
// ─────────────────────────────────────────────────────────────

describe('Route: DELETE /api/templates/:id', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeAll(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterAll(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  beforeEach(() => {
    db.prepare('DELETE FROM templates WHERE built_in = 0').run();
  });

  function insertCustomTemplate(id = 'custom-delete') {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO templates (id, name, description, category, goal, config, variables, built_in, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
    ).run(id, 'To Delete', 'Will be deleted', 'custom', 'Delete me', null, null, now, now);
  }

  it('deletes a custom template and returns 204', async () => {
    insertCustomTemplate();

    const res = await server.inject({ method: 'DELETE', url: '/api/templates/custom-delete' });
    expect(res.statusCode).toBe(204);

    // Verify deletion from DB
    const rows = db.prepare('SELECT * FROM templates WHERE id = ?').all('custom-delete');
    expect(rows.length).toBe(0);
  });

  it('returns 404 for non-existent template', async () => {
    const res = await server.inject({ method: 'DELETE', url: '/api/templates/nonexistent' });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Template not found');
  });

  it('returns 403 when deleting a built-in template', async () => {
    const res = await server.inject({ method: 'DELETE', url: '/api/templates/builtin-login-flow' });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Cannot delete built-in templates');

    // Verify it still exists
    const row = db.prepare('SELECT * FROM templates WHERE id = ?').get('builtin-login-flow');
    expect(row).toBeDefined();
  });

  it('returns 403 for each built-in template id', async () => {
    const builtInIds = [
      'builtin-login-flow',
      'builtin-crud-operations',
      'builtin-form-validation',
      'builtin-navigation-test',
      'builtin-file-dialog',
      'builtin-settings-page',
    ];

    for (const id of builtInIds) {
      const res = await server.inject({ method: 'DELETE', url: `/api/templates/${id}` });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Cannot delete built-in templates');
    }
  });

  it('deleting one custom template does not affect others', async () => {
    insertCustomTemplate('custom-a');
    insertCustomTemplate('custom-b');

    const res = await server.inject({ method: 'DELETE', url: '/api/templates/custom-a' });
    expect(res.statusCode).toBe(204);

    const remaining = db.prepare('SELECT * FROM templates WHERE id = ?').get('custom-b');
    expect(remaining).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────
// Templates: CRUD integration flow
// ─────────────────────────────────────────────────────────────

describe('Templates: Full CRUD integration', () => {
  let server: FastifyInstance;
  let db: Database.Database;
  let cleanupDir: string;

  beforeAll(async () => {
    const { dbPath, cleanupDir: dir } = createTempDbPath();
    cleanupDir = dir;
    const bundle = await buildServer({ databasePath: dbPath });
    server = bundle.server;
    db = bundle.db;
  });

  afterAll(async () => {
    await server.close();
    db.close();
    try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  beforeEach(() => {
    db.prepare('DELETE FROM templates WHERE built_in = 0').run();
  });

  it('create -> get -> update -> delete lifecycle', async () => {
    // Create
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/templates',
      payload: {
        name: 'Lifecycle Template',
        category: 'custom',
        goal: 'Test lifecycle',
        config: { version: 1 },
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);
    const templateId = created.id;

    // Get
    const getRes = await server.inject({ method: 'GET', url: `/api/templates/${templateId}` });
    expect(getRes.statusCode).toBe(200);
    const fetched = JSON.parse(getRes.body);
    expect(fetched.name).toBe('Lifecycle Template');
    expect(fetched.config).toEqual({ version: 1 });

    // Update
    const updateRes = await server.inject({
      method: 'PUT',
      url: `/api/templates/${templateId}`,
      payload: { name: 'Updated Lifecycle', config: { version: 2 } },
    });
    expect(updateRes.statusCode).toBe(200);
    const updated = JSON.parse(updateRes.body);
    expect(updated.name).toBe('Updated Lifecycle');
    expect(updated.config).toEqual({ version: 2 });

    // Verify update persisted
    const verifyRes = await server.inject({ method: 'GET', url: `/api/templates/${templateId}` });
    const verified = JSON.parse(verifyRes.body);
    expect(verified.name).toBe('Updated Lifecycle');

    // Delete
    const deleteRes = await server.inject({ method: 'DELETE', url: `/api/templates/${templateId}` });
    expect(deleteRes.statusCode).toBe(204);

    // Verify deletion
    const goneRes = await server.inject({ method: 'GET', url: `/api/templates/${templateId}` });
    expect(goneRes.statusCode).toBe(404);
  });

  it('created template appears in list endpoint', async () => {
    await server.inject({
      method: 'POST',
      url: '/api/templates',
      payload: { name: 'Listed Template', category: 'crud', goal: 'Show in list' },
    });

    const listRes = await server.inject({ method: 'GET', url: '/api/templates' });
    expect(listRes.statusCode).toBe(200);
    const body = JSON.parse(listRes.body);
    const found = body.data.find((t: { name: string }) => t.name === 'Listed Template');
    expect(found).toBeDefined();
    expect(found.category).toBe('crud');
  });

  it('custom templates are listed after built-in templates', async () => {
    await server.inject({
      method: 'POST',
      url: '/api/templates',
      payload: { name: 'AAA Custom', category: 'custom', goal: 'Should sort after built-in' },
    });

    const listRes = await server.inject({ method: 'GET', url: '/api/templates' });
    const body = JSON.parse(listRes.body);

    // Built-in templates come first (builtIn DESC), then custom
    const builtInCount = body.data.filter((t: { builtIn: boolean }) => t.builtIn).length;
    expect(builtInCount).toBeGreaterThanOrEqual(6);

    // The custom template should be last
    const lastTemplate = body.data[body.data.length - 1];
    expect(lastTemplate.name).toBe('AAA Custom');
    expect(lastTemplate.builtIn).toBe(false);
  });
});
