# i18n Verification Report
**Date**: 2026-05-22 00:55:42
**Scope**: 16 hardcoded English strings in apps/dashboard/src/

## Structured Report: Original 16 Items

| # | File | Original Line | String | Current Status | Still Hardcoded? |
|---|------|---------------|--------|----------------|-------------------|
| 1 | Settings.tsx | 257 | "OpenAI GPT-4o" | Now uses `t('settings.providerNamePlaceholder')` at line 257 | **NO** |
| 2 | Settings.tsx | 273 | "https://api.openai.com/v1" | Now uses `t('settings.baseUrlPlaceholder')` at line 273 | **NO** |
| 3 | Settings.tsx | 289 | "gpt-4o" | Now uses `t('settings.modelPlaceholder')` at line 289 | **NO** |
| 4 | Settings.tsx | 306 | "sk-..." | Now uses `t('settings.apiKeyPlaceholder')` at line 306 | **NO** |
| 5 | TaskCard.tsx | 79 | "Cancel task" | Now uses `t('common.cancelTask')` at line 92 (aria-label) | **NO** |
| 6 | TaskCard.tsx | 88 | "Delete task" | Now uses `t('common.deleteTask')` at line 101 (aria-label) | **NO** |
| 7 | AccessibilityTreeView.tsx | 39 | "Accessibility tree" | Now uses `t('common.a11yTree')` at line 39 (aria-label) | **NO** |
| 8 | StepTimeline.tsx | 59 | "Step timeline" | Now uses `t('common.stepTimeline')` at line 59 (aria-label) | **NO** |
| 9 | LogPanel.tsx | 54 | "Task log output" | Now uses `t('common.logOutput')` at line 54 (aria-label) | **NO** |
| 10 | TaskDetail.tsx | 133 | "Back to task list" | Now uses `t('common.backToTaskList')` at line 147 (aria-label) & `t('taskDetail.backToTasks')` at line 130 (visible text) | **NO** |
| 11 | TaskDetail.tsx | 163 | "Download JSON report" | Now uses `t('taskDetail.downloadJson')` at line 180 (visible) & `t('common.downloadJson')` at line 177 (aria-label) | **NO** |
| 12 | TaskDetail.tsx | 171 | "Download HTML report" | Now uses `t('taskDetail.downloadHtml')` at line 188 (visible) & `t('common.downloadHtml')` at line 185 (aria-label) | **NO** |
| 13 | FeedbackLoop.tsx (moved from components/ to pages/) | 70 | "Search feedback patterns" | Now uses `t('feedbackLoop.searchPlaceholder')` at line 66 (placeholder) | **NO** |
| 14 | StepTimeline.tsx | 103 | "Step " + index | Now uses `t('common.stepPrefix')` at line 103 + `index + 1` | **NO** |
| 15 | ScreenshotGallery.tsx | 47 | "Step " | Now uses `t('common.stepPrefix')` at line 47 + `stepIndex + 1` | **NO** |
| 16 | ScreenshotGallery.tsx | 81 | "Step " | Now uses `t('common.stepPrefix')` at line 81 + `stepIndex + 1` | **NO** |

## Summary

- **Total still hardcoded**: 0 of 16 ✅
- **Total already translated**: 16 of 16 ✅
- **Already done**: ALL 16 items

## useTranslation Import Status

All 8 affected files have `useTranslation` imported:

| File | Imported? | Line |
|------|-----------|------|
| Settings.tsx | ✅ YES | line 2 |
| TaskCard.tsx | ✅ YES | line 3 |
| AccessibilityTreeView.tsx | ✅ YES | line 2 |
| StepTimeline.tsx | ✅ YES | line 2 |
| LogPanel.tsx | ✅ YES | line 2 |
| TaskDetail.tsx | ✅ YES | line 3 |
| FeedbackLoop.tsx (now in pages/) | ✅ YES | line 2 |
| ScreenshotGallery.tsx | ✅ YES | line 2 |

## i18n Infrastructure

### File Sizes
- `en.json`: **261 lines** (215 leaf keys)
- `zh.json`: **265 lines** (215 leaf keys)

### Key Parity
✅ **All 215 keys match between en.json and zh.json** — no missing keys in either direction.

### ⚠️ zh.json Issue
`zh.json` has a **duplicate `a11yTree` key** at two locations:
- Lines 57-60 (first occurrence: only has `empty` and `emptyHint`)
- Lines 72-77 (second occurrence: has `empty`, `emptyHint`, `nodeLabel`, `nodeLabelSimple`)

The second occurrence overwrites the first per JSON spec — **not a functional bug**, but a code quality issue. The lines 57-60 block should be removed since it's fully superseded.

## BONUS: Additional Hardcoded Strings Found (NOT in Original 16)

The following strings are STILL HARDCODED and should be addressed in a follow-up:

| File | Line | Hardcoded String | Suggested Key |
|------|------|-----------------|---------------|
| Settings.tsx | 479 | `Model:` | `settings.modelLabelShort` or reuse `settings.modelLabel` |
| Settings.tsx | 482 | `Base URL:` | Reuse `settings.baseUrlLabel` |
| Settings.tsx | 486 | `API Key:` | Reuse `settings.apiKeyLabel` |
| TaskCard.tsx | 116 | `{task.stepCount} steps` (word "steps") | Reuse `t('common.steps')` — key already exists |
| TaskDetail.tsx | 77 | `'Failed to load task details'` | Add new key `taskDetail.loadError` |
| TaskDetail.tsx | 163 | `{task.stepCount} steps` (word "steps") | Reuse `t('common.steps')` |
| ScreenshotGallery.tsx | 41 | `alt={Step ${screenshot.stepIndex + 1} - }` | Add new interpolation key |
| ScreenshotGallery.tsx | 76 | `alt={Full size screenshot - Step ${selectedScreenshot.stepIndex + 1}}` | Add new interpolation key |

**8 additional hardcoded strings** remain in 4 files.

## i18n Hardcoded Strings Fix - Additional 8 Strings

### Changes Made
- **Settings.tsx (line 479, 482, 486)**: Model:, Base URL:, API Key: → 	('settings.modelLabel'), 	('settings.baseUrlLabel'), 	('settings.apiKeyLabel')
- **TaskCard.tsx (line 116)**: steps → 	('common.steps') (key already existed)
- **TaskDetail.tsx (line 77)**: 'Failed to load task details' → 	('taskDetail.loadError')
- **TaskDetail.tsx (line 163)**: steps → 	('common.steps')
- **ScreenshotGallery.tsx (line 41)**: alt with template literal → 	('screenshotGallery.viewScreenshot', {...})
- **ScreenshotGallery.tsx (line 76)**: alt with template literal → 	('screenshotGallery.fullSizeScreenshot', {...})

### New Keys Added
- 	askDetail.loadError (en/zh)
- screenshotGallery.fullSizeScreenshot (en/zh, with {{step}} interpolation)

### zh.json Fix
- Removed duplicate 11yTree section (lines 57-60) that had only 2 keys
- Kept complete 11yTree section (lines 72-76) with all 4 keys including 
odeLabel and 
odeLabelSimple

### Verification
- pnpm test apps/dashboard → 119 tests pass (9 test files)
- Both JSON files validate with JSON.parse()
- No hardcoded English strings remain in the 4 component/page files

### Notes
- settings.modelLabel, settings.baseUrlLabel, settings.apiKeyLabel already existed in both JSON files (without colons) — reused existing keys rather than creating duplicates
