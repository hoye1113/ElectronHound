# Dashboard Build Fix Plan

## TL;DR

> **Quick Summary**: Fix 2 pre-existing TypeScript errors in dashboard that block build.
>
> **Deliverables**:
> - `stores.test.ts` - Add missing `priority` field to mock task
> - `AccessibilityTreeView.tsx` - Fix `t` is not defined in TreeNode sub-component
>
> **Estimated Effort**: Small (2 files, <30 min)
> **Parallel Execution**: YES
> **Critical Path**: None - independent fixes

---

## Context

### Original Request
Dashboard build fails with TypeScript errors:
1. `stores.test.ts` - mock task missing `priority` field
2. `AccessibilityTreeView.tsx` - `t` not defined in TreeNode sub-component

### Root Cause Analysis

**Issue 1: `stores.test.ts`**
- `Task` schema requires `priority: TaskPriorityEnum` (line 30 in task.ts)
- Mock task at line 21-31 doesn't include `priority` field
- Fix: Add `priority: 'medium'` to mock task

**Issue 2: `AccessibilityTreeView.tsx`**
- `useTranslation()` hook is called in parent component (line 16)
- `t` is used inside `TreeNode` sub-component (line 50-94)
- `TreeNode` is a separate function component without access to parent's `t`
- Fix: Either pass `t` as prop or create local `useTranslation` hook

---

## Work Objectives

### Core Objective
Fix dashboard build errors so `pnpm build` succeeds.

### Concrete Deliverables
- Fix `apps/dashboard/src/__tests__/stores.test.ts` - add `priority` field
- Fix `apps/dashboard/src/components/AccessibilityTreeView.tsx` - fix `t` scope

### Definition of Done
- [x] `pnpm --filter "@eata/dashboard" build` exits 0
- [x] No TypeScript errors in stores.test.ts
- [x] No TypeScript errors in AccessibilityTreeView.tsx

### Must Have
- Add `priority: 'medium'` to mockTask in stores.test.ts
- Fix `t` usage in TreeNode component (pass as prop OR local hook)

### Must NOT Have
- Must NOT change any business logic
- Must NOT modify other files

---

## Verification Strategy

### QA Policy
- Run `pnpm --filter "@eata/dashboard" build`
- Verify exits 0 with no errors

---

## TODOs

### Wave 1: Fix TypeScript Errors (Parallel)

- [x] 1. Fix `stores.test.ts` - add `priority` field to mockTask

  **What to do**:
  - Open `apps/dashboard/src/__tests__/stores.test.ts`
  - Add `priority: 'medium'` to mockTask object at line 21-31

  **Must NOT do**:
  - Don't change any other fields

  **Acceptance Criteria**:
  - [ ] mockTask includes `priority: 'medium'`
  - [ ] TypeScript error on line 21 resolved

  **Commit**: YES
  - Message: `fix(dashboard): add missing priority field to mockTask`
  - Files: `apps/dashboard/src/__tests__/stores.test.ts`

- [x] 2. Fix `AccessibilityTreeView.tsx` - fix `t` scope in TreeNode

  **What to do**:
  - Option A (Recommended): Add `t` prop to TreeNode component
    ```typescript
    interface TreeNodeProps {
      node: AccessibilityTreeNode;
      depth: number;
      t: typeof t; // or use translation function type
    }
    ```
  - Or Option B: Create local `useTranslation` hook inside TreeNode

  **Must NOT do**:
  - Don't change rendering logic
  - Don't change visual output

  **Acceptance Criteria**:
  - [ ] TypeScript error "Cannot find name 't'" resolved
  - [ ] No changes to visual output

  **Commit**: YES
  - Message: `fix(dashboard): fix t scope in AccessibilityTreeView TreeNode`
  - Files: `apps/dashboard/src/components/AccessibilityTreeView.tsx`

---

## Final Verification Wave

- [x] F1. **Build Verification**
  Run `pnpm --filter "@eata/dashboard" build` and verify exits 0

---

## Commit Strategy

- **Task 1**: `fix(dashboard): add missing priority field to mockTask`
- **Task 2**: `fix(dashboard): fix t scope in AccessibilityTreeView TreeNode`

---

## Success Criteria

```bash
pnpm --filter "@eata/dashboard" build  # Expected: exits 0
```