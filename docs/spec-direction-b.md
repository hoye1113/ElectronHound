# Direction B: 质量保障 (Quality Assurance) Specification

**Version:** 1.0
**Date:** 2026-05-28
**Status:** In Progress

---

## Overview

Direction B focuses on improving test coverage and quality assurance across ElectronHound. The goal is to increase confidence in the codebase and catch regressions early.

**Current State:** 983 tests passing, 63 test files, 2 pre-existing failures

---

## Coverage Gaps Identified

### Dashboard (apps/dashboard)
- **Tested (8 files):** CreateTaskForm, LogPanel, PatternList, ScreenshotGallery, Settings, StepTimeline, TaskCard, stores
- **Untested (7 files):** AccessibilityTreeView, ErrorBoundary, Layout, FeedbackLoop, LiveMonitor, NotFound, TaskDetail, TaskList, lib/sse

### Server API (apps/server)
- **Tested (10/11 routes):** All routes except metrics
- **Untested (1 route):** GET /metrics
- **Untested infrastructure:** db/migrations.ts, db/seeds/

### Packages
- **agent-core:** Good coverage (~150 tests)
- **shared-types:** 3 test files
- **electron-bridge-mcp:** 1 test file (bridge-client.ts untested)
- **electron-helper:** 2 test files (ipc-channel.ts untested)
- **launcher:** 2 test files (good coverage)

### E2E
- **Existing:** 6 E2E + 1 integration test file
- **Missing:** Browser/Playwright tests, dashboard UI E2E, SSE streaming E2E

---

## Implementation Plan

### Phase 1: Server API Tests (Priority 1)

#### 1.1 Metrics Endpoint Test
**File:** apps/server/src/__tests__/metrics.test.ts

Test cases:
- GET /metrics returns 200
- Response Content-Type is text/plain
- Response contains prom-client metrics
- Contains custom metrics (eata_tasks_total, eata_workers_active, etc.)

#### 1.2 Fix Skipped Integration Tests
**File:** tests/integration/provider-integration.test.ts

- Investigate why 6 tests are skipped
- Fix or remove skipped tests
- Ensure tests pass in CI

### Phase 2: Dashboard Page Tests (Priority 1)

#### 2.1 TaskList Page Test
**File:** apps/dashboard/src/__tests__/TaskList.test.tsx

Test cases:
- Renders task list
- Shows loading state
- Shows error state
- Displays task cards
- Handles empty state
- Search/filter functionality

#### 2.2 TaskDetail Page Test
**File:** apps/dashboard/src/__tests__/TaskDetail.test.tsx

Test cases:
- Renders task details
- Shows task status
- Displays steps timeline
- Shows log panel
- Handles task not found
- Cancel button functionality

#### 2.3 ErrorBoundary Test
**File:** apps/dashboard/src/__tests__/ErrorBoundary.test.tsx

Test cases:
- Renders children when no error
- Catches and displays errors
- Shows retry button
- Resets error state on retry

### Phase 3: Infrastructure Tests (Priority 2)

#### 3.1 Database Migration Test
**File:** apps/server/src/__tests__/migrations.test.ts

Test cases:
- All tables created successfully
- Indexes created
- Foreign keys enforced
- Incremental migrations work

#### 3.2 Seed Data Test
**File:** apps/server/src/__tests__/seeds.test.ts

Test cases:
- Built-in templates seeded correctly
- Default report template seeded
- Seed is idempotent (running twice doesn't duplicate)

#### 3.3 Bridge Client Test
**File:** packages/electron-bridge-mcp/src/__tests__/bridge-client.test.ts

Test cases:
- Connects to MCP server
- Sends tool calls
- Handles responses
- Error handling

#### 3.4 IPC Channel Test
**File:** packages/electron-helper/src/__tests__/ipc-channel.test.ts

Test cases:
- Creates channel
- Sends messages
- Receives responses
- Handles timeouts

### Phase 4: E2E Tests (Priority 3)

#### 4.1 Dashboard E2E Test
**File:** tests/e2e/dashboard-ui.test.ts

Test cases:
- Task creation flow
- Task monitoring flow
- Report viewing flow
- Settings management

#### 4.2 SSE Streaming E2E Test
**File:** tests/e2e/sse-streaming.test.ts

Test cases:
- SSE connection establishment
- Real-time task updates
- Batch progress updates
- Connection recovery

---

## Acceptance Criteria

### Phase 1 Complete When:
- [ ] GET /metrics has dedicated test
- [ ] Skipped integration tests fixed or removed
- [ ] All server tests pass

### Phase 2 Complete When:
- [ ] TaskList page has tests
- [ ] TaskDetail page has tests
- [ ] ErrorBoundary has tests
- [ ] All dashboard tests pass

### Phase 3 Complete When:
- [ ] Database migrations have tests
- [ ] Seed data has tests
- [ ] Bridge client has tests
- [ ] IPC channel has tests

### Phase 4 Complete When:
- [ ] Dashboard E2E tests exist
- [ ] SSE streaming E2E tests exist
- [ ] All E2E tests pass

---

## Test Quality Standards

### Test Structure
- Use describe/it blocks for organization
- One assertion per it block when possible
- Clear test names describing expected behavior

### Test Isolation
- Each test should be independent
- Use beforeEach/afterEach for setup/teardown
- Clean up resources (close servers, remove temp files)

### Mocking Strategy
- Mock external dependencies (LLM calls, file system)
- Use vi.mock() for module mocking
- Use vi.fn() for function mocking

### Coverage Targets
- Statements: 80%
- Branches: 70%
- Functions: 80%
- Lines: 80%

---

## Technical Notes

### Dashboard Test Patterns
- Use React Testing Library
- Mock API calls with vi.mock()
- Use screen queries (getByText, getByRole, etc.)
- Test user interactions with fireEvent

### Server Test Patterns
- Use Fastify inject() for route testing
- Use temporary databases for isolation
- Clean up after each test

### E2E Test Patterns
- Use Playwright for browser tests
- Use supertest for API E2E tests
- Test complete user workflows
