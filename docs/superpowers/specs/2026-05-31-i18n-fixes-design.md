# i18n Fixes Design

> **Goal:** Fix two translation gaps and add automated i18n completeness validation tests.

## Context

Deep research (W91) identified two i18n issues:

1. **Bug:** `LanguageSwitcher.tsx` references `langSwitcher.title`, `langSwitcher.en`, `langSwitcher.zh` — but neither `en.json` nor `zh.json` contains a `langSwitcher` namespace. The language switcher's own labels display as raw translation keys.

2. **Dead code:** `en.json` contains a `schedule` namespace (35 keys) that is absent from `zh.json`. No source file references `t('schedule.*')`. This is orphaned code from a removed feature.

## Changes

### 1. Add `langSwitcher` namespace to both JSON files

**Files:** `apps/dashboard/src/i18n/en.json`, `apps/dashboard/src/i18n/zh.json`

Add the following keys:

```json
// en.json
"langSwitcher": {
  "title": "Language",
  "en": "English",
  "zh": "中文"
}

// zh.json
"langSwitcher": {
  "title": "语言",
  "en": "English",
  "zh": "中文"
}
```

Note: "English" and "中文" are the same in both languages — language names are not translated.

### 2. Remove `schedule` namespace from `en.json`

**File:** `apps/dashboard/src/i18n/en.json`

Delete lines 399-436 (the `schedule` namespace with 35 keys). These keys are not referenced anywhere in the codebase and have no corresponding zh.json entries.

### 3. Add i18n completeness validation tests

**File:** `apps/dashboard/src/__tests__/i18n.test.tsx`

Add a new `describe('i18n completeness')` block with:

1. **Key parity test:** Verify `en.json` and `zh.json` have identical top-level namespaces and leaf keys. This prevents future drift between the two translation files.

2. **LanguageSwitcher key test:** Verify `langSwitcher.title`, `langSwitcher.en`, `langSwitcher.zh` exist in both bundles and resolve to non-empty strings.

3. **No orphaned namespaces test:** Verify every namespace in `en.json` has at least one source file referencing `t('namespace.*')`. This catches dead code like the `schedule` namespace.

## TDD Approach

1. Write failing tests first (key parity, LanguageSwitcher keys)
2. Add `langSwitcher` namespace to JSON files → tests pass
3. Remove `schedule` namespace from `en.json` → key parity test passes
4. Run full test suite to verify no regressions

## Verification

- `pnpm test` passes with zero failures
- Key parity test confirms en.json and zh.json are in sync
- LanguageSwitcher component displays proper labels instead of raw keys
