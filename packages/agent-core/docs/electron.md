# Electron Integration

EATA provides direct Electron integration through Chrome DevTools Protocol (CDP). The 5 Electron-specific tools enable launching, controlling, and testing Electron applications from within the agent loop.

## Architecture

```
┌──────────────┐     CDP (WebSocket)     ┌──────────────────┐
│  CDPClient   │ ◄─────────────────────▶ │  Electron App    │
│  (Agent Core)│                         │  (port 9222)     │
└──────┬───────┘                         └──────┬───────────┘
       │                                         │
       │ sendCommand()                           │ Main Process
       │                                          │
       ▼                                          ▼
 ┌──────────────┐                         ┌──────────────┐
 │  CDPTool     │                         │  Electron    │
 │  (5 tools)   │                         │  Main/Renderer│
 └──────────────┘                         └──────────────┘
```

## 5 Electron Tools

### 1. `cdp_launch`

Launch an Electron application and establish a CDP connection.

```typescript
import { CDPClient, createCDPTools, ToolRegistry } from '@eata/agent-core';

const client = new CDPClient();
const registry = ToolRegistry.withCDP(client);

await registry.invoke('cdp_launch', {
  appPath: '/path/to/electron-app',
  args: ['--no-sandbox', '--disable-gpu'],
  cdpPort: 9222,
  env: {
    NODE_ENV: 'test',
    DEBUG: 'electron:*'
  }
});
```

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `appPath` | `string` | Yes | — | Path to Electron app executable |
| `args` | `string[]` | No | `[]` | Additional command-line arguments |
| `env` | `Record<string, string>` | No | `{}` | Environment variables |
| `cdpPort` | `number` | No | `9222` | CDP debugging port |

**Returns:**
```typescript
{
  success: true,
  data: {
    launched: true,
    appPath: '/path/to/app',
    sessionId: 'cdp-1234567890-abc123'
  }
}
```

**CDP flow:**
1. Start Electron process with `--remote-debugging-port=${cdpPort}`
2. CDPClient opens WebSocket to `ws://127.0.0.1:${cdpPort}/devtools/browser/...`
3. Session is established and registered

### 2. `cdp_close`

Close a running Electron application and disconnect CDP.

```typescript
await registry.invoke('cdp_close', {
  force: false,
  timeout: 10000
});
```

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `force` | `boolean` | No | `false` | Force-kill the process |
| `timeout` | `number` | No | — | Timeout before force-kill (ms) |

**Returns:**
```typescript
{
  success: true,
  data: { closed: true }
}
```

### 3. `cdp_execute_main`

Execute JavaScript code in the Electron main process.

```typescript
// Get app version
const result = await registry.invoke('cdp_execute_main', {
  code: 'require("electron").app.getVersion()',
  timeout: 5000
});
// result.data.result === '1.2.3'

// Get all windows
const windows = await registry.invoke('cdp_execute_main', {
  code: `
    const { BrowserWindow } = require('electron');
    return BrowserWindow.getAllWindows().map(w => ({
      id: w.id,
      title: w.getTitle(),
      bounds: w.getBounds()
    }));
  `,
  timeout: 3000
});
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `code` | `string` | Yes | JavaScript code to execute |
| `timeout` | `number` | No | Execution timeout (ms) |

**CDP method:** `Runtime.evaluate`

**Returns:**
```typescript
{
  success: true,
  data: { result: '...' }
}
```

**Security note:** Code is executed in the main process with full Node.js access. Only use this for testing scenarios where you control the code.

### 4. `cdp_trigger_ipc`

Trigger an IPC event on a channel between main and renderer processes.

```typescript
// Fire-and-forget IPC
await registry.invoke('cdp_trigger_ipc', {
  channel: 'open-file',
  payload: { path: '/tmp/test.txt' },
  expectResponse: false
});

