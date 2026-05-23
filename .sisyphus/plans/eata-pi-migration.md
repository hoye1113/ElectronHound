# EATA 迁移到 Pi 框架 - 完整重写计划

## TL;DR

> **Quick Summary**: 将 EATA 从 LangGraph + Vercel AI SDK 架构完全迁移到 `earendil-works/pi` 自研框架，借鉴 Pi 52.2k stars 项目的成熟实现（compaction/agent loop/Tool 接口），获得完整的上下文管理能力。
> 
> **Deliverables**:
> - 自研 TypeScript Agent Loop runtime（借鉴 Pi 的 compaction.md）
> - 自研 Tool 接口（替代 MCP）
> - 完整的 Compaction + Branch Summarization 实现
> - 统一多 Provider LLM API（借鉴 pi-ai）
> - 保持 Electron 测试场景兼容
> 
> **Estimated Effort**: 6-8 周（单人）
> **Parallel Execution**: YES - 4 waves, max 3 concurrent
> **Critical Path**: W1(Package Split) → W2(Compaction Core) → W3(Agent Loop) → W4(Tool Migration) → F1-F4

---

## Context

### Original Request
将 EATA 的 Agent Loop 架构从 LangGraph v0.3 + Vercel AI SDK 6.0 迁移到 `earendil-works/pi` 自研框架，借鉴 Pi 项目（52.2k stars）成熟的 compaction 实现。

### Decision Summary
经过对 Pi 项目（compaction.md 394 行完整文档）的深度调研，以及 5 个关键技术选型问题的确认，决定：

1. **EATA 是独立的 Electron 测试工具** - 不需要与 LangChain 生态集成
2. **MCP 是可选的** - 可以用 Pi 的自研 Tool 接口替代
3. **时间要求正常** - 4-8 周可接受完整的重写
4. **团队能力强** - 熟悉 TypeScript 底层，能维护自研 agent loop
5. **长期独立维护** - Pi 52.2k stars 的成熟度验证了自研方向的可行性

### Research Findings
- Pi 项目有完整的 `compaction.md` 文档（394 行），详细描述了 auto-compaction + branch summarization 的触发条件、cut point 规则、split turn 处理、累积文件追踪
- Pi 的 compaction 默认 `reserveTokens = 16384`, `keepRecentTokens = 20000`，按 token 数而非消息条数，更精确
- Pi 的 summary 格式结构化（Goal/Progress/Key Decisions/Next Steps/Critical Context），包含 `<read-files>` 和 `<modified-files>` 标签
- Pi 的 agent loop 完全自研 TypeScript，无 LangGraph 依赖
- Pi 有 16 个完整文档（compaction.md, sessions.md, providers.md 等）

---

## Work Objectives

### Core Objective
完全重写 EATA 的 Agent Loop 架构，从 LangGraph + Vercel AI SDK 迁移到 `earendil-works/pi` 自研框架，获得成熟的 compaction 实现和完整的文档体系。

### Concrete Deliverables
- `packages/agent-core/src/runtime/` - 自研 agent loop runtime（替代 LangGraph）
- `packages/agent-core/src/llm/` - 统一多 Provider LLM API（替代 Vercel AI SDK）
- `packages/agent-core/src/tools/` - 自研 Tool 接口（替代 MCP）
- `packages/agent-core/src/compaction/` - 完整 Compaction + Branch Summarization 实现
- `packages/agent-core/src/session/` - Session 管理 + 持久化
- `packages/agent-core/docs/` - 完整文档体系（借鉴 Pi 的 16 个 docs）
- `packages/agent-core/src/electron/` - Electron + Playwright CDP 集成

### Definition of Done
- [ ] 624 个现有测试全部通过（适配新架构）
- [ ] Compaction 在 contextTokens > 112K（128K - 16K 预留）时自动触发
- [ ] Summary 格式符合 Pi 结构化标准
- [ ] 文件追踪累积跨越多次 compaction
- [ ] Split turn 正确处理
- [ ] Branch summarization 支持多分支导航
- [ ] Electron 应用测试场景兼容
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 通过
- [ ] 完整文档体系生成

### Must Have
- 自研 Agent Loop runtime（借鉴 Pi 的 agent-core 包）
- 完整 Compaction 实现（cut point 规则 + split turn + 累积文件追踪）
- Branch Summarization（多分支上下文保留）
- 自研 Tool 接口（替代 MCP，保持 Electron/Playwright 能力）
- 统一多 Provider LLM API（借鉴 pi-ai，支持 GPT-4o/DeepSeek/Qwen/Ollama）
- Session 管理 + SQLite 持久化（保留现有检查点数据）
- 完整文档体系（compaction.md, sessions.md, tools.md 等）
- 624 个现有测试适配新架构
- 5 条工程约束继续保留

