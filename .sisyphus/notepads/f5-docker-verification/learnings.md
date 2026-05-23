# F5 Docker Verification — Learnings

## Dockerfile Design Patterns Observed
- **Layer caching strategy**: Copy dependency manifests FIRST (package.json, lockfile), then workspace stubs, then `pnpm install`, then source code. Code changes don't bust the dependency cache.
- **Two-stage build**: `builder` (full toolchain + compile) → `runner` (minimal alpine with compiled artifacts).
- **Workspace monorepo builds**: Must COPY each workspace's package.json stub before running `pnpm install --frozen-lockfile` to resolve `workspace:*` protocol references.
- **Alpine native modules**: `better-sqlite3` compiled in builder stage; runtime image only gets the pre-built `.node` binary.
- **HEALTHCHECK**: Uses `wget -qO-` (native to alpine) instead of `curl`.

## CD Workflow Pattern
- CI gate job runs BEFORE build (test → lint → typecheck).
- Three separate images published: server, dashboard, combined.
- GHA BuildKit caching with scope-separated caches (`type=gha,scope=server`).
- QEMU + Buildx for multi-platform (amd64 + arm64).
- Semver tags for releases, branch-sha tags for tracing.

## docker-compose.prod.yml Pattern
- `restart: unless-stopped` for production services.
- `deploy.resources.limits` for memory/CPU caps.
- Named volumes for data persistence (not bind mounts).
- `depends_on` with `condition: service_healthy` for startup ordering.
- Environment variable interpolation with defaults: `${VAR:-default}`.
