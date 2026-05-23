# QA Learnings — EATA v0.3 Remediation

## 2026-05-21 — F3 Manual QA Results

### Scenario 1: i18n Translation Rendering — PASS
- All 14 `common.*` keys present in `en.json` and `zh.json` with correct English/Chinese values
- **Settings.tsx**: All 4 placeholder fields correctly use `t('settings.providerNamePlaceholder')`, `t('settings.baseUrlPlaceholder')`, `t('settings.modelPlaceholder')`, `t('settings.apiKeyPlaceholder')`
- **Zero** hardcoded `aria-label="..."` strings in `.tsx` files
- All 8 target components verified using `t()` calls: TaskCard (cancelTask, deleteTask), AccessibilityTreeView (a11yTree), StepTimeline (stepTimeline, stepPrefix), LogPanel (logOutput), TaskDetail (backToTaskList, downloadJson, downloadHtml), FeedbackLoop (searchFeedback), ScreenshotGallery (stepPrefix ×2)
- **Remaining dynamic aria-labels** (template literals with interpolated provider names in Settings.tsx ProviderCard): `Edit ${provider.name}`, `Delete ${provider.name}`, `Test ${provider.name} connection`, `Set ${provider.name} as default` — these are correct patterns, not hardcoded strings

### Scenario 2: WorkerPool Integration — PASS
- **runner.ts**: `getWorkerPool()` is a singleton factory (lines 60-71), configured with `maxConcurrency: 3`, creates `ProcessTaskExecutor` wrapping `WorkerManager`
- **tasks.ts**: `POST /tasks` submits to pool via `pool.submit()` (line 143-153) with priority 'medium'; `POST /tasks/:id/cancel` calls `pool.cancel()` + broadcasts SSE; `DELETE /tasks/:id` calls `pool.cancel()` if running
- **server.ts**: `getWorkerPool()` called in `buildServer()` (line 47), decorated on server (line 48), `attachPoolEventListeners(db)` wired (line 49), graceful shutdown via `onClose` hook (lines 52-54)

### Scenario 3: Report-Graph Integration — PASS
- **report.ts**: `reportNode` handles pass/fail status determination
- **graph.ts**: `reportNode` imported and added as node, with edges from verify → report → END
- **index.ts**: Both `reportNode` (line 21) and `createReportGraph` (line 23) are re-exported
- **report-graph/graph.ts**: `createReportGraph` function defined (line 29) with comprehensive test coverage

### Scenario 4: Type Safety — PASS
- **`pnpm typecheck`**: All 8 workspace projects typecheck cleanly — zero TS errors
- **`as any` audit**: 0 hits in production source files. Only found in test files (`providers.test.ts` — mock setup pattern, acceptable for tests)

---

**VERDICT**: QA Scenarios [4/4 pass] | **PASS**
