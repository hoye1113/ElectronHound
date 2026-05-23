# F6: i18n Quality Check — Issues

## Date: 2026-05-21

### Minor: Duplicate `a11yTree` key in zh.json (raw file)

- **Location**: `apps/dashboard/src/i18n/zh.json`, lines 57–60 and 72–77
- **Impact**: None — JSON parsers use the last value for duplicate keys. The second definition (lines 72–77) includes all 4 keys (`empty`, `emptyHint`, `nodeLabel`, `nodeLabelSimple`), which is correct.
- **First definition (lines 57–60)**: only has `empty` and `emptyHint` — gets overwritten.
- **Recommendation**: Remove the first duplicate block (lines 57–60) to clean up the raw file, though this is purely cosmetic.
- **Severity**: Low (no functional impact; key counts match exactly at 215/215).
