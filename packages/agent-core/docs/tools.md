# Tool Interface

EATA's tool system provides a unified interface for all agent capabilities — browser automation, Electron control, and code execution. Tools are registered in a `ToolRegistry` and invoked by the agent loop during test execution.

## Core Interfaces

### Tool

Every tool implements the `Tool` interface:

```typescript
interface Tool {
  readonly name: string;
  readonly description: string;
  readonly schema: ZodSchema<any>;
  
  invoke(params: any): Promise<ToolResult>;
}
```

| Field | Description |
|-------|-------------|
| `name` | Unique tool identifier (e.g., `'browser_snapshot'`) |
| `description` | Human-readable description for LLM |
| `schema` | Zod schema for parameter validation |
| `invoke()` | Execute the tool with validated params |

### ToolResult

All tool invocations return a `ToolResult`:

```typescript
interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
}
```

### ToolRegistry

The registry manages tool registration, lookup, and invocation:

```typescript
interface ToolRegistry {
  readonly tools: Map<string, Tool>;
  
  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  invoke(name: string, params: any): Promise<ToolResult>;
  streamInvoke(name: string, params: any): AsyncIterable<ToolStreamChunk>;
}
```

## Tool Registry Usage

### Creating a Registry

```typescript
import { ToolRegistry, CDPClient } from '@eata/agent-core';

// Create with CDP client
const client = new CDPClient();
const registry = ToolRegistry.withCDP(client);

// Or create empty and register manually
const registry = new ToolRegistry();
registry.register(myCustomTool);
```

### Registering Tools

```typescript
// Register a single tool
registry.register(myTool);

// Register all CDP tools at once
registry.registerCDPTools(cdpClient);

// Register an array of tools
registry.registerAll([tool1, tool2, tool3]);
```

### Invoking Tools

```typescript
// Synchronous invocation (validates params, catches errors)
const result = await registry.invoke('browser_click', {
  selector: '[data-testid="submit"]',
  button: 'left'
});

if (result.success) {
  console.log('Clicked:', result.data);
} else {
  console.error('Failed:', result.error);
}
```

### Streaming Invocation

```typescript
// Streaming for long-running tools
for await (const chunk of registry.streamInvoke('cdp_launch', params)) {
  switch (chunk.type) {
    case 'progress':
      console.log(`${chunk.percent}%: ${chunk.message}`);
      break;
    case 'data':
      console.log('Data:', chunk.payload);
      break;
    case 'done':
      console.log('Result:', chunk.result);
      break;
    case 'error':
      console.error('Error:', chunk.error);
      break;
  }
}
```

## 12 CDP Tools

EATA provides 12 tools built on Chrome DevTools Protocol (CDP), categorized into Browser (7) and Electron (5) tools.

### Browser Tools (7)

#### 1. `browser_snapshot`

Take an accessibility snapshot or screenshot.

```typescript
await registry.invoke('browser_snapshot', {
  format: 'aria',        // 'aria' (accessibility tree) or 'screenshot'
  sessionId: 'session-1' // optional: target specific CDP session
});
```

- **CDP method**: `Accessibility.getFullAXTree` or `Page.captureSnapshot`
- **Returns**: `{ success: true, data: { ... } }`

#### 2. `browser_click`

Click an element.

```typescript
await registry.invoke('browser_click', {
  selector: '[data-testid="button"]',
  button: 'left',       // 'left', 'right', 'middle'
  clickCount: 1,        // 1 = single, 2 = double
  timeout: 5000         // optional: timeout in ms
});
```

- **CDP method**: `Input.dispatchMouseEvent`
- **Returns**: `{ success: true, data: { clicked: true, selector: '...' } }`

#### 3. `browser_type`

Type text into an input element.

```typescript
await registry.invoke('browser_type', {
  selector: 'input[name="email"]',
  text: 'test@example.com',
  clear: true,           // clear existing content first
  delay: 50              // optional: ms between keystrokes
});
```

- **CDP method**: `Input.insertText`
- **Returns**: `{ success: true, data: { typed: true, selector: '...', text: '...' } }`

#### 4. `browser_navigate`

Navigate to a URL.

```typescript
await registry.invoke('browser_navigate', {
  url: 'https://example.com',
  waitUntil: 'load',    // 'load', 'domcontentloaded', 'networkidle'
  timeout: 30000
});
```

- **CDP method**: `Page.navigate`
- **Returns**: `{ success: true, data: { navigated: true, url: '...' } }`

