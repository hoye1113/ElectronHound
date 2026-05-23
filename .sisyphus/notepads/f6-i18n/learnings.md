# F6: i18n Quality Check — Learnings

## Date: 2026-05-21

### Patterns That Work Well

1. **All 18 production `.tsx` files use `useTranslation()`** — consistent adoption across the codebase.
2. **Flat namespace structure** (`common.*`, `nav.*`, `settings.*`, etc.) keeps translations organized and discoverable.
3. **Comprehensive i18n test suite** (196 lines) covers 5 scenarios: init, switching, key coverage, hooks, fallback.
4. **`fallbackLng: 'en'`** ensures graceful degradation for missing translations.
5. **localStorage persistence** in `i18n/config.ts` preserves language preference across sessions.

### Key Comparison Technique

- Used `node -e` with `require()` and recursive key extraction to programmatically compare en.json (215 keys) vs zh.json (215 keys).
- Grep patterns for hardcoded strings: `>"[A-Z]..."`, `placeholder="[A-Z]..."`, `title="[A-Z]..."`, `aria-label="[A-Z]..."` — all returned 0 matches in production code.

### Namespace Coverage

All expected namespaces present: `common`, `nav`, `layout`, `notFound`, `logPanel`, `a11yTree`, `patternList`, `screenshotGallery`, `stepTimeline`, `taskCard`, `priority`, `createTask`, `taskList`, `feedbackLoop`, `taskDetail`, `liveMonitor`, `settings`, `fewShot`, `langSwitcher`, `auditReport`.
