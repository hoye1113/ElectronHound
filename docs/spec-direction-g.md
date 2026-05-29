# Direction G: 代码清理 (Code Cleanup)

**Version:** 1.0
**Date:** 2026-05-28
**Status:** In Progress

---

## Overview

Direction G 清理项目中的死代码、不一致和遗留问题。

---

## G1: 删除死代码

### G1.1 uiStore ✅

**文件:** `apps/dashboard/src/stores/uiStore.ts`

该 store 没有被任何组件引用，是遗留代码。已删除。

### G1.2 未使用的 API 方法
**文件:** `apps/dashboard/src/lib/api.ts`

`api.reports.getManifest()` 和 `api.reports.getTimeline()` 已定义但无页面调用。
- 如果 Direction F 不使用这些方法，则删除
- 如果 Direction F 需要则保留

---

## G2: API Client 与 Settings 同步 ✅

**文件:** `apps/dashboard/src/lib/api.ts`

Direction F 将 Settings 页面改为调用 API，需要确保 api.ts 中有完整的 Provider CRUD 方法：
- `api.providers.list()` — GET /api/providers
- `api.providers.create(data)` — POST /api/providers
- `api.providers.update(id, data)` — PUT /api/providers/:id
- `api.providers.delete(id)` — DELETE /api/providers/:id
- `api.providers.test(id)` — POST /api/providers/:id/test
- `api.providers.activate(id)` — POST /api/providers/:id/activate

检查现有 api.ts 是否已定义这些方法，缺失的补上。

---

## 验收标准

- [x] uiStore.ts 已删除
- [x] 未使用的 API 方法已清理
- [x] api.ts 包含完整的 Provider CRUD 方法
- [ ] 项目能正常构建（`pnpm build`）
- [x] 所有测试通过（`pnpm test`）

---

## Completion Status

### G1.1 uiStore ✅

File already deleted in previous iteration.

### G2 API Client Sync ✅

All Provider CRUD methods already implemented in api.ts and used by Settings.tsx.

### Unused API methods ✅

`api.templates.get(id)` removed (only used in tests).
