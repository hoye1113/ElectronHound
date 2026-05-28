# ElectronHound Master Roadmap

**Date:** 2026-05-28
**Status:** Active

---

## Overview

统一规划所有 spec 方向，按优先级分 4 个阶段推进。每个阶段有明确的交付物和验收标准。

---

## Phase 0: 已完成

| Spec | 状态 | 验证 |
|------|------|------|
| Dynamic MCP Connection | ✅ 完成 | 1280 测试通过，E2E 验证 |
| Pi Migration (Wave 1-3) | ✅ 完成 | 零 LangGraph/Vercel 依赖 |
| Gap Closure G3 (metrics test) | ✅ 完成 | metrics.test.ts 已有 |

---

## Phase 1: 核心可靠性（本周）

> 目标：让 agent 历史可追溯，让设置页真正可用

### 1.1 Runner State Integration

**文件:** `packages/agent-core/src/session/entryConverter.ts`, `packages/agent-core/src/runner.ts`

- 创建 `entryConverter.ts`，纯函数将 SessionEntry[] 转换为 StepRecord[]
- 修改 `runner.ts`，AgentLoop 完成后调用 `sessionManager.getSession()` 填充 RunTestResult
- 填充字段：`history`, `currentObservation`, `currentPlan`, `currentExecResult`, `stepCount`

**验收:** `runTest()` 返回的 `history` 数组非空，包含 observe/plan/execute/verify 步骤

### 1.2 Gap Closure G1: Settings.tsx → Provider API

**文件:** `apps/dashboard/src/pages/Settings.tsx`

- 替换 `loadConfig()`/`saveConfig()` 为 `api.providers.*` 调用
- 加载：`useEffect` 调用 `api.providers.list()`
- 创建/更新/删除/测试/激活：调用对应 API 方法
- 移除本地 `LLMProviderConfig` 定义，从 `api.ts` 导入
- 保留 localStorage 作为首次加载降级

**验收:** Settings 页面通过 API 管理 Provider，不依赖 localStorage

### 1.3 Code Cleanup (Direction G)

**文件:** 多个

- 删除 `apps/dashboard/src/stores/uiStore.ts`（确认无引用后）
- 检查 `api.reports.getManifest()`/`getTimeline()` 是否被 Direction F 使用
- 确保 `api.ts` 有完整的 Provider CRUD 方法

**验收:** `pnpm build` 和 `pnpm test` 通过，无死代码

---

## Phase 2: 安全与工程基线（下周）

> 目标：消除安全风险，建立部署基线

### 2.1 Eng Plan Phase 1: Security Baseline

**文件:** `.gitignore`, `.env.example`, `.dockerignore`, `Dockerfile`, `apps/server/src/server.ts`

- `.gitignore` 添加 `.omo/`, `.sisyphus/`, `.claude/`, `.env`, `data/feedback/`
- `git rm -r --cached .omo/ .sisyphus/` 清理已追踪目录
- 创建 `.env.example`（OPENAI_API_KEY, PORT, HOST, LLM_MODEL 等）
- `@fastify/cors` 中间件，限制 origin 为 dashboard 地址
- 创建 `.dockerignore`
- Dockerfile：Node 20, `USER node`, 移除 `EXPOSE 5173`, 生产 CMD

**验收:** `docker build` 成功且不以 root 运行；CORS 头正确返回

### 2.2 Core Features (Direction E)

**文件:** `packages/electron-helper/src/`

- `execute_main`: 通过 CDP `Runtime.evaluate` 在 Electron 主进程执行 JS
- `send_ipc`: 通过 CDP 调用 `ipcRenderer.invoke(channel, data)`
- `mock_dialog`: 注入 dialog mock 到主进程
- `get_menu_items`: 通过 CDP 获取菜单结构
- `llmModel` schema 从 `z.enum(...)` 改为 `z.string().min(1)`
- `.env.example` 添加 `DATABASE_PATH`, `CHECKPOINT_PATH`, `DATA_DIR`

**验收:** 4 个操作有实现代码 + 单元测试；llmModel 接受任意字符串

### 2.3 Gap Closure G2: Async I/O

**文件:** `apps/server/src/services/exportService.ts`

- `readFileSync` → `await readFile()` (fs/promises)
- `existsSync` → `await access().then(() => true).catch(() => false)`

**验收:** exportService.ts 无 `readFileSync`/`existsSync` 导入

---

## Phase 3: UI 与可观测性（第三周）

> 目标：Dashboard 功能完整，系统状态可感知

### 3.1 Dashboard UI (Direction F)

**文件:** `apps/dashboard/src/pages/`

