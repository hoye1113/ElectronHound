# Direction E: 核心功能补全 (Core Functionality Completion)

**Version:** 1.0
**Date:** 2026-05-28
**Status:** In Progress

---

## Overview

Direction E 补全项目核心功能缺失：electron-helper 操作实现、llmModel schema 放宽、环境变量文档补全。

---

## E1: electron-helper OperationHandler 实现

**文件:** `packages/electron-helper/src/operation-handler.ts`

当前 4 个操作返回 placeholder，需要实现真实逻辑。

### E1.1 execute_main
通过 Electron 的 `BrowserWindow.webContents.executeJavaScript()` 在主进程执行代码。

**实现方案：**
- 需要获取 Electron 的 `app` 和 `BrowserWindow` 模块
- payload: `{ code: string, timeout?: number }`
- 使用 `Function()` 或 `eval()` 在主进程上下文执行（注意安全限制）
- 返回执行结果或错误
- 添加超时机制（默认 5000ms）

**注意：** electron-helper 通过 `--require` 加载，此时 Electron 已启动。需要通过 `require('electron')` 获取 app 模块。

### E1.2 send_ipc
向渲染进程发送 IPC 消息。

**实现方案：**
- payload: `{ channel: string, args?: unknown[] }`
- 使用 `BrowserWindow.webContents.send(channel, ...args)` 发送
- 需要获取所有打开的 BrowserWindow

### E1.3 mock_dialog
模拟 Electron 原生对话框。

**实现方案：**
- payload: `{ dialogType: 'open'|'save'|'message', response: unknown }`
- 使用 `dialog.showOpenDialog` 等方法的 mock
- 通过 `electron` 模块的 `dialog` API 拦截

### E1.4 get_menu_items
获取应用菜单项列表。

**实现方案：**
- 使用 `Menu.getApplicationMenu()` 获取菜单
- 递归遍历菜单项，返回 `{ label, accelerator, enabled, visible }[]`

---

## E2: llmModel Schema 放宽

**文件:** `packages/shared-types/src/task.ts`

当前 `CreateTaskRequestSchema` 和 `TaskSchema` 中 `llmModel` 只允许 3 个硬编码值。

**修改：**
```typescript
// 之前
llmModel: z.enum(['gpt-4o', 'gpt-4o-mini', 'claude-3.5-sonnet']),

// 之后
llmModel: z.string().min(1),
```

允许任意模型名称，与 Provider 系统保持一致。

---

## E3: .env.example 补全

**文件:** `.env.example`

添加文档中提到但 .env.example 缺失的变量：
- `DATABASE_PATH` — SQLite 数据库路径
- `CHECKPOINT_PATH` — LangGraph 检查点路径
- `DATA_DIR` — 数据目录

---

## 验收标准

- [ ] execute_main 能在 Electron 主进程执行代码并返回结果
- [ ] send_ipc 能向渲染进程发送 IPC 消息
- [ ] mock_dialog 能模拟原生对话框
- [ ] get_menu_items 能返回菜单项列表
- [ ] llmModel 接受任意非空字符串
- [ ] .env.example 包含所有配置变量
