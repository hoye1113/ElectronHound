# Integrate WorkerPool into Task Runner — Decisions

## Architecture Decisions

### 1. Singleton pool in `tasks/runner.ts`
- **Decision**: Module-level singleton via `getWorkerPool()`
- **Rationale**: Simple, no framework-specific dependency, testable
- **Alt considered**: Fastify plugin registration — more complex, not needed

### 2. Direct executor adapter (ProcessTaskExecutor)
- **Decision**: Adapter class that bridges WorkerPoolManager to WorkerManager
- **Rationale**: Clean separation of concerns; pool doesn't know about child processes
- **Max concurrency**: 3 (matches plan specification)

### 3. Pool events for DB sync (not callback-based)
- **Decision**: `attachPoolEventListeners(db)` at startup wires pool → DB updates
- **Rationale**: Centralized, routes don't need DB update logic after pool.submit()
- **Trade-off**: Events are fire-and-forget; if DB update fails, pool and DB can diverge

### 4. Default priority 'medium'
- **Decision**: All tasks submitted with priority='medium'
- **Rationale**: CreateTaskRequestSchema doesn't include priority field yet
- **Future**: Could add priority to request schema and parse it

### 5. Cancel routes call pool.cancel()
- **Decision**: POST /tasks/:id/cancel and DELETE /tasks/:id both call pool.cancel()
- **Rationale**: Ensures worker process is killed, not just DB status updated
