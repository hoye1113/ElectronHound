# EATA Architecture Review & Refactoring Plan

## Background
After completing v0.1 (20 tasks) and v0.3 (31 tasks including multi-provider LLM), 
we need to audit the current codebase architecture, fix structural issues, and 
prepare for stable future development.

## Scope
- **IN**: Module decoupling, type system cleanup, config management unification, 
  dead code removal, error handling patterns
- **OUT**: New features, test coverage expansion, performance optimization

## Architecture Findings

### Critical Issues

1. **Duplicate LLM abstraction path** (`llm.ts:7-71`)
   - `LLMConfig` / `LLMProvider` (legacy) coexists with `LLMProviderConfig` (v0.3)
   - `createLLMProvider()` creates `createOpenAI` directly
   - `getGenerateObjectForProvider()` delegates to `provider-factory.ts`
   - Both paths work but create confusion about canonical usage

2. **Type-unsafe cast in `runner.ts:38`** 
   - `generateObject as never` bypasses type checking
   - `PlanNodeOptions` expects `model: ReturnType<typeof openai>` but actual runtime type is `LanguageModelV1`
   - Same issue in `VerifyNodeOptions`

3. **Dead code / misleading placeholders**
   - `plan.ts:55`: `model: {} as ReturnType<typeof openai>` — dummy model, never used
   - `verify.ts:38`: same pattern
   - `provider-factory.ts:44-51`: `testProviderConnection()` returns `true` always

### Medium Issues

4. **Config storage drift risk** — Dashboard uses `localStorage('eata-providers')`, 
   Server API reads/writes `~/.eata/providers.json`. No sync mechanism.
   
5. **Silent error swallowing** — `config-manager.ts:46` catches parse errors and 
   returns defaults without logging

6. **Index.ts pollution** — Exports both legacy (`LLMConfig`, `createLLMProvider`) 
   and new APIs, creating ambiguity

### Low Issues

7. **Unused export** — `getGenerateObject` from `llm.ts` (legacy) is imported in 
   `runner.ts` but `getGenerateObjectForProvider` is the actual path used when 
   `providerId` is specified

---

## 详细分析

### 1. 双 LLM 抽象路径 (Critical)

**现状**：
```
旧 API (v0.1):
  llm.ts:
    - LLMConfig { apiKey?, baseURL?, model? }
    - LLMProvider { openai: ReturnType<createOpenAI>, model }
    - createLLMProvider() → createOpenAI() 直接
    - getGenerateObject(opts) → provider.openai(provider.model)

新 API (v0.3):
  llm-types.ts:
    - LLMProviderConfig { id, name, type, apiKey, baseURL, model, enabled? }
    - ProvidersConfig { version, providers[], activeId }
  
  provider-factory.ts:
    - createProviderInstance(config) → openai(config.model)
    - getGenerateObjectForProvider(config) → createProviderInstance(config)
  
  llm.ts:
    - getGenerateObjectForProvider() → 委托给 provider-factory.ts
```

**问题**：
- 两条路径都返回 `LanguageModelV1`，但接口名不同
- `PlanNodeOptions.model` 类型是 `ReturnType<typeof openai>`，实际需要 `LanguageModelV1`
- `runner.ts:38` 使用 `as never` 绕过类型检查

### 2. 类型不安全 cast (Critical)

**位置**：
- `runner.ts:38`: `generateObject as never`
- `plan.ts:55`: `model: {} as ReturnType<typeof openai>`
- `verify.ts:38`: `model: {} as ReturnType<typeof openai>`

**原因**：
- `createPlanNode` 期望 `model: ReturnType<typeof openai>` (即函数类型)
- 实际 `LanguageModelV1` 是对象类型
- Vercel AI SDK v6 改变了 `createOpenAI` 返回值

### 3. Dead Code (Critical)

| 位置 | 问题 | 影响 |
|------|------|------|
| `provider-factory.ts:44-51` | `testProviderConnection()` 永远返回 `true` | Dashboard 测试连接按钮无效 |
| `graph.ts` | 无日志记录 | 调试困难 |
| `state.ts:54` | `default: () => 'running'` 硬编码 | 与 config 不一致 |

### 4. 配置存储漂移 (Medium)

**前端**：
- `Settings.tsx` 使用 `localStorage('eata-providers')`
- `taskStore.ts` 从 API 获取数据

**后端**：
- `providers.ts` 读写 `~/.eata/providers.json`
- `tasks.ts` 读写 SQLite

**问题**：
- Dashboard 和 Server 可能使用不同配置
- 无同步机制

### 5. 静默错误吞没 (Medium)

**位置**：
- `config-manager.ts:46`: `catch { return DEFAULT_PROVIDERS; }`
- 无日志记录解析错误

### 6. Index.ts 污染 (Low)

**导出**：
- `createLLMProvider` (旧 API)
- `getGenerateObjectForProvider` (新 API)
- `LLMConfig` (旧类型)
- `LLMProviderConfig` (新类型)

**问题**：使用者不清楚应该导入哪个

## 架构优点

