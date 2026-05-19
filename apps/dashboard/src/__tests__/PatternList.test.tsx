import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { FeedbackPattern } from '@eata/shared-types';
import PatternList from '../components/PatternList';

const mockPattern = (overrides: Partial<FeedbackPattern> = {}): FeedbackPattern => ({
  id: '550e8400-e29b-41d4-a716-446655440000',
  errorType: 'ElementNotFound',
  targetDescription: 'Login button not found on page',
  remediationHint: 'Verify selector matches the current DOM structure',
  similarityKeywords: ['selector', 'DOM', 'login'],
  frequency: 5,
  lastSeen: '2026-05-19T10:00:00Z',
  relatedGoalPatterns: [],
  ...overrides,
});

describe('PatternList', () => {
  it('renders empty state when no patterns', () => {
    render(<PatternList patterns={[]} maxFrequency={0} />);
    expect(screen.getByText('No patterns found')).toBeInTheDocument();
  });

  it('renders pattern errorType badge', () => {
    const patterns = [mockPattern({ errorType: 'TimeoutError' })];
    render(<PatternList patterns={patterns} maxFrequency={10} />);
    expect(screen.getByText('TimeoutError')).toBeInTheDocument();
  });

  it('renders target description', () => {
    const patterns = [mockPattern({ targetDescription: 'Button click failed' })];
    render(<PatternList patterns={patterns} maxFrequency={10} />);
    expect(screen.getByText('Button click failed')).toBeInTheDocument();
  });

  it('renders remediation hint', () => {
    const patterns = [mockPattern({ remediationHint: 'Check element visibility' })];
    render(<PatternList patterns={patterns} maxFrequency={10} />);
    expect(screen.getByText('Check element visibility')).toBeInTheDocument();
  });

  it('renders similarity keywords as tags', () => {
    const patterns = [mockPattern({ similarityKeywords: ['click', 'visibility', 'DOM'] })];
    render(<PatternList patterns={patterns} maxFrequency={10} />);
    expect(screen.getByText('click')).toBeInTheDocument();
    expect(screen.getByText('visibility')).toBeInTheDocument();
    expect(screen.getByText('DOM')).toBeInTheDocument();
  });

  it('renders frequency count', () => {
    const patterns = [mockPattern({ frequency: 12 })];
    render(<PatternList patterns={patterns} maxFrequency={20} />);
    expect(screen.getByText('12×')).toBeInTheDocument();
  });

  it('renders multiple patterns', () => {
    const patterns = [
      mockPattern({ id: '550e8400-e29b-41d4-a716-446655440000', errorType: 'Error A' }),
      mockPattern({ id: '550e8400-e29b-41d4-a716-446655440001', errorType: 'Error B' }),
      mockPattern({ id: '550e8400-e29b-41d4-a716-446655440002', errorType: 'Error C' }),
    ];
    render(<PatternList patterns={patterns} maxFrequency={10} />);
    expect(screen.getByText('Error A')).toBeInTheDocument();
    expect(screen.getByText('Error B')).toBeInTheDocument();
    expect(screen.getByText('Error C')).toBeInTheDocument();
  });

  it('renders last seen date', () => {
    const patterns = [mockPattern({ lastSeen: '2026-05-19T10:00:00Z' })];
    render(<PatternList patterns={patterns} maxFrequency={10} />);
    expect(screen.getByText(/Last seen:/)).toBeInTheDocument();
  });

  it('handles zero maxFrequency without errors', () => {
    const patterns = [mockPattern({ frequency: 0 })];
    render(<PatternList patterns={patterns} maxFrequency={0} />);
    expect(screen.getByText('0×')).toBeInTheDocument();
  });
});