### Must NOT Have (Guardrails)
- ❌ NO LangGraph 依赖（完全移除 `@langchain/langgraph`, `@langchain/core`）
- ❌ NO Vercel AI SDK 依赖（完全移除 `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic` 等）
- ❌ NO MCP 依赖（完全移除 MCP Server 架构）
- ❌ NO 破坏性重构影响 Electron 测试能力
- ❌ NO 过度设计（借鉴 Pi 的简洁设计哲学）
- ❌ NO AI slop（过度注释、无必要抽象、泛化命名）

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (v0.3 已有 624 个测试)
- **Automated tests**: YES (迁移后适配)
- **Framework**: Vitest 3.2.0 (保持)
- **Test Adaptation**: 重写测试以适配新架构，保持 624 个测试数量

### QA Policy
每个任务必须包含 agent-executed QA 场景：
- **Compaction 验证**: 模拟 contextTokens > 112K，验证 auto-compaction 触发
- **Summary 验证**: 验证 summary 格式符合 Pi 标准
- **Tool 验证**: 验证自研 Tool 接口能调用 Playwright CDP 和 Electron Bridge
- **Electron 测试**: 使用 fixture Electron 应用运行完整测试流程

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (基础架构 - Package 拆分):
├── Task 1: 创建新的 package 结构 [deep]
├── Task 2: 移除 LangGraph 依赖 [deep]
└── Task 3: 移除 Vercel AI SDK 依赖 [deep]

Wave 2 (Compaction Core - 核心压缩实现):
├── Task 4: Session 管理 + 持久化 [deep]
├── Task 5: Compaction 触发逻辑 [deep]
├── Task 6: Cut Point 规则 + Split Turn [deep]
└── Task 7: Summary 生成（Pi 格式）[deep]

Wave 3 (Agent Loop - 自研 runtime):
├── Task 8: 统一多 Provider LLM API [deep]
├── Task 9: 自研 Agent Loop runtime [deep]
├── Task 10: 自研 Tool 接口 [deep]
└── Task 11: Electron + Playwright CDP 集成 [deep]

Wave 4 (集成 + 文档):
├── Task 12: 测试适配（624 个测试重写）[deep]
├── Task 13: Branch Summarization [deep]
├── Task 14: 累积文件追踪 [deep]
└── Task 15: 完整文档体系生成 [deep]

Wave FINAL (验证):
├── F1: Plan Compliance Audit [oracle]
├── F2: Code Quality Review [unspecified-high]
├── F3: Real Manual QA [unspecified-high]
└── F4: Scope Fidelity Check [deep]
→ Present results → Get explicit user okay