1. **模块化清晰** — `packages/agent-core` 封装核心逻辑，`apps/server` 提供 REST API，`apps/dashboard` 提供 UI
2. **单一职责** — 每个 node 文件独立，职责清晰（`plan.ts` 只负责规划，`verify.ts` 只负责验证）
3. **依赖注入** — `PlanNodeOptions` 和 `VerifyNodeOptions` 支持 DI，便于测试
4. **类型安全** — 仅 1 处 `as any`（在测试文件中），其余使用严格类型
5. **向后兼容** — v0.3 保留旧 API，新 API 并行
6. **数据持久化** — SQLite WAL 模式，路径安全验证
7. **实时更新** — SSE Hub 管理客户端连接，状态变化实时推送
8. **进程隔离** — `worker-entry.ts` 通过 JSON-RPC 与主进程通信，心跳检测
9. **安全** — `fileSecurity.ts` 防止路径遍历攻击
10. **优雅降级** — MCP 客户端支持 mock 模式，无 LLM 时使用确定性 fallback

---

## 🎯 核心发现 & 修复方案

### 🔴 Critical Issues (3)

| # | 问题 | 位置 | 修复 |
|---|------|------|------|
| **C1** | `PlanNodeOptions.model` 类型不匹配 | `plan.ts:14`, `verify.ts:14` | 改为 `LanguageModelV1` |
| **C2** | `runner.ts:38` 使用 `as never` 绕过类型检查 | `runner.ts:38` | 移除 `as never`，修复类型 |
| **C3** | `testProviderConnection()` 永远返回 `true` | `provider-factory.ts:44` | 实现真实连接测试 |

### 🟡 Medium Issues (2)

| # | 问题 | 位置 | 修复 |
|---|------|------|------|
| **M1** | `graph.ts` 无日志记录 | `graph.ts:15-36` | 添加 `routeAfterVerify`/`routeAfterObserve` 日志 |
| **M2** | `config-manager.ts:46` 静默吞错误 | `config-manager.ts:46` | 添加 `console.warn` |

### 🟢 Low Issues (1)

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| **L1** | 旧/新 API 同时导出 | `index.ts:6-7, 60-61` | 保留向后兼容，待后续版本移除旧 API |

---

## 🛠️ 修复方案

### Phase 1: 类型统一 (P0, 30 分钟)
- 修改 `PlanNodeOptions.model: LanguageModelV1`
- 修改 `VerifyNodeOptions.model: LanguageModelV1`
- 移除 `runner.ts:38` 的 `as never` cast

### Phase 2: 死代码清理 (P1, 30 分钟)
- 实现 `testProviderConnection` 真实连接测试
- 添加 `graph.ts` 日志记录

### Phase 3: 日志 & 错误处理 (P2, 15 分钟)
- `config-manager.ts:46` 添加 `console.warn`
- 添加配置解析错误日志

**总计**：~75 分钟

---

## 已审查文件列表 (31 files)

### Agent Core (15 files)
1. `provider-factory.ts` — Provider 实例创建
2. `config-manager.ts` — 配置 CRUD
3. `config-paths.ts` — 配置路径常量
4. `llm-types.ts` — Provider 类型定义
5. `llm.ts` — LLM 抽象层（双路径）
6. `index.ts` — 导出映射
7. `graph.ts` — LangGraph 编排
8. `state.ts` — TestState 注解
9. `runner.ts` — 入口函数
10. `checkpoint.ts` — SQLite checkpoint
11. `worker-entry.ts` — 子进程入口
12. `mcp/client.ts` — MCP 双模式客户端
13. `guards.ts` — Zod 验证守卫
14. `nodes/plan.ts`, `verify.ts`, `execute.ts`, `observe.ts`, `abort.ts`, `report.ts`

### Server (12 files)
15. `server.ts` — Fastify 入口
16. `db/index.ts` — SQLite 初始化
17. `db/migrations.ts` — Schema 迁移
18. `routes/index.ts` — 路由注册
19. `routes/tasks.ts` — 任务 CRUD
20. `routes/providers.ts` — Provider API
21. `routes/stream.ts` — SSE 流
22. `routes/reports.ts` — 报告路由
23. `routes/feedback.ts` — 反馈路由
24. `services/reportService.ts` — 报告服务
25. `services/fileSecurity.ts` — 路径安全
26. `streams/sseHub.ts` — SSE 中心

### Dashboard (4 files)
27. `pages/Settings.tsx` — 多 Provider 管理
28. `pages/TaskList.tsx` — 任务列表
29. `stores/taskStore.ts` — Zustand 状态
30. `lib/api.ts`, `lib/sse.ts` — API + SSE 客户端
31. `App.tsx` — React Router 配置

### Shared Types (2 files)
32. `task.ts` — Task Zod schema
33. `index.ts` — barrel export

### Tests (1 file)
34. `tests/e2e/provider-selection.test.ts` — Provider 选择 E2E 测试

---

## ❓ 下一步确认

你希望我：

1. **立即执行** - 按 P0→P1→P2 顺序逐步修复
2. **生成详细 TODO** - 每个修复点拆分为具体任务列表
3. **先审查某个模块** - 深入分析某个特定问题

**请选择或直接告诉我你的决定。**

