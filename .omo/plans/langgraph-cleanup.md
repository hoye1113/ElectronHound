# LangGraph Cleanup: 全面清理残留引用

## TL;DR

> **Quick Summary**: 清理 Wave 4 完成后遗留的 LangGraph 引用，包括 README.md 更新、docs 文档更新、代码注释清理。
>
> **Estimated Effort**: Short (30 min)
> **Parallel Execution**: NO - sequential
> **Critical Path**: README → docs → comments

---

## Context

### Original Request
用户确认按顺序执行三个清理计划：
1. 更新 README.md (2 处)
2. 更新所有过时的 docs 文件 (5 个文件)
3. 清理代码注释 (4 个文件)

### Previous Work
- Wave 4 已完成：`packages/agent-core` 不再依赖 `@langchain/langgraph`
- 但 README、docs 和代码注释中仍有 LangGraph 引用

---

## Work Objectives

### Core Objective
消除所有过时的 LangGraph 引用，使文档与实际架构一致。

### Must Have
- README.md 第 3 行和第 78 行已更新
- 5 个 docs 文件已更新（无 LangGraph 引用）
- 4 个代码文件的注释已清理

### Must NOT Have
- 不修改任何业务逻辑
- 不修改 `.sisyphus/` 目录
- 不修改 node_modules/

---

## Execution Strategy

```
Step 1: README.md 更新
Step 2: docs/*.md 更新 (5 文件)
Step 3: 代码注释清理 (4 文件)
```

---

## TODOs

### Step 1: README.md 更新

- [x] 1. README.md - 更新第 3 行
- [x] 2. README.md - 更新第 78 行

  **What to do**: Edit `README.md` line 78:
  - 旧: `LangGraph test graph, LLM integration`
  - 新: `Agent loop runtime, LLM providers, test execution nodes`

### Step 2: docs/*.md 更新

- [x] 3. docs/index.md - 移除 LangGraph 引用
- [x] 4. docs/architecture.md - 更新 LangGraph 引用
- [x] 5. docs/api.md - 更新 LangGraph 引用
- [x] 6. docs/quickstart.md - 更新 LangGraph 引用
- [x] 7. docs/sessions.md - 更新 LangGraph 引用

  **What to do**: 读取 `packages/agent-core/docs/sessions.md`，替换 LangGraph checkpointer 相关描述

### Step 3: 代码注释清理

- [x] 8. loop/agentLoop.ts - 清理注释
- [x] 9. runtime/agentLoop.ts - 清理注释
- [x] 10. runner-types.ts - 清理注释
- [x] 11. workerManager.ts - 清理注释

---

## Success Criteria

```bash
grep -n "langgraph\|langchain" packages/agent-core/docs/*.md  # Expected: 0 matches
grep -n "langgraph\|langchain" packages/agent-core/src/loop/*.ts  # Expected: 0 matches
grep -n "langgraph\|langchain" packages/agent-core/src/runtime/*.ts  # Expected: 0 matches
grep -n "langgraph\|langchain" packages/agent-core/src/runner-types.ts  # Expected: 0 matches
grep -n "langgraph\|langchain" apps/server/src/services/workerManager.ts  # Expected: 0 matches
grep -n "langgraph\|langchain" README.md  # Expected: 0 matches
```