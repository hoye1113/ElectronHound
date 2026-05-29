# Feature Design: 数据持久化 + BatchList 改进 + 代码清理

**Version:** 1.0
**Date:** 2026-05-29
**Status:** Pending Approval

---

## Overview

三个并行功能方向：
1. FewShot 数据从 localStorage 迁移到后端 API 持久化
2. BatchList 从 localStorage 迁移到后端 batch list API
3. 代码清理（删除未使用方法）

---

## Feature 1: FewShot 数据持久化

### 问题

FewShot 示例完全存在 localStorage 中（key: `eata-few-shot-examples`），无后端支持。换设备或清缓存数据丢失。

### 数据库

```sql
CREATE TABLE few_shot_examples (
  id TEXT PRIMARY KEY,
  goal TEXT NOT NULL,
  steps TEXT NOT NULL,          -- JSON array of {action, observation}
  expected_result TEXT NOT NULL,
  metadata TEXT NOT NULL,        -- JSON {tags, domain, difficulty}
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

添加到 `apps/server/src/db/migrations.ts`。

### API 路由

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/few-shot` | 列表（支持 search/domain/difficulty 过滤） |
| POST | `/api/few-shot` | 创建 |
| PUT | `/api/few-shot/:id` | 更新 |
| DELETE | `/api/few-shot/:id` | 删除 |
| POST | `/api/few-shot/migrate` | 批量导入（localStorage 迁移用） |

**POST /api/few-shot/migrate 请求体：**
```json
{
  "examples": [
    {
      "id": "fs-1234-abc",
      "goal": "Login to app",
      "steps": [{"action": "click", "observation": "form"}],
      "expectedResult": "Dashboard visible",
      "metadata": {"tags": ["login"], "domain": "testing", "difficulty": "easy"}
    }
  ]
}
```

**冲突处理：** 使用 `INSERT OR REPLACE` 策略，相同 ID 的记录会被覆盖。

**响应：** `{ "imported": 5, "skipped": 0 }`

### 前端改动

**`apps/dashboard/src/lib/api.ts`** — `fewShot` 部分改为 HTTP 调用：

```typescript
fewShot: {
  list(params?: { search?: string; domain?: string }): Promise<{ data: FewShotExample[] }> {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.domain) query.set('domain', params.domain);
    return fetchJson(`${API_BASE}/api/few-shot?${query}`);
  },
  create(data: Omit<FewShotExample, 'id'>): Promise<FewShotExample> {
    return fetchJson(`${API_BASE}/api/few-shot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  update(id: string, data: Omit<FewShotExample, 'id'>): Promise<FewShotExample> {
    return fetchJson(`${API_BASE}/api/few-shot/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  remove(id: string): Promise<void> {
    return fetch(`${API_BASE}/api/few-shot/${id}`, { method: 'DELETE' }).then(res => {
      if (!res.ok) throw new Error(`Delete few-shot example failed: ${res.status}`);
    });
  },
  migrate(examples: FewShotExample[]): Promise<{ imported: number }> {
    return fetchJson(`${API_BASE}/api/few-shot/migrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ examples }),
    });
  },
}
```

**`apps/dashboard/src/pages/FewShotPage.tsx`** — 添加迁移逻辑：

```typescript
useEffect(() => {
  // Check for localStorage data to migrate
  const stored = localStorage.getItem('eata-few-shot-examples');
  if (stored) {
    try {
      const examples = JSON.parse(stored);
      if (Array.isArray(examples) && examples.length > 0) {
        api.fewShot.migrate(examples).then(() => {
          localStorage.removeItem('eata-few-shot-examples');
          refreshExamples();
        }).catch(() => {
          // Migration failed, keep localStorage data as fallback
        });
      }
    } catch {
      // Invalid JSON, ignore
    }
  }
}, []);
```

### 测试计划

- 路由测试：CRUD + 迁移端点（`apps/server/src/__tests__/few-shot.test.ts`）
- 前端测试：FewShotPage 迁移逻辑（更新 `FewShotPage.test.tsx`）

---

## Feature 2: BatchList 改进

### 问题

后端有完整的 batch CRUD，但前端用 localStorage 存储 batch ID 列表。清除缓存后丢失 batch 追踪。

### API 路由

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tasks/batches` | 列表所有 batch |

**查询参数：**
- `status`：过滤状态（pending/running/completed/failed/cancelled）
- `page`：页码（默认 1）
- `limit`：每页数量（默认 20）

**响应格式：**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Test Batch",
      "status": "running",
      "totalTasks": 5,
      "completedTasks": 2,
      "failedTasks": 0,
      "priority": "high",
      "createdAt": "2026-05-29T...",
      "updatedAt": "2026-05-29T...",
      "progress": 40
    }
  ],
  "total": 10,
  "page": 1,
  "limit": 20
}
```

### 前端改动

**`apps/dashboard/src/lib/api.ts`** — 添加 `batches.list`：

```typescript
batches: {
  // ... existing methods ...
  list(params?: { status?: string; page?: number; limit?: number }): Promise<{
    data: BatchData[];
    total: number;
    page: number;
    limit: number;
  }> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    return fetchJson(`${API_BASE}/api/tasks/batches?${query}`);
  },
}
```

**`apps/dashboard/src/pages/BatchList.tsx`** — 移除 localStorage：

- 删除 `STORAGE_KEY` 常量和相关 localStorage 读写
- 改用 `api.batches.list()` 获取 batch 列表
- 添加状态过滤下拉框
- 保留 10s 自动刷新

### 测试计划

- 路由测试：`GET /api/tasks/batches` 列表 + 过滤 + 分页（`apps/server/src/__tests__/batch.test.ts` 扩展）
- 前端测试：BatchList 页面更新（`BatchList.test.tsx` 扩展）

---

## Feature 3: 代码清理

### 清理项

1. **删除 `api.templates.get(id)`**
   - 位置：`apps/dashboard/src/lib/api.ts` 第 176-178 行
   - 原因：生产代码无调用，仅测试文件 `api.test.ts` 使用
   - 同步删除测试用例

2. **更新 Direction G 文档**
   - 标记 G1.1 完成（uiStore 已不存在）
   - 标记 G2 完成（API Client 与 Settings 已同步）

### 验证

- `pnpm test` 通过
- `npx eslint --quiet` 无新增错误

---

## 执行顺序

```
并行 Wave 1:
  ├── Agent 1: FewShot 后端（DB + 路由 + 测试）
  ├── Agent 2: BatchList 后端（路由 + 测试）
  └── Agent 3: 代码清理

串行 Wave 2:
  ├── FewShot 前端（api.ts + FewShotPage.tsx + 测试）
  └── BatchList 前端（api.ts + BatchList.tsx + 测试）
```

---

## 验收标准

- [ ] FewShot 数据通过 API 持久化，不再依赖 localStorage
- [ ] localStorage 数据首次访问时自动迁移到后端
- [ ] BatchList 通过 API 获取所有 batch，不再依赖 localStorage
- [ ] `GET /api/tasks/batches` 支持状态过滤和分页
- [ ] 未使用的 `api.templates.get(id)` 已删除
- [ ] 所有测试通过
- [ ] ESLint 无新增错误
