/**
 * Codegen Service Tests (PR-19)
 *
 * Tests for converting stored test steps into runnable Playwright test scripts.
 * Covers: action mapping, full script generation, edge cases, and API endpoint.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildServer } from '../server.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { generatePlaywrightScript, mapActionToPlaywright } from '../services/codegen.js';
import type { StepRecord } from '@eata/shared-types';

function createTempDbPath(): { dbPath: string; cleanupDir: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-codegen-test-'));
  return { dbPath: join(tmpDir, 'test-db.sqlite3'), cleanupDir: tmpDir };
}

function resetDb(db: Database.Database) {
  db.prepare('DELETE FROM steps').run();
  db.prepare('DELETE FROM tasks').run();
}

/** Insert a task directly into the DB for testing. */
function insertTask(db: Database.Database, overrides: Partial<{ id: string; goal: string; status: string }> = {}) {
  const id = overrides.id ?? randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, context_injection, step_count, created_at, updated_at, provider_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, overrides.goal ?? 'Test goal', '/app', 'gpt-4o', overrides.status ?? 'completed', 50, null, 0, now, now, null);
  return id;
}

/** Insert a step directly into the DB for testing. */
function insertStep(
  db: Database.Database,
  taskId: string,
  opts: {
    stepIndex: number;
    phase: string;
    status: string;
    actionName?: string;
    actionArgs?: Record<string, unknown>;
    observation?: string;
    duration?: number;
  },
) {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO steps (id, task_id, step_index, phase, status, observation, action, result, reasoning, screenshot_path, accessibility_snapshot_path, timestamp, duration)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    taskId,
    opts.stepIndex,
    opts.phase,
    opts.status,
    opts.observation ?? null,
    opts.actionName ? JSON.stringify({ name: opts.actionName, args: opts.actionArgs ?? {} }) : null,
    null,
    null,
    null,
    null,
    now,
    opts.duration ?? 100,
  );
}

// ── mapActionToPlaywright Unit Tests ────────────────────────────────────

describe('mapActionToPlaywright', () => {
  it('maps click action to page.click(selector)', () => {
    const result = mapActionToPlaywright({
      name: 'click',
      args: { selector: '#submit-btn' },
    });
    expect(result).toBe("await page.click('#submit-btn');");
  });

  it('maps type action to page.fill(selector, text)', () => {
    const result = mapActionToPlaywright({
      name: 'type',
      args: { selector: '#email', text: 'test@example.com' },
    });
    expect(result).toBe("await page.fill('#email', 'test@example.com');");
  });

  it('maps screenshot action to page.screenshot()', () => {
    const result = mapActionToPlaywright({
      name: 'screenshot',
      args: {},
    });
    expect(result).toBe('await page.screenshot();');
  });

  it('maps navigate action to page.goto(url)', () => {
    const result = mapActionToPlaywright({
      name: 'navigate',
      args: { url: 'https://example.com' },
    });
    expect(result).toBe("await page.goto('https://example.com');");
  });

  it('maps assert action with text to expect assertion', () => {
    const result = mapActionToPlaywright({
      name: 'assert',
      args: { selector: '.message', text: 'Success' },
    });
    expect(result).toBe("await expect(page.locator('.message')).toHaveText('Success');");
  });

  it('maps hover action to page.hover(selector)', () => {
    const result = mapActionToPlaywright({
      name: 'hover',
      args: { selector: '#menu-item' },
    });
    expect(result).toBe("await page.hover('#menu-item');");
  });

  it('maps press_key action to page.keyboard.press(key)', () => {
    const result = mapActionToPlaywright({
      name: 'press_key',
      args: { key: 'Enter' },
    });
    expect(result).toBe("await page.keyboard.press('Enter');");
  });

  it('maps browser_click with browser_ prefix to page.click()', () => {
    const result = mapActionToPlaywright({
      name: 'browser_click',
      args: { selector: '#btn' },
    });
    expect(result).toBe("await page.click('#btn');");
  });

  it('maps browser_type with browser_ prefix to page.fill()', () => {
    const result = mapActionToPlaywright({
      name: 'browser_type',
      args: { selector: '#input', text: 'hello' },
    });
    expect(result).toBe("await page.fill('#input', 'hello');");
  });

  it('maps browser_navigate with browser_ prefix to page.goto()', () => {
    const result = mapActionToPlaywright({
      name: 'browser_navigate',
      args: { url: 'https://example.com' },
    });
    expect(result).toBe("await page.goto('https://example.com');");
  });

  it('returns comment for unknown action types', () => {
    const result = mapActionToPlaywright({
      name: 'unknown_action',
      args: { foo: 'bar' },
    });
    expect(result).toContain('// Unsupported action: unknown_action');
  });

  it('handles click without selector gracefully', () => {
    const result = mapActionToPlaywright({
      name: 'click',
      args: {},
    });
    expect(result).toContain('// click action missing selector');
  });

  it('handles type without required args gracefully', () => {
    const result = mapActionToPlaywright({
      name: 'type',
      args: { selector: '#input' },
    });
    expect(result).toContain("// type action missing 'text' argument");
  });

  it('escapes single quotes in selector', () => {
    const result = mapActionToPlaywright({
      name: 'click',
      args: { selector: "[data-testid='btn']" },
    });
    expect(result).toContain("\\'");
  });

  it('escapes single quotes in text content', () => {
    const result = mapActionToPlaywright({
      name: 'type',
      args: { selector: '#input', text: "it's a test" },
    });
    expect(result).toContain("\\'");
  });
});

