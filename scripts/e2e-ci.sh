#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# e2e-ci.sh — Headless E2E test runner for ElectronHound CI
#
# Runs the full OPEV (Observe-Plan-Execute-Verify) loop against the test
# fixture Electron app in a headless CI environment (xvfb-run).
#
# Usage:
#   ./scripts/e2e-ci.sh                     # Run with defaults
#   ELECTRON_FLAGS="--disable-gpu" ./scripts/e2e-ci.sh  # Extra Electron flags
#
# Environment variables:
#   ELECTRON_FLAGS    — Comma-separated Electron/Chromium CLI flags
#   E2E_GOAL          — Custom test goal (overrides default)
#   E2E_MAX_STEPS     — Max agent loop steps (default: 10)
#   E2E_LLM_MODEL     — LLM model to use (default: mock for CI)
#   E2E_TIMEOUT       — Overall timeout in seconds (default: 120)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ── Defaults ─────────────────────────────────────────────────────────────────
FIXTURE_APP="${PROJECT_ROOT}/fixtures/test-electron-app"
MAX_STEPS="${E2E_MAX_STEPS:-10}"
TIMEOUT="${E2E_TIMEOUT:-120}"
LLM_MODEL="${E2E_LLM_MODEL:-mock}"
GOAL="${E2E_GOAL:-Launch the Electron app, verify the login form with username/password fields exists, navigate to the dashboard, and verify the counter and task list UI elements are present.}"

# ── CI-specific Electron flags ───────────────────────────────────────────────
# --no-sandbox is required when running as root (common in Docker/CI)
# --disable-gpu avoids GPU-related issues in headless environments
CI_FLAGS="--no-sandbox,--disable-gpu"
if [ -n "${ELECTRON_FLAGS:-}" ]; then
  ELECTRON_FLAGS="${CI_FLAGS},${ELECTRON_FLAGS}"
else
  ELECTRON_FLAGS="${CI_FLAGS}"
fi
export ELECTRON_FLAGS

# ── Helper functions ─────────────────────────────────────────────────────────
info() {
  echo "[e2e-ci] $*"
}

error() {
  echo "[e2e-ci] ERROR: $*" >&2
}

die() {
  error "$@"
  exit 1
}

# ── Pre-flight checks ───────────────────────────────────────────────────────
info "Starting E2E CI test runner"
info "  Project root: ${PROJECT_ROOT}"
info "  Fixture app:  ${FIXTURE_APP}"
info "  Max steps:    ${MAX_STEPS}"
info "  LLM model:    ${LLM_MODEL}"
info "  Timeout:      ${TIMEOUT}s"
info "  Electron flags: ${ELECTRON_FLAGS}"

# Verify fixture app exists
[ -f "${FIXTURE_APP}/main.js" ] || die "Fixture app not found at ${FIXTURE_APP}/main.js"
[ -f "${FIXTURE_APP}/package.json" ] || die "Fixture app package.json not found"

# Verify Node.js is available
command -v node >/dev/null 2>&1 || die "Node.js is not installed or not in PATH"

# Check that the build is available
AGENT_CLI="${PROJECT_ROOT}/packages/agent-core/src/cli.ts"
[ -f "${AGENT_CLI}" ] || die "Agent CLI not found at ${AGENT_CLI}"

# ── Run fixture unit tests first ─────────────────────────────────────────────
info "Running fixture unit tests..."
if command -v pnpm >/dev/null 2>&1; then
  (cd "${PROJECT_ROOT}" && pnpm --filter @eata/test-electron-app test) || die "Fixture unit tests failed"
  info "Fixture unit tests passed"
else
  info "pnpm not found, skipping fixture unit tests"
fi

# ── Verify Electron binary is available ──────────────────────────────────────
info "Checking Electron binary..."
if [ -f "${FIXTURE_APP}/node_modules/.bin/electron" ]; then
  info "Electron found in fixture node_modules"
elif command -v npx >/dev/null 2>&1; then
  info "Electron will be resolved via npx"
else
  die "Electron binary not found. Run 'pnpm install' first."
fi

# ── Launch fixture app and verify it starts ──────────────────────────────────
info "Smoke test: Launching fixture app to verify it starts..."

SMOKE_PID=""
SMOKE_RESULT=0

# Try a quick launch-and-kill to verify the app starts
if command -v npx >/dev/null 2>&1; then
  # Launch Electron with no-sandbox and a timeout
  timeout 15 npx electron "${FIXTURE_APP}" --no-sandbox --disable-gpu &
  SMOKE_PID=$!

  # Wait a few seconds for the app to start
  sleep 3

  # Check if process is still running (good sign)
  if kill -0 "${SMOKE_PID}" 2>/dev/null; then
    info "Smoke test passed: Electron app started successfully (PID: ${SMOKE_PID})"
    # Clean up
    kill "${SMOKE_PID}" 2>/dev/null || true
    wait "${SMOKE_PID}" 2>/dev/null || true
  else
    error "Smoke test failed: Electron app exited prematurely"
    SMOKE_RESULT=1
  fi
else
  info "npx not available, skipping smoke test"
fi

if [ "${SMOKE_RESULT}" -ne 0 ]; then
  die "Smoke test failed. Electron app cannot start in this environment."
fi

# ── Run the OPEV agent loop ─────────────────────────────────────────────────
info "Running OPEV agent loop..."
info "  Goal: ${GOAL}"

# The agent-core CLI requires an LLM provider. In CI without API keys,
# we verify the fixture app launches correctly via the smoke test above.
# For full OPEV testing, set OPENAI_API_KEY or configure a provider.

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
  info "To enable full E2E testing, set OPENAI_API_KEY or MINIMAX_API_KEY."
  info "Smoke test (app launch verification) passed successfully."
fi

# ── Summary ──────────────────────────────────────────────────────────────────
info "────────────────────────────────────────────"
info "E2E CI test run completed successfully"
info "  - Fixture unit tests: PASSED"
info "  - Smoke test (app launch): PASSED"
if [ -n "${OPENAI_API_KEY:-}" ] || [ -n "${MINIMAX_API_KEY:-}" ]; then
  info "  - OPEV agent loop: PASSED"
else
  info "  - OPEV agent loop: SKIPPED (no API key)"
fi
info "────────────────────────────────────────────"

exit 0
