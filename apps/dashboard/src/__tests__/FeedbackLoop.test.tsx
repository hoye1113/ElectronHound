import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import FeedbackLoop from '../pages/FeedbackLoop';
import type { FeedbackPattern } from '@eata/shared-types';

// ─── Mock api module ──────────────────────────────────────────────────────────

const mockGetPatterns = vi.fn();

vi.mock('../lib/api', () => ({
  api: {
    feedback: {
      getPatterns: (...args: unknown[]) => mockGetPatterns(...args),
    },
  },
}));

// ─── Test data ────────────────────────────────────────────────────────────────

function makePattern(overrides: Partial<FeedbackPattern> = {}): FeedbackPattern {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    errorType: 'ElementNotFound',
    targetDescription: 'Login button not found on page',
    remediationHint: 'Verify selector matches the current DOM structure',
    similarityKeywords: ['selector', 'DOM', 'login'],
    frequency: 5,
    lastSeen: '2026-05-19T10:00:00Z',
    relatedGoalPatterns: [],
    ...overrides,
  };
}

const mockPatterns: FeedbackPattern[] = [
  makePattern({
    id: '550e8400-e29b-41d4-a716-446655440000',
    errorType: 'ElementNotFound',
    targetDescription: 'Login button not found on page',
    remediationHint: 'Verify selector matches the current DOM structure',
    similarityKeywords: ['selector', 'DOM', 'login'],
    frequency: 5,
  }),
  makePattern({
    id: '550e8400-e29b-41d4-a716-446655440001',
    errorType: 'TimeoutError',
    targetDescription: 'Page load timed out',
    remediationHint: 'Increase timeout or check network',
    similarityKeywords: ['timeout', 'network', 'slow'],
    frequency: 12,
  }),
  makePattern({
    id: '550e8400-e29b-41d4-a716-446655440002',
    errorType: 'AssertionFailed',
    targetDescription: 'Expected text not found in element',
    remediationHint: 'Check if text content has changed',
    similarityKeywords: ['text', 'assertion', 'content'],
    frequency: 3,
  }),
];

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('FeedbackLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: return mock patterns
    mockGetPatterns.mockResolvedValue({ patterns: mockPatterns });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Rendering
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Rendering', () => {
    it('renders the feedback loop panel title', async () => {
      render(<FeedbackLoop />);

      await waitFor(() => {
        expect(screen.getByText('Feedback Loop')).toBeInTheDocument();
      });
    });

    it('renders the pattern count subtitle', async () => {
      render(<FeedbackLoop />);

      await waitFor(() => {
        expect(screen.getByText(/3 patterns detected across tasks/)).toBeInTheDocument();
      });
    });

    it('renders singular pattern text for one pattern', async () => {
      mockGetPatterns.mockResolvedValue({ patterns: [mockPatterns[0]] });
      render(<FeedbackLoop />);

      await waitFor(() => {
        expect(screen.getByText(/1 pattern detected across tasks/)).toBeInTheDocument();
      });
    });

    it('renders the search input', async () => {
      render(<FeedbackLoop />);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText('Search by error type, description, or keyword...'),
        ).toBeInTheDocument();
      });
    });

    it('calls api.feedback.getPatterns on mount', async () => {
      render(<FeedbackLoop />);

      await waitFor(() => {
        expect(mockGetPatterns).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Loading State
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Loading State', () => {
    it('shows loading indicator while fetching patterns', () => {
      // Return a promise that never resolves to keep loading state
      mockGetPatterns.mockReturnValue(new Promise(() => {}));
      render(<FeedbackLoop />);

      expect(screen.getByText('Loading patterns...')).toBeInTheDocument();
    });

    it('shows a spinner element during loading', () => {
      mockGetPatterns.mockReturnValue(new Promise(() => {}));
      render(<FeedbackLoop />);

      // The spinner has animate-spin class
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('hides loading indicator after patterns are fetched', async () => {
      render(<FeedbackLoop />);

      await waitFor(() => {
        expect(screen.queryByText('Loading patterns...')).not.toBeInTheDocument();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Empty State
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Empty State', () => {
    it('renders empty state when no patterns are returned', async () => {
      mockGetPatterns.mockResolvedValue({ patterns: [] });
      render(<FeedbackLoop />);

      await waitFor(() => {
        expect(screen.getByText('No patterns found')).toBeInTheDocument();
      });
    });

    it('shows 0 patterns in subtitle when empty', async () => {
      mockGetPatterns.mockResolvedValue({ patterns: [] });
      render(<FeedbackLoop />);

      await waitFor(() => {
        expect(screen.getByText(/0 patterns detected across tasks/)).toBeInTheDocument();
      });
    });

    it('shows empty state when API call fails silently', async () => {
      mockGetPatterns.mockRejectedValue(new Error('Network error'));
      render(<FeedbackLoop />);

      await waitFor(() => {
        // Component catches the error silently and patterns stays []
        expect(screen.getByText('No patterns found')).toBeInTheDocument();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Feedback Display
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Feedback Display', () => {
    it('renders feedback items (patterns) after loading', async () => {
      render(<FeedbackLoop />);

      await waitFor(() => {
        expect(screen.getByText('ElementNotFound')).toBeInTheDocument();
        expect(screen.getByText('TimeoutError')).toBeInTheDocument();
        expect(screen.getByText('AssertionFailed')).toBeInTheDocument();
      });
    });

    it('renders target descriptions for each pattern', async () => {
      render(<FeedbackLoop />);

      await waitFor(() => {
        expect(screen.getByText('Login button not found on page')).toBeInTheDocument();
        expect(screen.getByText('Page load timed out')).toBeInTheDocument();
        expect(screen.getByText('Expected text not found in element')).toBeInTheDocument();
      });
    });

    it('renders remediation hints for each pattern', async () => {
      render(<FeedbackLoop />);

      await waitFor(() => {
        expect(
          screen.getByText('Verify selector matches the current DOM structure'),
        ).toBeInTheDocument();
        expect(screen.getByText('Increase timeout or check network')).toBeInTheDocument();
        expect(screen.getByText('Check if text content has changed')).toBeInTheDocument();
      });
    });

    it('renders similarity keywords as tags', async () => {
      render(<FeedbackLoop />);

      await waitFor(() => {
        expect(screen.getByText('selector')).toBeInTheDocument();
        expect(screen.getByText('DOM')).toBeInTheDocument();
        expect(screen.getByText('login')).toBeInTheDocument();
      });
    });

    it('renders frequency counts', async () => {
      render(<FeedbackLoop />);

      await waitFor(() => {
        expect(screen.getByText('5×')).toBeInTheDocument();
        expect(screen.getByText('12×')).toBeInTheDocument();
        expect(screen.getByText('3×')).toBeInTheDocument();
      });
    });

    it('renders last seen timestamps', async () => {
      render(<FeedbackLoop />);

      await waitFor(() => {
        const lastSeenElements = screen.getAllByText(/Last seen:/);
        expect(lastSeenElements.length).toBeGreaterThanOrEqual(3);
      });
    });

    it('sorts patterns by frequency in descending order', async () => {
      render(<FeedbackLoop />);

      await waitFor(() => {
        // TimeoutError (freq 12) should appear first, then ElementNotFound (5), then AssertionFailed (3)
        // The first pattern should be TimeoutError (highest frequency)
        expect(screen.getByText('TimeoutError')).toBeInTheDocument();
      });

      // Verify the DOM order: TimeoutError (12×) > ElementNotFound (5×) > AssertionFailed (3×)
      const allText = document.body.textContent ?? '';
      const timeoutPos = allText.indexOf('TimeoutError');
      const elementNotFoundPos = allText.indexOf('ElementNotFound');
      const assertionPos = allText.indexOf('AssertionFailed');

      expect(timeoutPos).toBeLessThan(elementNotFoundPos);
      expect(elementNotFoundPos).toBeLessThan(assertionPos);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Search / Filter
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Search / Filter', () => {
    it('filters patterns by error type', async () => {
      render(<FeedbackLoop />);

      await waitFor(() => {
        expect(screen.getByText('TimeoutError')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(
        'Search by error type, description, or keyword...',
      );
      fireEvent.change(searchInput, { target: { value: 'Timeout' } });

      expect(screen.getByText('TimeoutError')).toBeInTheDocument();
      expect(screen.queryByText('ElementNotFound')).not.toBeInTheDocument();
      expect(screen.queryByText('AssertionFailed')).not.toBeInTheDocument();
    });

    it('filters patterns by target description', async () => {
      render(<FeedbackLoop />);

      await waitFor(() => {
        expect(screen.getByText('Login button not found on page')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(
        'Search by error type, description, or keyword...',
      );
      fireEvent.change(searchInput, { target: { value: 'login' } });

      expect(screen.getByText('ElementNotFound')).toBeInTheDocument();
      expect(screen.queryByText('TimeoutError')).not.toBeInTheDocument();
      expect(screen.queryByText('AssertionFailed')).not.toBeInTheDocument();
    });

    it('filters patterns by remediation hint', async () => {
      render(<FeedbackLoop />);

      await waitFor(() => {
        expect(screen.getByText('TimeoutError')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(
        'Search by error type, description, or keyword...',
      );
      fireEvent.change(searchInput, { target: { value: 'network' } });

      expect(screen.getByText('TimeoutError')).toBeInTheDocument();
      expect(screen.queryByText('ElementNotFound')).not.toBeInTheDocument();
    });

    it('filters patterns by similarity keyword', async () => {
      render(<FeedbackLoop />);

      await waitFor(() => {
        expect(screen.getByText('AssertionFailed')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(
        'Search by error type, description, or keyword...',
      );
      fireEvent.change(searchInput, { target: { value: 'assertion' } });

      expect(screen.getByText('AssertionFailed')).toBeInTheDocument();
      expect(screen.queryByText('ElementNotFound')).not.toBeInTheDocument();
      expect(screen.queryByText('TimeoutError')).not.toBeInTheDocument();
    });

    it('is case insensitive when filtering', async () => {
      render(<FeedbackLoop />);

      await waitFor(() => {
        expect(screen.getByText('TimeoutError')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(
        'Search by error type, description, or keyword...',
      );
      fireEvent.change(searchInput, { target: { value: 'TIMEOUT' } });

      expect(screen.getByText('TimeoutError')).toBeInTheDocument();
      expect(screen.queryByText('ElementNotFound')).not.toBeInTheDocument();
    });

    it('shows no results message when search has no matches', async () => {
      render(<FeedbackLoop />);

      await waitFor(() => {
        expect(screen.getByText('TimeoutError')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(
        'Search by error type, description, or keyword...',
      );
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

      expect(screen.getByText('No patterns found')).toBeInTheDocument();
    });

    it('clears filter when search input is emptied', async () => {
      render(<FeedbackLoop />);

      await waitFor(() => {
        expect(screen.getByText('TimeoutError')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(
        'Search by error type, description, or keyword...',
      );

      // Apply filter
      fireEvent.change(searchInput, { target: { value: 'Timeout' } });
      expect(screen.queryByText('ElementNotFound')).not.toBeInTheDocument();

      // Clear filter
      fireEvent.change(searchInput, { target: { value: '' } });
      expect(screen.getByText('ElementNotFound')).toBeInTheDocument();
      expect(screen.getByText('TimeoutError')).toBeInTheDocument();
      expect(screen.getByText('AssertionFailed')).toBeInTheDocument();
    });

    it('updates subtitle count when filter is applied', async () => {
      render(<FeedbackLoop />);

      await waitFor(() => {
        expect(screen.getByText(/3 patterns detected across tasks/)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(
        'Search by error type, description, or keyword...',
      );
      fireEvent.change(searchInput, { target: { value: 'Timeout' } });

      expect(screen.getByText(/1 pattern detected across tasks/)).toBeInTheDocument();
    });

    it('trims whitespace from search query', async () => {
      render(<FeedbackLoop />);

      await waitFor(() => {
        expect(screen.getByText('TimeoutError')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(
        'Search by error type, description, or keyword...',
      );
      fireEvent.change(searchInput, { target: { value: '  Timeout  ' } });

      expect(screen.getByText('TimeoutError')).toBeInTheDocument();
      expect(screen.queryByText('ElementNotFound')).not.toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Interaction
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Interaction', () => {
    it('allows typing in the search input', async () => {
      render(<FeedbackLoop />);

      await waitFor(() => {
        expect(screen.getByText('TimeoutError')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(
        'Search by error type, description, or keyword...',
      ) as HTMLInputElement;

      fireEvent.change(searchInput, { target: { value: 'test query' } });

      expect(searchInput.value).toBe('test query');
    });

    it('has proper aria-label on search input', async () => {
      render(<FeedbackLoop />);

      await waitFor(() => {
        expect(screen.getByLabelText('Search feedback patterns')).toBeInTheDocument();
      });
    });
  });
});
