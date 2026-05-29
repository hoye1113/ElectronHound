# Dashboard Advanced Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 测试结果对比视图、recharts 趋势图表、批量导出功能。

**Architecture:** 后端新增 compare/trends API，前端引入 recharts 图表库，新增 CompareView 页面和图表组件。

**Tech Stack:** recharts, React, Fastify, Zod

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| Create | `apps/server/src/routes/compare.ts` | 对比 API |
| Create | `apps/server/src/routes/trends.ts` | 趋势数据 API |
| Create | `apps/server/src/__tests__/compare.test.ts` | 对比 API 测试 |
| Create | `apps/server/src/__tests__/trends.test.ts` | 趋势 API 测试 |
| Create | `apps/dashboard/src/pages/CompareView.tsx` | 对比视图页面 |
| Create | `apps/dashboard/src/components/charts/PassRateChart.tsx` | 通过率折线图 |
| Create | `apps/dashboard/src/components/charts/TaskStatusChart.tsx` | 状态分布饼图 |
| Create | `apps/dashboard/src/components/charts/ExecutionTimeChart.tsx` | 执行时间趋势 |
| Create | `apps/dashboard/src/__tests__/CompareView.test.tsx` | 对比页面测试 |
| Create | `apps/dashboard/src/__tests__/charts.test.tsx` | 图表组件测试 |
| Modify | `apps/dashboard/package.json` | 添加 recharts |
| Modify | `apps/dashboard/src/App.tsx` | 添加路由 |
| Modify | `apps/dashboard/src/lib/api.ts` | 添加 API 方法 |
| Modify | `apps/server/src/routes/index.ts` | 注册路由 |

---

### Task 1: 安装 recharts

**Files:**
- Modify: `apps/dashboard/package.json`

- [ ] **Step 1: 安装 recharts**

Run: `cd apps/dashboard && pnpm add recharts`

- [ ] **Step 2: 验证安装**

Run: `pnpm build`
Expected: Dashboard 构建通过

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/package.json
git commit -m "feat: add recharts for dashboard charts"
```

---

### Task 2: 对比 API

**Files:**
- Create: `apps/server/src/routes/compare.ts`
- Create: `apps/server/src/__tests__/compare.test.ts`
- Modify: `apps/server/src/routes/index.ts`

- [ ] **Step 1: 创建 compare.ts 路由**

```typescript
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const CompareSchema = z.object({
  taskIds: z.array(z.string()).length(2),
});

export async function compareRoutes(server: FastifyInstance): Promise<void> {
  server.post('/tasks/compare', async (request, reply) => {
    const { taskIds } = CompareSchema.parse(request.body);
    const [task1, task2] = taskIds.map(id =>
      server.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
    );
    if (!task1 || !task2) {
      return reply.status(404).send({ error: 'One or both tasks not found' });
    }

    const getSteps = (taskId: string) =>
      server.db.prepare('SELECT * FROM steps WHERE task_id = ? ORDER BY step_index').all(taskId);

    const steps1 = getSteps(taskIds[0]) as any[];
    const steps2 = getSteps(taskIds[1]) as any[];

    // 对比步骤
    const newFailures: any[] = [];
    const fixedIssues: any[] = [];
    const planChanges: any[] = [];

    const steps1ByPhase = new Map(steps1.map(s => [s.phase, s]));
    const steps2ByPhase = new Map(steps2.map(s => [s.phase, s]));

    for (const [phase, s1] of steps1ByPhase) {
      const s2 = steps2ByPhase.get(phase);
      if (!s2) continue;
      if (phase === 'verify') {
        const v1 = JSON.parse(s1.content);
        const v2 = JSON.parse(s2.content);
        if (v1.verdict === 'fail' && v2.verdict !== 'fail') newFailures.push({ phase, task1: v1, task2: v2 });
        if (v1.verdict !== 'fail' && v2.verdict === 'fail') fixedIssues.push({ phase, task1: v1, task2: v2 });
      }
      if (phase === 'plan') {
        const p1 = JSON.parse(s1.content);
        const p2 = JSON.parse(s2.content);
        if (JSON.stringify(p1) !== JSON.stringify(p2)) planChanges.push({ phase, task1: p1, task2: p2 });
      }
    }

    return {
      task1: { id: taskIds[0], steps: steps1 },
      task2: { id: taskIds[1], steps: steps2 },
      diff: { newFailures, fixedIssues, planChanges, unchanged: Math.max(0, steps1.length - newFailures.length - fixedIssues.length - planChanges.length) },
    };
  });
}
```

- [ ] **Step 2: 创建 compare.test.ts**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server';

let server: Awaited<ReturnType<typeof buildServer>>['server'];

beforeAll(async () => {
  const built = await buildServer({ databasePath: ':memory:' });
  server = built.server;
});

afterAll(async () => { await server.close(); });

describe('Compare API', () => {
  it('POST /api/tasks/compare compares two tasks', async () => {
    // 创建两个 task
    const t1 = await server.inject({ method: 'POST', url: '/api/tasks', payload: { name: 'Task 1', goal: 'test', appPath: '/test' } });
    const t2 = await server.inject({ method: 'POST', url: '/api/tasks', payload: { name: 'Task 2', goal: 'test', appPath: '/test' } });
    const id1 = t1.json().id;
    const id2 = t2.json().id;

    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/compare',
      payload: { taskIds: [id1, id2] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().task1.id).toBe(id1);
    expect(res.json().task2.id).toBe(id2);
    expect(res.json().diff).toBeDefined();
  });

  it('returns 404 for missing task', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/compare',
      payload: { taskIds: ['nonexistent-1', 'nonexistent-2'] },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects invalid payload', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/tasks/compare',
      payload: { taskIds: ['only-one'] },
    });
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 3: 注册路由**

在 `apps/server/src/routes/index.ts` 添加：

```typescript
import { compareRoutes } from './compare';
server.register(compareRoutes, { prefix: '/api' });
```

- [ ] **Step 4: 运行测试**

Run: `pnpm test -- apps/server/src/__tests__/compare.test.ts`
Expected: 3 tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/compare.ts apps/server/src/__tests__/compare.test.ts apps/server/src/routes/index.ts
git commit -m "feat: task comparison API"
```

