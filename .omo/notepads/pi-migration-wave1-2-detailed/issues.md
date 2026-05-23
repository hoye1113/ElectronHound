# Issues Found - Scope Fidelity Check

## Task 5: Missing required test file
- **File**: `packages/agent-core/src/runtime/__tests__/agentLoop.test.ts` is MISSING
- **Plan requirement**: "创建 `packages/agent-core/src/runtime/__tests__/agentLoop.test.ts`: 测试循环执行, 测试步骤转换, 测试错误处理"
- **Acceptance criterion**: "测试覆盖所有方法"
- **Status**: FAIL — no test file exists for the new runtime AgentLoop
- **Note**: Existing agentLoop tests at `src/__tests__/agentLoop.test.ts` and `src/loop/__tests__/agentLoop.test.ts` test the OLD `loop/agentLoop.ts`, not the new `runtime/agentLoop.ts`

## Latent: Broken test file
- **File**: `packages/agent-core/src/__tests__/llm.test.ts`
- **Issue**: Still imports/mocks `ai` and `@ai-sdk/openai`, but the new `llm.ts` no longer uses these. Test likely fails at runtime.
- **Mitigation**: `tsconfig.json` now excludes `src/**/__tests__` from compilation
- **Severity**: Low (pre-existing test, excluded from build, not part of migration scope)
