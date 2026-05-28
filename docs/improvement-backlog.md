# ElectronHound 持续优化 Backlog

> 活文档 — 每轮迭代结束自动更新。按 Wave 分组，Wave 内按优先级排序。
> 每轮选当前 Wave 的第一个未完成任务执行。

## 每轮循环流程

```
1. 读取本文件 → 选当前 Wave 第一个未完成任务
2. 实施（可并行 sub-agent，充分探索代码后再动手）
3. 三层 code review（并行 agent，深度审查每个变更文件）
4. 修复 review 发现的所有问题
5. 验证：
   - npx eslint --quiet → 0 错误
   - pnpm test → 全部通过
   - pnpm build → 成功
   - 如涉及核心路径变更 → pnpm dev 启动验证
   - 如涉及 API 路由 → 端到端 curl 测试
   - 如涉及工具系统 → e2e 测试
6. 提交
7. 更新本文件（标记完成，记录指标变化）
8. 执行「发现扫描」→ 补充新任务到后续 Wave
9. 继续下一轮
```

## 发现扫描（每轮结束自动执行）

每轮结束时运行以下扫描，将发现的新问题追加到对应 Wave：

```bash
# 1. 新增 ESLint 错误
npx eslint packages/agent-core/src apps/server/src --quiet

# 2. 裸 catch 块
grep -rn "catch\s*(\w\+)" packages/ apps/ --include="*.ts" | grep -v ": unknown" | grep -v __tests__ | grep -v "catch {"

# 3. 生产代码 TODO/FIXME
grep -rn "TODO\|FIXME\|HACK" packages/agent-core/src apps/server/src --include="*.ts" | grep -v __tests__

# 4. 覆盖率下降
npx vitest run --coverage 2>&1 | grep "All files"

# 5. console.error 残留
grep -rn "console\.error" packages/agent-core/src apps/server/src --include="*.ts" | grep -v __tests__
```

---

## Wave 1 — 跨包 catch 块 + 严格模式（2-3 轮）

### 1.1 electron-bridge-mcp catch 块清理 ✅
- **范围：** `packages/electron-bridge-mcp/src/`
- **数量：** 4 个裸 `catch (err)` → 已修复
- **模式：** `catch (err)` → `catch (err: unknown)`
- **验证：** grep 返回 0

### 1.2 electron-helper catch 块清理 ✅
- **范围：** `packages/electron-helper/src/`
- **数量：** 9 个裸 `catch (err)` → 已修复
- **模式：** 同上

### 1.3 launcher catch 块清理 ✅
- **范围：** `packages/launcher/src/`
- **数量：** 2 个裸 `catch (err)` → 已修复
- **模式：** 同上

### 1.4 TypeScript noImplicitAny 评估 ✅
- **范围：** `packages/agent-core/tsconfig.json`
- **结果：** `strict: true` 已启用（包含 noImplicitAny）
- **错误数：** 29 个（cdp.ts 21, test 7, execution.ts 1）
- **根因：** `strictFunctionTypes` 下 invoke 签名不匹配
- **修复方案：** 合并到 Wave 3.1 泛型 Tool<P> 重构

### 1.5 dashboard catch 块清理 ✅（发现扫描补充）
- **范围：** `apps/dashboard/src/`
- **数量：** 8 个裸 `catch (err/e)` → 已修复
- **文件：** api.ts, sse.ts, taskStore.ts

---

## Wave 2 — 测试覆盖提升（4-6 轮）

### 2.1 electron-helper 测试补充
- **目标文件：** `packages/electron-helper/src/index.ts` (36% 覆盖)
- **测试要点：** IPC 通道注册、消息发送/接收、错误处理
- **参考模式：** `packages/agent-core/src/tools/__tests__/electron.test.ts`

### 2.2 electron-bridge-mcp 测试补充
- **目标文件：** `packages/electron-bridge-mcp/src/server.ts` (60% 覆盖)
- **测试要点：** MCP server 生命周期、工具注册、请求处理

### 2.3 路由测试 — feedback + templates
- **目标文件：** `apps/server/src/routes/feedback.ts`, `templates.ts`
- **测试要点：** CRUD 操作、验证、错误处理
- **参考模式：** `apps/server/src/__tests__/routes.test.ts`

### 2.4 路由测试 — health + exports + stream
- **目标文件：** `health.ts`, `exports.ts`, `stream.ts`
- **测试要点：** 健康检查、JSON/CSV/HTML 导出、SSE 连接

### 2.5 路由测试 — report-templates + providers + batches
- **目标文件：** `report-templates.ts`, `providers.ts`, `batches.ts`
- **测试要点：** 模板 CRUD、provider 管理、批次操作

### 2.6 workerPool 队列测试
- **目标文件：** `apps/server/src/services/workerPool/queue.ts`
- **测试要点：** FIFO 顺序、优先级、并发控制

---

## Wave 3 — 架构优化（3-5 轮）