Critical Path: W1 → W2 → W3 → W4 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 3 (Wave 2)
```

### Agent Dispatch Summary

- **Wave 1**: 3 tasks - all `deep` (架构拆分, 依赖清理)
- **Wave 2**: 4 tasks - all `deep` (Compaction 核心)
- **Wave 3**: 4 tasks - all `deep` (Agent Loop + Tools)
- **Wave 4**: 4 tasks - all `deep` (测试 + 文档)
- **FINAL**: 4 tasks - `oracle`, `unspecified-high`, `unspecified-high`, `deep`

---

## TODOs

### Wave 1: 基础架构 - Package 拆分

- [ ] 1. 创建新的 Package 结构

  **What to do**:
  - 创建 `packages/agent-core/src/runtime/` 目录
  - 创建 `packages/agent-core/src/llm/` 目录
  - 创建 `packages/agent-core/src/tools/` 目录
  - 创建 `packages/agent-core/src/compaction/` 目录
  - 创建 `packages/agent-core/src/session/` 目录
  - 创建 `packages/agent-core/src/electron/` 目录
  - 创建 `packages/agent-core/docs/` 目录
  - 更新 `package.json` 移除 LangGraph、Vercel AI SDK、MCP 依赖
  - 添加新的依赖（如果有）

  **Must NOT do**:
  - 不要删除现有测试文件（后续适配）
  - 不要修改现有 fixture Electron 应用
  - 不要修改现有 SQLite 检查点数据格式

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 架构拆分需要深入理解现有依赖关系
  - **Skills**: []
    - 标准 TypeScript monorepo 操作

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Wave 2 全部任务
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] 所有新目录创建
  - [ ] `package.json` 移除 LangGraph 依赖
  - [ ] `package.json` 移除 Vercel AI SDK 依赖
  - [ ] `pnpm install` 成功
  - [ ] `pnpm typecheck` 失败（预期，因为代码需要重写）

  **QA Scenarios**:
  ```
  Scenario: Package 结构验证
    Tool: Bash (pnpm)
    Steps:
      1. 运行 `pnpm install`
      2. 验证所有新目录存在
      3. 验证旧依赖已移除
      4. 运行 `pnpm typecheck`（预期失败）
    Expected Result: 安装成功，结构正确，类型检查失败（预期）
    Evidence: .sisyphus/evidence/task-1-package-structure.txt
  ```

  **Commit**: YES
  - Message: `refactor: remove LangGraph + Vercel AI SDK, create new package structure`
  - Files: `packages/agent-core/package.json`, 新目录

---

### Wave 2: Compaction Core - 核心压缩实现

- [ ] 4. Session 管理 + 持久化

  **What to do**:
  - 实现 `SessionManager` 类
  - 创建 Session 条目类型（`SessionEntry`, `CompactionEntry`, `BranchSummaryEntry`）
  - 实现 Session 持久化（SQLite）
  - 实现 `serializeConversation()`（将 messages 序列化为文本）
  - 实现 `extractFileOperations()`（从 messages 中提取文件操作）
  - 兼容现有 SQLite 检查点数据格式

  **Reference**:
  - Pi 项目 `session-manager.ts`

  **Acceptance Criteria**:
  - [ ] `SessionManager` 实现所有必要方法
  - [ ] 现有 SQLite 数据兼容
  - [ ] `pnpm test` 中 Session 相关测试通过

  **QA Scenarios**:
  ```
  Scenario: Session 持久化验证
    Tool: Bash (vitest)
    Steps:
      1. 创建新 Session
      2. 添加多个 entries
      3. 序列化 conversation
      4. 验证 SQLite 持久化
    Expected Result: 所有操作成功
  ```

- [ ] 5. Compaction 触发逻辑

  **What to do**:
  - 实现 `shouldCompact(totalTokens, contextWindow)`：
    ```typescript
    export function shouldCompact(totalTokens: number, contextWindow: number): boolean {
      const reserveTokens = 16384; // 固定预留
      return totalTokens > contextWindow - reserveTokens;
    }
    ```
  - 实现 `findCutPoint(messages, keepRecentTokens)`：
    - 从后往前遍历，累积 token 直到达到 keepRecentTokens
    - 返回 cut point 索引
  - 实现 `extractMessagesToFitBudget(messages, budget)`

  **Reference**:
  - Pi 项目 `compaction.ts` 的 `prepareCompaction()` 函数

  **Acceptance Criteria**:
  - [ ] 触发条件正确（contextTokens > contextWindow - 16384）
  - [ ] cut point 正确（保留最近 20K tokens）
  - [ ] 预算提取正确

- [ ] 6. Cut Point 规则 + Split Turn

  **What to do**:
  - 实现 cut point 规则：
    - 有效 cut point: User message, Assistant message, BashExecution, Custom message
    - **禁止在 Tool Result 处 cut**（必须与 Tool Call 一起）
  - 实现 Split Turn 检测：
    - 单个 turn 超过 keepRecentTokens 时
    - 生成两个 summary（history + turn prefix）并 merge
  - 实现 `isSplitTurn()` 检测

  **Reference**:
  - Pi 项目 `compaction.ts` 的 cut point 规则

  **Acceptance Criteria**:
  - [ ] cut point 规则正确
  - [ ] Split turn 检测正确
  - [ ] 两个 summary merge 逻辑正确

- [ ] 7. Summary 生成（Pi 格式）

  **What to do**:
  - 实现 `generateSummary(messages, previousSummary?, customInstructions?)`
  - Summary 格式必须严格符合 Pi 结构化标准：
    ```markdown
    ## Goal
    [What the user is trying to accomplish]

    ## Progress
    ### Done
    - [Completed tasks]

    ### In Progress
    - [Current work]

    ### Blocked
    - [Issues, if any]

    ## Key Decisions
    - **[Decision]**: [Rationale]

    ## Next Steps
    1. [What should happen next]

    ## Critical Context
    - [Data needed to continue]

    <read-files>
    path/to/file1.ts
    </read-files>

    <modified-files>
    path/to/changed.ts
    </modified-files>
    ```
  - 实现 `serializeCompactionEntry()`
  - 实现累积文件追踪

  **Reference**:
  - Pi 项目 `compaction.ts` 的 summary 格式
  - `branch-summarization.ts` 的 format

  **Acceptance Criteria**:
  - [ ] Summary 格式符合 Pi 标准
  - [ ] 累积文件追踪正确
  - [ ] LLM 调用成功（或 mock 通过）

---

### Wave 3: Agent Loop - 自研 Runtime

- [ ] 8. 统一多 Provider LLM API

  **What to do**:
  - 实现 `LLMProvider` 接口
  - 实现 `OpenAIProvider`, `AnthropicProvider`, `GoogleProvider`, `OllamaProvider`
  - 实现 `createProvider()` 工厂函数
  - 借鉴 pi-ai 的统一接口设计

  **Reference**:
  - Pi 项目 `packages/ai/` 包
  - 现有 EATA `llm.ts` 的实现（可以参考）

  **Acceptance Criteria**:
  - [ ] 4 个 provider 实现
  - [ ] 接口统一
  - [ ] 现有测试适配

- [ ] 9. 自研 Agent Loop Runtime

  **What to do**:
  - 实现 `AgentLoop` 类
  - 实现 `runTest()` 入口函数
  - 实现 observe → plan → execute → verify → report 的循环
  - 实现 stuck 检测、escalation 逻辑
  - 集成 Compaction（在每次 iteration 前后）

  **Reference**:
  - Pi 项目 `packages/agent/` 的 agent loop 实现
  - 现有 EATA `graph.ts` 的逻辑（参考）

  **Acceptance Criteria**:
  - [ ] observe/plan/execute/verify/report 循环正确
  - [ ] Compaction 集成正确
  - [ ] 现有逻辑兼容

- [ ] 10. 自研 Tool 接口

  **What to do**:
  - 实现 `Tool` 接口
  - 实现 `ToolRegistry`（工具注册表）
  - 实现 13 个现有工具：
    - Browser tools: snapshot, click, type, navigate, press_key, hover, drag
    - Electron tools: launch, close, execute_main, trigger_ipc, mock_dialog
    - Execution tools: execute_code
  - 借鉴 Pi 的 Tool 接口设计

  **Reference**:
  - Pi 项目 Tool 接口设计
  - 现有 EATA MCP 工具定义（参考）

  **Acceptance Criteria**:
  - [ ] `Tool` 接口定义
  - [ ] 13 个工具实现
  - [ ] 现有 Electron + Playwright 能力保留

- [ ] 11. Electron + Playwright CDP 集成

  **What to do**:
  - 实现 Electron 应用的 CDP 连接
  - 实现 Playwright CDP 集成（替代 MCP）
  - 实现 Electron Bridge 的直接调用
  - 保留所有现有 Electron 测试能力

  **Reference**:
  - 现有 EATA `mcp/client.ts`（参考）
  - Playwright CDP 文档

  **Acceptance Criteria**:
  - [ ] Electron CDP 连接成功
  - [ ] Playwright CDP 集成成功
  - [ ] 现有 Electron 应用测试通过

---

### Wave 4: 集成 + 文档

- [ ] 12. 测试适配（624 个测试重写）

  **What to do**:
  - 重写 `__tests__/` 目录下的所有测试
  - 适配新的 Agent Loop runtime
  - 适配新的 Tool 接口
  - 保持 624 个测试数量
  - 新增 Compaction 相关测试

  **Acceptance Criteria**:
  - [ ] 624 个测试通过
  - [ ] 新增 Compaction 测试
  - [ ] 无测试失败

- [ ] 13. Branch Summarization

  **What to do**:
  - 实现 `BranchSummarization`
  - 实现 `/tree` 导航时的上下文保留
  - 实现累积文件追踪跨多次 compaction
  - 实现 `BranchSummaryEntry` 类型

  **Reference**:
  - Pi 项目 `branch-summarization.ts`

  **Acceptance Criteria**:
  - [ ] Branch summarization 触发正确
  - [ ] 累积文件追踪正确
  - [ ] 多分支导航上下文保留正确

- [ ] 14. 累积文件追踪

  **What to do**:
  - 实现跨多次 compaction 的文件追踪
  - 在 `CompactionEntry.details` 中存储 readFiles/modifiedFiles
  - 在每次 summary 生成时累积文件列表

  **Acceptance Criteria**:
  - [ ] 累积追踪正确
  - [ ] 跨 compaction 文件列表保留

- [ ] 15. 完整文档体系生成

  **What to do**:
  - 创建完整文档体系（借鉴 Pi 的 16 个 docs）：
    - `compaction.md` - Compaction 策略（394 行标准）
    - `sessions.md` - Session 管理
    - `tools.md` - Tool 接口
    - `providers.md` - 多 Provider 配置
    - `electron.md` - Electron 集成
    - `playwright.md` - Playwright CDP 集成
    - `architecture.md` - 整体架构
    - `quickstart.md` - 快速开始
    - `api.md` - API 参考
    - 等等
  - 每个文档至少 100 行
  - 提供完整示例

  **Reference**:
  - Pi 项目 `packages/coding-agent/docs/` 目录

  **Acceptance Criteria**:
  - [ ] 16 个文档创建
  - [ ] 每个文档至少 100 行
  - [ ] 提供完整示例
  - [ ] 文档与实际实现一致

---

### Wave FINAL: 验证

- [ ] F1. Plan Compliance Audit [oracle]

  **What to do**:
  - 读取完整计划
  - 对照每个 "Must Have" 验证实现存在
  - 对照每个 "Must NOT Have" 验证禁止模式未出现
  - 验证测试数量（624 个测试）
  - 输出：`Must Have [N/N] | Must NOT Have [N/N] | Tests [N/N] | VERDICT`

  **VERDICT criteria**:
  - APPROVE: 全部 Must Have 存在 + 全部 Must NOT Have 不存在 + 624 测试通过
  - REJECT: 任何一项不满足

- [ ] F2. Code Quality Review [unspecified-high]

  **What to do**:
  - 运行 `pnpm typecheck`
  - 运行 `pnpm lint`（如果配置了）
  - 运行 `pnpm test`
  - 审查所有改动文件：
    - 检查 `as any` / `@ts-ignore`
    - 检查 empty catch
    - 检查 console.log in prod
    - 检查 AI slop
  - 输出：`Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

  **VERDICT criteria**:
  - APPROVE: Build + Tests + 0 个 Required 问题
  - REJECT: 任何 Required 问题

