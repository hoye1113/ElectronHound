# Test Scheduling System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Cron 表达式定时运行测试模板，结果对比历史数据，异常时发送 Webhook/SSE 通知。

**Architecture:** ScheduleService 管理 Cron 定时器，触发时复用现有 taskQueue 创建任务。执行历史存入 schedule_runs 表，结果对比检测回归后通过 NotificationService 通知。

**Tech Stack:** cron-parser, better-sqlite3, Fastify, Zod

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| Create | `apps/server/src/schemas/schedule.ts` | Zod 验证 |
| Create | `apps/server/src/services/scheduleService.ts` | 调度核心 |
| Create | `apps/server/src/services/notificationService.ts` | 通知服务 |
| Create | `apps/server/src/routes/schedules.ts` | CRUD + 执行路由 |
| Create | `apps/server/src/__tests__/schedule.test.ts` | 路由测试 |
| Create | `apps/server/src/__tests__/notification.test.ts` | 通知测试 |
| Modify | `apps/server/src/db/migrations.ts` | 新增表 |
| Modify | `apps/server/src/routes/index.ts` | 注册路由 |
| Modify | `apps/server/src/server.ts` | 启动/停止服务 |
| Modify | `package.json` | 添加 cron-parser |

---

### Task 1: 安装依赖 + 数据库迁移

**Files:**
- Modify: `package.json` (root)
- Modify: `apps/server/src/db/migrations.ts`

- [ ] **Step 1: 安装 cron-parser**

Run: `pnpm add cron-parser -w`

- [ ] **Step 2: 在 migrations.ts 添加 schedules 表**

在 schemaSql 数组末尾添加：

```typescript
`CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  template_id TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  next_run_at TEXT,
  run_count INTEGER NOT NULL DEFAULT 0,
  last_status TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`,
`CREATE INDEX IF NOT EXISTS idx_schedules_enabled ON schedules(enabled)`,
`CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON schedules(next_run_at)`,
`CREATE TABLE IF NOT EXISTS schedule_runs (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL,
  task_id TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  summary TEXT,
  error TEXT,
  FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
)`,
`CREATE INDEX IF NOT EXISTS idx_schedule_runs_schedule ON schedule_runs(schedule_id)`,
```

- [ ] **Step 3: 运行测试验证迁移**

Run: `pnpm test -- apps/server/src/__tests__/migration.test.ts`
Expected: 迁移测试通过

- [ ] **Step 4: Commit**

```bash
git add package.json apps/server/src/db/migrations.ts
git commit -m "feat: add schedules and schedule_runs tables"
```

---

### Task 2: Zod Schema + 路由

**Files:**
- Create: `apps/server/src/schemas/schedule.ts`
- Create: `apps/server/src/routes/schedules.ts`
- Modify: `apps/server/src/routes/index.ts`

- [ ] **Step 1: 创建 schedule.ts schema**

```typescript
import { z } from 'zod';

export const CreateScheduleSchema = z.object({
  name: z.string().min(1).max(200),
  templateId: z.string().min(1),
  cronExpression: z.string().min(1),
  enabled: z.boolean().default(true),
});

export const UpdateScheduleSchema = CreateScheduleSchema.partial();

export const ScheduleFiltersSchema = z.object({
  enabled: z.coerce.boolean().optional(),
});
```

- [ ] **Step 2: 创建 schedules.ts 路由**