### 3.1 泛型 Tool<P> 模式重构
- **现状：** 12 个 `as unknown as X` 双重转换
- **方案：**
  ```typescript
  interface ConcreteTool<P> extends Tool {
    invoke(params: P): Promise<ToolResult>;
  }
  ```
- **影响文件：** types.ts, browser.ts, electron.ts, cdp.ts, registry.ts
- **验证：** 所有工具测试通过，无 `as unknown as` 残留

### 3.2 noImplicitAny 错误修复（如 Wave 1.4 产出任务）
- **分批执行：** 按模块修复
- **每批验证：** `tsc --noEmit` 错误数递减

### 3.3 覆盖率阈值提升至 75%
- **当前：** 72.44% stmts
- **目标：** 75% stmts / 65% branches / 75% functions / 75% lines
- **依赖：** Wave 2 完成后自然达标

### 3.4 错误处理统一模式
- **现状：** 错误处理分散，有 `errMsg()`、`process.stderr.write`、直接 throw
- **方案：** 提取 `packages/agent-core/src/utils/error.ts` 统一工具函数
- **影响：** 减少重复的 `err instanceof Error ? err.message : String(err)` 模式

### 3.5 日志系统标准化
- **现状：** `process.stderr.write` + `console.warn` + `server.log` 混用
- **方案：** 定义 Logger 接口，统一注入
- **影响：** server 使用 fastify log，agent-core 使用 stderr

---

## Wave 4 — Skipped 测试 + CI（2-3 轮）

### 4.1 Deferred 测试重写 — crash-recovery
- **文件：** `tests/e2e/crash-recovery.test.ts`
- **需要：** 重写为 AgentLoop 架构
- **测试要点：** 进程崩溃恢复、超时处理、资源清理

### 4.2 Deferred 测试重写 — full-test-cycle + report-parallel
- **文件：** `tests/e2e/full-test-cycle.test.ts`, `report-parallel.test.ts`
- **需要：** 重写为 AgentLoop 架构

### 4.3 CI/CD 强化
- **检查：** `.github/workflows/ci.yml` 是否运行 ESLint
- **建议：** 添加 `npx eslint --quiet` 到 CI pre-merge
- **建议：** 添加 coverage threshold 检查到 CI

---

## Wave 5 — 性能 + DX（3-5 轮）

### 5.1 测试运行时间优化
- **当前：** ~47s 测试执行
- **分析：** 哪些测试最慢？是否可以并行？
- **目标：** < 30s

### 5.2 构建时间优化
- **当前：** dashboard ~400ms, server tsc ~?
- **分析：** 增量构建是否生效？

### 5.3 开发体验改进
- **检查：** `pnpm dev` 是否流畅
- **检查：** 热重载是否正常
- **检查：** 类型提示是否完整

### 5.4 Bundle 大小优化
- **检查：** dashboard bundle 大小
- **分析：** 是否有未 tree-shake 的依赖

### 5.5 文档完整性
- **检查：** API 文档是否与代码同步
- **检查：** README 安装步骤是否准确
- **检查：** CHANGELOG 是否记录所有 breaking changes

---

## Wave 6 — 安全加固（2-3 轮）

### 6.1 依赖安全审计
- **命令：** `pnpm audit`
- **修复：** 已知漏洞的依赖升级

### 6.2 输入验证加固
- **检查：** 所有 API 路由是否有 Zod schema 验证
- **检查：** 文件路径是否有路径遍历防护
- **检查：** 用户输入是否有 XSS 防护

### 6.3 敏感信息检查
- **检查：** 硬编码的 API key 或密码
- **检查：** `.env` 文件是否被正确 gitignore
- **检查：** 日志中是否泄露敏感信息

---

## 完成记录

| 轮次 | Wave | 任务 | Commit | 日期 |
|------|------|------|--------|------|
| Phase 2 | - | 审计链集成 + 错误日志 + 测试覆盖 | `dac9a74` | 2026-05-28 |
| Phase 2+ | - | 统一 stderr 日志 | `932187b` | 2026-05-28 |
| Phase 3 | - | ESLint 110→0 + 类型安全 | `59adec6` | 2026-05-28 |
| Phase 4 | - | catch 块 `: unknown` + 阈值提升 | `97ef456` | 2026-05-28 |
| Wave 1.1-1.3 | W1 | catch 块清理 (bridge/helper/launcher) | `c630603` | 2026-05-28 |

---

## 指标追踪

| 指标 | 基线 (Phase 2 前) | 当前 | 目标 |
|------|-------------------|------|------|
| ESLint 错误 | 110 | 0 | 0 |
| 测试数量 | 1280 | 1364 | 持续增长 |
| 覆盖率 (stmts) | ~68% | 72.44% | 80% |
| 裸 catch 块 | 73+ | 0 (全包) | 0 (全包) |
| TODO/FIXME | 1 | 0 | 0 |
| 测试运行时间 | ~50s | ~47s | < 30s |
| as unknown as | 0 | 12 | 0 |
