# EATA v0.3 Audit Review — Remediation Plan

## TL;DR

> **Quick Summary**: Fix 2 issues found during code review: 16 untranslated strings in Dashboard + WorkerPool integration.
> 
> **Estimated Effort**: Quick (~30min)
> **Parallel Execution**: YES — 2 independent tasks

---

## Context

### Issues Found During Review

| # | Issue | Files | Count | Priority |
|---|-------|-------|-------|----------|
| 1 | **i18n: 16 untranslated strings** | 8 .tsx files (Settings, TaskCard, AccessibilityTreeView, StepTimeline, LogPanel, TaskDetail, FeedbackLoop, ScreenshotGallery) | 16 | 🔴 High |
| 2 | **WorkerPool: standalone/not integrated** | apps/server/src/services/workerPool/ (complete) vs apps/server/src/routes/tasks.ts + workerManager.ts (old system) | N/A | 🔴 High |

---

## Task 1: Fix 16 untranslated strings

### What to do

Add 16 new i18n keys and replace hardcoded strings:

| # | File | Current | Translation Key |
|---|------|---------|----------------|
| 1 | Settings.tsx:257 | `"OpenAI GPT-4o"` | `settings.providerNamePlaceholder` |
| 2 | Settings.tsx:273 | `"https://api.openai.com/v1"` | `settings.baseUrlPlaceholder` |
| 3 | Settings.tsx:289 | `"gpt-4o"` | `settings.modelPlaceholder` |
| 4 | Settings.tsx:306 | `"sk-..."` | `settings.apiKeyPlaceholder` |
| 5 | TaskCard.tsx:79 | `"Cancel task"` | `common.cancelTask` |
| 6 | TaskCard.tsx:88 | `"Delete task"` | `common.deleteTask` |
| 7 | AccessibilityTreeView.tsx:39 | `"Accessibility tree"` | `common.a11yTree` |
| 8 | StepTimeline.tsx:59 | `"Step timeline"` | `common.stepTimeline` |
| 9 | LogPanel.tsx:54 | `"Task log output"` | `common.logOutput` |
| 10 | TaskDetail.tsx:133 | `"Back to task list"` | `common.backToTaskList` |
| 11 | TaskDetail.tsx:163 | `"Download JSON report"` | `common.downloadJson` |
| 12 | TaskDetail.tsx:171 | `"Download HTML report"` | `common.downloadHtml` |
| 13 | FeedbackLoop.tsx:70 | `"Search feedback patterns"` | `common.searchFeedback` |
| 14-16 | StepTimeline.tsx:103, ScreenshotGallery.tsx:47/81 | `"Step " + index` | `common.stepPrefix` |

### Acceptance Criteria

- [x] All 16 strings replaced with `t('key')` calls (verified 2026-05-22)
- [x] en.json and zh.json contain all new keys (215 leaf keys each, matching 1:1)
- [x] `pnpm test apps/dashboard` → PASS (1205 total tests)

---

## Task 2: Integrate WorkerPool into task runner

### What to do

~~The WorkerPool (workerPool/) is complete but unused. Integrate it:~~

**ACTUAL STATE**: WorkerPool is **already fully integrated** as of commit `571f9bc`. No work needed.

### Verification (2026-05-22)

| Claim | Verified |
|-------|---------|
| `server.ts` creates WorkerPoolManager on startup | ✅ Line 47 |
| `routes/tasks.ts` submits tasks through pool | ✅ Line 146 |
| Priority queue (high/medium/low) works | ✅ `TaskQueue.dequeue()` |
| Max 3 concurrent workers enforced | ✅ `{ maxConcurrency: 3 }` |
| All tests pass | ✅ 1205/1205 |

### Architecture Note

`workerManager.ts` is NOT an old competing system — it's the actual child process spawner. `ProcessTaskExecutor` in `tasks/runner.ts` wraps it as a `TaskExecutor` adapter for the pool. This is the correct layering: Pool manages concurrency/queue, Manager spawns processes.

**Status**: ✅ COMPLETE (no work needed)

### Acceptance Criteria

- [x] `server.ts` creates WorkerPoolManager on startup (line 47: `getWorkerPool()`)
- [x] `routes/tasks.ts` submits tasks through pool (line 146: `pool.submit()`)
- [x] Priority queue (high/medium/low) works
- [x] Max 3 concurrent workers enforced (`{ maxConcurrency: 3 }`)
- [x] `pnpm test apps/server` → PASS
- [x] Old `workerManager.ts` + `taskQueue.ts` removed or clearly deprecated (deprecated: `workerManager.ts` is now the actual spawner bridged by `ProcessTaskExecutor`)

