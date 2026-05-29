# Performance Baseline System Design

**Version:** 1.0
**Date:** 2026-05-29
**Status:** Pending Approval

---

## Overview

建立性能基准测试体系，覆盖 API 端点、数据库查询、Agent 执行、测试套件 4 个层面。使用 vitest bench 运行微基准测试，CI 中自动检测回归（阈值 10%）。

---

## 架构

```
benchmarks/
├── api.bench.ts          # API 端点性能
├── database.bench.ts     # 数据库查询性能
├── agent.bench.ts        # Agent 执行性能
├── suite.bench.ts        # 测试套件性能
├── baseline.json         # 基线结果（提交到 git）
└── compare.ts            # 回归检测脚本
```

---

## 层面 1: API 端点性能

**文件:** `benchmarks/api.bench.ts`

**测试目标：** 关键 API 路由的响应时间和吞吐量

| 基准测试 | 路由 | 指标 |
|----------|------|------|
| tasks-list | GET /api/tasks | ops/sec, p95 |
| tasks-create | POST /api/tasks | ops/sec, p95 |
| tasks-get | GET /api/tasks/:id | ops/sec, p95 |
| batches-list | GET /api/tasks/batches | ops/sec, p95 |
| reports-list | GET /api/reports | ops/sec, p95 |
| few-shot-list | GET /api/few-shot | ops/sec, p95 |
| templates-list | GET /api/report-templates | ops/sec, p95 |
| health | GET /health | ops/sec, p95 |

**实现方式：**
- 使用 `server.inject()` 做进程内 HTTP 测试（无需启动真实服务器）
- 每个基准测试预热 5 次，正式运行 100 次
- 使用 vitest 的 `bench()` API

**示例结构：**
```typescript
import { bench, describe } from 'vitest';
import { buildServer } from '../apps/server/src/server';

describe('API endpoints', async () => {
  const { server } = await buildServer({ databasePath: ':memory:' });

  bench('GET /api/tasks', async () => {
    await server.inject({ method: 'GET', url: '/api/tasks' });
  });

  bench('POST /api/tasks', async () => {
    await server.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { name: 'bench-task', goal: 'test' },
    });
  });

  // ... more endpoints
});
```

---

## 层面 2: 数据库查询性能

**文件:** `benchmarks/database.bench.ts`

**测试目标：** SQLite 查询效率、索引命中、prepared statements

| 基准测试 | 操作 | 指标 |
|----------|------|------|
| tasks-filter-status | SELECT tasks WHERE status=? | ops/sec |
| tasks-filter-batch | SELECT tasks WHERE batch_id=? | ops/sec |
| tasks-with-steps | SELECT tasks JOIN steps | ops/sec |
| reports-with-steps | SELECT reports JOIN steps | ops/sec |
| few-shot-search | SELECT few_shot_examples WHERE goal LIKE ? | ops/sec |
| batch-progress | SELECT COUNT(*) GROUP BY status | ops/sec |
| insert-task | INSERT INTO tasks | ops/sec |
| insert-step | INSERT INTO steps | ops/sec |

**实现方式：**
- 使用 `:memory:` SQLite 数据库
- 预填充 1000 条记录作为测试数据
- 每个查询预热 10 次，正式运行 500 次

---

## 层面 3: Agent 执行性能

**文件:** `benchmarks/agent.bench.ts`

**测试目标：** AgentLoop 单步执行时间、工具调用开销

| 基准测试 | 操作 | 指标 |
|----------|------|------|
| step-observe | Observation 生成 | ops/sec |
| step-plan | Plan 生成 | ops/sec |
| step-execute | 工具执行 | ops/sec |
| step-verify | Verdict 生成 | ops/sec |
| entry-converter | SessionEntry[] → StepRecord[] | ops/sec |
| fingerprint | fingerprintObservation() | ops/sec |

**实现方式：**
- 使用 mock LLM 响应（避免真实 API 调用）
- 测量纯计算开销，不包含网络延迟
- entry-converter 使用真实 SessionEntry[] 数据

---

## 层面 4: 测试套件性能

**文件:** `benchmarks/suite.bench.ts`

**测试目标：** 测试基础设施本身的开销

