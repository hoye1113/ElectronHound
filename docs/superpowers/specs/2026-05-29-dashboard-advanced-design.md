# Dashboard Advanced Features Design

**Version:** 1.0
**Date:** 2026-05-29
**Status:** Pending Approval

---

## Overview

Dashboard 高级功能：测试结果对比视图、趋势图表、批量导出。需要引入图表库（recharts），新增对比页面和趋势 API。

---

## 功能 1: 测试结果对比视图

### 问题

无法对比两次测试运行的结果差异。需要手动查看各自的报告。

### 设计

**新页面:** `apps/dashboard/src/pages/CompareView.tsx`

**路由:** `/compare` 或 `/compare/:taskId1/:taskId2`

**功能：**
- 选择两个 task 进行对比
- 并排展示通过/失败/跳过数量
- 高亮差异项（新增失败、修复的问题）
- 步骤级别的 diff（plan 变化、observation 变化）

**数据结构：**
```typescript
interface ComparisonResult {
  task1: { id: string; summary: TaskSummary; steps: StepRecord[] };
  task2: { id: string; summary: TaskSummary; steps: StepRecord[] };
  diff: {
    newFailures: StepDiff[];
    fixedIssues: StepDiff[];
    planChanges: StepDiff[];
    unchanged: number;
  };
}
```

**API:**
```
POST /api/tasks/compare
Body: { taskIds: [string, string] }
Response: ComparisonResult
```

---

## 功能 2: 趋势图表

### 问题

无法直观看到测试通过率、任务成功率随时间的变化趋势。

### 设计

**图表库:** `recharts`（React 原生，轻量，TypeScript 友好）

**新组件:** `apps/dashboard/src/components/charts/`

| 组件 | 数据 | 图表类型 |
|------|------|----------|
| PassRateChart | 历史 task 通过率 | 折线图 |
| TaskStatusChart | 任务状态分布 | 饼图 |
| ExecutionTimeChart | 执行时间趋势 | 折线图 |
| ScheduleHistoryChart | 调度执行历史 | 柱状图 |

**趋势 API:**
```
GET /api/tasks/trends?days=30
Response: {
  dates: string[];
  passRates: number[];
  taskCounts: number[];
  avgDuration: number[];
}
```

**集成位置：**
- TaskList 页面顶部：小型趋势概览
- SystemHealth 页面：详细趋势图表
- ScheduleHistory：调度执行历史图表

---

## 功能 3: 批量导出

### 问题

当前导出是单个 task 的 JSON/CSV/HTML。无法批量导出多个 task 或整个 batch 的结果。

### 设计

**API:**
```
POST /api/exports/batch
Body: {
  taskIds?: string[];
  batchId?: string;
  format: 'json' | 'csv' | 'html';
}
Response: { downloadUrl: string }
```

**前端：**
- BatchList 页面添加"导出全部"按钮
- TaskList 页面支持多选 + 批量导出
- 导出格式选择对话框

---

## 文件清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `apps/dashboard/src/pages/CompareView.tsx` | 对比视图页面 |
| `apps/dashboard/src/components/charts/PassRateChart.tsx` | 通过率折线图 |
| `apps/dashboard/src/components/charts/TaskStatusChart.tsx` | 状态分布饼图 |
| `apps/dashboard/src/components/charts/ExecutionTimeChart.tsx` | 执行时间趋势 |
| `apps/dashboard/src/components/charts/ScheduleHistoryChart.tsx` | 调度历史图表 |
| `apps/server/src/routes/compare.ts` | 对比 API |
| `apps/server/src/routes/trends.ts` | 趋势数据 API |
| `apps/server/src/__tests__/compare.test.ts` | 对比 API 测试 |
| `apps/server/src/__tests__/trends.test.ts` | 趋势 API 测试 |
| `apps/dashboard/src/__tests__/CompareView.test.tsx` | 对比页面测试 |
| `apps/dashboard/src/__tests__/charts.test.tsx` | 图表组件测试 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `apps/dashboard/package.json` | 添加 `recharts` 依赖 |
| `apps/dashboard/src/App.tsx` | 添加 `/compare` 路由 |
| `apps/dashboard/src/pages/TaskList.tsx` | 添加多选 + 批量导出 |
| `apps/dashboard/src/pages/BatchList.tsx` | 添加"导出全部"按钮 |
| `apps/dashboard/src/pages/SystemHealth.tsx` | 集成趋势图表 |
| `apps/dashboard/src/lib/api.ts` | 添加 compare/trends/batchExport API |
| `apps/server/src/routes/index.ts` | 注册 compare/trends 路由 |

---

## 验收标准

- [ ] `/compare` 页面可选择两个 task 进行对比
- [ ] 对比结果高亮差异（新失败、修复项）
- [ ] recharts 图表在 SystemHealth 页面展示趋势
- [ ] 趋势 API 返回 30 天历史数据
- [ ] BatchList 支持批量导出整个 batch
- [ ] TaskList 支持多选 + 批量导出
- [ ] 所有新组件有测试覆盖
- [ ] `pnpm build` 通过

---

## 执行顺序

```
Wave 1 (并行):
  ├── Agent 1: compare API + trends API + 测试
  └── Agent 2: recharts 图表组件 + 测试

Wave 2 (并行):
  ├── Agent 3: CompareView 页面 + 路由
  └── Agent 4: TaskList/BatchList 批量导出

Wave 3:
  └── 全量测试验证
```
