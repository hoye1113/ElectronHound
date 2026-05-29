import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import NotFound from '../pages/NotFound';

// Mock react-router-dom: Link renders as a plain <a> tag
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [key: string]: unknown }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
  };
});

describe('NotFound', () => {
  it('renders 404 heading', () => {
    render(<NotFound />);
    expect(screen.getByText('404')).toBeInTheDocument();
  });

  it('renders the page title', () => {
    render(<NotFound />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('renders a descriptive message', () => {
    render(<NotFound />);
    const message = screen.getByText(/doesn't exist/i);
    expect(message).toBeInTheDocument();
  });

  it('renders a back-to-tasks link', () => {
    render(<NotFound />);
    const link = screen.getByRole('link', { name: /back to tasks/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/');
  });

  it('renders the 404 number prominently', () => {
    const { container } = render(<NotFound />);
    const largeText = container.querySelector('.text-6xl');
    expect(largeText).toBeInTheDocument();
    expect(largeText?.textContent).toBe('404');
  });
});