---

### Task 3: 趋势数据 API

**Files:**
- Create: `apps/server/src/routes/trends.ts`
- Create: `apps/server/src/__tests__/trends.test.ts`
- Modify: `apps/server/src/routes/index.ts`

- [ ] **Step 1: 创建 trends.ts 路由**

```typescript
import type { FastifyInstance } from 'fastify';

export async function trendsRoutes(server: FastifyInstance): Promise<void> {
  server.get('/tasks/trends', async (request) => {
    const { days = '30' } = request.query as { days?: string };
    const numDays = Math.min(365, Math.max(1, parseInt(days, 10) || 30));

    const tasks = server.db.prepare(`
      SELECT
        date(created_at) as date,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM tasks
      WHERE created_at >= datetime('now', '-' || ? || ' days')
      GROUP BY date(created_at)
      ORDER BY date ASC
    `).all(numDays) as any[];

    const steps = server.db.prepare(`
      SELECT
        date(t.created_at) as date,
        AVG(CASE WHEN s.phase = 'verify' THEN 1 ELSE 0 END) as avg_steps
      FROM tasks t
      JOIN steps s ON t.id = s.task_id
      WHERE t.created_at >= datetime('now', '-' || ? || ' days')
      GROUP BY date(t.created_at)
    `).all(numDays) as any[];

    return {
      dates: tasks.map(t => t.date),
      passRates: tasks.map(t => t.total > 0 ? Math.round((t.completed / t.total) * 100) : 0),
      taskCounts: tasks.map(t => t.total),
      avgDuration: steps.map(s => s.avg_steps || 0),
    };
  });
}
```

- [ ] **Step 2: 创建 trends.test.ts**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server';

let server: Awaited<ReturnType<typeof buildServer>>['server'];

beforeAll(async () => {
  const built = await buildServer({ databasePath: ':memory:' });
  server = built.server;
});

afterAll(async () => { await server.close(); });

describe('Trends API', () => {
  it('GET /api/tasks/trends returns trend data', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/tasks/trends?days=7' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('dates');
    expect(res.json()).toHaveProperty('passRates');
    expect(res.json()).toHaveProperty('taskCounts');
    expect(Array.isArray(res.json().dates)).toBe(true);
  });

  it('defaults to 30 days', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/tasks/trends' });
    expect(res.statusCode).toBe(200);
  });

  it('clamps days to 1-365', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/tasks/trends?days=9999' });
    expect(res.statusCode).toBe(200);
  });
});
```

- [ ] **Step 3: 注册路由**

```typescript
import { trendsRoutes } from './trends';
server.register(trendsRoutes, { prefix: '/api' });
```

- [ ] **Step 4: 运行测试**

Run: `pnpm test -- apps/server/src/__tests__/trends.test.ts`
Expected: 3 tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/trends.ts apps/server/src/__tests__/trends.test.ts apps/server/src/routes/index.ts
git commit -m "feat: trends data API for dashboard charts"
```