- [ ] F3. Real Manual QA [unspecified-high]

  **What to do**:
  - 使用 fixture Electron 应用运行完整测试流程
  - 验证 Compaction 在实际场景中的表现：
    - 创建任务 → 运行多次工具调用 → 观察 compaction 触发
    - 验证 summary 质量
    - 验证文件追踪
  - 验证 Electron 测试能力：
    - 启动 fixture Electron 应用
    - 运行 CDP 连接
    - 运行工具调用
  - 输出：`Compaction [PASS/FAIL] | Electron [PASS/FAIL] | End-to-End [PASS/FAIL] | VERDICT`

  **VERDICT criteria**:
  - APPROVE: 全部 PASS
  - REJECT: 任何 FAIL

- [ ] F4. Scope Fidelity Check [deep]

  **What to do**:
  - 对照每个 TODO 任务验证实际改动
  - 验证无范围蔓延：
    - 检查是否有超出 15 个 TODO 的改动
    - 检查是否有未授权的依赖
  - 验证无破坏性变更：
    - 检查 fixture Electron 应用是否被修改
    - 检查 SQLite 检查点格式是否被破坏
  - 输出：`Tasks [N/N in scope] | Scope Creep [N/N] | Regressions [0 confirmed] | VERDICT`

  **VERDICT criteria**:
  - APPROVE: 15 任务全部 in scope + 无 creep + 无回归
  - REJECT: 任何任务 out of scope 或有回归

