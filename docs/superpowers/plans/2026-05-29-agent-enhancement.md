# Agent Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 5 个 electron-helper 操作、并行 audit-chain、断点续传机制。

**Architecture:** operation-handler 新增 CDP 操作，audit-chain 改为 Promise.all 并行，checkpointManager 实现 SQLite 持久化的断点续传。

**Tech Stack:** CDP (Chrome DevTools Protocol), better-sqlite3, Promise.all

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| Modify | `packages/electron-helper/src/operation-handler.ts` | 新增 5 个操作 |
| Modify | `packages/agent-core/src/sub-agents/audit-chain.ts` | 并行化 |
| Create | `packages/agent-core/src/session/checkpointManager.ts` | 断点管理 |
| Create | `packages/agent-core/src/__tests__/checkpoint.test.ts` | 断点测试 |
| Create | `packages/electron-helper/src/__tests__/new-operations.test.ts` | 新操作测试 |
| Modify | `packages/agent-core/src/runtime/agentLoop.ts` | resume 方法 |
| Modify | `packages/agent-core/src/runner.ts` | checkpoint 集成 |
| Modify | `apps/server/src/db/migrations.ts` | agent_checkpoints 表 |

---

### Task 1: 新增 electron-helper 操作

**Files:**
- Modify: `packages/electron-helper/src/operation-handler.ts`
- Create: `packages/electron-helper/src/__tests__/new-operations.test.ts`

- [ ] **Step 1: 在 operation-handler.ts 的 switch 中添加新 case**

```typescript
case 'take_screenshot': {
  const screenshot = await cdpSession.send('Page.captureScreenshot', {
    format: 'png',
    quality: 80,
  });
  return { screenshot: screenshot.data };
}

case 'get_console_logs': {
  const logs: any[] = [];
  cdpSession.on('Runtime.consoleAPICalled', (params: any) => {
    logs.push({
      type: params.type,
      args: params.args.map((a: any) => a.value ?? a.description),
      timestamp: params.timestamp,
    });
  });
  await cdpSession.send('Runtime.enable');
  return { logs };
}

case 'evaluate_in_page': {
  const { expression } = params as { expression: string };
  const result = await cdpSession.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
  });
  return { result: result.result.value, exceptionDetails: result.exceptionDetails };
}

case 'get_network_requests': {
  const requests: any[] = [];
  cdpSession.on('Network.requestWillBeSent', (params: any) => {
    requests.push({
      url: params.request.url,
      method: params.request.method,
      type: params.type,
      timestamp: params.timestamp,
    });
  });
  await cdpSession.send('Network.enable');
  return { requests };
}

case 'set_window_bounds': {
  const { bounds } = params as { bounds: { x: number; y: number; width: number; height: number } };
  const { windowId } = await cdpSession.send('Browser.getWindowForTarget');
  await cdpSession.send('Browser.setWindowBounds', { windowId, bounds });
  return { windowId, bounds };
}
```

- [ ] **Step 2: 创建 new-operations.test.ts**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { handleOperation } from '../operation-handler';

function createMockCDPSession() {
  const handlers = new Map<string, Function>();
  return {
    send: vi.fn().mockResolvedValue({ data: 'base64png', result: { value: 42 }, windowId: 1 }),
    on: vi.fn((event: string, handler: Function) => { handlers.set(event, handler); }),
    handlers,
  };
}

describe('New operations', () => {
  it('take_screenshot returns base64', async () => {
    const cdp = createMockCDPSession();
    const result = await handleOperation(cdp as any, 'take_screenshot', {});
    expect(result.screenshot).toBe('base64png');
    expect(cdp.send).toHaveBeenCalledWith('Page.captureScreenshot', expect.any(Object));
  });

  it('evaluate_in_page returns result', async () => {
    const cdp = createMockCDPSession();
    const result = await handleOperation(cdp as any, 'evaluate_in_page', { expression: '1+1' });
    expect(result.result).toBe(42);
    expect(cdp.send).toHaveBeenCalledWith('Runtime.evaluate', expect.objectContaining({ expression: '1+1' }));
  });

  it('set_window_bounds sends bounds', async () => {
    const cdp = createMockCDPSession();
    const bounds = { x: 0, y: 0, width: 1024, height: 768 };
    const result = await handleOperation(cdp as any, 'set_window_bounds', { bounds });
    expect(result.windowId).toBe(1);
    expect(cdp.send).toHaveBeenCalledWith('Browser.setWindowBounds', expect.objectContaining({ bounds }));
  });

  it('get_console_logs enables Runtime', async () => {
    const cdp = createMockCDPSession();
    const result = await handleOperation(cdp as any, 'get_console_logs', {});
    expect(Array.isArray(result.logs)).toBe(true);
    expect(cdp.send).toHaveBeenCalledWith('Runtime.enable');
  });

  it('get_network_requests enables Network', async () => {
    const cdp = createMockCDPSession();
    const result = await handleOperation(cdp as any, 'get_network_requests', {});
    expect(Array.isArray(result.requests)).toBe(true);
    expect(cdp.send).toHaveBeenCalledWith('Network.enable');
  });
});
```

- [ ] **Step 3: 运行测试**

Run: `pnpm test -- packages/electron-helper/src/__tests__/new-operations.test.ts`
Expected: 5 tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/electron-helper/src/operation-handler.ts packages/electron-helper/src/__tests__/new-operations.test.ts
git commit -m "feat: 5 new electron-helper operations (screenshot, console, eval, network, window)"
```

