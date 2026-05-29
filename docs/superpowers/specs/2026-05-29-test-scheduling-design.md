# Test Scheduling System Design

**Version:** 1.0
**Date:** 2026-05-29
**Status:** Pending Approval

---

## Overview

实现测试调度系统，支持 Cron 表达式定时运行测试模板，结果对比历史数据，异常时发送通知。

---

## 架构

```
apps/server/src/
├── services/
│   └── scheduleService.ts      # 调度核心：Cron 管理、任务触发
├── routes/
│   └── schedules.ts            # CRUD API
├── schemas/
│   └── schedule.ts             # Zod 验证
└── __tests__/
    └── schedule.test.ts        # 路由测试

apps/server/src/db/migrations.ts  # 新增 schedules 表
```

---

## 数据库

```sql
CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  template_id TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  next_run_at TEXT,
  run_count INTEGER NOT NULL DEFAULT 0,
  last_status TEXT,           -- 'success' | 'failed' | 'timeout'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_schedules_enabled ON schedules(enabled);
CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON schedules(next_run_at);
```

**外键：** `template_id` 引用 `templates(id)`，CASCADE 删除。

---

## API 路由

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/schedules` | 列表（支持 enabled 过滤） |
| GET | `/api/schedules/:id` | 详情 |
| POST | `/api/schedules` | 创建 |
| PUT | `/api/schedules/:id` | 更新 |
| DELETE | `/api/schedules/:id` | 删除 |
| POST | `/api/schedules/:id/run` | 立即执行一次 |
| GET | `/api/schedules/:id/history` | 执行历史 |

### POST /api/schedules 请求体

```json
{
  "name": "Daily regression test",
  "templateId": "tmpl-1234",
  "cronExpression": "0 9 * * 1-5",
  "enabled": true
}
```

### GET /api/schedules/:history 响应

```json
{
  "data": [
    {
      "id": "run-uuid",
      "scheduleId": "sch-1234",
      "startedAt": "2026-05-29T09:00:00Z",
      "completedAt": "2026-05-29T09:05:00Z",
      "status": "success",
      "taskId": "task-uuid",
      "summary": { "passed": 10, "failed": 0, "skipped": 0 }
    }
  ],
  "total": 30
}
```

---

## 调度服务

**文件:** `apps/server/src/services/scheduleService.ts`

### 核心逻辑

```typescript
class ScheduleService {
  private timers: Map<string, NodeJS.Timeout> = new Map();

  constructor(private db: Database.Database) {}

  // 启动所有 enabled 的调度
  start(): void {
    const schedules = this.db.prepare(
      'SELECT * FROM schedules WHERE enabled = 1'
    ).all();
    for (const schedule of schedules) {
      this.scheduleNext(schedule);
    }
  }

  // 计算下次执行时间并设置定时器
  private scheduleNext(schedule: Schedule): void {
    const nextRun = cronParser.parseExpression(schedule.cronExpression).next();
    const delay = nextRun.getTime() - Date.now();
    const timer = setTimeout(() => this.execute(schedule), delay);
    this.timers.set(schedule.id, timer);
    // 更新 next_run_at
    this.db.prepare(
      'UPDATE schedules SET next_run_at = ? WHERE id = ?'
    ).run(nextRun.toISOString(), schedule.id);
  }

  // 执行调度任务
  private async execute(schedule: Schedule): Promise<void> {
    // 1. 读取 template
    // 2. 创建 task（复用 taskQueue.enqueue）
    // 3. 记录 run history
    // 4. 更新 last_run_at, run_count, last_status
    // 5. 检查是否需要通知
    // 6. scheduleNext() 安排下一次
  }

  // 停止所有调度
  stop(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
```

### Cron 库

使用 `cron-parser`（轻量，无依赖冲突），不引入 `node-cron`（需要额外的进程管理）。

---

## 执行历史

**表：** `schedule_runs`

```sql
CREATE TABLE IF NOT EXISTS schedule_runs (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL,
  task_id TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'running',  -- running | success | failed | timeout
  summary TEXT,                              -- JSON {passed, failed, skipped}
  error TEXT,
  FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_schedule_runs_schedule ON schedule_runs(schedule_id);
```

---

## 结果对比

每次执行完成后，与上一次执行结果对比：

```typescript
function compareResults(current: RunSummary, previous: RunSummary | null): {
  regressions: string[];
  improvements: string[];
} {
  if (!previous) return { regressions: [], improvements: [] };

  const regressions: string[] = [];
  const improvements: string[] = [];

  if (current.failed > previous.failed) {
    regressions.push(`失败数增加: ${previous.failed} → ${current.failed}`);
  }
  if (current.passed < previous.passed) {
    regressions.push(`通过数减少: ${previous.passed} → ${current.passed}`);
  }
  if (current.failed < previous.failed) {
    improvements.push(`失败数减少: ${previous.failed} → ${current.failed}`);
  }

  return { regressions, improvements };
}
```

---

## 通知系统

**文件:** `apps/server/src/services/notificationService.ts`

支持 3 种通知渠道：

| 渠道 | 配置 | 优先级 |
|------|------|--------|
| Webhook | `NOTIFICATION_WEBHOOK_URL` 环境变量 | P0 |
| Server-Sent Events | 实时推送到 Dashboard | P0 |
| Email | SMTP 配置（P2，后续实现） | P2 |

### Webhook 通知

```typescript
async function sendWebhook(url: string, payload: NotificationPayload): Promise<void> {
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'schedule.completed',
      schedule: { id, name },
      run: { status, summary, regressions },
      timestamp: new Date().toISOString(),
    }),
  });
}
```

### SSE 通知

复用现有 `apps/server/src/routes/stream.ts` 的 SSE 基础设施，新增 `schedule-event` 事件类型。

---

## 服务集成

在 `apps/server/src/server.ts` 中启动 ScheduleService：

```typescript
// server.ts
const scheduleService = new ScheduleService(db);
scheduleService.start();

// graceful shutdown
server.addHook('onClose', async () => {
  scheduleService.stop();
});
```

---

## 文件清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `apps/server/src/services/scheduleService.ts` | 调度核心服务 |
| `apps/server/src/services/notificationService.ts` | 通知服务 |
| `apps/server/src/routes/schedules.ts` | CRUD + 执行路由 |
| `apps/server/src/schemas/schedule.ts` | Zod 验证 |
| `apps/server/src/__tests__/schedule.test.ts` | 路由测试 |
| `apps/server/src/__tests__/notification.test.ts` | 通知测试 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `apps/server/src/db/migrations.ts` | 新增 schedules + schedule_runs 表 |
| `apps/server/src/routes/index.ts` | 注册 scheduleRoutes |
| `apps/server/src/server.ts` | 启动/停止 ScheduleService |
| `package.json` | 添加 `cron-parser` 依赖 |

---

## 验收标准

- [ ] schedules 表和 schedule_runs 表在启动时创建
- [ ] CRUD API 可创建、查询、更新、删除调度
- [ ] Cron 表达式正确计算下次执行时间
- [ ] `POST /api/schedules/:id/run` 立即执行一次
- [ ] 执行结果记录到 schedule_runs 表
- [ ] 结果对比检测回归和改进
- [ ] Webhook 通知在回归时触发
- [ ] SSE 事件实时推送到 Dashboard
- [ ] 所有测试通过

---

## 执行顺序

```
Wave 1 (并行):
  ├── Agent 1: DB 迁移 + schemas + routes + tests
  └── Agent 2: scheduleService + notificationService

Wave 2 (串行):
  ├── server.ts 集成
  └── 全量测试验证
```
