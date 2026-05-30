/**
 * Playwright Codegen Service (PR-19)
 *
 * Converts stored test steps into runnable Playwright test scripts.
 * Supports action mapping for click, type, navigate, screenshot, assert, hover, and press_key.
 */
import type { StepRecord } from '@eata/shared-types';
import type Database from 'better-sqlite3';
import { dbRowToStep } from '../utils/dbMappers.js';

// ── Types ──────────────────────────────────────────────────────────────

export interface ActionMapping {
  name: string;
  args: Record<string, unknown>;
}

export interface GenerateOptions {
  /** Override the test title. Defaults to task goal. */
  title?: string;
  /** Include step comments in generated script. Defaults to true. */
  includeComments?: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Escape single quotes for use in JavaScript string literals.
 */
function escapeSingleQuotes(str: string): string {
  return str.replace(/'/g, "\\'");
}

/**
 * Strip the "browser_" prefix from action names for normalization.
 * E.g., "browser_click" -> "click", "browser_type" -> "type"
 */
function normalizeActionName(name: string): string {
  return name.startsWith('browser_') ? name.slice('browser_'.length) : name;
}

// ── Action Mapping ─────────────────────────────────────────────────────

/**
 * Map a single action to a Playwright API call string.
 *
 * Supported actions:
 * - click -> page.click(selector)
 * - type -> page.fill(selector, text)
 * - screenshot -> page.screenshot()
 * - navigate -> page.goto(url)
 * - assert -> expect(page.locator(selector)).toHaveText(text)
 * - hover -> page.hover(selector)
 * - press_key -> page.keyboard.press(key)
 */
export function mapActionToPlaywright(action: ActionMapping): string {
  const normalizedName = normalizeActionName(action.name);
  const args = action.args;

  switch (normalizedName) {
    case 'click': {
      const selector = args.selector as string | undefined;
      if (!selector) {
        return `// click action missing selector`;
      }
      return `await page.click('${escapeSingleQuotes(selector)}');`;
    }

    case 'type': {
      const selector = args.selector as string | undefined;
      const text = args.text as string | undefined;
      if (!selector) {
        return `// type action missing selector`;
      }
      if (text === undefined) {
        return `// type action missing 'text' argument`;
      }
      return `await page.fill('${escapeSingleQuotes(selector)}', '${escapeSingleQuotes(text)}');`;
    }

    case 'screenshot': {
      return `await page.screenshot();`;
    }

    case 'navigate': {
      const url = args.url as string | undefined;
      if (!url) {
        return `// navigate action missing url`;
      }
      return `await page.goto('${escapeSingleQuotes(url)}');`;
    }

    case 'assert': {
      const selector = args.selector as string | undefined;
      const text = args.text as string | undefined;
      if (!selector || !text) {
        return `// assert action missing selector or text`;
      }
      return `await expect(page.locator('${escapeSingleQuotes(selector)}')).toHaveText('${escapeSingleQuotes(text)}');`;
    }

    case 'hover': {
      const selector = args.selector as string | undefined;
      if (!selector) {
        return `// hover action missing selector`;
      }
      return `await page.hover('${escapeSingleQuotes(selector)}');`;
    }

    case 'press_key': {
      const key = args.key as string | undefined;
      if (!key) {
        return `// press_key action missing key`;
      }
      return `await page.keyboard.press('${escapeSingleQuotes(key)}');`;
    }

    default: {
      return `// Unsupported action: ${action.name}`;
    }
  }
}

// ── Script Generation ──────────────────────────────────────────────────

/**
 * Generate a complete Playwright test script from a list of StepRecords.
 *
 * @param steps - Array of StepRecord objects from the database
 * @param goal - The test goal/description (used as test title)
 * @param options - Optional generation settings
 * @returns Complete Playwright test script as a string
 */
export function generatePlaywrightScript(
  steps: StepRecord[],
  goal: string,
  options: GenerateOptions = {},
): string {
  const { includeComments = true } = options;
  const title = options.title ?? goal;

  const lines: string[] = [];

  // Import statement
  lines.push("import { test, expect } from '@playwright/test';");
  lines.push('');

  // Test block
  lines.push(`test('${escapeSingleQuotes(title)}', async ({ page }) => {`);

  // Process steps
  let stepNumber = 0;
  for (const step of steps) {
    stepNumber++;

    // Only process execute and verify phases
    if (step.phase === 'observe' || step.phase === 'plan') {
      continue;
    }

    // Add step comment
    if (includeComments) {
      lines.push(`  // Step ${stepNumber}: ${step.phase}`);
    }

    if (step.phase === 'execute' && step.action) {
      const playwrightLine = mapActionToPlaywright({
        name: step.action.name,
        args: step.action.args as Record<string, unknown>,
      });
      lines.push(`  ${playwrightLine}`);
    } else if (step.phase === 'verify') {
      // For verify phase, generate a comment with observation
      if (step.observation) {
        lines.push(`  // Verify: ${step.observation}`);
      }
      // If the step has an action, map it
      if (step.action) {
        const playwrightLine = mapActionToPlaywright({
          name: step.action.name,
          args: step.action.args as Record<string, unknown>,
        });
        lines.push(`  ${playwrightLine}`);
      }
    }

    // Add blank line between steps for readability
    if (includeComments) {
      lines.push('');
    }
  }

  lines.push('});');

  return lines.join('\n');
}

// ── Database Integration ───────────────────────────────────────────────

/**
 * Generate a Playwright script by reading task and steps from the database.
 *
 * @param db - Database connection
 * @param taskId - Task ID to generate script for
 * @param options - Optional generation settings
 * @returns Complete Playwright test script as a string
 * @throws Error if task not found
 */
export function generatePlaywrightFromDb(
  db: Database.Database,
  taskId: string,
  options: GenerateOptions = {},
): string {
  // Fetch task
  const taskRow = db
    .prepare('SELECT * FROM tasks WHERE id = ?')
    .get(taskId) as Record<string, unknown> | undefined;

  if (!taskRow) {
    throw new Error('Task not found');
  }

  const goal = String(taskRow.goal);

  // Fetch steps ordered by step_index
  const stepRows = db
    .prepare('SELECT * FROM steps WHERE task_id = ? ORDER BY step_index')
    .all(taskId) as Array<Record<string, unknown>>;

  const steps = stepRows.map(dbRowToStep);

  return generatePlaywrightScript(steps, goal, options);
}
