export { createServer } from './server.js';
export { BridgeClient } from './bridge-client.js';
export type { BridgeMessage } from './bridge-client.js';

export { electronLaunch } from './tools/electron-launch.js';
export { electronClose } from './tools/electron-close.js';
export { executeMain } from './tools/execute-main.js';
export { triggerIpc } from './tools/trigger-ipc.js';
export { mockDialog } from './tools/mock-dialog.js';

export type { ElectronLaunchInput, ElectronLaunchOutput, LaunchContext } from './tools/electron-launch.js';
export type { ElectronCloseInput, ElectronCloseOutput, CloseContext } from './tools/electron-close.js';
export type { ExecuteMainInput, ExecuteMainOutput, ExecuteMainContext } from './tools/execute-main.js';
export type { TriggerIpcInput, TriggerIpcOutput, TriggerIpcContext } from './tools/trigger-ipc.js';
export type { MockDialogInput, MockDialogOutput, MockDialogContext, DialogType } from './tools/mock-dialog.js';
