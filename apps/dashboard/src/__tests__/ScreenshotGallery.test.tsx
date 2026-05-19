import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ScreenshotGallery from '../components/ScreenshotGallery';

const mockScreenshots = [
  { url: '/screenshots/step-1.png', stepIndex: 0, phase: 'observe' },
  { url: '/screenshots/step-2.png', stepIndex: 1, phase: 'plan' },
  { url: '/screenshots/step-3.png', stepIndex: 2, phase: 'execute' },
];

describe('ScreenshotGallery', () => {
  it('renders empty state when no screenshots', () => {
    render(<ScreenshotGallery screenshots={[]} />);
    expect(screen.getByText('No screenshots available')).toBeInTheDocument();
  });

  it('renders thumbnail grid with correct count', () => {
    render(<ScreenshotGallery screenshots={mockScreenshots} />);
    const thumbnails = screen.getAllByRole('button');
    expect(thumbnails).toHaveLength(3);
  });

  it('renders step labels on thumbnails', () => {
    render(<ScreenshotGallery screenshots={mockScreenshots} />);
    expect(screen.getByText('Step 1')).toBeInTheDocument();
    expect(screen.getByText('Step 2')).toBeInTheDocument();
    expect(screen.getByText('Step 3')).toBeInTheDocument();
  });

  it('renders phase labels on thumbnails', () => {
    render(<ScreenshotGallery screenshots={mockScreenshots} />);
    expect(screen.getByText('observe')).toBeInTheDocument();
    expect(screen.getByText('plan')).toBeInTheDocument();
    expect(screen.getByText('execute')).toBeInTheDocument();
  });

  it('opens overlay when thumbnail is clicked', () => {
    render(<ScreenshotGallery screenshots={mockScreenshots} />);
    const thumbnails = screen.getAllByRole('button');
    fireEvent.click(thumbnails[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Close screenshot viewer')).toBeInTheDocument();
  });

  it('closes overlay when close button is clicked', () => {
    render(<ScreenshotGallery screenshots={mockScreenshots} />);
    const thumbnails = screen.getAllByRole('button');
    fireEvent.click(thumbnails[0]);
    fireEvent.click(screen.getByLabelText('Close screenshot viewer'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes overlay when Escape key is pressed', () => {
    render(<ScreenshotGallery screenshots={mockScreenshots} />);
    const thumbnails = screen.getAllByRole('button');
    fireEvent.click(thumbnails[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows correct step info in overlay', () => {
    render(<ScreenshotGallery screenshots={mockScreenshots} />);
    const thumbnails = screen.getAllByRole('button');
    fireEvent.click(thumbnails[1]);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Step 2');
    expect(dialog).toHaveTextContent('plan');
  });
});