| 基准测试 | 操作 | 指标 |
|----------|------|------|
| server-setup | buildServer() 冷启动 | ops/sec |
| server-inject | server.inject() 单次调用 | ops/sec |
| db-migration | 运行所有迁移 | ops/sec |
| db-seed | 填充测试数据 | ops/sec |
| mock-factory | 创建 mock 对象 | ops/sec |

---

## 基线管理

### 基线文件

**文件:** `benchmarks/baseline.json`

```json
{
  "version": 1,
  "timestamp": "2026-05-29T12:00:00Z",
  "commit": "abc1234",
  "results": {
    "api.bench.ts": {
      "GET /api/tasks": { "hz": 1250, "p95": 0.8 },
      "POST /api/tasks": { "hz": 800, "p95": 1.2 }
    },
    "database.bench.ts": {
      "tasks-filter-status": { "hz": 5000, "p95": 0.2 }
    }
  }
}
```

### 更新基线

```bash
pnpm bench:update
```

运行所有 benchmark，将结果写入 `baseline.json`，自动 git add。

---

## CI 回归检测

### 流程

```
PR 提交 → CI 运行 benchmark → 与 baseline.json 对比 → 超过 10% 则失败
```

### 实现

**文件:** `benchmarks/compare.ts`

```typescript
interface BenchmarkResult {
  file: string;
  name: string;
  hz: number;      // ops/sec
  p95: number;      // ms
}

function checkRegression(
  current: BenchmarkResult[],
  baseline: BenchmarkResult[],
  threshold: number = 0.10
): { passed: boolean; regressions: string[] } {
  // 对比每个 benchmark 的 ops/sec
  // 如果 current.hz < baseline.hz * (1 - threshold)，标记为回归
}
```

### CI 集成

在 `.github/workflows/ci.yml` 中添加：

```yaml
- name: Run benchmarks
  run: pnpm bench

- name: Check regression
  run: pnpm bench:check
```

**`pnpm bench`** 运行所有 `.bench.ts` 文件，输出 JSON 结果。
**`pnpm bench:check`** 运行 `compare.ts`，对比当前结果与 `baseline.json`。

---

## package.json 脚本

```json
{
  "bench": "vitest bench --run --reporter=json --outputFile=benchmarks/current.json",
  "bench:update": "vitest bench --run && node scripts/update-baseline.js",
  "bench:check": "node scripts/check-benchmark.js"
}
```

---

## vitest 配置

在 `vitest.config.ts` 中添加 benchmark 配置：

```typescript
{
  bench: {
    include: ['benchmarks/**/*.bench.ts'],
    reporters: ['default', 'json'],
    outputFile: 'benchmarks/current.json',
  },
}
```

---

## 文件清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `benchmarks/api.bench.ts` | API 端点基准测试 |
| `benchmarks/database.bench.ts` | 数据库查询基准测试 |
| `benchmarks/agent.bench.ts` | Agent 执行基准测试 |
| `benchmarks/suite.bench.ts` | 测试套件基准测试 |
| `benchmarks/baseline.json` | 基线结果 |
| `benchmarks/compare.ts` | 回归检测逻辑 |
| `scripts/update-baseline.js` | 更新基线脚本 |
| `scripts/check-benchmark.js` | CI 回归检查脚本 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `vitest.config.ts` | 添加 `bench` 配置 |
| `package.json` | 添加 `bench`, `bench:update`, `bench:check` 脚本 |
| `.github/workflows/ci.yml` | 添加 benchmark 运行和回归检查步骤 |

---

## 验收标准

- [ ] 4 个 benchmark 文件存在且可运行
- [ ] `pnpm bench` 输出 JSON 结果
- [ ] `baseline.json` 包含所有 benchmark 的基线数据
- [ ] `pnpm bench:check` 能检测 10% 以上的回归
- [ ] CI workflow 包含 benchmark 回归检查步骤
- [ ] 性能下降超过 10% 时 CI 失败
- [ ] `pnpm bench:update` 更新基线文件

---

## 执行顺序

```
Wave 1 (并行):
  ├── Agent 1: API 端点 benchmark + 数据库 benchmark
  └── Agent 2: Agent benchmark + 测试套件 benchmark

Wave 2 (串行):
  ├── vitest.config.ts + package.json 配置
  ├── compare.ts + 回归检测脚本
  └── CI workflow 更新
```
