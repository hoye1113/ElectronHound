import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AuditReportView from '../components/AuditReportView';
import type { AuditChainData } from '../components/AuditReportView';

// ── Test data factories ───────────────────────────────────────────────────────

const makeSubAgentOutput = (overrides: Record<string, unknown> = {}) => ({
  role: 'test-planner' as const,
  auditReport: {
    severity: 'pass' as const,
    summary: 'All test scenarios covered',
    findings: [] as Array<{ category: string; description: string; severity: 'info' | 'warn' | 'fail'; evidence?: string }>,
    timestamp: '2026-05-28T10:00:00Z',
  },
  analysis: 'Test plan is comprehensive',
  recommendations: [] as string[],
  ...overrides,
});

const makeAuditData = (overrides: Record<string, unknown> = {}): AuditChainData => ({
  goal: 'Test the login flow',
  testPlanner: makeSubAgentOutput({
    role: 'test-planner',
    auditReport: {
      severity: 'pass',
      summary: 'All test scenarios covered',
      findings: [],
      timestamp: '2026-05-28T10:00:00Z',
    },
    recommendations: ['Add edge case tests'],
  }),
  executionAnalyst: makeSubAgentOutput({
    role: 'execution-analyst',
    auditReport: {
      severity: 'info',
      summary: 'Execution completed with minor observations',
      findings: [
        { category: 'performance', description: 'Slow page load detected', severity: 'info' },
      ],
      timestamp: '2026-05-28T10:01:00Z',
    },
    recommendations: [],
  }),
  securityReviewer: makeSubAgentOutput({
    role: 'security-reviewer',
    auditReport: {
      severity: 'warn',
      summary: 'Potential security concerns found',
      findings: [
        { category: 'auth', description: 'Missing CSRF token validation', severity: 'warn' },
        { category: 'input', description: 'Unsanitized user input', severity: 'fail', evidence: 'XSS via search field' },
      ],
      timestamp: '2026-05-28T10:02:00Z',
    },
    recommendations: ['Add CSRF protection', 'Sanitize all inputs'],
  }),
  reportSynthesizer: makeSubAgentOutput({
    role: 'report-synthesizer',
    auditReport: {
      severity: 'pass',
      summary: 'Report generated successfully',
      findings: [],
      timestamp: '2026-05-28T10:03:00Z',
    },
    recommendations: [],
  }),
  chainOrder: ['test-planner', 'execution-analyst', 'security-reviewer', 'report-synthesizer'],
  durationMs: 5000,
  completedAt: '2026-05-28T10:03:00Z',
  ...overrides,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AuditReportView', () => {
  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders empty state when auditData is undefined', () => {
    render(<AuditReportView auditData={undefined} />);
    expect(screen.getByText('No audit data')).toBeInTheDocument();
    expect(screen.getByText('Audit data will appear after task completion')).toBeInTheDocument();
  });

  it('renders report view when auditData is provided', () => {
    const auditData = makeAuditData();
    render(<AuditReportView auditData={auditData} />);
    expect(screen.getByText('Test Planner')).toBeInTheDocument();
    expect(screen.getByText('Execution Analyst')).toBeInTheDocument();
    expect(screen.getByText('Security Reviewer')).toBeInTheDocument();
    expect(screen.getByText('Report Synthesizer')).toBeInTheDocument();
  });

  it('renders duration and completion time', () => {
    const auditData = makeAuditData();
    render(<AuditReportView auditData={auditData} />);
    expect(screen.getByText('Duration: 5000ms')).toBeInTheDocument();
    expect(screen.getByText(/Completed at/)).toBeInTheDocument();
  });

  it('renders role cards in chain order', () => {
    const auditData = makeAuditData();
    const { container } = render(<AuditReportView auditData={auditData} />);
    // The card containers are <div role="listitem"> elements
    const cards = container.querySelectorAll('div[role="listitem"]');
    expect(cards).toHaveLength(4);
  });

  it('renders role index numbers', () => {
    const auditData = makeAuditData();
    render(<AuditReportView auditData={auditData} />);
    expect(screen.getByText('1.')).toBeInTheDocument();
    expect(screen.getByText('2.')).toBeInTheDocument();
    expect(screen.getByText('3.')).toBeInTheDocument();
    expect(screen.getByText('4.')).toBeInTheDocument();
  });

  // ── Data display: severity levels ──────────────────────────────────────────

  it('displays severity badges for each role', () => {
    const auditData = makeAuditData();
    render(<AuditReportView auditData={auditData} />);
    expect(screen.getAllByText('Pass')).toHaveLength(2);
    expect(screen.getByText('Info')).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();
  });

  it('displays fail severity badge when present', () => {
    const auditData = makeAuditData();
    auditData.testPlanner.auditReport.severity = 'fail';
    render(<AuditReportView auditData={auditData} />);
    expect(screen.getAllByText('Fail')).toHaveLength(1);
  });

  it('displays summary text for each role', () => {
    const auditData = makeAuditData();
    render(<AuditReportView auditData={auditData} />);
    expect(screen.getByText('All test scenarios covered')).toBeInTheDocument();
    expect(screen.getByText('Execution completed with minor observations')).toBeInTheDocument();
    expect(screen.getByText('Potential security concerns found')).toBeInTheDocument();
    expect(screen.getByText('Report generated successfully')).toBeInTheDocument();
  });

  // ── Data display: findings ─────────────────────────────────────────────────

  it('shows findings label with count when findings exist', () => {
    const auditData = makeAuditData();
    render(<AuditReportView auditData={auditData} />);
    expect(screen.getByText('1 finding(s)')).toBeInTheDocument();
    expect(screen.getByText('2 finding(s)')).toBeInTheDocument();
  });

  it('does not show findings section when findings are empty', () => {
    const auditData = makeAuditData();
    render(<AuditReportView auditData={auditData} />);
    // test-planner has no findings, so no findings label for it
    expect(screen.queryByText('0 finding(s)')).not.toBeInTheDocument();
  });

  it('displays finding descriptions when expanded', () => {
    const auditData = makeAuditData();
    render(<AuditReportView auditData={auditData} />);
    // Expand security-reviewer findings
    fireEvent.click(screen.getByText('2 finding(s)'));
    expect(screen.getByText('Missing CSRF token validation')).toBeInTheDocument();
    expect(screen.getByText('Unsanitized user input')).toBeInTheDocument();
  });

  it('displays finding categories', () => {
    const auditData = makeAuditData();
    render(<AuditReportView auditData={auditData} />);
    fireEvent.click(screen.getByText('2 finding(s)'));
    expect(screen.getByText('auth')).toBeInTheDocument();
    expect(screen.getByText('input')).toBeInTheDocument();
  });

  it('displays finding severity tags', () => {
    const auditData = makeAuditData();
    render(<AuditReportView auditData={auditData} />);
    fireEvent.click(screen.getByText('2 finding(s)'));
    expect(screen.getByText('warn')).toBeInTheDocument();
    expect(screen.getByText('fail')).toBeInTheDocument();
  });

  it('displays finding evidence when present', () => {
    const auditData = makeAuditData();
    render(<AuditReportView auditData={auditData} />);
    fireEvent.click(screen.getByText('2 finding(s)'));
    expect(screen.getByText('XSS via search field')).toBeInTheDocument();
  });

  it('finding without evidence does not render evidence element', () => {
    const auditData = makeAuditData();
    const { container } = render(<AuditReportView auditData={auditData} />);
    // Expand execution-analyst findings (1 finding, no evidence)
    fireEvent.click(screen.getByText('1 finding(s)'));
    // The execution-analyst card's finding should not contain a <pre> element
    const cards = container.querySelectorAll('div[role="listitem"]');
    // execution-analyst is the second card (index 1)
    const executionCard = cards[1];
    const preElements = executionCard!.querySelectorAll('pre');
    expect(preElements).toHaveLength(0);
  });

  // ── Data display: recommendations ──────────────────────────────────────────

  it('shows recommendations label with count when recommendations exist', () => {
    const auditData = makeAuditData();
    render(<AuditReportView auditData={auditData} />);
    expect(screen.getByText('1 recommendation(s)')).toBeInTheDocument();
    expect(screen.getByText('2 recommendation(s)')).toBeInTheDocument();
  });

  it('does not show recommendations section when recommendations are empty', () => {
    const auditData = makeAuditData();
    render(<AuditReportView auditData={auditData} />);
    // executionAnalyst and reportSynthesizer have no recommendations
    expect(screen.queryByText('0 recommendation(s)')).not.toBeInTheDocument();
  });

  it('displays recommendation text when expanded', () => {
    const auditData = makeAuditData();
    render(<AuditReportView auditData={auditData} />);
    fireEvent.click(screen.getByText('2 recommendation(s)'));
    expect(screen.getByText('Add CSRF protection')).toBeInTheDocument();
    expect(screen.getByText('Sanitize all inputs')).toBeInTheDocument();
  });

  // ── Interaction: expand/collapse sections ──────────────────────────────────

  it('findings section is collapsed by default', () => {
    const auditData = makeAuditData();
    const { container } = render(<AuditReportView auditData={auditData} />);
    // All <details> elements should not have the open attribute by default
    const detailsElements = container.querySelectorAll('details');
    detailsElements.forEach((details) => {
      expect(details).not.toHaveAttribute('open');
    });
  });

  it('recommendations section is collapsed by default', () => {
    const auditData = makeAuditData();
    const { container } = render(<AuditReportView auditData={auditData} />);
    const detailsElements = container.querySelectorAll('details');
    expect(detailsElements.length).toBeGreaterThan(0);
    detailsElements.forEach((details) => {
      expect(details).not.toHaveAttribute('open');
    });
  });

  it('expands findings section when clicked', () => {
    const auditData = makeAuditData();
    render(<AuditReportView auditData={auditData} />);
    fireEvent.click(screen.getByText('2 finding(s)'));
    expect(screen.getByText('Missing CSRF token validation')).toBeInTheDocument();
    expect(screen.getByText('Unsanitized user input')).toBeInTheDocument();
  });

  it('expands recommendations section when clicked', () => {
    const auditData = makeAuditData();
    render(<AuditReportView auditData={auditData} />);
    fireEvent.click(screen.getByText('2 recommendation(s)'));
    expect(screen.getByText('Add CSRF protection')).toBeInTheDocument();
    expect(screen.getByText('Sanitize all inputs')).toBeInTheDocument();
  });

  it('can expand findings and recommendations independently', () => {
    const auditData = makeAuditData();
    const { container } = render(<AuditReportView auditData={auditData} />);
    // Expand findings only
    fireEvent.click(screen.getByText('2 finding(s)'));
    expect(screen.getByText('Missing CSRF token validation')).toBeInTheDocument();
    // The recommendations <details> should still not have open attribute
    const detailsElements = container.querySelectorAll('details');
    // Find the details element whose summary contains "recommendation(s)"
    const recDetails = Array.from(detailsElements).find((d) =>
      d.querySelector('summary')?.textContent?.includes('recommendation(s)'),
    );
    expect(recDetails).toBeDefined();
    expect(recDetails!).not.toHaveAttribute('open');
  });

  it('can expand multiple sections on different cards', () => {
    const auditData = makeAuditData();
    render(<AuditReportView auditData={auditData} />);
    // Expand execution-analyst findings
    fireEvent.click(screen.getByText('1 finding(s)'));
    expect(screen.getByText('Slow page load detected')).toBeInTheDocument();
    // Expand security-reviewer recommendations
    fireEvent.click(screen.getByText('2 recommendation(s)'));
    expect(screen.getByText('Add CSRF protection')).toBeInTheDocument();
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it('renders with custom chain order', () => {
    const auditData = makeAuditData({
      chainOrder: ['security-reviewer', 'test-planner'],
    });
    const { container } = render(<AuditReportView auditData={auditData} />);
    const cards = container.querySelectorAll('div[role="listitem"]');
    expect(cards).toHaveLength(2);
    // First should be security-reviewer (index 0), second test-planner (index 1)
    expect(screen.getByText('1.')).toBeInTheDocument();
    expect(screen.getByText('2.')).toBeInTheDocument();
    expect(screen.getByText('Security Reviewer')).toBeInTheDocument();
    expect(screen.getByText('Test Planner')).toBeInTheDocument();
  });

  it('renders with all severity levels', () => {
    const auditData = makeAuditData();
    auditData.testPlanner.auditReport.severity = 'pass';
    auditData.executionAnalyst.auditReport.severity = 'info';
    auditData.securityReviewer.auditReport.severity = 'warn';
    auditData.reportSynthesizer.auditReport.severity = 'fail';
    render(<AuditReportView auditData={auditData} />);
    expect(screen.getByText('Pass')).toBeInTheDocument();
    expect(screen.getByText('Info')).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Fail')).toBeInTheDocument();
  });

  it('handles role with findings but no recommendations', () => {
    const auditData = makeAuditData();
    render(<AuditReportView auditData={auditData} />);
    // executionAnalyst has findings but no recommendations
    expect(screen.getByText('1 finding(s)')).toBeInTheDocument();
    // Only securityReviewer has 2 recommendations
    expect(screen.getByText('2 recommendation(s)')).toBeInTheDocument();
  });

  it('handles role with recommendations but no findings', () => {
    const auditData = makeAuditData();
    // testPlanner has recommendations but no findings
    render(<AuditReportView auditData={auditData} />);
    expect(screen.getByText('1 recommendation(s)')).toBeInTheDocument();
  });

  it('renders with zero duration', () => {
    const auditData = makeAuditData({ durationMs: 0 });
    render(<AuditReportView auditData={auditData} />);
    expect(screen.getByText('Duration: 0ms')).toBeInTheDocument();
  });

  it('formats timestamp correctly', () => {
    const auditData = makeAuditData({ completedAt: '2026-05-28T14:30:45Z' });
    render(<AuditReportView auditData={auditData} />);
    // The formatTimestamp function uses toLocaleTimeString with hour12: false
    expect(screen.getByText(/Completed at/)).toBeInTheDocument();
  });
});
