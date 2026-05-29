import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AccessibilityTreeView from '../components/AccessibilityTreeView';

// Test data factories
const makeNode = (overrides: Record<string, unknown> = {}) => ({
  role: 'button',
  name: 'Submit',
  ...overrides,
});

const makeTree = () => ({
  role: 'webArea',
  name: 'Login Page',
  children: [
    {
      role: 'heading',
      name: 'Welcome',
      children: [],
    },
    {
      role: 'form',
      name: 'Login Form',
      children: [
        { role: 'textbox', name: 'Username' },
        { role: 'textbox', name: 'Password' },
        { role: 'button', name: 'Sign In' },
      ],
    },
    {
      role: 'link',
      name: 'Forgot Password',
    },
  ],
});

const makeDeepTree = () => ({
  role: 'webArea',
  name: 'Root',
  children: [
    {
      role: 'group',
      name: 'Level 1',
      children: [
        {
          role: 'group',
          name: 'Level 2',
          children: [
            {
              role: 'button',
              name: 'Level 3 Button',
            },
          ],
        },
      ],
    },
  ],
});

describe('AccessibilityTreeView', () => {
  // ── Empty state ────────────────────────────────────────────────────────

  it('renders empty state when snapshot is null', () => {
    render(<AccessibilityTreeView snapshot={null} />);
    expect(screen.getByText('No accessibility snapshot')).toBeInTheDocument();
  });

  it('renders empty hint text when snapshot is null', () => {
    render(<AccessibilityTreeView snapshot={null} />);
    expect(screen.getByText('Snapshot will appear when steps capture a11y data')).toBeInTheDocument();
  });

  // ── String snapshot (raw text) ─────────────────────────────────────────

  it('renders string snapshot as preformatted text', () => {
    const rawText = 'raw accessibility data';
    render(<AccessibilityTreeView snapshot={rawText} />);
    expect(screen.getByText(rawText)).toBeInTheDocument();
  });

  it('renders string snapshot in a pre element', () => {
    const rawText = 'raw accessibility data';
    render(<AccessibilityTreeView snapshot={rawText} />);
    const preElement = screen.getByText(rawText);
    expect(preElement.tagName).toBe('PRE');
  });

  // ── Tree view rendering ────────────────────────────────────────────────

  it('renders tree view with role="tree" container', () => {
    const tree = makeTree();
    render(<AccessibilityTreeView snapshot={tree} />);
    expect(screen.getByRole('tree')).toBeInTheDocument();
  });

  it('renders tree items with role="treeitem"', () => {
    const tree = makeTree();
    render(<AccessibilityTreeView snapshot={tree} />);
    const items = screen.getAllByRole('treeitem');
    expect(items.length).toBeGreaterThan(0);
  });

  it('renders root node role indicator', () => {
    const tree = makeTree();
    render(<AccessibilityTreeView snapshot={tree} />);
    expect(screen.getByText('webArea')).toBeInTheDocument();
  });

  it('renders root node name', () => {
    const tree = makeTree();
    render(<AccessibilityTreeView snapshot={tree} />);
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  // ── Tree structure: expand/collapse ────────────────────────────────────

  it('auto-expands nodes at depth < 2', () => {
    const tree = makeTree();
    render(<AccessibilityTreeView snapshot={tree} />);
    // Depth 0 and 1 nodes should be auto-expanded
    // 'heading' is at depth 1, its children (empty) are auto-expanded
    // 'form' is at depth 1, its children should be visible
    expect(screen.getByText('Login Form')).toBeInTheDocument();
    // Form children should be visible since depth 1 < 2
    expect(screen.getByText('Username')).toBeInTheDocument();
    expect(screen.getByText('Password')).toBeInTheDocument();
    expect(screen.getByText('Sign In')).toBeInTheDocument();
  });

  it('does not auto-expand nodes at depth >= 2', () => {
    const tree = makeDeepTree();
    render(<AccessibilityTreeView snapshot={tree} />);
    // Root (depth 0) and Level 1 (depth 1) auto-expand
    // Level 2 (depth 2) should NOT auto-expand
    expect(screen.getByText('Level 1')).toBeInTheDocument();
    expect(screen.getByText('Level 2')).toBeInTheDocument();
    // Level 3 Button should NOT be visible (depth 2 node is collapsed)
    expect(screen.queryByText('Level 3 Button')).not.toBeInTheDocument();
  });

  it('expands node when clicked', () => {
    const tree = makeDeepTree();
    render(<AccessibilityTreeView snapshot={tree} />);

    // Level 2 is collapsed, click to expand
    fireEvent.click(screen.getByText('Level 2'));

    expect(screen.getByText('Level 3 Button')).toBeInTheDocument();
  });

  it('collapses node when clicked again', () => {
    const tree = makeDeepTree();
    render(<AccessibilityTreeView snapshot={tree} />);

    // Expand Level 2
    fireEvent.click(screen.getByText('Level 2'));
    expect(screen.getByText('Level 3 Button')).toBeInTheDocument();

    // Collapse Level 2
    fireEvent.click(screen.getByText('Level 2'));
    expect(screen.queryByText('Level 3 Button')).not.toBeInTheDocument();
  });

  it('sets aria-expanded on nodes with children', () => {
    const tree = makeDeepTree();
    render(<AccessibilityTreeView snapshot={tree} />);

    const items = screen.getAllByRole('treeitem');
    // First treeitem is the root (auto-expanded)
    expect(items[0]).toHaveAttribute('aria-expanded', 'true');
  });

  it('does not set aria-expanded on leaf nodes', () => {
    const tree = {
      role: 'button',
      name: 'Leaf Node',
    };
    render(<AccessibilityTreeView snapshot={tree} />);

    const item = screen.getByRole('treeitem');
    expect(item).not.toHaveAttribute('aria-expanded');
  });

  // ── Data display: role indicators ──────────────────────────────────────

  it('displays role badges for each node', () => {
    const tree = makeTree();
    render(<AccessibilityTreeView snapshot={tree} />);
    expect(screen.getByText('webArea')).toBeInTheDocument();
    expect(screen.getByText('heading')).toBeInTheDocument();
    expect(screen.getByText('form')).toBeInTheDocument();
    expect(screen.getByText('link')).toBeInTheDocument();
  });

  it('displays node names alongside roles', () => {
    const tree = makeTree();
    render(<AccessibilityTreeView snapshot={tree} />);
    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.getByText('Welcome')).toBeInTheDocument();
    expect(screen.getByText('Login Form')).toBeInTheDocument();
    expect(screen.getByText('Forgot Password')).toBeInTheDocument();
  });

  it('displays child count for nodes with children', () => {
    const tree = makeTree();
    render(<AccessibilityTreeView snapshot={tree} />);
    // Root has 3 children, Form has 3 children — both show "3"
    const counts = screen.getAllByText('3');
    expect(counts.length).toBeGreaterThanOrEqual(2);
  });

  it('renders node without name', () => {
    const tree = {
      role: 'button',
      name: '',
      children: [],
    };
    render(<AccessibilityTreeView snapshot={tree} />);
    expect(screen.getByText('button')).toBeInTheDocument();
  });

  // ── Hierarchy display ──────────────────────────────────────────────────

  it('renders nested tree structure correctly', () => {
    const tree = makeTree();
    render(<AccessibilityTreeView snapshot={tree} />);
    // All visible nodes should be present
    expect(screen.getByText('webArea')).toBeInTheDocument();
    expect(screen.getByText('heading')).toBeInTheDocument();
    expect(screen.getByText('form')).toBeInTheDocument();
    expect(screen.getByText('link')).toBeInTheDocument();
    // Form children should be visible (auto-expanded at depth 1)
    // 'textbox' appears twice (Username, Password)
    const textboxRoles = screen.getAllByText('textbox');
    expect(textboxRoles.length).toBe(2);
    expect(screen.getByText('button')).toBeInTheDocument();
  });

  it('renders multiple children at the same level', () => {
    const tree = {
      role: 'list',
      name: 'Items',
      children: [
        { role: 'listitem', name: 'Item 1' },
        { role: 'listitem', name: 'Item 2' },
        { role: 'listitem', name: 'Item 3' },
      ],
    };
    render(<AccessibilityTreeView snapshot={tree} />);
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
    expect(screen.getByText('Item 3')).toBeInTheDocument();
  });

  it('handles nodes with empty children array', () => {
    const tree = {
      role: 'group',
      name: 'Empty Group',
      children: [],
    };
    render(<AccessibilityTreeView snapshot={tree} />);
    expect(screen.getByText('Empty Group')).toBeInTheDocument();
    // Should not have expand/collapse behavior
    const item = screen.getByRole('treeitem');
    expect(item).not.toHaveAttribute('aria-expanded');
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  it('handles single node without children', () => {
    const node = makeNode();
    render(<AccessibilityTreeView snapshot={node} />);
    expect(screen.getByText('button')).toBeInTheDocument();
    expect(screen.getByText('Submit')).toBeInTheDocument();
  });

  it('handles deeply nested tree expansion', () => {
    const tree = makeDeepTree();
    render(<AccessibilityTreeView snapshot={tree} />);

    // Expand Level 2 to reveal Level 3
    fireEvent.click(screen.getByText('Level 2'));
    expect(screen.getByText('Level 3 Button')).toBeInTheDocument();

    // Level 3 Button is a leaf node, clicking it should not cause errors
    fireEvent.click(screen.getByText('Level 3 Button'));
    // Should still be visible
    expect(screen.getByText('Level 3 Button')).toBeInTheDocument();
  });

  it('renders tree with aria-label', () => {
    const tree = makeTree();
    render(<AccessibilityTreeView snapshot={tree} />);
    const treeElement = screen.getByRole('tree');
    expect(treeElement).toHaveAttribute('aria-label');
  });
});