---

## Commit Strategy

- **Task 1**: `refactor: remove LangGraph + Vercel AI SDK, create new package structure`
- **Task 2**: `refactor: remove LangGraph dependency completely`
- **Task 3**: `refactor: remove Vercel AI SDK dependency completely`
- **Task 4**: `feat(compaction): implement Session management + SQLite persistence`
- **Task 5**: `feat(compaction): implement auto-compaction trigger logic`
- **Task 6**: `feat(compaction): implement cut point rules + split turn detection`
- **Task 7**: `feat(compaction): implement summary generation (Pi format)`
- **Task 8**: `feat(llm): implement unified multi-provider LLM API`
- **Task 9**: `feat(agent): implement custom agent loop runtime`
- **Task 10**: `feat(tools): implement custom Tool interface`
- **Task 11**: `feat(electron): implement Electron + Playwright CDP integration`
- **Task 12**: `test: adapt 624 tests for new architecture`
- **Task 13**: `feat(compaction): implement branch summarization`
- **Task 14**: `feat(compaction): implement cumulative file tracking`
- **Task 15**: `docs: generate complete documentation system`

---

## Success Criteria

### Verification Commands

```bash
# 架构验证
pnpm install              # Expected: success (no LangGraph/Vercel AI SDK)
pnpm typecheck            # Expected: pass

# Compaction 验证
pnpm test compaction      # Expected: all pass
# 手动触发 compaction:
# 1. 启动 agent
# 2. 连续 30 次工具调用（每次 3K tokens）
# 3. 观察 compaction 自动触发
# 4. 检查 summary 格式

# Electron 验证
pnpm test electron        # Expected: all pass
# 1. 启动 fixture Electron 应用
# 2. 运行 CDP 连接测试
# 3. 运行工具调用测试

# 完整测试
pnpm test                 # Expected: 624 passed, 0 failed
```

