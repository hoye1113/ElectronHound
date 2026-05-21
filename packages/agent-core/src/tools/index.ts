/**
 * EATA Tools — Barrel exports
 *
 * Re-exports all tool modules:
 * - Browser tools (7): snapshot, click, type, navigate, press_key, hover, drag
 * - Electron tools (5): launch, close, execute_main, trigger_ipc, mock_dialog
 * - Execution tools (1): execute_code
 * - CDP tools (12): browser_snapshot..browser_drag + cdp_launch..cdp_mock_dialog
 */

// ─── Browser tools ──────────────────────────────────────────────────────
export {
  BrowserTool,
  SnapshotTool,
  ClickTool,
  TypeTool,
  NavigateTool,
  PressKeyTool,
  HoverTool,
  DragTool,
  createBrowserTools,
} from './browser.js';

// ─── Electron tools ─────────────────────────────────────────────────────
export {
  ElectronTool,
  LaunchElectronTool,
  CloseElectronTool,
  ExecuteMainTool,
  TriggerIpcTool,
  MockDialogTool,
  createElectronTools,
} from './electron.js';

// ─── Execution tools ────────────────────────────────────────────────────
export { ExecuteCodeTool, createExecutionTools } from './execution.js';

// ─── CDP integration (replaces MCP) ─────────────────────────────────────
export {
  CDPClient,
  CDPSession,
  CDPTool,
  BrowserSnapshotTool,
  BrowserClickTool,
  BrowserTypeTool,
  BrowserNavigateTool,
  BrowserPressKeyTool,
  BrowserHoverTool,
  BrowserDragTool,
  CDPLaunchTool,
  CDPCloseTool,
  CDPExecuteMainTool,
  CDPTriggerIpcTool,
  CDPMockDialogTool,
  createCDPTools,
} from './cdp.js';

// ─── Registry ───────────────────────────────────────────────────────────
export { ToolRegistry } from './registry.js';

// ─── Types ──────────────────────────────────────────────────────────────
export type {
  Tool,
  ToolResult,
  ToolStreamChunk,
  ToolRegistry as ToolRegistryType,
  BrowserContext,
  ElectronContext,
  ExecutionContext,
  CDPConfig,
  CDPSessionInfo,
  CDPRawResult,
  CDPToolParams,
  CDPToolResult,
  CDPContext,
  SnapshotParams,
  ClickParams,
  TypeParams,
  NavigateParams,
  PressKeyParams,
  HoverParams,
  DragParams,
  LaunchParams,
  CloseParams,
  ExecuteMainParams,
  TriggerIpcParams,
  MockDialogParams,
  ExecuteCodeParams,
  CDPBrowserSnapshotParams,
  CDPBrowserClickParams,
  CDPBrowserTypeParams,
  CDPBrowserNavigateParams,
  CDPBrowserPressKeyParams,
  CDPBrowserHoverParams,
  CDPBrowserDragParams,
  CDPLaunchParams,
  CDPCloseParams,
  CDPExecuteMainParams,
  CDPTriggerIpcParams,
  CDPMockDialogParams,
} from './types.js';
