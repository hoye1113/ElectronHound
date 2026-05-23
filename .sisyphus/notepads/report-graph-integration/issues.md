# Issues: Report-Graph Integration

## Critical: Report-Graph Not Connected to Main Flow
- **Severity:** High
- **Description:** The `createReportGraph` function (fan-out analysis: safety, perf, a11y, pattern → summarize) is fully implemented but NEVER called in production code. It only has test coverage.
- **Impact:** All test runs produce NO deep analysis reports. The htmlReport only shows step timeline, no safety/perf/a11y sections.
- **Root Cause:** The `reportNode` in the main graph is a stub that only sets status.

## TestState Missing Report Fields
- **Severity:** High  
- **Description:** `TestState` in `state.ts` has no fields for `safetyReport`, `performanceReport`, `accessibilityReport`, `newPatterns`, or `summaryText`. These exist only in `ReportState`.
- **Impact:** Even if reportGraph were invoked, the results can't flow back through the main graph state.

## No LLM in Report Node
- **Severity:** Medium
- **Description:** The `runner.ts` creates `generateObject` and passes it to plan/verify nodes but NOT to the report node. Without `generateObject`, the safety, accessibility, and pattern nodes fall back to dumb defaults (riskLevel=none, no WCAG analysis).
- **Impact:** Even after connecting the report graph, the LLM-powered analysis won't actually use the LLM without wiring through `generateObject`.