---

### Task 2: 并行 audit-chain

**Files:**
- Modify: `packages/agent-core/src/sub-agents/audit-chain.ts`

- [ ] **Step 1: 改造 runAuditChain 为并行执行**

```typescript
export async function runAuditChain(context: AuditContext): Promise<AuditReport> {
  // Wave 1: 三个分析角色并行执行
  const [planResult, analysisResult, securityResult] = await Promise.allSettled([
    runSubAgent('test-planner', context),
    runSubAgent('execution-analyst', context),
    runSubAgent('security-reviewer', context),
  ]);

  // 提取结果，失败的角色标记错误
  const extractResult = (r: PromiseSettledResult<any>) =>
    r.status === 'fulfilled' ? r.value : { error: r.reason?.message || 'Agent failed' };

  // Wave 2: 汇总
  const report = await runSubAgent('report-synthesizer', {
    ...context,
    planResult: extractResult(planResult),
    analysisResult: extractResult(analysisResult),
    securityResult: extractResult(securityResult),
  });

  return report;
}
```

- [ ] **Step 2: 运行现有测试**

Run: `pnpm test -- packages/agent-core/src/sub-agents/__tests__/`
Expected: 现有 audit-chain 测试通过

- [ ] **Step 3: Commit**

```bash
git add packages/agent-core/src/sub-agents/audit-chain.ts
git commit -m "perf: parallelize audit-chain sub-agents"
```

---

### Task 3: CheckpointManager

**Files:**
- Create: `packages/agent-core/src/session/checkpointManager.ts`
- Create: `packages/agent-core/src/__tests__/checkpoint.test.ts`
- Modify: `apps/server/src/db/migrations.ts`

- [ ] **Step 1: 在 migrations.ts 添加 agent_checkpoints 表**

