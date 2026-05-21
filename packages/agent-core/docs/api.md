# API Reference

Complete reference for all public APIs exported from `@eata/agent-core`.

## Graph and State

### `createTestGraph(options?)`

Create a LangGraph `StateGraph` for test execution.

```typescript
import { createTestGraph } from '@eata/agent-core';

const graph = createTestGraph({
  plan: { temperature: 0.2 },
  verify: { strictness: 'medium' }
});
```

**Parameters:**
- `options.plan` — PlanNode options
- `options.verify` — VerifyNode options

**Returns:** `StateGraph<TestState>` — A LangGraph state graph.

---

### `createCheckpointer()`

Create a checkpointer for session persistence.

```typescript
import { createCheckpointer } from '@eata/agent-core';

const checkpointer = createCheckpointer();
```

---

### `runTest(options)`

Run a complete test execution.

```typescript
import { runTest } from '@eata/agent-core';

const result = await runTest({
  goal: 'Test login flow',
  targetAppPath: '/path/to/app',
  llmModel: 'gpt-4o',
  maxSteps: 30
});
```

**RunTestOptions:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `goal` | `string` | Yes | Natural language test goal |
| `targetAppPath` | `string` | Yes | Path to Electron app |
| `llmModel` | `string` | No | LLM model (default: `'gpt-4o'`) |
| `maxSteps` | `number` | No | Max execution steps (default: 50) |
| `taskId` | `string` | No | Task identifier |

---

### `TestState`

LangGraph annotation for the test state object.

```typescript
import { TestState } from '@eata/agent-core';

// Fields: goal, targetAppPath, llmModel, maxSteps, history,
//         currentObservation, currentPlan, currentExecResult,
//         currentVerdict, stepCount, stuckCounter, status,
//         lastObservationHash
```

## MCP Client

### `getMCPClient()` / `setMCPClient(client)`

Get/set the MCP client singleton.

```typescript
import { getMCPClient, setMCPClient, MCPClient } from '@eata/agent-core';

const client = new MCPClient();
setMCPClient(client);
const current = getMCPClient();
```

## Guards

### `guardObservation(result)`

Validate observation result format.

```typescript
import { guardObservation, GuardError } from '@eata/agent-core';

try {
  guardObservation(observationResult);
} catch (e) {
  if (e instanceof GuardError) {
    console.error('Invalid observation:', e.message);
  }
}
```

### `guardPlan(result)`

Validate plan result format.

### `guardExecResult(result)`

Validate execution result format.

### `guardVerdict(result)`

Validate verdict result format.

## Nodes

### `observeNode`

Observation node for the agent loop. Captures current state of the target application.

### `createPlanNode(options?)`

Factory that creates a plan node with configurable options.

### `executeNode`

Execution node. Invokes tools based on the plan.

### `createVerifyNode(options?)`

Factory that creates a verification node with configurable options.

### `abortNode`

Abort node. Called when the test cannot continue.

### `reportNode`

Report node. Generates the final test report.

## Report Graph

### `createReportGraph(options?)`

Create a report generation graph.

### `ReportState`

Annotation for report state.

### Node Factories

```typescript
import {
  createSafetyNode,
  createPerformanceNode,
  createAccessibilityNode,
  createPatternNode,
  createSummarizeNode,
  PatternStore,
} from '@eata/agent-core';
```

## Configuration (v0.3)

### `loadProvidersConfig()`

Load provider configuration from `~/.eata/providers.json`.

### `saveProvidersConfig(config)`

Save provider configuration.

### `addProvider(config)`

Add a new provider configuration.

### `updateProvider(id, updates)`

Update an existing provider.

### `deleteProvider(id)`

Delete a provider configuration.

### `setActiveProvider(id)`

Set the default active provider.

### `getActiveProviderConfig()`

Get the currently active provider configuration.

## Provider Factory

### `createProviderInstance(config)`

Create an LLM provider instance from configuration.

### `getGenerateObjectForProvider(provider)`

Get the `generateObject` function for a specific provider.

## Provider Types

### `LLMProviderConfig`

```typescript
interface LLMProviderConfig {
  id: string;
  name: string;
  type: 'openai-compatible';
  apiKey: string;
  baseURL: string;
  model: string;
  enabled?: boolean;
}
```

### `ProvidersConfig`

```typescript
interface ProvidersConfig {
  version: number;
  providers: LLMProviderConfig[];
  activeId: string;
  taskLevel?: { [taskId: string]: string };
}
```

### `BUILTIN_TEMPLATES`

Pre-defined provider templates for OpenAI, DeepSeek, Qwen, and Groq.

## Sub-Agents

### Classes

| Class | Description |
|-------|-------------|
| `TestPlanner` | Plans test strategies from goals |
| `ExecutionAnalyst` | Analyzes execution results |
| `SecurityReviewer` | Reviews security implications |
| `ReportSynthesizer` | Synthesizes final reports |

### `runAuditChain(subAgents)`

Run the audit chain through sub-agents.

### Types

```typescript
type SubAgentRole = 'planner' | 'analyst' | 'reviewer' | 'synthesizer';

interface SubAgentInput { /* ... */ }
interface SubAgentOutput { /* ... */ }
interface AuditReport { /* ... */ }
interface AuditFinding { /* ... */ }
interface AuditChainResult { /* ... */ }
```

## Few-Shot Examples

### `loadExamples()`

Load few-shot examples for prompt augmentation.

## CDP Tools

### CDPClient

```typescript
import { CDPClient } from '@eata/agent-core';

const client = new CDPClient();

// Connect
await client.connect({ port: 9222, targetType: 'browser' });

// Send commands
const result = await client.sendCommand('Page.navigate', { url: 'https://...' });

// Sessions
const session = await client.createSession(targetId, 'page');
await client.closeSession(sessionId);
const all = client.listSessions();

// Disconnect
await client.disconnect();
```

### CDPTool

Abstract base class for all CDP tools.

### CDPTool Classes

| Class | Tool Name |
|-------|-----------|
| `BrowserSnapshotTool` | `browser_snapshot` |
| `BrowserClickTool` | `browser_click` |
| `BrowserTypeTool` | `browser_type` |
| `BrowserNavigateTool` | `browser_navigate` |
| `BrowserPressKeyTool` | `browser_press_key` |
| `BrowserHoverTool` | `browser_hover` |
| `BrowserDragTool` | `browser_drag` |
| `CDPLaunchTool` | `cdp_launch` |
| `CDPCloseTool` | `cdp_close` |
| `CDPExecuteMainTool` | `cdp_execute_main` |
| `CDPTriggerIpcTool` | `cdp_trigger_ipc` |
| `CDPMockDialogTool` | `cdp_mock_dialog` |

### `createCDPTools(client)`

Create all 12 CDP tools for a given CDPClient.

## CDP Types

### `CDPConfig`

Configuration for CDP connection: `endpoint`, `host`, `port`, `timeout`, `targetType`.

### `CDPSessionInfo`

Session information: `sessionId`, `targetId`, `type`.

### `CDPRawResult`

Raw CDP command result: `result`, `error`.

### `CDPContext`

CDP abstraction: `connect()`, `disconnect()`, `sendCommand()`, `createSession()`, `closeSession()`, `listSessions()`.

## Compaction

See [compaction.md](compaction.md), [cut-point.md](cut-point.md), [split-turn.md](split-turn.md), [summary-generation.md](summary-generation.md), [branch-summarization.md](branch-summarization.md), [file-tracking.md](file-tracking.md).
