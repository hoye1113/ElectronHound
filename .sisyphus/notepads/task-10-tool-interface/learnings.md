# Task 10: Tool Interface — Learnings

## Patterns
- Tool 接口 replaces MCP architecture with direct tool invocation
- Each tool uses Zod schema for parameter validation (defaults applied only through registry.invoke(), not direct tool.invoke())
- Context injection pattern: BrowserContext, ElectronContext, ExecutionContext interfaces enable testable tools
- BrowserTool / ElectronTool abstract base classes hold context reference, concrete tools extend them
- Factory functions (createBrowserTools, createElectronTools, createExecutionTools) create all tools for a context

## Conventions
- ES modules with `.js` import extensions
- Vitest testing with `vi.fn()` mocks
- Tool naming: snake_case for tool names (snapshot, press_key, execute_code), PascalCase for classes (SnapshotTool, PressKeyTool)

## Key Decisions
- ToolRegistry interface (types.ts) vs ToolRegistry class (registry.ts): imported with alias to avoid name collision
- Zod validation is in registry.invoke()/streamInvoke() — tools themselves just pass params through
- streamInvoke supports native streaming via optional `stream()` method on tools
- ToolResult.success/error pattern — never throws, always wraps errors

## Test Coverage
- registry: 17 tests (register, get, invoke, streamInvoke, batch ops)
- browser: 13 tests (all 7 tools + factory + error handling)
- electron: 12 tests (all 5 tools + factory + error handling)
- execution: 5 tests (execute_code + factory + error handling)
- Total: 47 tests in 4 files
