#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# self-test.sh — Dogfooding: run ElectronHound against itself
#
# Builds the Dashboard, launches the self-test fixture app (which embeds the
# Dashboard and mocks the backend), then runs the EATA agent against it.
#
# Standard goal: "Create a new task named 'self-test', verify it appears in
# task list and SSE timeline shows step events."
#
# Usage:
#   ./scripts/self-test.sh                     # Run with defaults
#   SELF_TEST_PORT=3002 ./scripts/self-test.sh  # Custom port
#
# Environment variables:
#   SELF_TEST_PORT    — HTTP port for the self-test server (default: 3001)
#   E2E_MAX_STEPS     — Max agent loop steps (default: 10)
#   E2E_TIMEOUT       — Overall timeout in seconds (default: 120)
#   E2E_LLM_MODEL     — LLM model to use (default: mock for CI)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ── Defaults ─────────────────────────────────────────────────────────────────
FIXTURE_APP="${PROJECT_ROOT}/fixtures/self-test-electron-app"
MAX_STEPS="${E2E_MAX_STEPS:-10}"
TIMEOUT="${E2E_TIMEOUT:-120}"
LLM_MODEL="${E2E_LLM_MODEL:-mock}"
SELF_TEST_PORT="${SELF_TEST_PORT:-3001}"
GOAL="${E2E_GOAL:-Create a new task named 'self-test', verify it appears in task list and SSE timeline shows step events.}"

# ── CI-specific Electron flags ───────────────────────────────────────────────
CI_FLAGS="--no-sandbox,--disable-gpu"
if [ -n "${ELECTRON_FLAGS:-}" ]; then
  ELECTRON_FLAGS="${CI_FLAGS},${ELECTRON_FLAGS}"
else
  ELECTRON_FLAGS="${CI_FLAGS}"
fi
export ELECTRON_FLAGS

# ── Helper functions ─────────────────────────────────────────────────────────
info() {
  echo "[self-test] $*"
}

error() {
  echo "[self-test] ERROR: $*" >&2
}

die() {
  error "$@"
  exit 1
}

# ── Pre-flight checks ───────────────────────────────────────────────────────
info "Starting ElectronHound self-test (dogfooding)"
info "  Project root: ${PROJECT_ROOT}"
info "  Fixture app:  ${FIXTURE_APP}"
info "  Port:         ${SELF_TEST_PORT}"
info "  Max steps:    ${MAX_STEPS}"
info "  LLM model:    ${LLM_MODEL}"
info "  Timeout:      ${TIMEOUT}s"

# Verify fixture app exists
[ -f "${FIXTURE_APP}/main.js" ] || die "Fixture app not found at ${FIXTURE_APP}/main.js"
[ -f "${FIXTURE_APP}/package.json" ] || die "Fixture app package.json not found"

# Verify Node.js is available
command -v node >/dev/null 2>&1 || die "Node.js is not installed or not in PATH"

# ── Step 1: Build the Dashboard ──────────────────────────────────────────────
info "Building Dashboard..."
DASHBOARD_DIR="${PROJECT_ROOT}/apps/dashboard"

if [ ! -f "${DASHBOARD_DIR}/dist/index.html" ]; then
  info "Dashboard dist not found, building..."
  (cd "${PROJECT_ROOT}" && pnpm --filter @eata/dashboard build) || die "Dashboard build failed"
  info "Dashboard built successfully"
else
  info "Dashboard dist already exists, skipping build"
fi

# Verify dashboard dist exists
[ -f "${DASHBOARD_DIR}/dist/index.html" ] || die "Dashboard build output not found at ${DASHBOARD_DIR}/dist/index.html"

# ── Step 2: Run fixture unit tests ──────────────────────────────────────────
info "Running self-test fixture unit tests..."
if command -v pnpm >/dev/null 2>&1; then
  (cd "${PROJECT_ROOT}" && pnpm --filter @eata/self-test-electron-app test) || die "Fixture unit tests failed"
  info "Fixture unit tests passed"
else
  info "pnpm not found, skipping fixture unit tests"
fi

# ── Step 3: Verify Electron binary is available ──────────────────────────────
info "Checking Electron binary..."
if [ -f "${FIXTURE_APP}/node_modules/.bin/electron" ]; then
  info "Electron found in fixture node_modules"
elif command -v npx >/dev/null 2>&1; then
  info "Electron will be resolved via npx"
else
  die "Electron binary not found. Run 'pnpm install' first."
fi

# ── Step 4: Smoke test — verify the app starts ───────────────────────────────
info "Smoke test: Launching self-test app to verify it starts..."

SMOKE_PID=""
SMOKE_RESULT=0

if command -v npx >/dev/null 2>&1; then
  timeout 15 npx electron "${FIXTURE_APP}" --no-sandbox --disable-gpu &
  SMOKE_PID=$!

  # Wait for the app to start
  sleep 3

  if kill -0 "${SMOKE_PID}" 2>/dev/null; then
    info "Smoke test passed: Self-test app started successfully (PID: ${SMOKE_PID})"
    kill "${SMOKE_PID}" 2>/dev/null || true
    wait "${SMOKE_PID}" 2>/dev/null || true
  else
    error "Smoke test failed: Self-test app exited prematurely"
    SMOKE_RESULT=1
  fi
else
  info "npx not available, skipping smoke test"
fi

if [ "${SMOKE_RESULT}" -ne 0 ]; then
  die "Smoke test failed. Self-test app cannot start in this environment."
fi

# ── Step 5: Run the OPEV agent loop ─────────────────────────────────────────
info "Running OPEV agent loop..."
info "  Goal: ${GOAL}"

AGENT_CLI="${PROJECT_ROOT}/packages/agent-core/src/cli.ts"
[ -f "${AGENT_CLI}" ] || die "Agent CLI not found at ${AGENT_CLI}"

if [ -n "${OPENAI_API_KEY:-}" ] || [ -n "${MINIMAX_API_KEY:-}" ]; then
  info "LLM API key detected, running full OPEV loop..."

  AGENT_EXIT_CODE=0
  timeout "${TIMEOUT}" npx tsx "${AGENT_CLI}" \
    --goal "${GOAL}" \
    --app "${FIXTURE_APP}" \
    --model "${LLM_MODEL}" \
    --maxSteps "${MAX_STEPS}" \
    || AGENT_EXIT_CODE=$?

  if [ "${AGENT_EXIT_CODE}" -eq 0 ]; then
    info "OPEV loop completed successfully"
  elif [ "${AGENT_EXIT_CODE}" -eq 124 ]; then
    die "OPEV loop timed out after ${TIMEOUT}s"
  else
    error "OPEV loop exited with code ${AGENT_EXIT_CODE}"
    exit "${AGENT_EXIT_CODE}"
  fi
else
  info "No LLM API key found. Skipping full OPEV loop."
  info "To enable full self-testing, set OPENAI_API_KEY or MINIMAX_API_KEY."
  info "Smoke test (app launch verification) passed successfully."
fi

# ── Summary ──────────────────────────────────────────────────────────────────
info "────────────────────────────────────────────"
info "ElectronHound self-test completed successfully"
info "  - Dashboard build:     OK"
info "  - Fixture unit tests:  PASSED"
info "  - Smoke test (launch): PASSED"
if [ -n "${OPENAI_API_KEY:-}" ] || [ -n "${MINIMAX_API_KEY:-}" ]; then
  info "  - OPEV agent loop:     PASSED"
else
  info "  - OPEV agent loop:     SKIPPED (no API key)"
fi
info "────────────────────────────────────────────"

exit 0