// Request-response IPC
const response = await registry.invoke('cdp_trigger_ipc', {
  channel: 'get-user-data',
  payload: { userId: 123 },
  expectResponse: true,
  timeout: 5000
});
// response.data.result === { name: 'John', ... }
```

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `channel` | `string` | Yes | — | IPC channel name |
| `payload` | `any` | No | `undefined` | Data to send |
| `expectResponse` | `boolean` | No | `false` | Wait for response |
| `timeout` | `number` | No | — | Timeout for response wait |

**IPC mechanism:**

When `expectResponse` is false:
```javascript
// Renderer process
ipcRenderer.send('channel-name', payload);
```

When `expectResponse` is true:
```javascript
// Renderer process
const result = await ipcRenderer.invoke('channel-name', payload);
return result;
```

**Returns:**
```typescript
{
  success: true,
  data: {
    channel: 'get-user-data',
    result: { name: 'John', ... }
  }
}
```

### 5. `cdp_mock_dialog`

Mock a native dialog (alert, confirm, prompt) so the test can auto-respond.

```typescript
// Mock confirm dialog to return true
await registry.invoke('cdp_mock_dialog', {
  type: 'confirm',
  response: true
});

// Mock prompt dialog with specific text input
await registry.invoke('cdp_mock_dialog', {
  type: 'prompt',
  response: 'John Doe'
});

// Mock alert and dismiss
await registry.invoke('cdp_mock_dialog', {
  type: 'alert',
  dismiss: true
});
```

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `type` | `'alert' \| 'confirm' \| 'prompt'` | Yes | — | Dialog type |
| `response` | `string \| boolean` | No | — | Auto-accept response |
| `dismiss` | `boolean` | No | `false` | Dismiss instead of accept |

**CDP method:** `Page.handleJavaScriptDialog`

**Returns:**
```typescript
{
  success: true,
  data: {
    mocked: true,
    type: 'confirm',
    response: true
  }
}
```

## CDP Client

The `CDPClient` manages WebSocket connections to Electron DevTools:

```typescript
import { CDPClient } from '@eata/agent-core';

const client = new CDPClient();

// Connect to a running Electron app
const session = await client.connect({
  port: 9222,
  targetType: 'electron',
  timeout: 30000
});

// Send raw CDP commands
const result = await client.sendCommand('Runtime.evaluate', {
  expression: 'process.pid',
  returnByValue: true
});

// Create additional sessions for specific targets
const rendererSession = await client.createSession(targetId, 'page');

// List active sessions
const sessions = client.listSessions();
// [{ sessionId: '...', type: 'electron-main' }, ...]

// Disconnect
await client.disconnect();
```

## CDP Session

Each `CDPSession` corresponds to a CDP target (main process, renderer, etc.):

```typescript
const session = client.getSession(sessionId);
const result = await session.sendCommand('DOM.getDocument', {});
```

## Complete Example

```typescript
import { CDPClient, createCDPTools, ToolRegistry } from '@eata/agent-core';

async function testElectronApp() {
  const client = new CDPClient();
  const registry = ToolRegistry.withCDP(client);

  try {
    // 1. Launch the app
    await registry.invoke('cdp_launch', {
      appPath: '/path/to/my-app',
      cdpPort: 9222
    });

    // 2. Take a snapshot of the UI
    const snapshot = await registry.invoke('browser_snapshot', {
      format: 'aria'
    });
    console.log('UI:', snapshot.data);

    // 3. Click a button
    await registry.invoke('browser_click', {
      selector: 'button#save'
    });

    // 4. Mock a confirm dialog
    await registry.invoke('cdp_mock_dialog', {
      type: 'confirm',
      response: true
    });

    // 5. Execute code in main process
    const pid = await registry.invoke('cdp_execute_main', {
      code: 'process.pid',
      timeout: 3000
    });
    console.log('Main process PID:', pid.data.result);

    // 6. Trigger IPC
    await registry.invoke('cdp_trigger_ipc', {
      channel: 'save-data',
      payload: { key: 'test', value: 42 },
      expectResponse: false
    });
  } finally {
    // 7. Clean up
    await registry.invoke('cdp_close', {});
  }
}
```
