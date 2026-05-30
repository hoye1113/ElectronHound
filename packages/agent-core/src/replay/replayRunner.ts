/**
 * ReplayRunner - Deterministic replay of recorded test steps.
 *
 * Reads steps from the database and re-executes them against an MCP client,
 * comparing observations with expected results using the ReplayVerifier.
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { MCPClient } from '../mcp/client.js';
import { ReplayVerifier, type DiffResult } from './replayVerifier.js';
import { createStderrLogger } from '../utils/logger.js';

const logger = createStderrLogger('replay-runner');

// ── Types ─────────────────────────────────────────────────────────────────

interface StepRow {
  id: string;
  task_id: string;
  step_number: number;
  action: string; // JSON string
  observation: string;
  created_at: string;
}

interface StepReplayResult {
  stepNumber: number;
  action: string;
  expectedObservation: string;
  actualObservation: string;
  passed: boolean;
  diff?: DiffResult;
}

export interface ReplayResult {
  taskId: string;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  mode: 'strict' | 'loose';
  steps: StepReplayResult[];
  success: boolean;
}

// ── Schema ────────────────────────────────────────────────────────────────

const STEPS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS steps (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  action TEXT NOT NULL,
  observation TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_steps_task_id ON steps(task_id);
`;

// ── ReplayRunner ──────────────────────────────────────────────────────────

export class ReplayRunner {
  private db: Database.Database;
  private verifier: ReplayVerifier;

  constructor(dbPath: string) {
    // Ensure parent directory exists
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(STEPS_SCHEMA_SQL);

    this.verifier = new ReplayVerifier();
  }

  /**
   * Replay all steps for a given task.
   *
   * @param taskId - The task ID to replay
   * @param mode - Comparison mode: 'strict' or 'loose'
   * @returns ReplayResult with pass/fail status for each step
   */
  async replay(taskId: string, mode: 'strict' | 'loose'): Promise<ReplayResult> {
    logger.info(`Starting replay for task ${taskId} in ${mode} mode`);

    // Fetch steps from database
    const steps = this.getStepsByTaskId(taskId);

    if (steps.length === 0) {
      logger.warn(`No steps found for task ${taskId}`);
      return {
        taskId,
        totalSteps: 0,
        passedSteps: 0,
        failedSteps: 0,
        mode,
        steps: [],
        success: true,
      };
    }

    logger.info(`Found ${steps.length} steps to replay`);

    // Create MCP client for replay
    const mcpClient = new MCPClient();
    await mcpClient.connect({}); // Connect in mock mode for now

    const results: StepReplayResult[] = [];
    let passedSteps = 0;
    let failedSteps = 0;

    // Execute each step
    for (const step of steps) {
      const stepResult = await this.replayStep(mcpClient, step, mode);
      results.push(stepResult);

      if (stepResult.passed) {
        passedSteps++;
      } else {
        failedSteps++;
      }
    }

    // Disconnect MCP client
    await mcpClient.disconnect();

    const result: ReplayResult = {
      taskId,
      totalSteps: steps.length,
      passedSteps,
      failedSteps,
      mode,
      steps: results,
      success: failedSteps === 0,
    };

    logger.info(
      `Replay completed: ${passedSteps}/${steps.length} steps passed`
    );

    return result;
  }

  /**
   * Replay a single step.
   */
  private async replayStep(
    mcpClient: MCPClient,
    step: StepRow,
    mode: 'strict' | 'loose'
  ): Promise<StepReplayResult> {
    const action = JSON.parse(step.action) as {
      name: string;
      server?: 'playwright' | 'electron';
      args: Record<string, unknown>;
    };

    const server = action.server ?? 'playwright';
    const toolName = action.name;
    const args = action.args;

    logger.info(
      `Step ${step.step_number}: Executing ${server}/${toolName}`
    );

    let actualObservation: string;
    let passed: boolean;
    let diff: DiffResult | undefined;

    try {
      // Execute the action via MCP client
      const result = await mcpClient.callTool(server, toolName, args);

      if (result.success) {
        // Extract observation from result
        actualObservation = this.extractObservation(result.result);
      } else {
        actualObservation = `Error: ${JSON.stringify(result.result)}`;
      }

      // Compare with expected observation
      diff = this.verifier.compare(step.observation, actualObservation, mode);
      passed = diff.match;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      actualObservation = `Exception: ${errorMessage}`;
      passed = false;
      diff = {
        match: false,
        differences: [
          {
            path: 'execution',
            expected: 'successful execution',
            actual: `exception: ${errorMessage}`,
            type: 'changed',
          },
        ],
      };

      logger.warn(
        `Step ${step.step_number} failed with exception: ${errorMessage}`
      );
    }

    return {
      stepNumber: step.step_number,
      action: step.action,
      expectedObservation: step.observation,
      actualObservation,
      passed,
      diff,
    };
  }

  /**
   * Extract observation string from MCP tool result.
   */
  private extractObservation(result: unknown): string {
    if (typeof result === 'string') {
      return result;
    }

    if (result && typeof result === 'object') {
      // Handle MCP result format: { content: [{ type: 'text', text: '...' }] }
      const mcpResult = result as {
        content?: Array<{ type?: string; text?: string }>;
      };

      if (mcpResult.content && Array.isArray(mcpResult.content)) {
        const textContent = mcpResult.content.find(
          (c) => c.type === 'text' && c.text
        );
        if (textContent?.text) {
          return textContent.text;
        }
      }

      // Fallback to JSON stringification
      return JSON.stringify(result);
    }

    return String(result);
  }

  /**
   * Fetch steps from database by task ID.
   */
  private getStepsByTaskId(taskId: string): StepRow[] {
    const stmt = this.db.prepare(
      'SELECT * FROM steps WHERE task_id = ? ORDER BY step_number ASC'
    );
    return stmt.all(taskId) as StepRow[];
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }
}
