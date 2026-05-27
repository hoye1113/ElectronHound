# Direction C: 性能优化 (Performance Optimization) Specification

**Version:** 1.0
**Date:** 2026-05-28
**Status:** In Progress

---

## Overview

Direction C focuses on performance optimization across ElectronHound. The goal is to improve response times, reduce memory usage, and increase throughput.

---

## Bottlenecks Identified

### Priority 1 - High Impact

#### 1. Synchronous File I/O
**Files:** apps/server/src/routes/reports.ts, feedback.ts, apps/server/src/services/reportService.ts
**Issue:** readFileSync/writeFileSync blocks event loop
**Fix:** Replace with fs/promises equivalents

#### 2. Missing Database Indexes
**File:** apps/server/src/db/migrations.ts
**Issue:** No indexes on tasks(batch_id), tasks(created_at), steps(task_id, step_index)
**Fix:** Add indexes in migration

#### 3. No Prepared Statement Caching
**Files:** apps/server/src/tasks/runner.ts, apps/server/src/routes/tasks.ts
**Issue:** db.prepare() called per request instead of hoisted
**Fix:** Hoist prepare calls to module scope

#### 4. Unbounded WorkerPoolManager Handles Map
**File:** apps/server/src/services/workerPool/manager.ts
**Issue:** handles Map grows indefinitely
**Fix:** Add TTL or max size with eviction

### Priority 2 - Medium Impact

#### 5. Hardcoded Worker Concurrency
**File:** apps/server/src/tasks/runner.ts:70
**Issue:** maxConcurrency hardcoded to 3
**Fix:** Add to ServerConfig

#### 6. No SSE Client Limits
**File:** apps/server/src/streams/sseHub.ts
**Issue:** No max clients per task or total
**Fix:** Add configurable limits

#### 7. High-Cardinality Prometheus Labels
**File:** apps/server/src/server.ts
**Issue:** Route labels include UUIDs
**Fix:** Normalize labels to route patterns

#### 8. No Dashboard Code Splitting
**File:** apps/dashboard/src/App.tsx
**Issue:** All pages eagerly loaded
**Fix:** React.lazy for route-level splitting

#### 9. Dashboard Step Array Copies
**File:** apps/dashboard/src/stores/taskStore.ts
**Issue:** New array on every step event
**Fix:** Use bounded buffer or mutable pattern

### Priority 3 - Low Impact

#### 10. Sequential Startup
**File:** apps/server/src/server.ts
**Issue:** Independent steps awaited sequentially
**Fix:** Promise.all for parallel init

#### 11. Per-Request BatchService
**Files:** apps/server/src/routes/batches.ts
**Issue:** New instance per request
**Fix:** Singleton at startup

#### 12. No Vite Chunk Splitting
**File:** apps/dashboard/vite.config.ts
**Issue:** All vendors in single chunk
**Fix:** manualChunks config

#### 13. Array.shift() in Queue
**File:** apps/server/src/services/workerPool/queue.ts
**Issue:** O(n) dequeue
**Fix:** Use ring buffer or index tracking

---

## Implementation Plan

### Phase 1: Async I/O & Database (Priority 1)

#### 1.1 Replace Synchronous File I/O
- reports.ts: readFileSync → readFile
- feedback.ts: readFileSync → readFile
- reportService.ts: writeFileSync → writeFile, appendFileSync → appendFile
- All handlers remain async-compatible

#### 1.2 Add Database Indexes
```sql
CREATE INDEX IF NOT EXISTS idx_tasks_batch_id ON tasks(batch_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_steps_task_step ON steps(task_id, step_index);
```

#### 1.3 Hoist Prepared Statements
- runner.ts: Move db.prepare() to module scope
- tasks.ts: Create statement objects at registration time

#### 1.4 Bound WorkerPoolManager Handles
- Add maxHandles config (default 1000)
- Evict oldest completed/failed handles when limit reached
- Keep handle for configurable TTL after completion

### Phase 2: Configuration & Limits (Priority 2)

#### 2.1 Configurable Worker Concurrency
- Add maxConcurrency to ServerConfig
- Pass through to getWorkerPool()
- Default to 3 for backward compatibility

#### 2.2 SSE Client Limits
- Add maxClientsPerTask (default 10)
- Add maxTotalClients (default 100)
- Reject new connections with 429 when limit reached

#### 2.3 Normalize Prometheus Labels
- Strip UUIDs from route labels
- Use route pattern instead of actual URL
- Add label normalization helper

#### 2.4 Dashboard Code Splitting
- React.lazy for all page components
- Suspense with loading fallback
- Keep critical components eager

#### 2.5 Optimize Step Accumulation
- Use bounded buffer (last N steps)
- Or use mutable push with periodic snapshot
- Cap displayed steps with pagination

### Phase 3: Minor Optimizations (Priority 3)

#### 3.1 Parallel Startup
- Promise.all for seeding + routes + pool init
- Keep DB init sequential (required)

#### 3.2 Singleton BatchService
- Create at server startup
- Decorate server with instance

#### 3.3 Vite Chunk Splitting
- manualChunks for vendor-react, vendor-ui
- Optimize dependency pre-bundling

#### 3.4 Proper Queue Implementation
- Replace Array.shift() with index tracking
- Or use a ring buffer

---

## Acceptance Criteria

### Phase 1 Complete When:
- [ ] No readFileSync/writeFileSync in routes
- [ ] Database indexes added
- [ ] Prepared statements hoisted
- [ ] WorkerPoolManager handles bounded

### Phase 2 Complete When:
- [ ] Worker concurrency configurable
- [ ] SSE client limits enforced
- [ ] Prometheus labels normalized
- [ ] Dashboard uses React.lazy

### Phase 3 Complete When:
- [ ] Startup parallelized
- [ ] BatchService singleton
- [ ] Vite chunks split
- [ ] Queue uses proper data structure

---

## Performance Targets

### Response Times
- Task list: < 50ms (currently ~100ms)
- Task detail: < 30ms (currently ~50ms)
- Report generation: < 200ms (currently ~500ms for large reports)

### Memory
- WorkerPoolManager handles: bounded at 1000
- SSE clients: max 100 total
- Dashboard bundle: < 500KB gzipped

### Throughput
- Concurrent tasks: configurable (default 3)
- API requests: 100+ req/s
- SSE connections: 100+ concurrent
