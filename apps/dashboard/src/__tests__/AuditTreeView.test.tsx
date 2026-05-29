import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AuditTreeView from '../pages/AuditTreeView';

// Mock react-router-dom
let mockParams: { id?: string } = { id: 'audit-123' };
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useParams: () => mockParams,
  };
});

// Mock api module
const mockReportsGet = vi.fn();
vi.mock('../lib/api', () => ({
  api: {
    reports: {
      get: (...args: unknown[]) => mockReportsGet(...args),
    },
  },
}));

const makeAuditData = (overrides: Record<string, unknown> = {}) => ({
  goal: 'Test the login flow',
  testPlanner: {
    role: 'test-planner',
    auditReport: {
      severity: 'pass',
      summary: 'All test scenarios covered',
      findings: [],
      timestamp: '2026-05-28T10:00:00Z',
    },
    analysis: 'Test plan is comprehensive',
    recommendations: ['Add edge case tests'],
  },
  executionAnalyst: {
    role: 'execution-analyst',
    auditReport: {
      severity: 'info',
      summary: 'Execution completed with minor observations',
      findings: [
        { category: 'performance', description: 'Slow page load detected', severity: 'info' },
      ],
      timestamp: '2026-05-28T10:01:00Z',
    },
    analysis: 'Execution analysis complete',
    recommendations: [],
  },
  securityReviewer: {
    role: 'security-reviewer',
    auditReport: {
      severity: 'warn',
      summary: 'Potential security concerns found',
      findings: [
        { category: 'auth', description: 'Missing CSRF token validation', severity: 'warn' },
        { category: 'input', description: 'Unsanitized user input', severity: 'fail' },
      ],
      timestamp: '2026-05-28T10:02:00Z',
    },
    analysis: 'Security review complete',
    recommendations: ['Add CSRF protection', 'Sanitize all inputs'],
  },
  reportSynthesizer: {
    role: 'report-synthesizer',
    auditReport: {
      severity: 'pass',
      summary: 'Report generated successfully',
      findings: [],
      timestamp: '2026-05-28T10:03:00Z',
    },
    analysis: 'Synthesis complete',
    recommendations: [],
  },
  chainOrder: ['test-planner', 'execution-analyst', 'security-reviewer', 'report-synthesizer'],
  durationMs: 5000,
  completedAt: '2026-05-28T10:03:00Z',
  ...overrides,
});

