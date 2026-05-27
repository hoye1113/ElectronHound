# =============================================================================
# EATA Development Container
# -----------------------------------------------------------------------------
# PURPOSE: Run server (API) + dashboard (Vite) for development/CI.
# LIMITATIONS (T28 will address):
#   - Does NOT contain Playwright browsers
#   - Does NOT support running real Electron apps inside the container
#     (Alpine uses musl; Electron ships glibc binaries)
#   - Native module better-sqlite3 requires build tools installed below
# =============================================================================

# ---- Stage 1: Install dependencies & build ----
FROM node:20-alpine AS builder

# Install build toolchain for native modules (better-sqlite3, esbuild deps)
RUN apk add --no-cache python3 make g++ build-base linux-headers

# Install pnpm v9 (matches pnpm-lock.yaml lockfileVersion 9.0)
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# 1) Copy dependency manifests first (cache-friendly)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

# 2) Copy per-workspace package.json stubs so pnpm install can resolve workspace:*
#    Required for pnpm --frozen-lockfile in monorepos
COPY apps/server/package.json apps/server/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY packages/agent-core/package.json packages/agent-core/package.json
COPY packages/electron-bridge-mcp/package.json packages/electron-bridge-mcp/package.json
COPY packages/electron-helper/package.json packages/electron-helper/package.json
COPY packages/launcher/package.json packages/launcher/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

# 3) Install all dependencies (including devDependencies, needed for tsx/vite dev mode)
RUN pnpm install --frozen-lockfile

# 4) Now copy source code (avoids busting deps cache on code changes)
COPY apps/ apps/
COPY packages/ packages/
COPY fixtures/ fixtures/
COPY tsconfig.base.json eslint.config.js vitest.config.ts ./

# 5) Build TypeScript (server compiles to dist; dashboard bundles with vite)
RUN pnpm run build

# ---- Stage 2: Runtime ----
FROM node:20-alpine

# Keep build tools ONLY if needed for runtime native module resolution
# (better-sqlite3 was already compiled in builder; just needs compatible node)
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Bring in compiled node_modules & built sources
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps ./apps
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/fixtures ./fixtures
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/tsconfig.base.json ./tsconfig.base.json

# Expose Server API only
EXPOSE 3000

# Run as non-root user
USER node

# Default: run server
CMD ["pnpm", "--filter", "@eata/server", "start"]
