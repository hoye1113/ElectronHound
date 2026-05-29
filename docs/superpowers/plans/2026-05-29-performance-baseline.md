# Performance Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 vitest bench 微基准测试体系，覆盖 API/数据库/Agent/测试套件 4 层，CI 回归检测阈值 10%。

**Architecture:** 使用 vitest 内置的 bench() API 运行微基准测试，结果输出 JSON，与 baseline.json 对比检测回归。CI 中新增 benchmark 步骤。

**Tech Stack:** vitest bench, tinybench, Node.js, SQLite

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| Create | `benchmarks/api.bench.ts` | API 端点基准测试 |
| Create | `benchmarks/database.bench.ts` | 数据库查询基准测试 |
| Create | `benchmarks/agent.bench.ts` | Agent 执行基准测试 |
| Create | `benchmarks/suite.bench.ts` | 测试套件基准测试 |
| Create | `benchmarks/baseline.json` | 基线结果 |
| Create | `benchmarks/compare.ts` | 回归检测逻辑 |
| Create | `scripts/update-baseline.js` | 更新基线脚本 |
| Create | `scripts/check-benchmark.js` | CI 回归检查脚本 |
| Modify | `vitest.config.ts` | 添加 bench 配置 |
| Modify | `package.json` | 添加 bench 脚本 |
| Modify | `.github/workflows/ci.yml` | 添加 benchmark 步骤 |

---

### Task 1: vitest bench 配置

**Files:**
- Modify: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: 在 vitest.config.ts 添加 bench 配置**

```typescript
// vitest.config.ts — 在 export default defineConfig({}) 内添加
bench: {
  include: ['benchmarks/**/*.bench.ts'],
  reporters: ['default', 'json'],
  outputFile: 'benchmarks/current.json',
},
```

- [ ] **Step 2: 在 package.json 添加脚本**

```json
{
  "bench": "vitest bench --run",
  "bench:update": "node scripts/update-baseline.js",
  "bench:check": "node scripts/check-benchmark.js"
}
```

- [ ] **Step 3: 创建空 baseline.json**

```json
{
  "version": 1,
  "timestamp": "",
  "commit": "",
  "results": {}
}
```

- [ ] **Step 4: 验证配置**

