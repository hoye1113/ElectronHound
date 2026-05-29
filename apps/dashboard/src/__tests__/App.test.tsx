import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import App from '../App';

// ---------------------------------------------------------------------------
// Mock all lazy-loaded page components with identifiable test IDs
// ---------------------------------------------------------------------------
vi.mock('../pages/TaskList', () => ({
  default: () => <div data-testid="page-task-list">TaskList</div>,
}));
vi.mock('../pages/TaskDetail', () => ({
  default: () => <div data-testid="page-task-detail">TaskDetail</div>,
}));
vi.mock('../pages/LiveMonitor', () => ({
  default: () => <div data-testid="page-live-monitor">LiveMonitor</div>,
}));
vi.mock('../pages/FeedbackLoop', () => ({
  default: () => <div data-testid="page-feedback-loop">FeedbackLoop</div>,
}));
vi.mock('../pages/Settings', () => ({
  default: () => <div data-testid="page-settings">Settings</div>,
}));
vi.mock('../pages/Templates', () => ({
  default: () => <div data-testid="page-templates">Templates</div>,
}));
vi.mock('../pages/SystemHealth', () => ({
  default: () => <div data-testid="page-system-health">SystemHealth</div>,
}));
vi.mock('../pages/BatchList', () => ({
  default: () => <div data-testid="page-batch-list">BatchList</div>,
}));
vi.mock('../pages/NotFound', () => ({
  default: () => <div data-testid="page-not-found">NotFound</div>,
}));

// ---------------------------------------------------------------------------
// Mock Layout: render a lightweight wrapper that includes <Outlet /> so that
// the real react-router-dom routing still resolves child routes.
// ---------------------------------------------------------------------------
vi.mock('../components/Layout', async () => {
  const { Outlet } =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    default: () => (
      <div data-testid="layout-wrapper">
        <nav data-testid="mock-nav">Navigation</nav>
        <main>
          <Outlet />
        </main>
      </div>
    ),
  };
});

// ---------------------------------------------------------------------------
// Mock ErrorBoundary to simply pass through children (tested separately)
// ---------------------------------------------------------------------------
vi.mock('../components/ErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('App', () => {
  afterEach(() => {
    // Reset to root between tests so BrowserRouter picks up a clean path
    window.history.pushState({}, '', '/');
  });

  // ---- Rendering ----------------------------------------------------------

  it('renders without crashing', async () => {
    render(<App />);
    expect(await screen.findByTestId('layout-wrapper')).toBeInTheDocument();
  });

  it('renders the layout navigation', async () => {
    render(<App />);
    expect(await screen.findByTestId('mock-nav')).toBeInTheDocument();
  });

  it('does not show Suspense loading text after pages resolve', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });
  });

  // ---- Routing ------------------------------------------------------------

  it('renders TaskList on the default root route (/)', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('page-task-list')).toBeInTheDocument();
    });
  });

  it('renders TaskDetail on /task/:id route', async () => {
    window.history.pushState({}, '', '/task/abc-123');
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('page-task-detail')).toBeInTheDocument();
    });
  });

  it('renders LiveMonitor on /monitor route', async () => {
    window.history.pushState({}, '', '/monitor');
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('page-live-monitor')).toBeInTheDocument();
    });
  });

  it('renders LiveMonitor on /monitor/:id route', async () => {
    window.history.pushState({}, '', '/monitor/xyz-456');
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('page-live-monitor')).toBeInTheDocument();
    });
  });

  it('renders FeedbackLoop on /feedback route', async () => {
    window.history.pushState({}, '', '/feedback');
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('page-feedback-loop')).toBeInTheDocument();
    });
  });

  it('renders BatchList on /batches route', async () => {
    window.history.pushState({}, '', '/batches');
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('page-batch-list')).toBeInTheDocument();
    });
  });

  it('renders Settings on /settings route', async () => {
    window.history.pushState({}, '', '/settings');
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('page-settings')).toBeInTheDocument();
    });
  });

  it('renders Templates on /templates route', async () => {
    window.history.pushState({}, '', '/templates');
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('page-templates')).toBeInTheDocument();
    });
  });

  it('renders SystemHealth on /health route', async () => {
    window.history.pushState({}, '', '/health');
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('page-system-health')).toBeInTheDocument();
    });
  });

  it('renders NotFound on an unmatched route', async () => {
    window.history.pushState({}, '', '/nonexistent-path');
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('page-not-found')).toBeInTheDocument();
    });
  });

  // ---- Navigation ---------------------------------------------------------

  it('wraps content in the Layout component', async () => {
    render(<App />);
    // The layout wrapper and its nav are present for every route
    await waitFor(() => {
      expect(screen.getByTestId('layout-wrapper')).toBeInTheDocument();
      expect(screen.getByTestId('mock-nav')).toBeInTheDocument();
    });
  });

  it('renders Layout alongside the active page', async () => {
    render(<App />);
    await waitFor(() => {
      // Both the layout shell and the page content should coexist
      expect(screen.getByTestId('layout-wrapper')).toBeInTheDocument();
      expect(screen.getByTestId('page-task-list')).toBeInTheDocument();
    });
  });
});
