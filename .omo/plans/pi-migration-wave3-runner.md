# Pi 迁移 Wave 3: runner.ts 迁移到 Agent Loop

## 当前状态
- `runner.ts` 使用 LangGraph (`createTestGraph`)
- `loop/agentLoop.ts` 有自研 Agent Loop，但接口不兼容
- 需要创建适配器来桥接

## 任务分解

### Task 1: 创建 LLMProvider 适配器
- **文件**: `packages/agent-core/src/llm/adapter.ts`
- **功能**: 将 Vercel AI SDK 的 `generateObject` 包装为自研 `LLMProvider` 接口
- **依赖**: `provider-factory.ts`, `llm.ts`

### Task 2: 创建 ToolRegistry 适配器
- **文件**: `packages/agent-core/src/tools/adapter.ts`
- **功能**: 将现有 `ToolRegistry` 包装为 AgentLoop 需要的 `ToolRegistry` 接口
- **依赖**: `tools/registry.ts`

### Task 3: 创建 RunTestResult 类型
- **文件**: `packages/agent-core/src/runner-types.ts`
- **功能**: 定义新的返回类型，兼容旧接口

### Task 4: 重写 runner.ts
- **文件**: `packages/agent-core/src/runner.ts`
- **功能**: 使用 AgentLoop 替代 LangGraph
- **保持**: 相同的 `RunTestOptions` 接口

### Task 5: 更新调用者
- **文件**: `packages/agent-core/src/cli.ts`, `worker-entry.ts`
- **功能**: 适配新的返回类型

## 验收标准
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 通过
- [ ] `runTest` 函数签名保持不变
