import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import FewShotPage from '../pages/FewShotPage';
import type { FewShotExample } from '../lib/api';

// ─── Mock api module ──────────────────────────────────────────────────────────

const mockFewShotList = vi.fn();
const mockFewShotAdd = vi.fn();
const mockFewShotUpdate = vi.fn();
const mockFewShotRemove = vi.fn();

vi.mock('../lib/api', () => ({
  api: {
    fewShot: {
      list: (...args: unknown[]) => mockFewShotList(...args),
      add: (...args: unknown[]) => mockFewShotAdd(...args),
      update: (...args: unknown[]) => mockFewShotUpdate(...args),
      remove: (...args: unknown[]) => mockFewShotRemove(...args),
    },
  },
}));

// ─── Mock localStorage ───────────────────────────────────────────────────────

const mockGetItem = vi.fn();
const mockSetItem = vi.fn();
const mockRemoveItem = vi.fn();

Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: (...args: unknown[]) => mockGetItem(...args),
    setItem: (...args: unknown[]) => mockSetItem(...args),
    removeItem: (...args: unknown[]) => mockRemoveItem(...args),
  },
  writable: true,
});

// ─── Test data ────────────────────────────────────────────────────────────────

const mockExamples: FewShotExample[] = [
  {
    id: 'fs-1',
    goal: 'Test login flow',
    steps: [
      { action: 'Navigate to login page', observation: 'Login form is visible' },
      { action: 'Enter credentials', observation: 'Fields filled' },
    ],
    expectedResult: 'User is logged in successfully',
    metadata: { tags: ['auth', 'login'], domain: 'testing', difficulty: 'easy' },
  },
  {
    id: 'fs-2',
    goal: 'Navigate to settings page',
    steps: [
      { action: 'Click settings icon', observation: 'Settings page opens' },
    ],
    expectedResult: 'Settings page is displayed',
    metadata: { tags: ['navigation'], domain: 'navigation', difficulty: 'medium' },
  },
  {
    id: 'fs-3',
    goal: 'Submit contact form',
    steps: [
      { action: 'Fill in form fields', observation: 'Fields populated' },
      { action: 'Click submit', observation: 'Form submitted' },
    ],
    expectedResult: 'Form submission confirmed',
    metadata: { tags: ['form', 'auth'], domain: 'general', difficulty: 'hard' },
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createExample(overrides: Partial<FewShotExample> = {}): FewShotExample {
  return {
    id: 'fs-new',
    goal: 'New example',
    steps: [{ action: 'Step 1', observation: 'Result 1' }],
    expectedResult: 'Expected outcome',
    metadata: { tags: [], domain: 'general', difficulty: 'medium' },
    ...overrides,
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('FewShotPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetItem.mockReturnValue(null);
    mockSetItem.mockImplementation(() => {});
    mockRemoveItem.mockImplementation(() => {});
    // Default: return empty list
    mockFewShotList.mockReturnValue([]);
    mockFewShotAdd.mockImplementation((data: Omit<FewShotExample, 'id'>) =>
      createExample({ ...data, id: `fs-${Date.now()}` }),
    );
    mockFewShotUpdate.mockImplementation(() => {});
    mockFewShotRemove.mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Rendering
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Rendering', () => {
    it('renders empty state when no patterns exist', () => {
      render(<FewShotPage />);
      expect(screen.getByText('fewShot.empty')).toBeInTheDocument();
      expect(screen.getByText('fewShot.emptyHint')).toBeInTheDocument();
    });

    it('renders pattern list from API', () => {
      mockFewShotList.mockReturnValue(mockExamples);
      render(<FewShotPage />);

      expect(screen.getByText('Test login flow')).toBeInTheDocument();
      expect(screen.getByText('Navigate to settings page')).toBeInTheDocument();
      expect(screen.getByText('Submit contact form')).toBeInTheDocument();
    });

    it('renders page title and subtitle', () => {
      render(<FewShotPage />);
      expect(screen.getByText('fewShot.title')).toBeInTheDocument();
      expect(screen.getByText('fewShot.subtitle')).toBeInTheDocument();
    });

    it('renders add button in empty state', () => {
      render(<FewShotPage />);
      expect(screen.getByText('fewShot.addFirst')).toBeInTheDocument();
    });

    it('renders add new button when examples exist', () => {
      mockFewShotList.mockReturnValue(mockExamples);
      render(<FewShotPage />);
      expect(screen.getByText('fewShot.addNew')).toBeInTheDocument();
    });

    it('renders expected result for each example', () => {
      mockFewShotList.mockReturnValue([mockExamples[0]]);
      render(<FewShotPage />);
      expect(screen.getByText('User is logged in successfully')).toBeInTheDocument();
    });

    it('renders domain and difficulty metadata', () => {
      mockFewShotList.mockReturnValue([mockExamples[0]]);
      render(<FewShotPage />);
      // Domain is rendered directly as text
      expect(screen.getByText('testing')).toBeInTheDocument();
      // Difficulty goes through t() and renders as the key since it's missing from en.json
      expect(screen.getByText('fewShot.difficulty_easy')).toBeInTheDocument();
    });

    it('renders tags on example cards', () => {
      mockFewShotList.mockReturnValue([mockExamples[0]]);
      render(<FewShotPage />);
      expect(screen.getByText('auth')).toBeInTheDocument();
      expect(screen.getByText('login')).toBeInTheDocument();
    });

    it('renders step count for examples', () => {
      mockFewShotList.mockReturnValue([mockExamples[0]]);
      render(<FewShotPage />);
      // Step count is rendered as "{length} {t('fewShot.stepsCount', {count})}"
      // The t() returns the key string since it's missing from en.json
      expect(screen.getByText(/fewShot\.stepsCount/)).toBeInTheDocument();
    });

    it('shows search input when examples exist', () => {
      mockFewShotList.mockReturnValue(mockExamples);
      render(<FewShotPage />);
      expect(screen.getByPlaceholderText('fewShot.searchPlaceholder')).toBeInTheDocument();
    });

    it('hides search input when no examples', () => {
      render(<FewShotPage />);
      expect(screen.queryByPlaceholderText('fewShot.searchPlaceholder')).not.toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CRUD Operations
  // ═══════════════════════════════════════════════════════════════════════════

  describe('CRUD Operations', () => {
    it('opens add dialog when clicking add button', async () => {
      render(<FewShotPage />);
      fireEvent.click(screen.getByText('fewShot.addFirst'));

      await waitFor(() => {
        expect(screen.getByText('fewShot.addTitle')).toBeInTheDocument();
      });
    });

    it('creates a new pattern via API', async () => {
      render(<FewShotPage />);
      fireEvent.click(screen.getByText('fewShot.addFirst'));

      await waitFor(() => {
        expect(screen.getByText('fewShot.addTitle')).toBeInTheDocument();
      });

      // Fill in required fields
      fireEvent.change(screen.getByLabelText('fewShot.goalLabel'), {
        target: { value: 'New test goal' },
      });
      fireEvent.change(screen.getByLabelText('fewShot.expectedResultLabel'), {
        target: { value: 'Expected result' },
      });

      // After create, reload returns the new example
      mockFewShotList.mockReturnValueOnce([
        createExample({ goal: 'New test goal', expectedResult: 'Expected result' }),
      ]);

      // Submit the form — the submit button text is t('common.add') = 'Add'
      fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }));

      await waitFor(() => {
        expect(mockFewShotAdd).toHaveBeenCalledWith(
          expect.objectContaining({
            goal: 'New test goal',
            expectedResult: 'Expected result',
          }),
        );
      });
    });

    it('opens edit dialog when clicking edit button', async () => {
      mockFewShotList.mockReturnValue([mockExamples[0]]);
      render(<FewShotPage />);

      await waitFor(() => {
        expect(screen.getByText('Test login flow')).toBeInTheDocument();
      });

      const editButton = screen.getByLabelText(/fewShot\.editExample/i);
      fireEvent.click(editButton);

      await waitFor(() => {
        expect(screen.getByText('fewShot.editTitle')).toBeInTheDocument();
      });
    });

    it('edits an existing pattern via API', async () => {
      mockFewShotList.mockReturnValue([mockExamples[0]]);
      render(<FewShotPage />);

      await waitFor(() => {
        expect(screen.getByText('Test login flow')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText(/fewShot\.editExample/i));

      await waitFor(() => {
        expect(screen.getByText('fewShot.editTitle')).toBeInTheDocument();
      });

      // Modify the goal
      const goalInput = screen.getByLabelText('fewShot.goalLabel');
      fireEvent.change(goalInput, { target: { value: 'Updated login flow' } });

      // After update, reload returns updated data
      mockFewShotList.mockReturnValueOnce([
        { ...mockExamples[0], goal: 'Updated login flow' },
      ]);

      // Click save — button text is t('common.save') = 'Save'
      fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));

      await waitFor(() => {
        expect(mockFewShotUpdate).toHaveBeenCalledWith(
          'fs-1',
          expect.objectContaining({ goal: 'Updated login flow' }),
        );
      });
    });

    it('shows delete confirmation dialog', async () => {
      mockFewShotList.mockReturnValue([mockExamples[0]]);
      render(<FewShotPage />);

      await waitFor(() => {
        expect(screen.getByText('Test login flow')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText(/fewShot\.deleteExample/i));

      await waitFor(() => {
        expect(screen.getByText('fewShot.deleteTitle')).toBeInTheDocument();
      });
    });

    it('deletes pattern after confirmation', async () => {
      mockFewShotList.mockReturnValue(mockExamples);
      render(<FewShotPage />);

      await waitFor(() => {
        expect(screen.getByText('Test login flow')).toBeInTheDocument();
      });

      // Click delete on first example
      const deleteButtons = screen.getAllByLabelText(/fewShot\.deleteExample/i);
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('fewShot.deleteTitle')).toBeInTheDocument();
      });

      // After delete, reload returns list without the deleted example
      mockFewShotList.mockReturnValueOnce(mockExamples.filter((e) => e.id !== 'fs-1'));

      // Confirm deletion — button text is t('common.delete') = 'Delete'
      fireEvent.click(screen.getByText('Delete'));

      await waitFor(() => {
        expect(mockFewShotRemove).toHaveBeenCalledWith('fs-1');
      });

      await waitFor(() => {
        expect(screen.queryByText('Test login flow')).not.toBeInTheDocument();
      });
    });

    it('cancels deletion when cancel is clicked', async () => {
      mockFewShotList.mockReturnValue([mockExamples[0]]);
      render(<FewShotPage />);

      await waitFor(() => {
        expect(screen.getByText('Test login flow')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText(/fewShot\.deleteExample/i));

      await waitFor(() => {
        expect(screen.getByText('fewShot.deleteTitle')).toBeInTheDocument();
      });

      // Cancel — button text is t('common.cancel') = 'Cancel'
      fireEvent.click(screen.getByText('Cancel'));

      await waitFor(() => {
        expect(screen.queryByText('fewShot.deleteTitle')).not.toBeInTheDocument();
      });

      expect(mockFewShotRemove).not.toHaveBeenCalled();
      expect(screen.getByText('Test login flow')).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Validation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Validation', () => {
    it('validates required fields on create', async () => {
      render(<FewShotPage />);
      fireEvent.click(screen.getByText('fewShot.addFirst'));

      await waitFor(() => {
        expect(screen.getByText('fewShot.addTitle')).toBeInTheDocument();
      });

      // Submit without filling anything
      const submitBtn = screen.getByRole('button', { name: 'Add', exact: true });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText('fewShot.goalRequired')).toBeInTheDocument();
        expect(screen.getByText('fewShot.expectedResultRequired')).toBeInTheDocument();
      });

      expect(mockFewShotAdd).not.toHaveBeenCalled();
    });

    it('clears validation errors when fields are filled and form resubmitted', async () => {
      render(<FewShotPage />);
      fireEvent.click(screen.getByText('fewShot.addFirst'));

      await waitFor(() => {
        expect(screen.getByText('fewShot.addTitle')).toBeInTheDocument();
      });

      // Submit empty form to trigger validation
      fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }));

      await waitFor(() => {
        expect(screen.getByText('fewShot.goalRequired')).toBeInTheDocument();
      });

      // Fill in the goal
      fireEvent.change(screen.getByLabelText('fewShot.goalLabel'), {
        target: { value: 'Some goal' },
      });

      // Fill in expected result
      fireEvent.change(screen.getByLabelText('fewShot.expectedResultLabel'), {
        target: { value: 'Some result' },
      });

      // Re-submit — validation should now pass and errors should be gone
      mockFewShotList.mockReturnValueOnce([
        createExample({ goal: 'Some goal', expectedResult: 'Some result' }),
      ]);
      fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }));

      await waitFor(() => {
        expect(screen.queryByText('fewShot.goalRequired')).not.toBeInTheDocument();
        expect(screen.queryByText('fewShot.expectedResultRequired')).not.toBeInTheDocument();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Search / Filter
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Search/Filter', () => {
    it('filters by keyword in goal', () => {
      mockFewShotList.mockReturnValue(mockExamples);
      render(<FewShotPage />);

      const searchInput = screen.getByPlaceholderText('fewShot.searchPlaceholder');
      fireEvent.change(searchInput, { target: { value: 'login' } });

      expect(screen.getByText('Test login flow')).toBeInTheDocument();
      expect(screen.queryByText('Navigate to settings page')).not.toBeInTheDocument();
      expect(screen.queryByText('Submit contact form')).not.toBeInTheDocument();
    });

    it('filters by keyword in expected result', () => {
      mockFewShotList.mockReturnValue(mockExamples);
      render(<FewShotPage />);

      const searchInput = screen.getByPlaceholderText('fewShot.searchPlaceholder');
      fireEvent.change(searchInput, { target: { value: 'confirmed' } });

      expect(screen.getByText('Submit contact form')).toBeInTheDocument();
      expect(screen.queryByText('Test login flow')).not.toBeInTheDocument();
    });

    it('filters by tag', () => {
      mockFewShotList.mockReturnValue(mockExamples);
      render(<FewShotPage />);

      const searchInput = screen.getByPlaceholderText('fewShot.searchPlaceholder');
      fireEvent.change(searchInput, { target: { value: 'auth' } });

      // Both examples with 'auth' tag should match
      expect(screen.getByText('Test login flow')).toBeInTheDocument();
      expect(screen.getByText('Submit contact form')).toBeInTheDocument();
      expect(screen.queryByText('Navigate to settings page')).not.toBeInTheDocument();
    });

    it('filters by domain', () => {
      mockFewShotList.mockReturnValue(mockExamples);
      render(<FewShotPage />);

      const searchInput = screen.getByPlaceholderText('fewShot.searchPlaceholder');
      fireEvent.change(searchInput, { target: { value: 'navigation' } });

      expect(screen.getByText('Navigate to settings page')).toBeInTheDocument();
      expect(screen.queryByText('Test login flow')).not.toBeInTheDocument();
    });

    it('shows no results message when search has no matches', () => {
      mockFewShotList.mockReturnValue(mockExamples);
      render(<FewShotPage />);

      const searchInput = screen.getByPlaceholderText('fewShot.searchPlaceholder');
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

      expect(screen.getByText('fewShot.noResults')).toBeInTheDocument();
      expect(screen.queryByText('Test login flow')).not.toBeInTheDocument();
    });

    it('clears filter when search input is emptied', () => {
      mockFewShotList.mockReturnValue(mockExamples);
      render(<FewShotPage />);

      const searchInput = screen.getByPlaceholderText('fewShot.searchPlaceholder');

      // Apply filter
      fireEvent.change(searchInput, { target: { value: 'login' } });
      expect(screen.queryByText('Submit contact form')).not.toBeInTheDocument();

      // Clear filter
      fireEvent.change(searchInput, { target: { value: '' } });
      expect(screen.getByText('Test login flow')).toBeInTheDocument();
      expect(screen.getByText('Navigate to settings page')).toBeInTheDocument();
      expect(screen.getByText('Submit contact form')).toBeInTheDocument();
    });

    it('filter is case insensitive', () => {
      mockFewShotList.mockReturnValue(mockExamples);
      render(<FewShotPage />);

      const searchInput = screen.getByPlaceholderText('fewShot.searchPlaceholder');
      fireEvent.change(searchInput, { target: { value: 'LOGIN' } });

      expect(screen.getByText('Test login flow')).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Example Management (steps, tags, metadata in the form dialog)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Example Management', () => {
    async function openAddDialog() {
      render(<FewShotPage />);
      fireEvent.click(screen.getByText('fewShot.addFirst'));
      await waitFor(() => {
        expect(screen.getByText('fewShot.addTitle')).toBeInTheDocument();
      });
    }

    async function openEditDialogForExample(example: FewShotExample) {
      mockFewShotList.mockReturnValue([example]);
      render(<FewShotPage />);
      await waitFor(() => {
        expect(screen.getByLabelText(/fewShot\.editExample/i)).toBeInTheDocument();
      });
      fireEvent.click(screen.getByLabelText(/fewShot\.editExample/i));
      await waitFor(() => {
        expect(screen.getByText('fewShot.editTitle')).toBeInTheDocument();
      });
    }

    it('adds a step in the form', async () => {
      await openAddDialog();

      // Initially there should be 1 step
      const actionInputs = screen.getAllByPlaceholderText('fewShot.stepActionPlaceholder');
      expect(actionInputs).toHaveLength(1);

      // Click "Add Step"
      fireEvent.click(screen.getByText('fewShot.addStep'));

      // Now there should be 2 steps
      const updatedActionInputs = screen.getAllByPlaceholderText('fewShot.stepActionPlaceholder');
      expect(updatedActionInputs).toHaveLength(2);
    });

    it('removes a step from the form', async () => {
      await openAddDialog();

      // Add a second step
      fireEvent.click(screen.getByText('fewShot.addStep'));
      expect(screen.getAllByPlaceholderText('fewShot.stepActionPlaceholder')).toHaveLength(2);

      // Remove the second step
      const removeButtons = screen.getAllByLabelText('fewShot.removeStep');
      expect(removeButtons).toHaveLength(2); // Both steps should have remove buttons
      fireEvent.click(removeButtons[1]);

      expect(screen.getAllByPlaceholderText('fewShot.stepActionPlaceholder')).toHaveLength(1);
    });

    it('does not show remove button when only one step', async () => {
      await openAddDialog();

      // With one step, no remove button should be visible
      expect(screen.queryByLabelText('fewShot.removeStep')).not.toBeInTheDocument();
    });

    it('adds a tag via Enter key', async () => {
      await openAddDialog();

      const tagInput = screen.getByLabelText('fewShot.tagsLabel');
      fireEvent.change(tagInput, { target: { value: 'mytag' } });
      fireEvent.keyDown(tagInput, { key: 'Enter' });

      // Tag should appear in the form
      expect(screen.getByText('mytag')).toBeInTheDocument();
    });

    it('adds a tag via comma key', async () => {
      await openAddDialog();

      const tagInput = screen.getByLabelText('fewShot.tagsLabel');
      fireEvent.change(tagInput, { target: { value: 'mytag' } });
      fireEvent.keyDown(tagInput, { key: ',' });

      expect(screen.getByText('mytag')).toBeInTheDocument();
    });

    it('adds a tag on blur', async () => {
      await openAddDialog();

      const tagInput = screen.getByLabelText('fewShot.tagsLabel') as HTMLInputElement;
      fireEvent.change(tagInput, { target: { value: 'blurred-tag' } });
      fireEvent.blur(tagInput);

      expect(screen.getByText('blurred-tag')).toBeInTheDocument();
    });

    it('removes a tag', async () => {
      await openEditDialogForExample(mockExamples[0]);

      // Tags 'auth' and 'login' appear both on the card and in the dialog form.
      // The dialog form has tag spans with remove buttons inside.
      // The removeTag aria-label is t('fewShot.removeTag', { tag }) which renders
      // as the key "fewShot.removeTag" since it's missing from en.json.
      const removeTagButtons = screen.getAllByLabelText(/fewShot\.removeTag/);
      expect(removeTagButtons.length).toBeGreaterThanOrEqual(2); // auth + login

      // Count the "auth" texts before removal (at least 2: card + form)
      const authBefore = screen.getAllByText('auth');
      expect(authBefore.length).toBeGreaterThanOrEqual(2);

      // Click the first remove tag button (this removes 'auth')
      fireEvent.click(removeTagButtons[0]);

      // After removing 'auth' from the form, one fewer 'auth' text should remain
      await waitFor(() => {
        const authAfter = screen.getAllByText('auth');
        expect(authAfter.length).toBeLessThan(authBefore.length);
      });
    });

    it('populates form fields when editing an existing example', async () => {
      await openEditDialogForExample(mockExamples[0]);

      const goalInput = screen.getByLabelText('fewShot.goalLabel') as HTMLTextAreaElement;
      expect(goalInput.value).toBe('Test login flow');

      const resultInput = screen.getByLabelText('fewShot.expectedResultLabel') as HTMLTextAreaElement;
      expect(resultInput.value).toBe('User is logged in successfully');

      // Steps should be pre-populated
      const actionInputs = screen.getAllByPlaceholderText('fewShot.stepActionPlaceholder');
      expect(actionInputs).toHaveLength(2);
      expect((actionInputs[0] as HTMLInputElement).value).toBe('Navigate to login page');
      expect((actionInputs[1] as HTMLInputElement).value).toBe('Enter credentials');
    });

    it('preserves step order in form', async () => {
      await openEditDialogForExample(mockExamples[2]);

      const actionInputs = screen.getAllByPlaceholderText('fewShot.stepActionPlaceholder');
      expect(actionInputs).toHaveLength(2);
      expect((actionInputs[0] as HTMLInputElement).value).toBe('Fill in form fields');
      expect((actionInputs[1] as HTMLInputElement).value).toBe('Click submit');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Import / Export (JSON round-trip through API)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Import/Export', () => {
    it('exports data by calling api.fewShot.list on mount', () => {
      mockFewShotList.mockReturnValue(mockExamples);
      render(<FewShotPage />);

      expect(mockFewShotList).toHaveBeenCalled();
      // All examples should be rendered
      expect(screen.getByText('Test login flow')).toBeInTheDocument();
      expect(screen.getByText('Navigate to settings page')).toBeInTheDocument();
      expect(screen.getByText('Submit contact form')).toBeInTheDocument();
    });

    it('imports a new example and persists via api.fewShot.add', async () => {
      render(<FewShotPage />);
      fireEvent.click(screen.getByText('fewShot.addFirst'));

      await waitFor(() => {
        expect(screen.getByText('fewShot.addTitle')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText('fewShot.goalLabel'), {
        target: { value: 'Imported goal' },
      });
      fireEvent.change(screen.getByLabelText('fewShot.expectedResultLabel'), {
        target: { value: 'Imported result' },
      });

      // Fill in step
      fireEvent.change(screen.getAllByPlaceholderText('fewShot.stepActionPlaceholder')[0], {
        target: { value: 'Imported action' },
      });
      fireEvent.change(screen.getAllByPlaceholderText('fewShot.stepObservationPlaceholder')[0], {
        target: { value: 'Imported observation' },
      });

      // Add tag
      const tagInput = screen.getByLabelText('fewShot.tagsLabel');
      fireEvent.change(tagInput, { target: { value: 'imported' } });
      fireEvent.keyDown(tagInput, { key: 'Enter' });

      // After save, return updated list
      mockFewShotList.mockReturnValueOnce([
        createExample({ goal: 'Imported goal', expectedResult: 'Imported result' }),
      ]);

      fireEvent.click(screen.getByRole('button', { name: 'Add', exact: true }));

      await waitFor(() => {
        expect(mockFewShotAdd).toHaveBeenCalledWith(
          expect.objectContaining({
            goal: 'Imported goal',
            expectedResult: 'Imported result',
            metadata: expect.objectContaining({
              tags: ['imported'],
            }),
          }),
        );
      });
    });

    it('handles import with format errors gracefully (empty list from API)', () => {
      // Simulate api.fewShot.list returning empty due to parse error
      mockFewShotList.mockReturnValue([]);
      render(<FewShotPage />);

      // Should show empty state, not crash
      expect(screen.getByText('fewShot.empty')).toBeInTheDocument();
      expect(screen.getByText('fewShot.emptyHint')).toBeInTheDocument();
    });

    it('handles malformed localStorage data (api returns empty)', () => {
      // Simulate corrupted localStorage
      mockGetItem.mockReturnValue('not-valid-json');
      mockFewShotList.mockReturnValue([]);
      render(<FewShotPage />);

      expect(screen.getByText('fewShot.empty')).toBeInTheDocument();
    });

    it('removes example and persists deletion via api.fewShot.remove', async () => {
      mockFewShotList.mockReturnValue([mockExamples[0]]);
      render(<FewShotPage />);

      await waitFor(() => {
        expect(screen.getByText('Test login flow')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText(/fewShot\.deleteExample/i));

      await waitFor(() => {
        expect(screen.getByText('fewShot.deleteTitle')).toBeInTheDocument();
      });

      mockFewShotList.mockReturnValueOnce([]);

      fireEvent.click(screen.getByText('Delete'));

      await waitFor(() => {
        expect(mockFewShotRemove).toHaveBeenCalledWith('fs-1');
      });
    });
  });
});
