# =============================================================================
# EATA Docker Image — Multi-Stage Build
# -----------------------------------------------------------------------------
# USAGE:
#   docker build -t eata .
#   docker compose up                    # dev (see docker-compose.yml)
#   docker compose -f docker-compose.prod.yml up  # production
#
# LIMITATIONS (T28):
#   - Does NOT contain Playwright browsers (would add ~2 GB to image)
#     → Tests targeting real browsers must run outside the container
#   - Does NOT support running real Electron apps inside the container
#     (Alpine uses musl libc; Electron ships glibc binaries — incompatible)
#     → Electron-based test targets must run on the host machine
#   - Native module better-sqlite3 is compiled in the builder stage;
#     the runtime image relies on the pre-built .node binary from builder
#   - Dashboard Vite dev server (port 5173) is for development only;
#     in production, serve the built static assets via a reverse proxy
# =============================================================================

# ---- Stage 1: Builder — install deps & compile ----
FROM node:18-alpine AS builder

# Build toolchain: required for native modules (better-sqlite3, esbuild)
# These are NOT carried into the runtime image (multi-stage discards them)
RUN apk add --no-cache python3 make g++ build-base linux-headers

# pnpm v9 — matches pnpm-lock.yaml lockfileVersion 9.0
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Layer 1 — dependency manifests (cache-friendly: only rebuilt when deps change)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

# Layer 2 — workspace package.json stubs (required for pnpm --frozen-lockfile
#            to resolve workspace:* protocol references in monorepos)
COPY apps/server/package.json apps/server/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY packages/agent-core/package.json packages/agent-core/package.json
COPY packages/electron-bridge-mcp/package.json packages/electron-bridge-mcp/package.json
COPY packages/electron-helper/package.json packages/electron-helper/package.json
COPY packages/launcher/package.json packages/launcher/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

# Layer 3 — install ALL dependencies (including devDependencies for tsx/vite)
# In production, consider a separate stage with `pnpm install --prod` to
# reduce image size by excluding devDependencies.
RUN pnpm install --frozen-lockfile

# Layer 4 — copy source code (changing code doesn't bust the deps cache)
COPY apps/ apps/
COPY packages/ packages/
COPY fixtures/ fixtures/
COPY tsconfig.base.json eslint.config.js vitest.config.ts ./

# Layer 5 — build TypeScript and bundle assets
RUN pnpm run build

# ---- Stage 2: Runtime — minimal production image ----
FROM node:18-alpine AS runner

# pnpm is needed at runtime because CMD invokes `pnpm run` scripts.
# A further optimization would copy only production node_modules and
# use `node dist/server.js` directly, eliminating pnpm from runtime.
RUN corepack enable && corepack prepare pnpm@9 --activate

# Security: run as non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

# Copy compiled artifacts from builder (node_modules includes pre-built
# better-sqlite3 native binary — must match node version & platform)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps ./apps
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/fixtures ./fixtures
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/tsconfig.base.json ./tsconfig.base.json

# Expose Server API (3000) and Dashboard Vite dev server (5173)
EXPOSE 3000 5173

# Health check: verifies the server API is responding
# wget is available in alpine by default (no curl needed)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Drop to non-root user for security
# Note: comment out if file permission issues arise with volume mounts
# USER appuser

# Default: run all workspaces in parallel (server + dashboard)
# Override in production: CMD ["node", "apps/server/dist/server.js"]
CMD ["pnpm", "run", "dev"]
