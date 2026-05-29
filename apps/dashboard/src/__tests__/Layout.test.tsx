import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Layout from '../components/Layout';

// Mock react-router-dom: NavLink renders as an <a> with active class; Outlet renders nothing
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    NavLink: ({
      to,
      children,
      className,
      ...rest
    }: {
      to: string;
      children: React.ReactNode;
      className?: string | ((props: { isActive: boolean }) => string);
      [key: string]: unknown;
    }) => {
      const resolved =
        typeof className === 'function'
          ? className({ isActive: false })
          : className;
      return (
        <a href={to} className={resolved} {...rest}>
          {children}
        </a>
      );
    },
    Outlet: () => <div data-testid="outlet" />,
  };
});

describe('Layout', () => {
  it('renders children via Outlet', () => {
    render(<Layout />);
    expect(screen.getByTestId('outlet')).toBeInTheDocument();
  });

  it('renders brand name', () => {
    render(<Layout />);
    expect(screen.getByText('EATA')).toBeInTheDocument();
  });

  it('renders all navigation items', () => {
    render(<Layout />);
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();

    const links = screen.getAllByRole('link');
    // 7 nav links + no other links expected
    expect(links.length).toBeGreaterThanOrEqual(7);
  });

  it('renders navigation links with correct hrefs', () => {
    render(<Layout />);
    const expectedHrefs = ['/', '/batches', '/monitor', '/feedback', '/templates', '/settings', '/health'];
    const allLinks = screen.getAllByRole('link');
    for (const href of expectedHrefs) {
      const found = allLinks.some((el) => el.getAttribute('href') === href);
      expect(found).toBe(true);
    }
  });

  it('renders footer text', () => {
    render(<Layout />);
    expect(screen.getByText(/Electron AI Testing Agent/i)).toBeInTheDocument();
  });

  it('renders the sidebar element', () => {
    const { container } = render(<Layout />);
    const aside = container.querySelector('aside');
    expect(aside).toBeInTheDocument();
  });

  it('renders the main content area', () => {
    const { container } = render(<Layout />);
    const main = container.querySelector('main');
    expect(main).toBeInTheDocument();
  });
});