```typescript
`CREATE TABLE IF NOT EXISTS agent_checkpoints (
  session_id TEXT PRIMARY KEY,
  checkpoint TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`,
```

- [ ] **Step 2: 创建 checkpointManager.ts**

```typescript
import type Database from 'better-sqlite3';

export interface AgentCheckpoint {
  sessionId: string;
  currentStep: number;
  maxSteps: number;
  taskPrompt: string;
  config: Record<string, unknown>;
  lastObservation: unknown;
  lastPlan: unknown;
  lastExecutionResult: unknown;
  sessionEntries: unknown[];
  timestamp: string;
}

export class CheckpointManager {
  constructor(private db: Database.Database) {}

  save(checkpoint: AgentCheckpoint): void {
    const existing = this.db.prepare(
      'SELECT session_id FROM agent_checkpoints WHERE session_id = ?'
    ).get(checkpoint.sessionId);

    if (existing) {
      this.db.prepare(
        "UPDATE agent_checkpoints SET checkpoint = ?, updated_at = datetime('now') WHERE session_id = ?"
      ).run(JSON.stringify(checkpoint), checkpoint.sessionId);
    } else {
      this.db.prepare(
        'INSERT INTO agent_checkpoints (session_id, checkpoint) VALUES (?, ?)'
      ).run(checkpoint.sessionId, JSON.stringify(checkpoint));
    }
  }

  get(sessionId: string): AgentCheckpoint | null {
    const row = this.db.prepare(
      'SELECT checkpoint FROM agent_checkpoints WHERE session_id = ?'
    ).get(sessionId) as { checkpoint: string } | undefined;
    return row ? JSON.parse(row.checkpoint) : null;
  }

  delete(sessionId: string): void {
    this.db.prepare('DELETE FROM agent_checkpoints WHERE session_id = ?').run(sessionId);
  }

  list(): AgentCheckpoint[] {
    const rows = this.db.prepare('SELECT checkpoint FROM agent_checkpoints').all() as { checkpoint: string }[];
    return rows.map(r => JSON.parse(r.checkpoint));
  }
}
```

- [ ] **Step 3: 创建 checkpoint.test.ts**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { CheckpointManager, type AgentCheckpoint } from '../session/checkpointManager';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE IF NOT EXISTS agent_checkpoints (
    session_id TEXT PRIMARY KEY,
    checkpoint TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  return db;
}

function makeCheckpoint(overrides?: Partial<AgentCheckpoint>): AgentCheckpoint {
  return {
    sessionId: 'test-session-1',
    currentStep: 3,
    maxSteps: 10,
    taskPrompt: 'test task',
    config: {},
    lastObservation: { type: 'observation' },
    lastPlan: { type: 'plan', steps: [] },
    lastExecutionResult: { success: true },
    sessionEntries: [],
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('CheckpointManager', () => {
  let db: Database.Database;
  let manager: CheckpointManager;

  beforeEach(() => {
    db = createTestDb();
    manager = new CheckpointManager(db);
  });

  it('saves and retrieves checkpoint', () => {
    const cp = makeCheckpoint();
    manager.save(cp);
    const retrieved = manager.get('test-session-1');
    expect(retrieved).toBeTruthy();
    expect(retrieved!.sessionId).toBe('test-session-1');
    expect(retrieved!.currentStep).toBe(3);
  });

  it('updates existing checkpoint', () => {
    manager.save(makeCheckpoint({ currentStep: 3 }));
    manager.save(makeCheckpoint({ currentStep: 5 }));
    const retrieved = manager.get('test-session-1');
    expect(retrieved!.currentStep).toBe(5);
  });

  it('returns null for missing checkpoint', () => {
    expect(manager.get('nonexistent')).toBeNull();
  });

  it('deletes checkpoint', () => {
    manager.save(makeCheckpoint());
    manager.delete('test-session-1');
    expect(manager.get('test-session-1')).toBeNull();
  });

  it('lists all checkpoints', () => {
    manager.save(makeCheckpoint({ sessionId: 's1' }));
    manager.save(makeCheckpoint({ sessionId: 's2' }));
    expect(manager.list()).toHaveLength(2);
  });
});
```

- [ ] **Step 4: 运行测试**

Run: `pnpm test -- packages/agent-core/src/__tests__/checkpoint.test.ts`
Expected: 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/agent-core/src/session/checkpointManager.ts packages/agent-core/src/__tests__/checkpoint.test.ts apps/server/src/db/migrations.ts
git commit -m "feat: CheckpointManager for agent resume"
```

---

### Task 4: AgentLoop resume 集成

**Files:**
- Modify: `packages/agent-core/src/runtime/agentLoop.ts`
- Modify: `packages/agent-core/src/runner.ts`

- [ ] **Step 1: 在 agentLoop.ts 添加 resume 方法**

```typescript
import type { AgentCheckpoint } from '../session/checkpointManager';

class AgentLoop {
  // ... existing code ...

  async resume(checkpoint: AgentCheckpoint): Promise<AgentRunResult> {
    // 恢复 session entries
    for (const entry of checkpoint.sessionEntries) {
      await this.sessionManager.addEntry(entry as any);
    }
    // 从 checkpoint 的 step+1 继续
    this.currentStep = checkpoint.currentStep + 1;
    return this.run(checkpoint.taskPrompt, checkpoint.config as any);
  }
}
```

- [ ] **Step 2: 在 runner.ts 集成 checkpoint 检查**

```typescript
import { CheckpointManager } from '../session/checkpointManager';

async function runTest(params: RunTestParams): Promise<RunTestResult> {
  const checkpointManager = new CheckpointManager(db);

  // 检查是否有未完成的 checkpoint
  const checkpoint = checkpointManager.get(params.sessionId);
  if (checkpoint) {
    const result = await agentLoop.resume(checkpoint);
    checkpointManager.delete(params.sessionId);
    return buildRunTestResult(result);
  }

  // 正常运行
  const result = await agentLoop.run(params.taskPrompt, params.config);
  checkpointManager.delete(params.sessionId);
  return buildRunTestResult(result);
}
```

- [ ] **Step 3: 运行全量测试**

Run: `pnpm test`
Expected: 所有测试通过

- [ ] **Step 4: Commit**

```bash
git add packages/agent-core/src/runtime/agentLoop.ts packages/agent-core/src/runner.ts
git commit -m "feat: agent checkpoint resume in runner"
```

---

### Task 5: 全量验证

- [ ] **Step 1: 运行全量测试**

Run: `pnpm test`
Expected: 所有测试通过

- [ ] **Step 2: 构建验证**

Run: `pnpm build`
Expected: 构建通过

- [ ] **Step 3: ESLint 检查**

Run: `npx eslint packages/agent-core/src apps/server/src --quiet`
Expected: 0 errors