// ── generatePlaywrightScript Unit Tests ─────────────────────────────────

describe('generatePlaywrightScript', () => {
  it('generates script with proper imports', () => {
    const steps: StepRecord[] = [];
    const script = generatePlaywrightScript(steps, 'Test goal');
    expect(script).toContain("import { test, expect } from '@playwright/test';");
  });

  it('generates test block with goal as description', () => {
    const steps: StepRecord[] = [];
    const script = generatePlaywrightScript(steps, 'Click the submit button');
    expect(script).toContain("test('Click the submit button'");
  });

  it('generates empty test body when no steps', () => {
    const steps: StepRecord[] = [];
    const script = generatePlaywrightScript(steps, 'Empty test');
    expect(script).toContain('test(');
    expect(script).toContain('{');
    expect(script).toContain('}');
  });

  it('generates navigate action for execute phase steps', () => {
    const steps: StepRecord[] = [
      {
        id: randomUUID(),
        taskId: 'task-1',
        stepIndex: 0,
        phase: 'execute',
        status: 'success',
        action: { name: 'navigate', args: { url: 'https://example.com' } },
        timestamp: new Date().toISOString(),
        duration: 100,
      },
    ];
    const script = generatePlaywrightScript(steps, 'Navigate test');
    expect(script).toContain("await page.goto('https://example.com');");
  });

  it('generates click action for execute phase steps', () => {
    const steps: StepRecord[] = [
      {
        id: randomUUID(),
        taskId: 'task-1',
        stepIndex: 0,
        phase: 'execute',
        status: 'success',
        action: { name: 'click', args: { selector: '#btn' } },
        timestamp: new Date().toISOString(),
        duration: 100,
      },
    ];
    const script = generatePlaywrightScript(steps, 'Click test');
    expect(script).toContain("await page.click('#btn');");
  });

  it('generates type action for execute phase steps', () => {
    const steps: StepRecord[] = [
      {
        id: randomUUID(),
        taskId: 'task-1',
        stepIndex: 0,
        phase: 'execute',
        status: 'success',
        action: { name: 'type', args: { selector: '#input', text: 'hello' } },
        timestamp: new Date().toISOString(),
        duration: 100,
      },
    ];
    const script = generatePlaywrightScript(steps, 'Type test');
    expect(script).toContain("await page.fill('#input', 'hello');");
  });

  it('generates assertion for verify phase with observation', () => {
    const steps: StepRecord[] = [
      {
        id: randomUUID(),
        taskId: 'task-1',
        stepIndex: 0,
        phase: 'verify',
        status: 'success',
        observation: 'Success message displayed',
        timestamp: new Date().toISOString(),
        duration: 100,
      },
    ];
    const script = generatePlaywrightScript(steps, 'Assert test');
    expect(script).toContain('expect');
  });

  it('skips observe phase steps (informational only)', () => {
    const steps: StepRecord[] = [
      {
        id: randomUUID(),
        taskId: 'task-1',
        stepIndex: 0,
        phase: 'observe',
        status: 'success',
        observation: 'Page loaded',
        timestamp: new Date().toISOString(),
        duration: 100,
      },
    ];
    const script = generatePlaywrightScript(steps, 'Observe test');
    expect(script).not.toContain('await page');
  });

  it('skips plan phase steps (informational only)', () => {
    const steps: StepRecord[] = [
      {
        id: randomUUID(),
        taskId: 'task-1',
        stepIndex: 0,
        phase: 'plan',
        status: 'success',
        reasoning: 'Will click the button',
        timestamp: new Date().toISOString(),
        duration: 100,
      },
    ];
    const script = generatePlaywrightScript(steps, 'Plan test');
    expect(script).not.toContain('await page');
  });

  it('generates multi-step script in correct order', () => {
    const steps: StepRecord[] = [
      {
        id: randomUUID(),
        taskId: 'task-1',
        stepIndex: 0,
        phase: 'execute',
        status: 'success',
        action: { name: 'navigate', args: { url: 'https://example.com' } },
        timestamp: new Date().toISOString(),
        duration: 100,
      },
      {
        id: randomUUID(),
        taskId: 'task-1',
        stepIndex: 1,
        phase: 'execute',
        status: 'success',
        action: { name: 'click', args: { selector: '#login' } },
        timestamp: new Date().toISOString(),
        duration: 100,
      },
      {
        id: randomUUID(),
        taskId: 'task-1',
        stepIndex: 2,
        phase: 'execute',
        status: 'success',
        action: { name: 'type', args: { selector: '#email', text: 'user@test.com' } },
        timestamp: new Date().toISOString(),
        duration: 100,
      },
    ];
    const script = generatePlaywrightScript(steps, 'Multi-step test');
    const lines = script.split('\n');

    // Navigate should come before click, click before type
    const navigateIdx = lines.findIndex((l) => l.includes('page.goto'));
    const clickIdx = lines.findIndex((l) => l.includes("page.click('#login')"));
    const typeIdx = lines.findIndex((l) => l.includes("page.fill('#email'"));

    expect(navigateIdx).toBeLessThan(clickIdx);
    expect(clickIdx).toBeLessThan(typeIdx);
  });

  it('includes step comments for readability', () => {
    const steps: StepRecord[] = [
      {
        id: randomUUID(),
        taskId: 'task-1',
        stepIndex: 0,
        phase: 'execute',
        status: 'success',
        action: { name: 'click', args: { selector: '#btn' } },
        timestamp: new Date().toISOString(),
        duration: 100,
      },
    ];
    const script = generatePlaywrightScript(steps, 'Test');
    expect(script).toContain('// Step 1');
  });

  it('generates valid TypeScript syntax', () => {
    const steps: StepRecord[] = [
      {
        id: randomUUID(),
        taskId: 'task-1',
        stepIndex: 0,
        phase: 'execute',
        status: 'success',
        action: { name: 'navigate', args: { url: 'https://example.com' } },
        timestamp: new Date().toISOString(),
        duration: 100,
      },
      {
        id: randomUUID(),
        taskId: 'task-1',
        stepIndex: 1,
        phase: 'execute',
        status: 'success',
        action: { name: 'click', args: { selector: '#btn' } },
        timestamp: new Date().toISOString(),
        duration: 100,
      },
    ];
    const script = generatePlaywrightScript(steps, 'Test');
    // Basic syntax checks
    expect(script).toMatch(/import \{ test, expect \} from/);
    expect(script).toMatch(/test\('.*', async \(\{ page \}\) => \{/);
    expect(script).toContain('});');
  });

  it('handles steps with no action gracefully', () => {
    const steps: StepRecord[] = [
      {
        id: randomUUID(),
        taskId: 'task-1',
        stepIndex: 0,
        phase: 'execute',
        status: 'success',
        timestamp: new Date().toISOString(),
        duration: 100,
      },
    ];
    const script = generatePlaywrightScript(steps, 'No action test');
    expect(script).toContain('test(');
    // Should not crash, just skip the step
  });

  it('uses data-testid selector when available', () => {
    const steps: StepRecord[] = [
      {
        id: randomUUID(),
        taskId: 'task-1',
        stepIndex: 0,
        phase: 'execute',
        status: 'success',
        action: { name: 'click', args: { selector: '[data-testid="submit-btn"]' } },
        timestamp: new Date().toISOString(),
        duration: 100,
      },
    ];
    const script = generatePlaywrightScript(steps, 'Test');
    expect(script).toContain('[data-testid="submit-btn"]');
  });
});

// ── API Endpoint Tests ──────────────────────────────────────────────────

describe('GET /api/tasks/:id/generate', () => {
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

  beforeEach(() => resetDb(db));

  it('returns Playwright script for a task with steps', async () => {
    const taskId = insertTask(db, { goal: 'Test login flow' });
    insertStep(db, taskId, {
      stepIndex: 0,
      phase: 'execute',
      status: 'success',
      actionName: 'navigate',
      actionArgs: { url: 'https://example.com/login' },
    });
    insertStep(db, taskId, {
      stepIndex: 1,
      phase: 'execute',
      status: 'success',
      actionName: 'click',
      actionArgs: { selector: '#login-btn' },
    });

    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}/generate`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/typescript');
    expect(res.body).toContain("import { test, expect } from '@playwright/test'");
    expect(res.body).toContain("test('Test login flow'");
    expect(res.body).toContain("await page.goto('https://example.com/login');");
    expect(res.body).toContain("await page.click('#login-btn');");
  });

  it('returns script with correct content-disposition header', async () => {
    const taskId = insertTask(db);

    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}/generate`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('.spec.ts');
    expect(res.headers['content-disposition']).toContain(taskId);
  });

  it('returns 404 for non-existent task', async () => {
    const fakeId = 'f0000000-0000-4000-f000-000000000001';

    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${fakeId}/generate`,
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Task not found');
  });

  it('returns valid script for task with no steps', async () => {
    const taskId = insertTask(db, { goal: 'Empty task' });

    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}/generate`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("import { test, expect } from '@playwright/test'");
    expect(res.body).toContain("test('Empty task'");
  });

  it('returns script with all action types', async () => {
    const taskId = insertTask(db, { goal: 'Full flow' });
    insertStep(db, taskId, {
      stepIndex: 0,
      phase: 'execute',
      status: 'success',
      actionName: 'navigate',
      actionArgs: { url: 'https://example.com' },
    });
    insertStep(db, taskId, {
      stepIndex: 1,
      phase: 'execute',
      status: 'success',
      actionName: 'type',
      actionArgs: { selector: '#search', text: 'query' },
    });
    insertStep(db, taskId, {
      stepIndex: 2,
      phase: 'execute',
      status: 'success',
      actionName: 'click',
      actionArgs: { selector: '#search-btn' },
    });
    insertStep(db, taskId, {
      stepIndex: 3,
      phase: 'execute',
      status: 'success',
      actionName: 'screenshot',
      actionArgs: {},
    });

    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}/generate`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("await page.goto('https://example.com');");
    expect(res.body).toContain("await page.fill('#search', 'query');");
    expect(res.body).toContain("await page.click('#search-btn');");
    expect(res.body).toContain('await page.screenshot();');
  });

  it('handles task with browser_ prefixed action names', async () => {
    const taskId = insertTask(db, { goal: 'Browser prefixed test' });
    insertStep(db, taskId, {
      stepIndex: 0,
      phase: 'execute',
      status: 'success',
      actionName: 'browser_click',
      actionArgs: { selector: '#btn' },
    });

    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}/generate`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("await page.click('#btn');");
  });

  it('accepts format query parameter', async () => {
    const taskId = insertTask(db);

    const res = await server.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}/generate?format=playwright`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("import { test, expect } from '@playwright/test'");
  });
});