describe('AuditTreeView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParams = { id: 'audit-123' };
  });

  // ── Loading state ──────────────────────────────────────────────────────

  it('shows loading state initially', () => {
    mockReportsGet.mockReturnValue(new Promise(() => {})); // never resolves
    render(<AuditTreeView />);
    expect(screen.getByText('Loading audit tree...')).toBeInTheDocument();
  });

  it('hides loading state after data loads', async () => {
    mockReportsGet.mockResolvedValue({ audit: makeAuditData() });
    render(<AuditTreeView />);

    await waitFor(() => {
      expect(screen.queryByText('Loading audit tree...')).not.toBeInTheDocument();
    });
  });

  // ── Error state ────────────────────────────────────────────────────────

  it('shows error state when API call fails', async () => {
    mockReportsGet.mockRejectedValue(new Error('Network error'));
    render(<AuditTreeView />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load audit data')).toBeInTheDocument();
    });
  });

  // ── Empty state ────────────────────────────────────────────────────────

  it('shows empty state when no audit data exists', async () => {
    mockReportsGet.mockResolvedValue(null);
    render(<AuditTreeView />);

    await waitFor(() => {
      expect(screen.getByText('No audit data available')).toBeInTheDocument();
    });
  });

  it('shows empty state when audit field is missing', async () => {
    mockReportsGet.mockResolvedValue({});
    render(<AuditTreeView />);

    await waitFor(() => {
      expect(screen.getByText('No audit data available')).toBeInTheDocument();
    });
  });

  // ── Tree structure ─────────────────────────────────────────────────────

  it('renders tree view with all role nodes', async () => {
    mockReportsGet.mockResolvedValue({ audit: makeAuditData() });
    render(<AuditTreeView />);

    await waitFor(() => {
      expect(screen.getByText('test-planner')).toBeInTheDocument();
      expect(screen.getByText('execution-analyst')).toBeInTheDocument();
      expect(screen.getByText('security-reviewer')).toBeInTheDocument();
      expect(screen.getByText('report-synthesizer')).toBeInTheDocument();
    });
  });

  it('renders tree with role="tree" container', async () => {
    mockReportsGet.mockResolvedValue({ audit: makeAuditData() });
    render(<AuditTreeView />);

    await waitFor(() => {
      expect(screen.getByRole('tree')).toBeInTheDocument();
    });
  });

  it('renders tree items with role="treeitem"', async () => {
    mockReportsGet.mockResolvedValue({ audit: makeAuditData() });
    render(<AuditTreeView />);

    await waitFor(() => {
      const items = screen.getAllByRole('treeitem');
      expect(items).toHaveLength(4);
    });
  });

  it('nodes are collapsed by default', async () => {
    mockReportsGet.mockResolvedValue({ audit: makeAuditData() });
    render(<AuditTreeView />);

    await waitFor(() => {
      expect(screen.getByText('test-planner')).toBeInTheDocument();
    });

    // Findings should not be visible when collapsed
    expect(screen.queryByText('All test scenarios covered')).not.toBeInTheDocument();
    expect(screen.queryByText('Slow page load detected')).not.toBeInTheDocument();
  });

  it('sets aria-expanded="false" on collapsed nodes', async () => {
    mockReportsGet.mockResolvedValue({ audit: makeAuditData() });
    render(<AuditTreeView />);

    await waitFor(() => {
      const items = screen.getAllByRole('treeitem');
      items.forEach((item) => {
        expect(item).toHaveAttribute('aria-expanded', 'false');
      });
    });
  });

  // ── Expand/collapse ────────────────────────────────────────────────────

  it('expands node when clicked', async () => {
    mockReportsGet.mockResolvedValue({ audit: makeAuditData() });
    render(<AuditTreeView />);

    await waitFor(() => {
      expect(screen.getByText('test-planner')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('test-planner'));

    await waitFor(() => {
      expect(screen.getByText('All test scenarios covered')).toBeInTheDocument();
    });
  });

  it('sets aria-expanded="true" on expanded nodes', async () => {
    mockReportsGet.mockResolvedValue({ audit: makeAuditData() });
    render(<AuditTreeView />);

    await waitFor(() => {
      expect(screen.getByText('test-planner')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('test-planner'));

    await waitFor(() => {
      const items = screen.getAllByRole('treeitem');
      expect(items[0]).toHaveAttribute('aria-expanded', 'true');
    });
  });

  it('collapses node when clicked again', async () => {
    mockReportsGet.mockResolvedValue({ audit: makeAuditData() });
    render(<AuditTreeView />);

    await waitFor(() => {
      expect(screen.getByText('test-planner')).toBeInTheDocument();
    });

    // Expand
    fireEvent.click(screen.getByText('test-planner'));
    await waitFor(() => {
      expect(screen.getByText('All test scenarios covered')).toBeInTheDocument();
    });

    // Collapse
    fireEvent.click(screen.getByText('test-planner'));
    await waitFor(() => {
      expect(screen.queryByText('All test scenarios covered')).not.toBeInTheDocument();
    });
  });

  it('can expand multiple nodes independently', async () => {
    mockReportsGet.mockResolvedValue({ audit: makeAuditData() });
    render(<AuditTreeView />);

    await waitFor(() => {
      expect(screen.getByText('test-planner')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('test-planner'));
    fireEvent.click(screen.getByText('security-reviewer'));

    await waitFor(() => {
      expect(screen.getByText('All test scenarios covered')).toBeInTheDocument();
      expect(screen.getByText('Potential security concerns found')).toBeInTheDocument();
    });
  });

  // ── Data display: audit results ───────────────────────────────────────

  it('displays severity badges for each role', async () => {
    mockReportsGet.mockResolvedValue({ audit: makeAuditData() });
    render(<AuditTreeView />);

    await waitFor(() => {
      const passBadges = screen.getAllByText('pass');
      expect(passBadges.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('info')).toBeInTheDocument();
      expect(screen.getByText('warn')).toBeInTheDocument();
    });
  });

  it('displays findings when a role node is expanded', async () => {
    mockReportsGet.mockResolvedValue({ audit: makeAuditData() });
    render(<AuditTreeView />);

    await waitFor(() => {
      expect(screen.getByText('security-reviewer')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('security-reviewer'));

    await waitFor(() => {
      expect(screen.getByText('Missing CSRF token validation')).toBeInTheDocument();
      expect(screen.getByText('Unsanitized user input')).toBeInTheDocument();
    });
  });

  it('displays summary text when expanded', async () => {
    mockReportsGet.mockResolvedValue({ audit: makeAuditData() });
    render(<AuditTreeView />);

    await waitFor(() => {
      expect(screen.getByText('execution-analyst')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('execution-analyst'));

    await waitFor(() => {
      expect(screen.getByText('Execution completed with minor observations')).toBeInTheDocument();
    });
  });

  it('displays severity indicators on findings', async () => {
    mockReportsGet.mockResolvedValue({ audit: makeAuditData() });
    render(<AuditTreeView />);

    await waitFor(() => {
      expect(screen.getByText('security-reviewer')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('security-reviewer'));

    await waitFor(() => {
      // The findings list should be rendered
      const findings = screen.getAllByText(/Missing CSRF|Unsanitized/);
      expect(findings).toHaveLength(2);
    });
  });

  it('renders without findings for roles with empty findings', async () => {
    mockReportsGet.mockResolvedValue({ audit: makeAuditData() });
    render(<AuditTreeView />);

    await waitFor(() => {
      expect(screen.getByText('test-planner')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('test-planner'));

    await waitFor(() => {
      expect(screen.getByText('All test scenarios covered')).toBeInTheDocument();
    });

    // No findings list should be present since testPlanner has no findings
    expect(screen.queryByText('Missing CSRF token validation')).not.toBeInTheDocument();
  });

  // ── Fetches with correct id ────────────────────────────────────────────

  it('fetches audit data with correct task id', async () => {
    mockParams = { id: 'custom-audit-id' };
    mockReportsGet.mockResolvedValue({ audit: makeAuditData() });
    render(<AuditTreeView />);

    await waitFor(() => {
      expect(mockReportsGet).toHaveBeenCalledWith('custom-audit-id');
    });
  });

  it('does not fetch when id is missing', async () => {
    mockParams = {};
    mockReportsGet.mockResolvedValue({ audit: makeAuditData() });
    render(<AuditTreeView />);

    // Should stay in loading since no fetch happens
    expect(mockReportsGet).not.toHaveBeenCalled();
  });

  // ── Title ──────────────────────────────────────────────────────────────

  it('renders page title', async () => {
    mockReportsGet.mockResolvedValue({ audit: makeAuditData() });
    render(<AuditTreeView />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Audit Tree' })).toBeInTheDocument();
    });
  });
});