### Final Checklist

- [ ] LangGraph 完全移除
- [ ] Vercel AI SDK 完全移除
- [ ] MCP 完全移除
- [ ] 自研 Agent Loop 实现
- [ ] Compaction 完整实现（cut point + split turn + 文件追踪）
- [ ] Branch Summarization 完整实现
- [ ] 自研 Tool 接口实现
- [ ] 13 个工具全部实现
- [ ] Electron + Playwright CDP 集成
- [ ] 624 个测试通过
- [ ] 完整文档体系生成
- [ ] 无 scope creep
- [ ] 无回归

---

## Key Differences from v3 Plan

| Aspect | v3 (Based on LangGraph) | v4 (Migrate to Pi) |
|--------|-------------------------|-------------------|
| **Agent Loop** | LangGraph v0.3 StateGraph | 自研 TypeScript runtime |
| **LLM API** | Vercel AI SDK 6.0 | 自研统一 API |
| **Tool 接口** | MCP 协议 | 自研 Tool 接口 |
| **Compression** | 三级压缩（80%/93%/95%） | Compaction + Branch Summarization（借鉴 Pi） |
| **Documentation** | 无 | 16 个完整文档 |
| **Trigger** | 比例阈值（80%/93%/95%） | 固定 token 预留（16384）+ keepRecentTokens（20000） |
| **Summary 格式** | Schema 约束 | Pi 结构化格式（Goal/Progress/Next Steps/Critical Context + <read-files>/<modified-files>） |
| **File Tracking** | 无 | 累积跨多次 compaction |
| **Split Turn** | 无 | 完整实现（单 turn 超大时的特殊处理） |
| **Branch Summarization** | 无 | 完整实现（多分支导航时的上下文保留） |
| **Total Effort** | 8 周 | 6-8 周（更成熟方案） |
| **Key Benefit** | 快速获得压缩能力 | 获得完整成熟架构 |

---

## Final Recommendation

基于 5 个关键问题的回答和 Pi 项目的深度调研，**强烈建议执行方案 A（迁移到 Pi）**：

1. **架构清晰度** - Pi 的自研 agent loop 比 LangGraph 更简洁、更可控
2. **成熟度验证** - Pi 52.2k stars + `compaction.md` 394 行文档证明方案的成熟度
3. **长期维护** - 自研框架减少框架依赖，更可持续
4. **团队能力** - 团队强技术储备可以维护自研 loop
5. **时间要求** - 4-8 周可接受，方案 A 和方案 B 时间相当
6. **功能完整性** - 方案 A 获得的 Branch Summarization、Split Turn、累积文件追踪是方案 B 没有的

---

## Next Steps

1. **确认执行方案** - 请确认是否执行本计划
2. **立即启动 Wave 1** - 开始 Package 拆分 + 依赖清理（预计 2-4 小时）
3. **按 Wave 1-4 执行** - 共 15 个 TODO，预计 6-8 周完成
4. **FINAL 验证** - 4 个 FINAL 任务验证，预计 1-2 小时
5. **确认完成** - 请确认是否完成

---

## Plan Version

- **Version**: v4.0 (Migrate to Pi)
- **Created**: 2026-05-20
- **Author**: Prometheus (EATA planning)
- **Based on**: earendil-works/pi (52.2k stars)
- **Reference**: https://github.com/earendil-works/pi