#### 5. `browser_press_key`

Press a keyboard key.

```typescript
await registry.invoke('browser_press_key', {
  key: 'Enter',
  selector: 'input#search' // optional: focus this element first
});
```

- **CDP method**: `Input.dispatchKeyEvent`
- **Returns**: `{ success: true, data: { keyPressed: 'Enter' } }`

#### 6. `browser_hover`

Hover over an element.

```typescript
await registry.invoke('browser_hover', {
  selector: '[data-testid="menu-item"]',
  timeout: 5000
});
```

- **CDP method**: `Input.dispatchMouseEvent` (mouseMoved)
- **Returns**: `{ success: true, data: { hovered: true, selector: '...' } }`

#### 7. `browser_drag`

Drag an element from source to target.

```typescript
await registry.invoke('browser_drag', {
  sourceSelector: '.draggable',
  targetSelector: '.dropzone',
  timeout: 10000
});
```

- **CDP method**: `Input.dispatchMouseEvent` (drag sequence)
- **Returns**: `{ success: true, data: { dragged: true, from: '...', to: '...' } }`

### Electron Tools (5)

#### 8. `cdp_launch`

Launch an Electron application and establish a CDP connection.

```typescript
await registry.invoke('cdp_launch', {
  appPath: '/path/to/electron-app',
  args: ['--no-sandbox'],
  cdpPort: 9222,
  env: { NODE_ENV: 'test' }
});
```

- **Returns**: `{ success: true, data: { launched: true, appPath: '...', sessionId: '...' } }`

#### 9. `cdp_close`

Close a running Electron application and disconnect CDP.

```typescript
await registry.invoke('cdp_close', {
  force: false,
  timeout: 10000
});
```

- **Returns**: `{ success: true, data: { closed: true } }`

#### 10. `cdp_execute_main`

Execute JavaScript code in the Electron main process.

```typescript
await registry.invoke('cdp_execute_main', {
  code: 'require("electron").app.getVersion()',
  timeout: 5000
});
```

- **CDP method**: `Runtime.evaluate`
- **Returns**: `{ success: true, data: { result: '...' } }`

#### 11. `cdp_trigger_ipc`

Trigger an IPC event on a channel.

```typescript
// Fire-and-forget
await registry.invoke('cdp_trigger_ipc', {
  channel: 'open-file',
  payload: { path: '/tmp/test.txt' },
  expectResponse: false
});

// Wait for response
await registry.invoke('cdp_trigger_ipc', {
  channel: 'get-user-data',
  expectResponse: true,
  timeout: 5000
});
```

- **Returns**: `{ success: true, data: { channel: '...', result: ... } }`

#### 12. `cdp_mock_dialog`

Mock a native dialog (alert, confirm, prompt).

```typescript
await registry.invoke('cdp_mock_dialog', {
  type: 'confirm',
  response: true,       // auto-accept
  dismiss: false        // set to true to dismiss
});

// For prompt dialogs
await registry.invoke('cdp_mock_dialog', {
  type: 'prompt',
  response: 'user-input-text'
});
```

- **CDP method**: `Page.handleJavaScriptDialog`
- **Returns**: `{ success: true, data: { mocked: true, type: '...', response: ... } }`

## Creating Custom Tools

Implement the `Tool` interface:

```typescript
import { z } from 'zod';
import type { Tool, ToolResult } from '@eata/agent-core';

class MyCustomTool implements Tool {
  readonly name = 'my_custom_tool';
  readonly description = 'Description for the LLM';
  readonly schema = z.object({
    param1: z.string().min(1),
    param2: z.number().optional()
  });

  async invoke(params: z.infer<typeof this.schema>): Promise<ToolResult> {
    try {
      const result = await doSomething(params.param1, params.param2);
      return { success: true, data: result };
    } catch (err) {
      return { 
        success: false, 
        error: `my_custom_tool failed: ${err.message}` 
      };
    }
  }
}

// Register it
const registry = new ToolRegistry();
registry.register(new MyCustomTool());
```

## Tool Streaming

Tools that perform long-running operations can implement optional streaming:

```typescript
class LongRunningTool extends CDPTool {
  async *stream(params: any): AsyncIterable<ToolStreamChunk> {
    yield { type: 'progress', percent: 0, message: 'Starting...' };
    // ... do work in stages ...
    yield { type: 'progress', percent: 50, message: 'Halfway done' };
    // ... more work ...
    yield { type: 'done', result: { success: true, data: { ... } } };
  }
}
```
