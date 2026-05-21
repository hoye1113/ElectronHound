# Playwright CDP Integration

EATA uses Playwright's Chrome DevTools Protocol (CDP) connection for browser automation. The 7 browser tools provide direct CDP access for snapshot, click, type, navigate, keyboard, hover, and drag operations.

## Architecture

```
┌──────────────────┐   CDP (WebSocket)   ┌──────────────────┐
│  CDPClient       │ ◄─────────────────▶ │  Chromium/Browser  │
│  (Agent Core)    │                     │  (DevTools Port)   │
└────────┬─────────┘                     └────────────────────┘
         │
         ▼
┌──────────────────┐
│  7 Browser Tools │
│  (CDPTool)       │
└──────────────────┘
```

### Why CDP instead of Playwright API?

EATA uses raw CDP protocol messages rather than the Playwright high-level API. This approach:

1. **Avoids Playwright dependency** — No browser download required
2. **Works with Electron** — Same interface for browser and Electron
3. **Lower latency** — Single WebSocket hop
4. **Full protocol access** — Any CDP method is available

## 7 Browser Tools

### 1. `browser_snapshot`

Take an accessibility snapshot or screenshot of the current page state.

```typescript
import { ToolRegistry, CDPClient } from '@eata/agent-core';

const client = new CDPClient();
const registry = ToolRegistry.withCDP(client);

// Accessibility tree (preferred for agent reasoning)
const snapshot = await registry.invoke('browser_snapshot', {
  format: 'aria'
});
// snapshot.data contains the full AX tree

// Screenshot (visual capture)
const screenshot = await registry.invoke('browser_snapshot', {
  format: 'screenshot'
});
```

**CDP method:** `Accessibility.getFullAXTree` or `Page.captureSnapshot`
**Returns:** `{ success: true, data: { ... } }`

### 2. `browser_click`

Click an element identified by CSS selector or accessibility label.

```typescript
await registry.invoke('browser_click', {
  selector: '[data-testid="submit-button"]',
  button: 'left',       // 'left', 'right', 'middle'
  clickCount: 1,        // 1 = single, 2 = double
  timeout: 5000         // wait up to 5s for element
});
```

**CDP method:** `Input.dispatchMouseEvent` (mousePressed)
**Returns:** `{ success: true, data: { clicked: true, selector: '...' } }`

### 3. `browser_type`

Type text into an input element with optional delay between keystrokes.

```typescript
await registry.invoke('browser_type', {
  selector: 'input[name="search"]',
  text: 'Hello, world!',
  clear: true,          // clear existing content first
  delay: 50             // 50ms between keystrokes (human-like typing)
});
```

**CDP method:** `Input.insertText`
**Returns:** `{ success: true, data: { typed: true, selector: '...', text: '...' } }`

### 4. `browser_navigate`

Navigate to a URL with configurable wait condition.

```typescript
await registry.invoke('browser_navigate', {
  url: 'https://example.com',
  waitUntil: 'networkidle',  // 'load', 'domcontentloaded', 'networkidle'
  timeout: 30000
});
```

**Wait conditions:**
| Value | Description |
|-------|-------------|
| `load` | Wait for `load` event |
| `domcontentloaded` | Wait for DOMContentLoaded |
| `networkidle` | Wait until no network requests for 500ms |

**CDP method:** `Page.navigate`
**Returns:** `{ success: true, data: { navigated: true, url: '...' } }`

### 5. `browser_press_key`

Press a keyboard key, optionally focusing a specific element first.

```typescript
// Press Enter
await registry.invoke('browser_press_key', {
  key: 'Enter'
});

// Press Tab (navigate to next focusable element)
await registry.invoke('browser_press_key', {
  key: 'Tab'
});

// Press Escape
await registry.invoke('browser_press_key', {
  key: 'Escape'
});

// Press Ctrl+A (select all in focused element)
await registry.invoke('browser_press_key', {
  key: 'Control+A',
  selector: 'input#editor'
});
```

**CDP method:** `Input.dispatchKeyEvent`
**Returns:** `{ success: true, data: { keyPressed: 'Enter' } }`

### 6. `browser_hover`

Hover the mouse over an element to trigger hover effects.

```typescript
await registry.invoke('browser_hover', {
  selector: '[data-testid="menu-trigger"]',
  timeout: 5000
});
```