Run: `pnpm bench --help`
Expected: vitest bench 帮助信息输出

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts package.json benchmarks/baseline.json
git commit -m "chore: add vitest bench configuration"
```

---

### Task 2: API 端点基准测试

**Files:**
- Create: `benchmarks/api.bench.ts`

- [ ] **Step 1: 创建 api.bench.ts**

```typescript
import { bench, describe, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../apps/server/src/server';
import type Database from 'better-sqlite3';

let server: Awaited<ReturnType<typeof buildServer>>['server'];
let db: Database.Database;

beforeAll(async () => {
  const built = await buildServer({ databasePath: ':memory:' });
  server = built.server;
  db = built.db;

  // 预填充测试数据
  const insertTask = db.prepare(
    'INSERT INTO tasks (id, name, goal, status, created_at, updated_at) VALUES (?, ?, ?, ?, datetime("now"), datetime("now"))'
  );
  for (let i = 0; i < 100; i++) {
    insertTask.run(`bench-task-${i}`, `Task ${i}`, 'benchmark test', i % 3 === 0 ? 'completed' : 'pending');
  }
});

afterAll(async () => {
  await server.close();
});

describe('API endpoints', () => {
  bench('GET /api/tasks', async () => {
    await server.inject({ method: 'GET', url: '/api/tasks' });
  });

  bench('GET /api/tasks?status=pending', async () => {
    await server.inject({ method: 'GET', url: '/api/tasks?status=pending' });
  });

  bench('POST /api/tasks', async () => {
    await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { name: 'bench-task', goal: 'benchmark test', appPath: '/test' },
    });
  });

  bench('GET /api/tasks/batches', async () => {
    await server.inject({ method: 'GET', url: '/api/tasks/batches' });
  });

  bench('GET /api/reports', async () => {
    await server.inject({ method: 'GET', url: '/api/reports' });
  });

  bench('GET /api/few-shot', async () => {
    await server.inject({ method: 'GET', url: '/api/few-shot' });
  });

  bench('GET /api/report-templates', async () => {
    await server.inject({ method: 'GET', url: '/api/report-templates' });
  });

  bench('GET /health', async () => {
    await server.inject({ method: 'GET', url: '/health' });
  });

  bench('GET /metrics', async () => {
    await server.inject({ method: 'GET', url: '/metrics' });
  });
});
```

- [ ] **Step 2: 运行验证**

Run: `pnpm bench -- benchmarks/api.bench.ts`
Expected: 所有 benchmark 通过，输出 ops/sec 数据

- [ ] **Step 3: Commit**

```bash
git add benchmarks/api.bench.ts
git commit -m "test: add API endpoint benchmarks"
```

---

### Task 3: 数据库查询基准测试

**Files:**
- Create: `benchmarks/database.bench.ts`

- [ ] **Step 1: 创建 database.bench.ts**

```typescript
import { bench, describe, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../apps/server/src/db/migrations';

let db: Database.Database;

beforeAll(() => {
  db = new Database(':memory:');
  runMigrations(db);

  // 预填充 1000 条 tasks
  const insertTask = db.prepare(
    'INSERT INTO tasks (id, name, goal, status, batch_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime("now"), datetime("now"))'
  );
  const insertStep = db.prepare(
    'INSERT INTO steps (task_id, step_index, phase, content, created_at) VALUES (?, ?, ?, ?, datetime("now"))'
  );

  const batchId = 'bench-batch-1';
  for (let i = 0; i < 1000; i++) {
    const taskId = `bench-task-${i}`;
    insertTask.run(taskId, `Task ${i}`, 'benchmark', i % 4 === 0 ? 'completed' : 'pending', i % 50 === 0 ? batchId : null);
    for (let j = 0; j < 3; j++) {
      insertStep.run(taskId, j, 'observe', JSON.stringify({ type: 'observation', data: `step ${j}` }));
    }
  }
});

afterAll(() => {
  db.close();
});

describe('Database queries', () => {
  bench('SELECT tasks WHERE status=?', () => {
    db.prepare('SELECT * FROM tasks WHERE status = ?').all('pending');
  });

  bench('SELECT tasks WHERE batch_id=?', () => {
    db.prepare('SELECT * FROM tasks WHERE batch_id = ?').all('bench-batch-1');
  });

  bench('SELECT tasks JOIN steps', () => {
    db.prepare('SELECT t.*, s.content FROM tasks t JOIN steps s ON t.id = s.task_id WHERE t.id = ?').all('bench-task-0');
  });

  bench('SELECT few_shot_examples WHERE goal LIKE ?', () => {
    db.prepare('SELECT * FROM few_shot_examples WHERE goal LIKE ?').all('%benchmark%');
  });

  bench('SELECT COUNT(*) GROUP BY status (batch progress)', () => {
    db.prepare('SELECT status, COUNT(*) as count FROM tasks WHERE batch_id = ? GROUP BY status').all('bench-batch-1');
  });

  bench('INSERT INTO tasks', () => {
    db.prepare(
      'INSERT INTO tasks (id, name, goal, status, created_at, updated_at) VALUES (?, ?, ?, ?, datetime("now"), datetime("now"))'
    ).run(`bench-insert-${Date.now()}`, 'Insert test', 'benchmark', 'pending');
  });

  bench('INSERT INTO steps', () => {
    db.prepare(
      'INSERT INTO steps (task_id, step_index, phase, content, created_at) VALUES (?, ?, ?, ?, datetime("now"))'
    ).run('bench-task-0', 99, 'observe', '{"type":"benchmark"}');
  });
});
```

- [ ] **Step 2: 运行验证**

Run: `pnpm bench -- benchmarks/database.bench.ts`
Expected: 所有 benchmark 通过

- [ ] **Step 3: Commit**

```bash
git add benchmarks/database.bench.ts
git commit -m "test: add database query benchmarks"
```

---

### Task 4: Agent 执行基准测试

**Files:**
- Create: `benchmarks/agent.bench.ts`

- [ ] **Step 1: 创建 agent.bench.ts**

```typescript
import { bench, describe } from 'vitest';
import { entriesToStepRecords, extractLastStep } from '../packages/agent-core/src/session/entryConverter';
import type { SessionEntry } from '../packages/agent-core/src/session/types';

// 生成模拟 SessionEntry[]
function generateEntries(count: number): SessionEntry[] {
  const entries: SessionEntry[] = [
    { role: 'user', type: 'user', content: 'test prompt', timestamp: new Date().toISOString() },
  ];
  for (let i = 0; i < count; i++) {
    entries.push(
      { role: 'assistant', type: 'assistant', content: JSON.stringify({ type: 'observation', screenshot: null, logs: [] }), timestamp: new Date().toISOString() },
      { role: 'assistant', type: 'assistant', content: JSON.stringify({ type: 'plan', steps: [{ action: 'test', target: 'page' }] }), timestamp: new Date().toISOString() },
      { role: 'system', type: 'system', content: JSON.stringify({ type: 'execution', success: true, output: 'ok' }), timestamp: new Date().toISOString() },
      { role: 'assistant', type: 'assistant', content: JSON.stringify({ type: 'verdict', verdict: 'pass', reason: 'test passed' }), timestamp: new Date().toISOString() },
    );
  }
  return entries;
}

const entries10 = generateEntries(10);
const entries50 = generateEntries(50);
const entries100 = generateEntries(100);

describe('Agent execution', () => {
  bench('entriesToStepRecords (10 steps)', () => {
    entriesToStepRecords(entries10);
  });

  bench('entriesToStepRecords (50 steps)', () => {
    entriesToStepRecords(entries50);
  });

  bench('entriesToStepRecords (100 steps)', () => {
    entriesToStepRecords(entries100);
  });

  bench('extractLastStep (10 steps)', () => {
    extractLastStep(entries10);
  });

  bench('extractLastStep (100 steps)', () => {
    extractLastStep(entries100);
  });
});
```

- [ ] **Step 2: 运行验证**

Run: `pnpm bench -- benchmarks/agent.bench.ts`
Expected: 所有 benchmark 通过

- [ ] **Step 3: Commit**

```bash
git add benchmarks/agent.bench.ts
git commit -m "test: add agent execution benchmarks"
```

---

### Task 5: 测试套件基准测试

**Files:**
- Create: `benchmarks/suite.bench.ts`

- [ ] **Step 1: 创建 suite.bench.ts**

```typescript
import { bench, describe } from 'vitest';
import { buildServer } from '../apps/server/src/server';

describe('Test infrastructure', () => {
  bench('buildServer (cold start)', async () => {
    const { server } = await buildServer({ databasePath: ':memory:' });
    await server.close();
  });

  bench('server.inject (single call)', async () => {
    const { server } = await buildServer({ databasePath: ':memory:' });
    await server.inject({ method: 'GET', url: '/health' });
    await server.close();
  });
});
```

- [ ] **Step 2: 运行验证**

Run: `pnpm bench -- benchmarks/suite.bench.ts`
Expected: 所有 benchmark 通过

- [ ] **Step 3: Commit**

```bash
git add benchmarks/suite.bench.ts
git commit -m "test: add test suite infrastructure benchmarks"
```

---

### Task 6: 回归检测脚本

**Files:**
- Create: `benchmarks/compare.ts`
- Create: `scripts/check-benchmark.js`
- Create: `scripts/update-baseline.js`

- [ ] **Step 1: 创建 compare.ts**

```typescript
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface BenchmarkResult {
  file: string;
  name: string;
  hz: number;
}

interface Baseline {
  version: number;
  timestamp: string;
  commit: string;
  results: Record<string, Record<string, { hz: number }>>;
}

export function loadBaseline(path: string): Baseline {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function loadCurrent(path: string): BenchmarkResult[] {
  const raw = JSON.parse(readFileSync(path, 'utf-8'));
  const results: BenchmarkResult[] = [];
  for (const [file, suites] of Object.entries(raw.testResults || {})) {
    for (const suite of suites as any[]) {
      for (const task of suite.assertionResults || []) {
        if (task.benchmark) {
          results.push({
            file,
            name: task.fullName,
            hz: task.benchmark.hz,
          });
        }
      }
    }
  }
  return results;
}

export function checkRegression(
  current: BenchmarkResult[],
  baseline: Baseline,
  threshold: number = 0.10
): { passed: boolean; regressions: string[] } {
  const regressions: string[] = [];

  for (const result of current) {
    const fileResults = baseline.results[result.file];
    if (!fileResults) continue;

    const baseHz = fileResults[result.name]?.hz;
    if (!baseHz) continue;

    const drop = (baseHz - result.hz) / baseHz;
    if (drop > threshold) {
      regressions.push(
        `${result.name}: ${(baseHz).toFixed(0)} → ${(result.hz).toFixed(0)} ops/sec (${(drop * 100).toFixed(1)}% drop)`
      );
    }
  }

  return { passed: regressions.length === 0, regressions };
}
```

- [ ] **Step 2: 创建 check-benchmark.js**

```javascript
const { loadBaseline, loadCurrent, checkRegression } = require('./benchmarks/compare');

const current = loadCurrent('benchmarks/current.json');
const baseline = loadBaseline('benchmarks/baseline.json');

const { passed, regressions } = checkRegression(current, baseline, 0.10);

if (!passed) {
  console.error('\n⚠️  Performance regression detected:\n');
  for (const r of regressions) {
    console.error(`  ❌ ${r}`);
  }
  console.error('\nRun `pnpm bench:update` to update baseline if this is expected.\n');
  process.exit(1);
} else {
  console.log('✅ No performance regression detected.');
}
```

- [ ] **Step 3: 创建 update-baseline.js**

```javascript
const { readFileSync, writeFileSync } = require('node:fs');
const { execSync } = require('node:child_process');

// Run benchmarks
execSync('vitest bench --run --reporter=json --outputFile=benchmarks/current.json', {
  stdio: 'inherit',
});

// Load current results
const raw = JSON.parse(readFileSync('benchmarks/current.json', 'utf-8'));
const results = {};

for (const [file, suites] of Object.entries(raw.testResults || {})) {
  results[file] = {};
  for (const suite of suites) {
    for (const task of suite.assertionResults || []) {
      if (task.benchmark) {
        results[file][task.fullName] = { hz: task.benchmark.hz };
      }
    }
  }
}

const commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();

const baseline = {
  version: 1,
  timestamp: new Date().toISOString(),
  commit: commitHash,
  results,
};

writeFileSync('benchmarks/baseline.json', JSON.stringify(baseline, null, 2) + '\n');
console.log('✅ Baseline updated.');
```

- [ ] **Step 4: 运行验证**

Run: `node scripts/update-baseline.js`
Expected: baseline.json 更新

- [ ] **Step 5: Commit**

```bash
git add benchmarks/compare.ts scripts/check-benchmark.js scripts/update-baseline.js
git commit -m "feat: benchmark regression detection scripts"
```

---

### Task 7: CI 集成

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: 在 ci.yml 添加 benchmark 步骤**

在 `Run tests with coverage` 步骤之后添加：

```yaml
      - name: Run benchmarks
        run: pnpm bench

      - name: Check benchmark regression
        run: pnpm bench:check
        continue-on-error: true
```

- [ ] **Step 2: 运行验证**

Run: `git diff .github/workflows/ci.yml`
Expected: 显示新增的 benchmark 步骤

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add benchmark regression check to CI workflow"
```

---

### Task 8: 全量验证

- [ ] **Step 1: 运行所有 benchmark**

Run: `pnpm bench`
Expected: 所有 benchmark 通过，输出 ops/sec

- [ ] **Step 2: 更新基线**

Run: `node scripts/update-baseline.js`
Expected: baseline.json 更新

- [ ] **Step 3: 验证回归检查**

Run: `node scripts/check-benchmark.js`
Expected: ✅ No performance regression detected.

- [ ] **Step 4: 运行全量测试**

Run: `pnpm test`
Expected: 2410+ 测试通过

- [ ] **Step 5: Commit**

```bash
git add benchmarks/baseline.json
git commit -m "chore: initial benchmark baseline"
```