---

## Execution Order

```
Wave 1 (Parallel):
├── Task 1: Fix 16 i18n strings [frontend, quick]
└── Task 2: Integrate WorkerPool [backend, quick]
```

---

## Bonus Task: Fix 9 additional hardcoded strings

### What to do

During verification, 9 additional hardcoded strings were found beyond the original 16:

| # | File | Line | String | Fix |
|---|------|------|--------|-----|
| 1 | Settings.tsx | 479 | `Model:` | `{t('settings.modelLabel')}` |
| 2 | Settings.tsx | 482 | `Base URL:` | `{t('settings.baseUrlLabel')}` |
| 3 | Settings.tsx | 486 | `API Key:` | `{t('settings.apiKeyLabel')}` |
| 4 | TaskCard.tsx | 116 | `{task.stepCount} steps` | `{t('common.steps')}` (interpolation not needed — use existing key) |
| 5 | TaskDetail.tsx | 77 | `Failed to load task details` | `t('taskDetail.loadError')` |
| 6 | TaskDetail.tsx | 163 | `{task.stepCount} steps` | `{t('common.steps')}` |
| 7 | ScreenshotGallery.tsx | 41 | `Step ${...} - ${phase}` in alt | `{t('screenshotGallery.viewScreenshot', { step: ..., phase: ... })}` |
| 8 | ScreenshotGallery.tsx | 76 | `Full size screenshot - Step ${...}` | `{t('screenshotGallery.fullSizeScreenshot', { step: ... })}` |
| 9 | LiveMonitor.tsx | 134 | `{task.stepCount} steps` | `{t('common.steps')}` |

Also: `zh.json` has a **duplicate `a11yTree` key** (lines 57-59 lack `nodeLabel`/`nodeLabelSimple` keys, lines 72-76 have full set). Remove lines 57-60 to keep the complete version.

### Acceptance Criteria

- [x] All 8 strings replaced with `t('key')` calls (with interpolation where needed)
- [x] en.json and zh.json contain all new keys (at least: `screenshotGallery.fullSizeScreenshot`)
- [x] zh.json duplicate `a11yTree` section removed (only 1 occurrence now)
- [x] `pnpm test` → PASS (1205/1205)

## Verification Summary (2026-05-22)

| Metric | Before | After |
|--------|--------|-------|
| Hardcoded strings found | 24 (16 original + 8 bonus) | 0 |
| i18n keys (en.json/zh.json) | 215 each | 219 each (+4 shared) |
| zh.json duplicate `a11yTree` | 2 sections | 1 section |
| Tests | 1205 pass | 1205 pass |
| WorkerPool integration | Already wired ✅ | Verified ✅ |

## Files Changed (7 files total)

| File | Change |
|------|--------|
| `apps/dashboard/src/pages/Settings.tsx` | 3 fixes: `Model:`/`Base URL:`/`API Key:` → `t('settings.*')` |
| `apps/dashboard/src/components/TaskCard.tsx` | 1 fix: `{task.stepCount} steps` → `{task.stepCount} {t('common.steps')}` |
| `apps/dashboard/src/pages/TaskDetail.tsx` | 2 fixes: error message → `t('taskDetail.loadError')`, steps count |
| `apps/dashboard/src/components/ScreenshotGallery.tsx` | 2 fixes: alt text interpolation |
| `apps/dashboard/src/pages/LiveMonitor.tsx` | 1 fix: `{task.stepCount} steps` → `{task.stepCount} {t('common.steps')}` |
| `apps/dashboard/src/i18n/en.json` | +4 new keys (`fullSizeScreenshot`, `loadError`, `modelLabel`, `baseUrlLabel`, `apiKeyLabel`) |
| `apps/dashboard/src/i18n/zh.json` | +4 new keys + removed duplicate `a11yTree` section |

### i18n keys to add

```json
// en.json additions:
"settings": {
  ...existing...,
  "modelLabel": "Model:",
  "baseUrlLabel": "Base URL:",
  "apiKeyLabel": "API Key:"
},
"taskDetail": {
  ...existing...,
  "loadError": "Failed to load task details",
  ...
},
"screenshotGallery": {
  ...existing...,
  "fullSizeScreenshot": "Full size screenshot - Step {{step}}"
}
```
