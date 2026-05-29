# Wave F: CreateTaskForm.tsx Coverage Improvement

## Goal

Improve `apps/dashboard/src/components/CreateTaskForm.tsx` coverage from 79.43% to ~90%.

## Current State

| Metric | Value |
|--------|-------|
| File lines | 259 |
| Current coverage | 79.43% stmts |
| Test file | `CreateTaskForm.test.tsx` (form rendering, validation, submit) |

## Untested Code Paths

| Path | Lines | Status |
|------|-------|--------|
| Provider loading success → renders selector | 68-78 | 0% |
| Provider loading failure → graceful skip | 79 | 0% |
| Provider selection → providerId in data | 82-86 | 0% |
| Submit error → error message display | 108-112 | 0% |
| Submitting state → button disabled | 100 | 0% |
| llmModel validation error | 44-46 | 0% (Radix Select limitation) |

## Approach: Extend Existing Test File

**Why this approach:**
- Reuse existing store mock and fetch stub patterns
- Follows project convention (extend, don't create new files)
- Provider API mock is straightforward

**Alternatives considered:**
- Mock Radix Select component — rejected: too much mocking, low value
- Test via Playwright e2e — rejected: out of scope for unit tests

## Detailed Test Plan

### Mock Setup

Existing mocks already handle:
- `vi.mock('../stores/taskStore')` — store mock
- `vi.stubGlobal('fetch')` — API mock

Need to add:
- Mock `api.providers.list` response for provider loading tests

### 1. Provider Loading (2 tests)

```ts
it('renders provider selector when providers are loaded', async () => {
  // Mock fetch to return providers list
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({
      providers: [
        { id: 'p1', name: 'Provider 1', enabled: true },
        { id: 'p2', name: 'Provider 2', enabled: true },
      ],
      activeProviderId: 'p1',
    })})
    .mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
  );

  render(<CreateTaskForm open={true} onOpenChange={vi.fn()} />);
  await waitFor(() => {
    expect(screen.getByText('Provider 1')).toBeInTheDocument();
  });
});

it('handles provider loading failure gracefully', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockRejectedValueOnce(new Error('Network error'))
  );
  // Should not crash
  render(<CreateTaskForm open={true} onOpenChange={vi.fn()} />);
  await waitFor(() => {
    expect(screen.getByLabelText('Goal')).toBeInTheDocument();
  });
});
```

### 2. Submit Error Display (1 test)

```ts
it('displays error message when createTask fails', async () => {
  mockCreateTask.mockRejectedValueOnce(new Error('Server error'));
  render(<CreateTaskForm open={true} onOpenChange={vi.fn()} />);

  fireEvent.change(screen.getByLabelText('Goal'), { target: { value: 'Test' } });
  fireEvent.change(screen.getByLabelText('Target App Path'), { target: { value: '/app' } });
  fireEvent.click(screen.getByText('Create Task'));

  await waitFor(() => {
    expect(screen.getByText(/Server error/)).toBeInTheDocument();
  });
});
```

### 3. Submitting State (1 test)

```ts
it('disables submit button while submitting', async () => {
  let resolveCreate: (v: unknown) => void;
  mockCreateTask.mockReturnValueOnce(new Promise(r => { resolveCreate = r; }));

  render(<CreateTaskForm open={true} onOpenChange={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Goal'), { target: { value: 'Test' } });
  fireEvent.change(screen.getByLabelText('Target App Path'), { target: { value: '/app' } });
  fireEvent.click(screen.getByText('Create Task'));

  await waitFor(() => {
    expect(screen.getByText('Create Task')).toBeDisabled();
  });

  resolveCreate!(undefined);
});
```

### 4. Provider Selection (1 test)

```ts
it('includes providerId in submission when provider selected', async () => {
  // Load providers, select one, submit
  // Verify mockCreateTask was called with providerId field
});
```

### 5. handleOpenChange(true) (1 test)

```ts
it('does not reset form when opening', () => {
  const { rerender } = render(<CreateTaskForm open={false} onOpenChange={vi.fn()} />);
  rerender(<CreateTaskForm open={true} onOpenChange={vi.fn()} />);
  // Form should be rendered without reset
  expect(screen.getByLabelText('Goal')).toBeInTheDocument();
});
```

## Expected Coverage

| After | Stmts | Branches |
|-------|-------|----------|
| CreateTaskForm.tsx | ~90% | ~80% |
| Overall project | +0.2% | |

## Verification

- `npx vitest run apps/dashboard/src/__tests__/CreateTaskForm.test.tsx` — all tests pass
- `npx vitest run --coverage` — CreateTaskForm.tsx ≥ 85%
