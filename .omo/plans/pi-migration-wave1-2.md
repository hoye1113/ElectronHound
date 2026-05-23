# Pi 迁移 Wave 1-2 执行计划

## 当前状态
- Phase 1（Token Tracking）: ✅ 已完成（commit 1773cb0）
- Pi 迁移 Wave 1: 🔄 部分完成
- Pi 迁移 Wave 2: ❌ 未开始

## Wave 1 剩余任务

### Task 1: 迁移 Vercel AI SDK 代码，然后移除依赖

**⚠️ 重要发现**: 直接移除会导致构建失败，因为以下文件仍在使用：

| 文件 | 引用 | 性质 |
|------|------|------|
| `apps/server/src/routes/providers.ts:75` | `const { generateText } = await import('ai')` | 动态 import |
| `packages/agent-core/src/provider-factory.ts:1-3` | `import { createOpenAI } from '@ai-sdk/openai'` + `import { generateObject } from 'ai'` | 静态 import |
| `packages/agent-core/src/llm.ts:1-3` | `import { createOpenAI } from '@ai-sdk/openai'` + `import { generateObject } from 'ai'` | 静态 import |

**更严重的问题**: `packages/agent-core/package.json` **完全没有声明** `@ai-sdk/openai` 和 `ai` 依赖。这两个包仅存在于 `apps/server/package.json`，通过 pnpm hoisting 被 agent-core 解析到。这是一个隐式依赖（phantom dependency）。

**执行步骤**:
1. 迁移 `apps/server/src/routes/providers.ts` 中的 `generateText` 调用 → 使用自有 LLM 系统
2. 迁移 `packages/agent-core/src/provider-factory.ts` 和 `llm.ts` 中的 Vercel AI SDK 用法 → 改用自有 LLM 实现
3. 从 `apps/server/package.json` 移除 `@ai-sdk/openai` 和 `ai`
4. 验证 `pnpm install` + `pnpm typecheck` + `pnpm test`

### Task 2: 清理 root LangGraph 依赖（评估）
- **文件**: `package.json` (root)
- **状态**: 6 个文件仍在使用 LangGraph，**不能移除**
- **处理**: 保留，在 Wave 3 迁移 graph.ts 时一并处理

## Wave 2 任务

### Task 3: 实现 Session 管理
- **目录**: `packages/agent-core/src/session/`
- **当前状态**: 只有 `.gitkeep`，为空
- **需要实现**:
  - `sessionManager.ts` - SessionManager 类
  - `types.ts` - SessionEntry, CompactionEntry, BranchSummaryEntry 类型
  - `persistence.ts` - SQLite 持久化
  - `__tests__/sessionManager.test.ts` - 测试

### Task 4: 实现 Agent Loop Runtime
- **目录**: `packages/agent-core/src/runtime/`
- **当前状态**: 只有 `.gitkeep`，为空
- **需要实现**:
  - `agentLoop.ts` - AgentLoop 类（observe → plan → execute → verify → report）
  - `types.ts` - AgentLoop 类型定义
  - `stuckDetection.ts` - 卡住检测逻辑
  - `__tests__/agentLoop.test.ts` - 测试

## 执行顺序
1. Task 1（依赖清理）
2. Task 3（Session 管理）
3. Task 4（Agent Loop）

## 验收标准
- [ ] `pnpm install` 成功
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 通过（新增测试）
- [ ] 无 LangGraph/Vercel AI SDK 新依赖引入