---

### Task 4: 前端 API 方法 + 路由

**Files:**
- Modify: `apps/dashboard/src/lib/api.ts`
- Modify: `apps/dashboard/src/App.tsx`

- [ ] **Step 1: 在 api.ts 添加 compare 和 trends 方法**

```typescript
// 在 api 对象内添加：
compare: {
  run(taskIds: [string, string]) {
    return fetchJson(`${API_BASE}/api/tasks/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskIds }),
    });
  },
},
trends: {
  get(days?: number) {
    const query = days ? `?days=${days}` : '';
    return fetchJson(`${API_BASE}/api/tasks/trends${query}`);
  },
},
exports: {
  batchExport(params: { taskIds?: string[]; batchId?: string; format: string }) {
    return fetchJson(`${API_BASE}/api/exports/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  },
},
```

- [ ] **Step 2: 在 App.tsx 添加 /compare 路由**

```typescript
import CompareView from './pages/CompareView';

// 在 Routes 中添加:
<Route path="/compare" element={<CompareView />} />
<Route path="/compare/:taskId1/:taskId2" element={<CompareView />} />
```

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/lib/api.ts apps/dashboard/src/App.tsx
git commit -m "feat: add compare/trends API methods and route"
```

---

### Task 5: 图表组件

**Files:**
- Create: `apps/dashboard/src/components/charts/PassRateChart.tsx`
- Create: `apps/dashboard/src/components/charts/TaskStatusChart.tsx`
- Create: `apps/dashboard/src/components/charts/ExecutionTimeChart.tsx`
- Create: `apps/dashboard/src/__tests__/charts.test.tsx`

- [ ] **Step 1: 创建 PassRateChart.tsx**

```tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface PassRateChartProps {
  data: { dates: string[]; passRates: number[] };
}

export default function PassRateChart({ data }: PassRateChartProps) {
  const chartData = data.dates.map((date, i) => ({
    date,
    passRate: data.passRates[i],
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis domain={[0, 100]} />
        <Tooltip />
        <Line type="monotone" dataKey="passRate" stroke="#22c55e" name="Pass Rate %" />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: 创建 TaskStatusChart.tsx**

```tsx
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface TaskStatusChartProps {
  data: { completed: number; failed: number; pending: number; running: number };
}

const COLORS = ['#22c55e', '#ef4444', '#94a3b8', '#3b82f6'];

export default function TaskStatusChart({ data }: TaskStatusChartProps) {
  const chartData = [
    { name: 'Completed', value: data.completed },
    { name: 'Failed', value: data.failed },
    { name: 'Pending', value: data.pending },
    { name: 'Running', value: data.running },
  ].filter(d => d.value > 0);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie data={chartData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label />
        {chartData.map((_, i) => (
          <Cell key={i} fill={COLORS[i % COLORS.length]} />
        ))}
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: 创建 ExecutionTimeChart.tsx**

```tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ExecutionTimeChartProps {
  data: { dates: string[]; avgDuration: number[] };
}

export default function ExecutionTimeChart({ data }: ExecutionTimeChartProps) {
  const chartData = data.dates.map((date, i) => ({
    date,
    duration: data.avgDuration[i],
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="duration" stroke="#3b82f6" name="Avg Duration (s)" />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 4: 创建 charts.test.tsx**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PassRateChart from '../components/charts/PassRateChart';
import TaskStatusChart from '../components/charts/TaskStatusChart';
import ExecutionTimeChart from '../components/charts/ExecutionTimeChart';

// Mock recharts to avoid SVG rendering issues in tests
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="chart">{children}</div>,
  LineChart: () => <div>LineChart</div>,
  PieChart: () => <div>PieChart</div>,
  Line: () => null,
  Pie: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

describe('Chart Components', () => {
  it('PassRateChart renders', () => {
    render(<PassRateChart data={{ dates: ['2026-01-01'], passRates: [95] }} />);
    expect(screen.getByTestId('chart')).toBeTruthy();
  });

  it('TaskStatusChart renders', () => {
    render(<TaskStatusChart data={{ completed: 10, failed: 2, pending: 3, running: 1 }} />);
    expect(screen.getByTestId('chart')).toBeTruthy();
  });

  it('ExecutionTimeChart renders', () => {
    render(<ExecutionTimeChart data={{ dates: ['2026-01-01'], avgDuration: [5.2] }} />);
    expect(screen.getByTestId('chart')).toBeTruthy();
  });
});
```

- [ ] **Step 5: 运行测试**

Run: `pnpm test -- apps/dashboard/src/__tests__/charts.test.tsx`
Expected: 3 tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/charts/ apps/dashboard/src/__tests__/charts.test.tsx
git commit -m "feat: recharts chart components"
```

---

### Task 6: CompareView 页面

**Files:**
- Create: `apps/dashboard/src/pages/CompareView.tsx`
- Create: `apps/dashboard/src/__tests__/CompareView.test.tsx`

- [ ] **Step 1: 创建 CompareView.tsx**

```tsx
import { useState } from 'react';
import { api } from '../lib/api';

export default function CompareView() {
  const [taskId1, setTaskId1] = useState('');
  const [taskId2, setTaskId2] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCompare = async () => {
    if (!taskId1 || !taskId2) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.compare.run([taskId1, taskId2]);
      setResult(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Compare Tasks</h1>
      <div className="flex gap-4 mb-6">
        <input
          placeholder="Task ID 1"
          value={taskId1}
          onChange={e => setTaskId1(e.target.value)}
          className="border rounded px-3 py-2 flex-1"
        />
        <input
          placeholder="Task ID 2"
          value={taskId2}
          onChange={e => setTaskId2(e.target.value)}
          className="border rounded px-3 py-2 flex-1"
        />
        <button onClick={handleCompare} disabled={loading} className="bg-blue-500 text-white px-4 py-2 rounded">
          {loading ? 'Comparing...' : 'Compare'}
        </button>
      </div>
      {error && <div className="text-red-500 mb-4">{error}</div>}
      {result && (
        <div className="grid grid-cols-2 gap-6">
          <div>
            <h2 className="font-semibold mb-2">Task 1: {result.task1.id}</h2>
            <p>Steps: {result.task1.steps.length}</p>
          </div>
          <div>
            <h2 className="font-semibold mb-2">Task 2: {result.task2.id}</h2>
            <p>Steps: {result.task2.steps.length}</p>
          </div>
          <div className="col-span-2">
            <h2 className="font-semibold mb-2">Diff</h2>
            <p>New failures: {result.diff.newFailures.length}</p>
            <p>Fixed issues: {result.diff.fixedIssues.length}</p>
            <p>Plan changes: {result.diff.planChanges.length}</p>
            <p>Unchanged: {result.diff.unchanged}</p>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 创建 CompareView.test.tsx**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CompareView from '../pages/CompareView';

vi.mock('../lib/api', () => ({
  api: {
    compare: {
      run: vi.fn().mockResolvedValue({
        task1: { id: 't1', steps: [] },
        task2: { id: 't2', steps: [] },
        diff: { newFailures: [], fixedIssues: [], planChanges: [], unchanged: 0 },
      }),
    },
  },
}));

describe('CompareView', () => {
  it('renders inputs and button', () => {
    render(<CompareView />);
    expect(screen.getByPlaceholderText('Task ID 1')).toBeTruthy();
    expect(screen.getByPlaceholderText('Task ID 2')).toBeTruthy();
    expect(screen.getByText('Compare')).toBeTruthy();
  });

  it('shows result after comparison', async () => {
    render(<CompareView />);
    fireEvent.change(screen.getByPlaceholderText('Task ID 1'), { target: { value: 't1' } });
    fireEvent.change(screen.getByPlaceholderText('Task ID 2'), { target: { value: 't2' } });
    fireEvent.click(screen.getByText('Compare'));
    await waitFor(() => {
      expect(screen.getByText(/Diff/)).toBeTruthy();
    });
  });
});
```

- [ ] **Step 3: 运行测试**

Run: `pnpm test -- apps/dashboard/src/__tests__/CompareView.test.tsx`
Expected: 2 tests pass

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/pages/CompareView.tsx apps/dashboard/src/__tests__/CompareView.test.tsx
git commit -m "feat: CompareView page for task comparison"
```

---

### Task 7: 全量验证

- [ ] **Step 1: 运行全量测试**

Run: `pnpm test`
Expected: 所有测试通过

- [ ] **Step 2: 构建验证**

Run: `pnpm build`
Expected: 构建通过

- [ ] **Step 3: 最终 Commit**

```bash
git add -A
git commit -m "feat: dashboard advanced features — compare, charts, trends"
```