```typescript
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { CreateScheduleSchema, UpdateScheduleSchema, ScheduleFiltersSchema } from '../schemas/schedule';
import { parseExpression } from 'cron-parser';

export async function scheduleRoutes(server: FastifyInstance): Promise<void> {
  // GET /schedules
  server.get('/schedules', async (request) => {
    const filters = ScheduleFiltersSchema.parse(request.query);
    let sql = 'SELECT * FROM schedules';
    const params: unknown[] = [];
    if (filters.enabled !== undefined) {
      sql += ' WHERE enabled = ?';
      params.push(filters.enabled ? 1 : 0);
    }
    sql += ' ORDER BY created_at DESC';
    return { data: server.db.prepare(sql).all(...params) };
  });

  // GET /schedules/:id
  server.get('/schedules/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const schedule = server.db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
    if (!schedule) return reply.status(404).send({ error: 'Schedule not found' });
    return schedule;
  });

  // POST /schedules
  server.post('/schedules', async (request, reply) => {
    const body = CreateScheduleSchema.parse(request.body);
    // 验证 cron 表达式
    try {
      parseExpression(body.cronExpression);
    } catch {
      return reply.status(400).send({ error: 'Invalid cron expression' });
    }
    // 验证 template 存在
    const template = server.db.prepare('SELECT id FROM templates WHERE id = ?').get(body.templateId);
    if (!template) return reply.status(400).send({ error: 'Template not found' });

    const id = randomUUID();
    const nextRun = parseExpression(body.cronExpression).next().toISOString();
    server.db.prepare(
      'INSERT INTO schedules (id, name, template_id, cron_expression, enabled, next_run_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, body.name, body.templateId, body.cronExpression, body.enabled ? 1 : 0, nextRun);
    const schedule = server.db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
    return reply.status(201).send(schedule);
  });

  // PUT /schedules/:id
  server.put('/schedules/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = UpdateScheduleSchema.parse(request.body);
    const existing = server.db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
    if (!existing) return reply.status(404).send({ error: 'Schedule not found' });

    const sets: string[] = [];
    const params: unknown[] = [];
    if (body.name !== undefined) { sets.push('name = ?'); params.push(body.name); }
    if (body.templateId !== undefined) { sets.push('template_id = ?'); params.push(body.templateId); }
    if (body.cronExpression !== undefined) {
      try { parseExpression(body.cronExpression); } catch { return reply.status(400).send({ error: 'Invalid cron expression' }); }
      sets.push('cron_expression = ?'); params.push(body.cronExpression);
      sets.push('next_run_at = ?'); params.push(parseExpression(body.cronExpression).next().toISOString());
    }
    if (body.enabled !== undefined) { sets.push('enabled = ?'); params.push(body.enabled ? 1 : 0); }
    sets.push("updated_at = datetime('now')");
    params.push(id);

    server.db.prepare(`UPDATE schedules SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    return server.db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
  });

  // DELETE /schedules/:id
  server.delete('/schedules/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = server.db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
    if (result.changes === 0) return reply.status(404).send({ error: 'Schedule not found' });
    return { deleted: true };
  });

  // POST /schedules/:id/run — 立即执行
  server.post('/schedules/:id/run', async (request, reply) => {
    const { id } = request.params as { id: string };
    const schedule = server.db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) as any;
    if (!schedule) return reply.status(404).send({ error: 'Schedule not found' });

    const runId = randomUUID();
    server.db.prepare(
      "INSERT INTO schedule_runs (id, schedule_id, status) VALUES (?, ?, 'running')"
    ).run(runId, id);

    // 异步执行（不阻塞响应）
    setImmediate(async () => {
      try {
        const template = server.db.prepare('SELECT * FROM templates WHERE id = ?').get(schedule.template_id) as any;
        // 创建 task（简化版，实际复用 taskQueue）
        const taskId = randomUUID();
        server.db.prepare(
          "INSERT INTO tasks (id, name, goal, status, created_at, updated_at) VALUES (?, ?, 'pending', datetime('now'), datetime('now'))"
        ).run(taskId, `Scheduled: ${schedule.name}`);

        server.db.prepare(
          "UPDATE schedule_runs SET task_id = ?, status = 'success', completed_at = datetime('now') WHERE id = ?"
        ).run(taskId, runId);
        server.db.prepare(
          "UPDATE schedules SET last_run_at = datetime('now'), run_count = run_count + 1, last_status = 'success' WHERE id = ?"
        ).run(id);
      } catch (err) {
        server.db.prepare(
          "UPDATE schedule_runs SET status = 'failed', error = ?, completed_at = datetime('now') WHERE id = ?"
        ).run(String(err), runId);
        server.db.prepare(
          "UPDATE schedules SET last_run_at = datetime('now'), run_count = run_count + 1, last_status = 'failed' WHERE id = ?"
        ).run(id);
      }
    });

    return reply.status(202).send({ runId, status: 'running' });
  });

  // GET /schedules/:id/history
  server.get('/schedules/:id/history', async (request, reply) => {
    const { id } = request.params as { id: string };
    const schedule = server.db.prepare('SELECT id FROM schedules WHERE id = ?').get(id);
    if (!schedule) return reply.status(404).send({ error: 'Schedule not found' });
    const runs = server.db.prepare(
      'SELECT * FROM schedule_runs WHERE schedule_id = ? ORDER BY started_at DESC LIMIT 50'
    ).all(id);
    return { data: runs, total: runs.length };
  });
}
```

- [ ] **Step 3: 注册路由**

在 `apps/server/src/routes/index.ts` 添加：

```typescript
import { scheduleRoutes } from './schedules';
// 在 register 调用中添加:
server.register(scheduleRoutes, { prefix: '/api' });
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/schemas/schedule.ts apps/server/src/routes/schedules.ts apps/server/src/routes/index.ts
git commit -m "feat: schedule CRUD routes with cron validation"
```

---

### Task 3: 路由测试

**Files:**
- Create: `apps/server/src/__tests__/schedule.test.ts`

- [ ] **Step 1: 创建 schedule.test.ts**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildServer } from '../server';
import type Database from 'better-sqlite3';

let server: Awaited<ReturnType<typeof buildServer>>['server'];
let db: Database.Database;

beforeAll(async () => {
  const built = await buildServer({ databasePath: ':memory:' });
  server = built.server;
  db = built.db;
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  db.prepare('DELETE FROM schedule_runs').run();
  db.prepare('DELETE FROM schedules').run();
  db.prepare('DELETE FROM templates').run();
});

describe('Schedule Routes', () => {
  it('GET /api/schedules returns empty list', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/schedules' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
  });

  it('POST /api/schedules creates a schedule', async () => {
    // 先创建 template
    db.prepare("INSERT INTO templates (id, name, goal, created_at, updated_at) VALUES ('tmpl-1', 'Test', 'test', datetime('now'), datetime('now'))").run();
    const res = await server.inject({
      method: 'POST',
      url: '/api/schedules',
      payload: { name: 'Daily test', templateId: 'tmpl-1', cronExpression: '0 9 * * *' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().name).toBe('Daily test');
    expect(res.json().cron_expression).toBe('0 9 * * *');
    expect(res.json().next_run_at).toBeTruthy();
  });

  it('POST /api/schedules rejects invalid cron', async () => {
    db.prepare("INSERT INTO templates (id, name, goal, created_at, updated_at) VALUES ('tmpl-1', 'Test', 'test', datetime('now'), datetime('now'))").run();
    const res = await server.inject({
      method: 'POST',
      url: '/api/schedules',
      payload: { name: 'Bad cron', templateId: 'tmpl-1', cronExpression: 'not-a-cron' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Invalid cron');
  });

  it('POST /api/schedules rejects missing template', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/schedules',
      payload: { name: 'No template', templateId: 'nonexistent', cronExpression: '0 9 * * *' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Template not found');
  });

  it('PUT /api/schedules/:id updates schedule', async () => {
    db.prepare("INSERT INTO templates (id, name, goal, created_at, updated_at) VALUES ('tmpl-1', 'Test', 'test', datetime('now'), datetime('now'))").run();
    const create = await server.inject({
      method: 'POST',
      url: '/api/schedules',
      payload: { name: 'Original', templateId: 'tmpl-1', cronExpression: '0 9 * * *' },
    });
    const id = create.json().id;
    const res = await server.inject({
      method: 'PUT',
      url: `/api/schedules/${id}`,
      payload: { name: 'Updated' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Updated');
  });

  it('DELETE /api/schedules/:id deletes schedule', async () => {
    db.prepare("INSERT INTO templates (id, name, goal, created_at, updated_at) VALUES ('tmpl-1', 'Test', 'test', datetime('now'), datetime('now'))").run();
    const create = await server.inject({
      method: 'POST',
      url: '/api/schedules',
      payload: { name: 'To delete', templateId: 'tmpl-1', cronExpression: '0 9 * * *' },
    });
    const id = create.json().id;
    const res = await server.inject({ method: 'DELETE', url: `/api/schedules/${id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().deleted).toBe(true);
  });

  it('GET /api/schedules/:id/history returns runs', async () => {
    db.prepare("INSERT INTO templates (id, name, goal, created_at, updated_at) VALUES ('tmpl-1', 'Test', 'test', datetime('now'), datetime('now'))").run();
    const create = await server.inject({
      method: 'POST',
      url: '/api/schedules',
      payload: { name: 'With history', templateId: 'tmpl-1', cronExpression: '0 9 * * *' },
    });
    const id = create.json().id;
    // 手动插入一条 run
    db.prepare("INSERT INTO schedule_runs (id, schedule_id, status) VALUES ('run-1', ?, 'success')").run(id);
    const res = await server.inject({ method: 'GET', url: `/api/schedules/${id}/history` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });

  it('POST /api/schedules/:id/run triggers execution', async () => {
    db.prepare("INSERT INTO templates (id, name, goal, created_at, updated_at) VALUES ('tmpl-1', 'Test', 'test', datetime('now'), datetime('now'))").run();
    const create = await server.inject({
      method: 'POST',
      url: '/api/schedules',
      payload: { name: 'Run now', templateId: 'tmpl-1', cronExpression: '0 9 * * *' },
    });
    const id = create.json().id;
    const res = await server.inject({ method: 'POST', url: `/api/schedules/${id}/run` });
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe('running');
  });

  it('GET /api/schedules filters by enabled', async () => {
    db.prepare("INSERT INTO templates (id, name, goal, created_at, updated_at) VALUES ('tmpl-1', 'Test', 'test', datetime('now'), datetime('now'))").run();
    await server.inject({ method: 'POST', url: '/api/schedules', payload: { name: 'Enabled', templateId: 'tmpl-1', cronExpression: '0 9 * * *', enabled: true } });
    await server.inject({ method: 'POST', url: '/api/schedules', payload: { name: 'Disabled', templateId: 'tmpl-1', cronExpression: '0 9 * * *', enabled: false } });
    const res = await server.inject({ method: 'GET', url: '/api/schedules?enabled=true' });
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].name).toBe('Enabled');
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `pnpm test -- apps/server/src/__tests__/schedule.test.ts`
Expected: 9 tests pass

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/__tests__/schedule.test.ts
git commit -m "test: schedule CRUD route tests"
```

---

### Task 4: ScheduleService 核心

**Files:**
- Create: `apps/server/src/services/scheduleService.ts`

- [ ] **Step 1: 创建 scheduleService.ts**

```typescript
import type Database from 'better-sqlite3';
import { parseExpression } from 'cron-parser';

interface ScheduleRow {
  id: string;
  name: string;
  template_id: string;
  cron_expression: string;
  enabled: number;
  next_run_at: string | null;
}

export class ScheduleService {
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(private db: Database.Database) {}

  start(): void {
    const schedules = this.db.prepare(
      'SELECT * FROM schedules WHERE enabled = 1'
    ).all() as ScheduleRow[];
    for (const schedule of schedules) {
      this.scheduleNext(schedule);
    }
  }

  private scheduleNext(schedule: ScheduleRow): void {
    try {
      const nextRun = parseExpression(schedule.cron_expression).next();
      const delay = Math.max(0, nextRun.getTime() - Date.now());
      const timer = setTimeout(() => this.execute(schedule), delay);
      this.timers.set(schedule.id, timer);
      this.db.prepare(
        'UPDATE schedules SET next_run_at = ? WHERE id = ?'
      ).run(nextRun.toISOString(), schedule.id);
    } catch {
      // Invalid cron, skip
    }
  }

  private async execute(schedule: ScheduleRow): Promise<void> {
    const { randomUUID } = await import('node:crypto');
    const runId = randomUUID();
    this.db.prepare(
      "INSERT INTO schedule_runs (id, schedule_id, status) VALUES (?, ?, 'running')"
    ).run(runId, schedule.id);

    try {
      // 创建 task
      const taskId = randomUUID();
      this.db.prepare(
        "INSERT INTO tasks (id, name, goal, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', datetime('now'), datetime('now'))"
      ).run(taskId, `Scheduled: ${schedule.name}`, `Auto-run from schedule ${schedule.id}`);

      this.db.prepare(
        "UPDATE schedule_runs SET task_id = ?, status = 'success', completed_at = datetime('now') WHERE id = ?"
      ).run(taskId, runId);
      this.db.prepare(
        "UPDATE schedules SET last_run_at = datetime('now'), run_count = run_count + 1, last_status = 'success' WHERE id = ?"
      ).run(schedule.id);
    } catch (err) {
      this.db.prepare(
        "UPDATE schedule_runs SET status = 'failed', error = ?, completed_at = datetime('now') WHERE id = ?"
      ).run(String(err), runId);
      this.db.prepare(
        "UPDATE schedules SET last_run_at = datetime('now'), run_count = run_count + 1, last_status = 'failed' WHERE id = ?"
      ).run(schedule.id);
    }

    // 安排下一次
    const updated = this.db.prepare('SELECT * FROM schedules WHERE id = ?').get(schedule.id) as ScheduleRow;
    if (updated && updated.enabled) {
      this.scheduleNext(updated);
    }
  }

  stop(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/services/scheduleService.ts
git commit -m "feat: ScheduleService with cron execution"
```

---

### Task 5: 通知服务

**Files:**
- Create: `apps/server/src/services/notificationService.ts`
- Create: `apps/server/src/__tests__/notification.test.ts`

- [ ] **Step 1: 创建 notificationService.ts**

```typescript
export interface NotificationPayload {
  event: 'schedule.completed' | 'schedule.failed' | 'regression.detected';
  schedule: { id: string; name: string };
  run: { id: string; status: string; summary?: Record<string, unknown> };
  regressions?: string[];
  timestamp: string;
}

export class NotificationService {
  private webhookUrl: string | undefined;

  constructor() {
    this.webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL;
  }

  async send(payload: NotificationPayload): Promise<void> {
    await Promise.all([
      this.sendWebhook(payload),
      this.broadcastSSE(payload),
    ]);
  }

  private async sendWebhook(payload: NotificationPayload): Promise<void> {
    if (!this.webhookUrl) return;
    try {
      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      // Webhook 失败不影响主流程
    }
  }

  private async broadcastSSE(payload: NotificationPayload): Promise<void> {
    // 通过 SSE 广播（集成到 stream.ts）
    // 实际实现时通过 EventEmitter 广播
    if (typeof this.sseBroadcast === 'function') {
      this.sseBroadcast('schedule-event', payload);
    }
  }

  private sseBroadcast?: (event: string, data: unknown) => void;

  setSSEBroadcast(fn: (event: string, data: unknown) => void): void {
    this.sseBroadcast = fn;
  }
}
```

- [ ] **Step 2: 创建 notification.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationService } from '../services/notificationService';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    service = new NotificationService();
  });

  it('sends webhook when URL configured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
    (service as any).webhookUrl = 'https://hooks.example.com/test';
    await service.send({
      event: 'schedule.completed',
      schedule: { id: 's1', name: 'Test' },
      run: { id: 'r1', status: 'success' },
      timestamp: new Date().toISOString(),
    });
    expect(fetchSpy).toHaveBeenCalledWith('https://hooks.example.com/test', expect.objectContaining({ method: 'POST' }));
    fetchSpy.mockRestore();
  });

  it('skips webhook when URL not configured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await service.send({
      event: 'schedule.completed',
      schedule: { id: 's1', name: 'Test' },
      run: { id: 'r1', status: 'success' },
      timestamp: new Date().toISOString(),
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('broadcasts SSE event', async () => {
    const broadcast = vi.fn();
    service.setSSEBroadcast(broadcast);
    await service.send({
      event: 'regression.detected',
      schedule: { id: 's1', name: 'Test' },
      run: { id: 'r1', status: 'failed' },
      regressions: ['Pass rate dropped'],
      timestamp: new Date().toISOString(),
    });
    expect(broadcast).toHaveBeenCalledWith('schedule-event', expect.objectContaining({
      event: 'regression.detected',
    }));
  });
});
```

- [ ] **Step 3: 运行测试**

Run: `pnpm test -- apps/server/src/__tests__/notification.test.ts`
Expected: 3 tests pass

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/services/notificationService.ts apps/server/src/__tests__/notification.test.ts
git commit -m "feat: NotificationService with webhook + SSE"
```

---

### Task 6: 服务集成

**Files:**
- Modify: `apps/server/src/server.ts`

- [ ] **Step 1: 在 server.ts 集成 ScheduleService**

在 server 启动后添加：

```typescript
import { ScheduleService } from './services/scheduleService';

// 在 buildServer() 函数内，server.ready() 之后：
const scheduleService = new ScheduleService(db);
scheduleService.start();

// graceful shutdown
server.addHook('onClose', async () => {
  scheduleService.stop();
});
```

- [ ] **Step 2: 运行全量测试**

Run: `pnpm test`
Expected: 所有测试通过

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/server.ts
git commit -m "feat: integrate ScheduleService in server startup"
```
