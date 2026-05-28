# Direction F: Dashboard UI 补全 (Frontend Feature Completion)

**Version:** 1.0
**Date:** 2026-05-28
**Status:** In Progress

---

## Overview

Direction F 补全 Dashboard 前端缺失的 UI 页面，使后端已实现的 API 能被用户使用。

---

## F1: Settings 页面连接服务端 Provider API

**文件:** `apps/dashboard/src/pages/Settings.tsx`

**问题：** 当前 Settings 页面用 localStorage 管理 Provider，后端有完整的 CRUD API 未被使用。

**修改方案：**
1. 将 `loadConfig()` / `saveConfig()` 替换为 API 调用：
   - 列表: `GET /api/providers`
   - 添加: `POST /api/providers`
   - 更新: `PUT /api/providers/:id`
   - 删除: `DELETE /api/providers/:id`
   - 测试: `POST /api/providers/:id/test` (已有)
   - 激活: `POST /api/providers/:id/activate`
2. 移除 localStorage 相关代码
3. 保留模板快速填充功能
4. 添加 loading 状态

---

## F2: 批量测试 UI

**新建文件:** `apps/dashboard/src/pages/BatchList.tsx`

**路由:** `/batches`

**功能：**
- 批量任务列表（从 `/api/tasks` 按 batch_id 分组，或新增 batch 列表接口）
- 创建批量任务表单（复用 CreateTaskForm，支持添加多个任务）
- 批量详情页（显示进度、每个任务状态）
- 取消批量按钮

**简化方案：** 由于后端没有独立的 batch list 接口，可以在 TaskList 页面添加 "Batch" 视图，按 batch_id 分组显示。

---

## F3: 模板画廊页面

**新建文件:** `apps/dashboard/src/pages/Templates.tsx`

**路由:** `/templates`

**功能：**
- 展示所有模板（内置 + 自定义），按 category 分组
- 模板卡片：名称、描述、分类、变量列表
- "使用模板" 按钮 → 跳转到 CreateTaskForm 并预填 goal
- 创建/编辑/删除自定义模板
- 内置模板不可编辑/删除

**API 调用：**
- `GET /api/templates` — 列表
- `POST /api/templates` — 创建
- `PUT /api/templates/:id` — 更新
- `DELETE /api/templates/:id` — 删除

---

## F4: 导出按钮

**修改文件:** `apps/dashboard/src/pages/TaskDetail.tsx`

在 TaskDetail 页面添加导出下拉菜单：
- JSON 导出: `GET /api/tasks/:taskId/export/json`
- CSV 导出: `GET /api/tasks/:taskId/export/csv`
- HTML 导出: `GET /api/tasks/:taskId/export/html`

**实现：** 添加一个 DropdownMenu 组件，点击后触发对应格式的下载。

---

## F5: 系统健康仪表板

**新建文件:** `apps/dashboard/src/pages/SystemHealth.tsx`

**路由:** `/health`

**功能：**
- 显示 `/health` 端点返回的状态（database、workerPool）
- 系统状态指示器（ok / degraded / error）
- Worker 池状态（running / queued / maxWorkers）
- 运行时间

**API 调用：**
- `GET /health`

---

## F6: 路由和导航更新

**修改文件:** `apps/dashboard/src/App.tsx` — 添加新路由
**修改文件:** `apps/dashboard/src/components/Layout.tsx` — 添加侧边栏导航项

新增导航项：
- Templates（模板画廊）
- System（系统健康）

---

## 验收标准

- [ ] Settings 页面通过 API 管理 Provider
- [ ] 模板画廊页面可浏览和管理模板
- [ ] TaskDetail 页面有导出按钮（JSON/CSV/HTML）
- [ ] 系统健康页面显示服务状态
- [ ] 侧边栏包含新页面导航
- [ ] 所有新页面有基本的 loading 和 error 处理