**CDP method:** `Input.dispatchMouseEvent` (mouseMoved)
**Returns:** `{ success: true, data: { hovered: true, selector: '...' } }`

### 7. `browser_drag`

Drag an element from a source position to a target position.

```typescript
await registry.invoke('browser_drag', {
  sourceSelector: '.draggable-item',
  targetSelector: '.dropzone',
  timeout: 10000
});
```

**CDP method:** `Input.dispatchMouseEvent` (drag sequence: mousePressed → mouseMoved → mouseReleased)
**Returns:** `{ success: true, data: { dragged: true, from: '...', to: '...' } }`

## CDP Connection Configuration

### Direct Endpoint

```typescript
await client.connect({
  endpoint: 'ws://127.0.0.1:9222/devtools/browser/abc123'
});
```

### Host/Port Configuration

```typescript
await client.connect({
  host: '127.0.0.1',
  port: 9222,
  targetType: 'browser',
  timeout: 30000
});
```

The endpoint is automatically built as `ws://${host}:${port}/devtools/browser/`.

## Session Management

Multiple CDP sessions can be active simultaneously:

```typescript
const client = new CDPClient();
await client.connect({ port: 9222 });

// Create sessions for different targets
const mainSession = await client.createSession(undefined, 'electron-main');
const pageSession = await client.createSession(pageTargetId, 'page');

// List all sessions
const sessions = client.listSessions();
// [
//   { sessionId: 'cdp-1', type: 'electron-main' },
//   { sessionId: 'cdp-2', type: 'page' }
// ]

// Send commands to specific sessions
await client.sendCommand('Runtime.evaluate', { expression: '...' }, mainSession.sessionId);

// Close a specific session
await client.closeSession(pageSession.sessionId);

// Disconnect all
await client.disconnect();
```

## Raw CDP Commands

For advanced use cases, send any CDP protocol command directly:

```typescript
// Get page DOM
const doc = await client.sendCommand('DOM.getDocument', {});

// Evaluate expression
const result = await client.sendCommand('Runtime.evaluate', {
  expression: 'document.title',
  returnByValue: true
});

// Set device metrics
await client.sendCommand('Emulation.setDeviceMetricsOverride', {
  width: 1920,
  height: 1080,
  deviceScaleFactor: 2
});
```

## Error Handling

All CDP tools handle errors gracefully:

```typescript
const result = await registry.invoke('browser_click', {
  selector: '[data-testid="nonexistent"]'
});

if (!result.success) {
  console.error('Tool failed:', result.error);
  // e.g., "browser_click failed: Element not found"
}
```

CDP errors include error codes:
```typescript
// Direct CDP command
const raw = await client.sendCommand('Page.navigate', { url: 'invalid://url' });
if (raw.error) {
  console.log(raw.error.code);     // CDP error code
  console.log(raw.error.message);  // Error description
}
```

## Complete Example

```typescript
import { CDPClient, createCDPTools, ToolRegistry } from '@eata/agent-core';

async function testWebApp() {
  const client = new CDPClient();
  const registry = ToolRegistry.withCDP(client);

  // Connect to a running browser/Electron app
  await client.connect({
    port: 9222,
    targetType: 'browser',
    timeout: 30000
  });

  try {
    // 1. Navigate to a page
    await registry.invoke('browser_navigate', {
      url: 'https://example.com',
      waitUntil: 'networkidle'
    });

    // 2. Take an accessibility snapshot
    const snapshot = await registry.invoke('browser_snapshot', {
      format: 'aria'
    });
    console.log('Page snapshot captured');

    // 3. Type into the search box
    await registry.invoke('browser_type', {
      selector: 'input[type="search"]',
      text: 'Playwright CDP',
      clear: true,
      delay: 20
    });

    // 4. Press Enter to submit
    await registry.invoke('browser_press_key', {
      key: 'Enter'
    });

    // 5. Hover over a menu item
    await registry.invoke('browser_hover', {
      selector: '.menu-item:first-child'
    });

    // 6. Click the menu item
    await registry.invoke('browser_click', {
      selector: '.menu-item:first-child',
      button: 'left'
    });

    // 7. Take a screenshot of the result
    const screenshot = await registry.invoke('browser_snapshot', {
      format: 'screenshot'
    });
    console.log('Screenshot captured');
  } finally {
    await client.disconnect();
  }
}
```