| 页面 | 功能 | 依赖 |
|------|------|------|
| Settings.tsx | Provider API 集成 | Phase 1.2 |
| BatchList.tsx | 批次列表、创建、详情 | Direction A API |
| Templates.tsx | 模板画廊、CRUD | Direction A API |
| TaskDetail.tsx | 导出按钮（JSON/CSV/HTML） | Direction A API |
| SystemHealth.tsx | 健康检查数据展示 | Eng Plan Phase 3 |
| Layout.tsx | 侧边栏新增导航项 | 以上页面 |

**验收:** 所有页面可访问，数据通过 API 加载

### 3.2 Eng Plan Phase 3: Observability

**文件:** `apps/server/src/routes/health.ts`, `apps/server/src/routes/metrics.ts`

- `/health` 返回 `{ status, checks: { database, workerPool }, uptime }`
- `/metrics` 使用 `prom-client` 暴露 Prometheus 指标
- 指标：`eata_tasks_total`, `eata_task_duration_seconds`, `eata_workers_active`, `eata_sse_connections`
- workerManager 日志替换 `console.error` 为 Fastify logger
- docker-compose healthcheck 关联增强后的 `/health`

**验收:** `curl /health` 返回结构化 JSON；`curl /metrics` 返回 Prometheus 格式

### 3.3 Gap Closure G4: report_templates 表

**文件:** `apps/server/src/db/migrations/`, `apps/server/src/routes/`

- 创建 `report_templates` 表迁移
- 实现 CRUD 路由 `/api/report-templates`

**验收:** 模板可通过 API 创建、查询、更新、删除

---

## Phase 4: 质量与发布（持续）

> 目标：测试覆盖率提升，建立发布流程

### 4.1 QA (Direction B)

- 补充 TaskList, TaskDetail, ErrorBoundary 测试
- bridge-client 和 IPC 测试
- E2E 测试（test-electron-app fixture）
- 覆盖率阈值：statements 60%, branches 50%

**验收:** 测试数 > 1400，覆盖率达标

### 4.2 Performance (Direction C)

- exportService async I/O（Phase 2.3 已覆盖）
- 数据库索引优化
- 预编译 SQL 语句
- SSE 连接数限制
- 前端代码分割

**验收:** 任务列表 < 50ms，报告生成 < 200ms

### 4.3 Open Source (Direction D)

- LICENSE, CONTRIBUTING.md, SECURITY.md
- Issue/PR 模板, CODEOWNERS
- package.json metadata 丰富
- CI 分支目标 main → master
- 英文 README 段落

**验收:** 所有开源必备文件就位

### 4.4 Eng Plan Phase 4: Release Management

- CHANGELOG.md（历史版本补录）
- Changesets 配置
- Release CI workflow
- `engines` 约束（Node >= 20, pnpm >= 9）

**验收:** `pnpm changeset status` 正常运行

---

## Dependency Graph

```
Phase 1 (本周)
├─ 1.1 Runner State Integration ──────────────────────────────┐
├─ 1.2 Settings.tsx → API ────────────────────────┐           │
└─ 1.3 Code Cleanup ──────────────────────────────┤           │
                                                  │           │
Phase 2 (下周)                                     │           │
├─ 2.1 Security Baseline (独立)                    │           │
├─ 2.2 Core Features E (独立)                      │           │
└─ 2.3 Async I/O (独立)                            │           │
                                                  ▼           │
Phase 3 (第三周)                                              │
├─ 3.1 Dashboard UI (依赖 1.2, 2.2) ──────────────┘           │
├─ 3.2 Observability (独立)                                   │
└─ 3.3 report_templates (独立)                                │
                                                              │
Phase 4 (持续)                                                │
├─ 4.1 QA (依赖 1.1, 3.1) ───────────────────────────────────┘
├─ 4.2 Perf (依赖 3.1)
├─ 4.3 Open Source (独立)
└─ 4.4 Release (依赖 4.3)
```

---

## Metrics

| 指标 | 当前 | Phase 1 后 | Phase 3 后 | Phase 4 后 |
|------|------|-----------|-----------|-----------|
| 测试数 | 1280 | 1300 | 1350 | 1400+ |
| Agent 历史可追溯 | ✗ | ✓ | ✓ | ✓ |
| Settings API 集成 | ✗ | ✓ | ✓ | ✓ |
| 安全基线 | ✗ | ✗ | ✓ | ✓ |
| electron-helper 操作 | 1/5 | 1/5 | 5/5 | 5/5 |
| Dashboard 页面完整 | 4/8 | 4/8 | 8/8 | 8/8 |
| 可观测性 | ✗ | ✗ | ✓ | ✓ |
| 发布流程 | ✗ | ✗ | ✗ | ✓ |
