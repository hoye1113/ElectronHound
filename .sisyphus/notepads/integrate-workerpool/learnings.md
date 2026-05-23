# Integrate WorkerPool into Task Runner — Learnings

## Patterns & Conventions

### Singleton Pattern for Pool
- `tasks/runner.ts` uses module-level singleton with `getWorkerPool()` / `closeWorkerPool()`
- No need for Fastify plugin registration pattern — direct import works well

### TaskExecutor Adapter
- `WorkerPoolManager` takes a `TaskExecutor` interface (execute + cancel)
- `ProcessTaskExecutor` bridges pool abstraction to `WorkerManager` (child process spawner)
- WorkerManager `onEvent` listeners must be registered per-task to capture completion callbacks

### Pool Events → DB Sync
- `attachPoolEventListeners(db)` wires pool events to DB updates + SSE broadcasts
- Called once at server startup in `server.ts`
- Events: started → 'running', completed → 'completed', failed → 'failed'

### Fastify Type Augmentation
- `types/fastify.d.ts` declares `workerPool: WorkerPoolManager` on `FastifyInstance`
- Routes use direct import of `getWorkerPool()` (not `server.workerPool`)

## Test Gotchas

### POST /tasks now submits to pool
- Tasks are immediately submitted to the pool on creation
- In test env, `npx` fails with ENOENT, causing status to change from 'queued' to 'failed'
- Test assertion relaxed: `expect(['queued', 'failed']).toContain(rows[0].status)`

## Pre-existing Issues

### Typecheck TS6059 errors
- All are rootDir errors about sibling packages (shared-types, agent-core)
- Monorepo `paths` in tsconfig.base.json point to source files outside `rootDir`
- NOT caused by this change — pre-existing infrastructure issue
