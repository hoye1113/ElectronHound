import { runTest } from './runner.js';
import { CreateTaskRequestSchema } from '@eata/shared-types';
import type {
  Manifest,
  TimelineEntry,
  FeedbackPattern,
  StepRecord,
} from '@eata/shared-types';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  appendFileSync,
} from 'node:fs';
import { join } from 'node:path';

// DX imports
import {
  ErrorCode,
  EataError,
  wrapError,
  getLogger,
  Spinner,
  ProgressTracker,
  formatDuration,
  CLIHelp,
  runConfigWizard,
} from './dx/index.js';

// Replay imports
import { ReplayRunner } from './replay/replayRunner.js';

// ─── Types ───────────────────────────────────────────────

interface CliArgs {
  goal: string;
  targetAppPath: string;
  llmModel: string;
  maxSteps: number;
  providerId?: string;
}

interface ReplayCliArgs {
  taskId: string;
  strict: boolean;
  loose: boolean;
  dbPath?: string;
}

interface ExportCliArgs {
  taskId: string;
  format: string;
  output?: string;
  dbPath?: string;
}

interface ImportCliArgs {
  file: string;
  dbPath?: string;
}

// ─── Argument Parsing ────────────────────────────────────

/**
 * Parse CLI arguments from process.argv.
 * Supports: --goal, --app, --model, --maxSteps
 */
export function parseArgs(argv: string[]): CliArgs {
  const raw: Record<string, string> = {};

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        raw[key] = next;
        i++;
      } else {
        raw[key] = 'true';
      }
    }
  }

  return {
    goal: raw.goal ?? '',
    targetAppPath: raw.app ?? '',
    llmModel: raw.model ?? 'gpt-4o',
    maxSteps: raw.maxSteps !== undefined ? parseInt(raw.maxSteps, 10) : 50,
    providerId: raw.provider || undefined,
  };
}

/**
 * Parse replay CLI arguments from process.argv.
 * Supports: replay --taskId <id> [--strict] [--loose] [--db <path>]
 */
export function parseReplayArgs(argv: string[]): ReplayCliArgs | null {
  // Find the 'replay' subcommand
  const replayIndex = argv.findIndex((arg) => arg === 'replay');
  if (replayIndex === -1) {
    return null;
  }

  const raw: Record<string, string> = {};

  // Parse arguments after 'replay'
  for (let i = replayIndex + 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        raw[key] = next;
        i++;
      } else {
        raw[key] = 'true';
      }
    }
  }

  // Validate required taskId
  if (!raw.taskId) {
    return null;
  }

  return {
    taskId: raw.taskId,
    strict: raw.strict === 'true',
    loose: raw.loose === 'true',
    dbPath: raw.db || undefined,
  };
}

/**
 * Parse export CLI arguments from process.argv.
 * Supports: export --taskId <id> [--format jsonl] [--output <file>] [--db <path>]
 */
export function parseExportArgs(argv: string[]): ExportCliArgs | null {
  const exportIndex = argv.findIndex((arg) => arg === 'export');
  if (exportIndex === -1) {
    return null;
  }

  const raw: Record<string, string> = {};

  for (let i = exportIndex + 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        raw[key] = next;
        i++;
      } else {
        raw[key] = 'true';
      }
    }
  }

  if (!raw.taskId) {
    return null;
  }

  return {
    taskId: raw.taskId,
    format: raw.format ?? 'jsonl',
    output: raw.output || undefined,
    dbPath: raw.db || undefined,
  };
}

/**
 * Parse import CLI arguments from process.argv.
 * Supports: import --file <path> [--db <path>]
 */
export function parseImportArgs(argv: string[]): ImportCliArgs | null {
  const importIndex = argv.findIndex((arg) => arg === 'import');
  if (importIndex === -1) {
    return null;
  }

  const raw: Record<string, string> = {};

  for (let i = importIndex + 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        raw[key] = next;
        i++;
      } else {
        raw[key] = 'true';
      }
    }
  }

  if (!raw.file) {
    return null;
  }

  return {
    file: raw.file,
    dbPath: raw.db || undefined,
  };
}

/**
 * Validate CLI args against the shared CreateTaskRequestSchema.
 * Returns parsed data or null with error message.
 */
export function validateArgs(
  args: CliArgs,
): { ok: true; data: CliArgs } | { ok: false; error: string } {
  const result = CreateTaskRequestSchema.safeParse({
    goal: args.goal,
    targetAppPath: args.targetAppPath,
    llmModel: args.llmModel,
    maxSteps: args.maxSteps,
  });

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    return { ok: false, error: `Validation failed:\n${issues}` };
  }

  return {
    ok: true,
    data: {
      goal: result.data.goal,
      targetAppPath: result.data.targetAppPath,
      llmModel: result.data.llmModel,
      maxSteps: result.data.maxSteps ?? 50,
      providerId: args.providerId,
    },
  };
}

// ─── Progress Formatting ─────────────────────────────────

/**
 * Format a single step record for human-readable progress output.
 */
export function formatStepProgress(
  record: StepRecord,
  stepNumber: number,
  maxSteps: number,
): string {
  const prefix = `[Step ${stepNumber}/${maxSteps}]`;

  switch (record.phase) {
    case 'observe': {
      const shortObs = (record.observation ?? 'Scanning app...').slice(0, 80);
      return `${prefix} Observe: ${shortObs}`;
    }
    case 'plan': {
      return `${prefix} Plan: ${record.reasoning ?? 'Planning next action...'}`;
    }
    case 'execute': {
      const action = record.action ?? { name: 'unknown', args: {} };
      const status = record.status === 'success' ? '\u2713' : '\u2717';
      return `${prefix} Execute: ${action.name} ${status}`;
    }
    case 'verify': {
      const verdictMark =
        record.status === 'success' ? '\u2713' : '\u2717';
      return `${prefix} Verify: ${record.reasoning ?? record.observation ?? 'Checking...'} ${verdictMark}`;
    }
    default:
      return `${prefix} ${record.phase}: ${record.status}`;
  }
}

/**
 * Format a final result summary line.
 */
export function formatResult(
  status: string,
  stepCount: number,
  totalDurationMs: number,
): string {
  const durationSec = (totalDurationMs / 1000).toFixed(1);
  const statusDisplay = status === 'completed' ? 'PASS' : status.toUpperCase();
  return `\nResult: ${statusDisplay} (${stepCount} steps, ${durationSec}s)`;
}

// ─── Report Saving ───────────────────────────────────────

/**
 * Save manifest.json to the report directory for a task.
 */
export function saveManifest(
  reportDir: string,
  taskId: string,
  goal: string,
  status: string,
  history: StepRecord[],
  startTime: string,
  endTime: string,
  totalDurationMs: number,
): void {
  mkdirSync(reportDir, { recursive: true });

  const passed = history.filter(
    (r) => r.status === 'success',
  ).length;
  const failed = history.filter(
    (r) => r.status === 'failed',
  ).length;
  const retried = history.filter(
    (r) => r.status === 'retry',
  ).length;

  const manifestStatus = ((): Manifest['status'] => {
    if (status === 'completed') return 'completed';
    if (status === 'aborted') return 'aborted';
    return 'failed';
  })();

  const manifest: Manifest = {
    taskId,
    goal,
    status: manifestStatus,
    totalSteps: history.length,
    passedSteps: passed,
    failedSteps: failed,
    retriedSteps: retried,
    startTime,
    endTime,
    totalDuration: totalDurationMs,
  };

  writeFileSync(
    join(reportDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  );
}

/**
 * Save timeline.jsonl to the report directory.
 */
export function saveTimeline(
  reportDir: string,
  history: StepRecord[],
): void {
  mkdirSync(reportDir, { recursive: true });

  const timelinePath = join(reportDir, 'timeline.jsonl');
  for (const record of history) {
    const entry: TimelineEntry = {
      stepIndex: record.stepIndex,
      phase: record.phase,
      status: record.status,
      action: record.action?.name ?? 'N/A',
      resultSummary: record.reasoning ?? record.observation ?? 'N/A',
      timestamp: record.timestamp,
      duration: record.duration,
    };
    appendFileSync(timelinePath, JSON.stringify(entry) + '\n');
  }
}

/**
 * Save feedback patterns to patterns.jsonl.
 * Creates entries for failed steps to enable learning.
 */
export function savePatterns(
  feedbackDir: string,
  taskId: string,
  history: StepRecord[],
  goal: string,
): void {
  mkdirSync(feedbackDir, { recursive: true });

  const patternsPath = join(feedbackDir, 'patterns.jsonl');
  const failedSteps = history.filter((r) => r.status === 'failed');

  for (const record of failedSteps) {
    const actionName = record.action?.name ?? 'unknown';
    const pattern: FeedbackPattern = {
      id: crypto.randomUUID(),
      errorType: `${actionName}_failure`,
      targetDescription: record.reasoning ?? record.observation ?? 'N/A',
      remediationHint: `Step ${record.stepIndex} (${record.phase}) failed during action "${actionName}". Check the action parameters and retry.`,
      similarityKeywords: [actionName, record.phase, 'failure'],
      frequency: 1,
      lastSeen: record.timestamp,
      relatedGoalPatterns: [goal],
    };
    appendFileSync(patternsPath, JSON.stringify(pattern) + '\n');
  }
}

// ─── Replay Command Handler ─────────────────────────────

/**
 * Handle the replay subcommand.
 * Returns process exit code.
 */
export async function handleReplayCommand(args: ReplayCliArgs): Promise<number> {
  const logger = getLogger({ source: 'replay' });

  // Determine mode (default to loose)
  const mode: 'strict' | 'loose' = args.strict ? 'strict' : 'loose';

  // Determine database path
  const dbPath = args.dbPath ?? join('data', 'replay.db');

  logger.info(`Replaying task ${args.taskId} in ${mode} mode`);

  const spinner = new Spinner({ text: `Replaying task ${args.taskId}...` });
  spinner.start();

  let runner: ReplayRunner | null = null;

  try {
    runner = new ReplayRunner(dbPath);
    const result = await runner.replay(args.taskId, mode);

    spinner.stop();

    // Print results
    process.stdout.write('\n');
    process.stdout.write(`${'='.repeat(60)}\n`);
    process.stdout.write(`  Replay Results: ${args.taskId}\n`);
    process.stdout.write(`${'='.repeat(60)}\n\n`);

    process.stdout.write(`Mode: ${mode}\n`);
    process.stdout.write(`Total Steps: ${result.totalSteps}\n`);
    process.stdout.write(`Passed: ${result.passedSteps}\n`);
    process.stdout.write(`Failed: ${result.failedSteps}\n\n`);

    // Print step details
    for (const step of result.steps) {
      const icon = step.passed ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
      process.stdout.write(`${icon} Step ${step.stepNumber}: ${step.passed ? 'PASSED' : 'FAILED'}\n`);

      if (!step.passed && step.diff) {
        process.stdout.write(`  Expected: ${step.expectedObservation.slice(0, 80)}...\n`);
        process.stdout.write(`  Actual:   ${step.actualObservation.slice(0, 80)}...\n`);

        if (step.diff.differences.length > 0) {
          process.stdout.write(`  Differences:\n`);
          for (const diff of step.diff.differences.slice(0, 3)) {
            process.stdout.write(`    - ${diff.path}: ${diff.type}\n`);
          }
          if (step.diff.differences.length > 3) {
            process.stdout.write(`    ... and ${step.diff.differences.length - 3} more\n`);
          }
        }
      }

      process.stdout.write('\n');
    }

    // Print summary
    process.stdout.write(`${'─'.repeat(60)}\n`);
    if (result.success) {
      process.stdout.write('\x1b[32m✓ Replay PASSED\x1b[0m\n');
    } else {
      process.stdout.write('\x1b[31m✗ Replay FAILED\x1b[0m\n');
    }
    process.stdout.write(`${'─'.repeat(60)}\n\n`);

    return result.success ? 0 : 1;
  } catch (err: unknown) {
    spinner.fail('Replay failed');

    const eataError = wrapError(err, ErrorCode.TASK_EXECUTION_FAILED);
    logger.error('Replay failed', eataError);

    return 1;
  } finally {
    runner?.close();
  }
}

// ─── Export Command Handler ─────────────────────

/**
 * Export a task from the database as JSONL.
 * Self-contained implementation for CLI use (no server dependency).
 */
function cliExportTask(db: import('better-sqlite3').Database, taskId: string): string {
  const taskRow = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Record<string, unknown> | undefined;
  if (!taskRow) {
    throw new Error('Task not found');
  }

  const stepRows = db.prepare('SELECT * FROM steps WHERE task_id = ? ORDER BY step_index').all(taskId) as Array<Record<string, unknown>>;

  const lines: string[] = [];

  // Task line
  lines.push(JSON.stringify({
    type: 'task',
    data: {
      id: String(taskRow.id),
      goal: String(taskRow.goal),
      target_app_path: String(taskRow.target_app_path),
      llm_model: String(taskRow.llm_model),
      status: String(taskRow.status),
      max_steps: Number(taskRow.max_steps),
      step_count: Number(taskRow.step_count),
      result_summary: taskRow.result_summary ?? null,
      context_injection: taskRow.context_injection ?? null,
      provider_id: taskRow.provider_id ?? null,
      created_at: String(taskRow.created_at),
      updated_at: String(taskRow.updated_at),
    },
  }));

  // Step lines
  for (const row of stepRows) {
    lines.push(JSON.stringify({
      type: 'step',
      data: {
        step_number: Number(row.step_index),
        phase: String(row.phase),
        status: String(row.status),
        observation: row.observation ?? null,
        action: row.action ? JSON.parse(row.action as string) : null,
        result: row.result ? JSON.parse(row.result as string) : null,
        reasoning: row.reasoning ?? null,
        screenshot_path: row.screenshot_path ?? null,
        accessibility_snapshot_path: row.accessibility_snapshot_path ?? null,
        timestamp: String(row.timestamp),
        duration: Number(row.duration),
      },
    }));
  }

  return lines.join('\n') + '\n';
}

/**
 * Handle the export subcommand.
 * Returns process exit code.
 */
export async function handleExportCommand(args: ExportCliArgs): Promise<number> {
  const logger = getLogger({ source: 'export' });

  if (args.format !== 'jsonl') {
    logger.error(`Unsupported format: ${args.format}. Only "jsonl" is supported.`);
    return 1;
  }

  const dbPath = args.dbPath ?? join('data', 'eata.db');

  logger.info(`Exporting task ${args.taskId} as ${args.format}`);

  const spinner = new Spinner({ text: `Exporting task ${args.taskId}...` });
  spinner.start();

  try {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath);

    try {
      const jsonl = cliExportTask(db, args.taskId);

      spinner.stop();

      if (args.output) {
        writeFileSync(args.output, jsonl, 'utf-8');
        process.stdout.write(`Exported task ${args.taskId} to ${args.output}\n`);
      } else {
        process.stdout.write(jsonl);
      }

      return 0;
    } finally {
      db.close();
    }
  } catch (err: unknown) {
    spinner.fail('Export failed');
    logger.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

// ─── Import Command Handler ─────────────────────

/**
 * Import a task from JSONL content into the database.
 * Self-contained implementation for CLI use (no server dependency).
 */
function cliImportTask(db: import('better-sqlite3').Database, jsonl: string): { taskId: string; stepCount: number } {
  const lines = jsonl.trim().split('\n').filter((l) => l.trim());
  if (lines.length === 0) {
    throw new Error('JSONL content is empty');
  }

  let taskData: Record<string, unknown> | null = null;
  const stepDataList: Array<Record<string, unknown>> = [];

  for (let i = 0; i < lines.length; i++) {
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(lines[i].trim());
    } catch {
      throw new Error(`line ${i + 1}: invalid JSON`);
    }

    if (!obj.type || !obj.data) {
      throw new Error(`line ${i + 1}: missing "type" or "data" field`);
    }

    if (obj.type !== 'task' && obj.type !== 'step') {
      throw new Error(`line ${i + 1}: invalid type "${obj.type}"`);
    }

    if (obj.type === 'task') {
      taskData = obj.data as Record<string, unknown>;
    } else if (obj.type === 'step') {
      if (!taskData) {
        throw new Error(`line ${i + 1}: "step" line found before "task" line`);
      }
      stepDataList.push(obj.data as Record<string, unknown>);
    }
  }

  if (!taskData) {
    throw new Error('No task line found in JSONL');
  }

  // Handle duplicate IDs
  let taskId = String(taskData.id);
  const existing = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId);
  if (existing) {
    taskId = crypto.randomUUID();
  }

  // Insert task
  db.prepare(
    `INSERT INTO tasks (id, goal, target_app_path, llm_model, status, max_steps, step_count, result_summary, context_injection, provider_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    taskId,
    String(taskData.goal),
    String(taskData.target_app_path),
    String(taskData.llm_model),
    String(taskData.status),
    Number(taskData.max_steps),
    Number(taskData.step_count),
    taskData.result_summary ?? null,
    taskData.context_injection ?? null,
    taskData.provider_id ?? null,
    String(taskData.created_at),
    String(taskData.updated_at),
  );

  // Insert steps
  for (const stepData of stepDataList) {
    db.prepare(
      `INSERT INTO steps (id, task_id, step_index, phase, status, observation, action, result, reasoning, screenshot_path, accessibility_snapshot_path, timestamp, duration)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      taskId,
      Number(stepData.step_number),
      String(stepData.phase),
      String(stepData.status),
      stepData.observation ?? null,
      stepData.action ? JSON.stringify(stepData.action) : null,
      stepData.result ? JSON.stringify(stepData.result) : null,
      stepData.reasoning ?? null,
      stepData.screenshot_path ?? null,
      stepData.accessibility_snapshot_path ?? null,
      String(stepData.timestamp),
      Number(stepData.duration),
    );
  }

  return { taskId, stepCount: stepDataList.length };
}

/**
 * Handle the import subcommand.
 * Returns process exit code.
 */
export async function handleImportCommand(args: ImportCliArgs): Promise<number> {
  const logger = getLogger({ source: 'import' });

  const dbPath = args.dbPath ?? join('data', 'eata.db');

  logger.info(`Importing task from ${args.file}`);

  const spinner = new Spinner({ text: `Importing from ${args.file}...` });
  spinner.start();

  try {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath);

    try {
      const jsonl = readFileSync(args.file, 'utf-8');
      const result = cliImportTask(db, jsonl);

      spinner.succeed('Import completed');
      process.stdout.write(`Imported task ${result.taskId} with ${result.stepCount} steps\n`);
      return 0;
    } finally {
      db.close();
    }
  } catch (err: unknown) {
    spinner.fail('Import failed');
    logger.error(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

// ─── Main CLI Flow ──────────────────────────────────────

/**
 * Main CLI entry point. Returns process exit code.
 * Accepts optional args override for testing (defaults to process.argv).
 */
export async function cliMain(
  argsOverride?: CliArgs,
): Promise<number> {
  const logger = getLogger({ source: 'cli' });
  const startTime = new Date().toISOString();
  const startMs = Date.now();

  // Check for help command
  const argv = argsOverride ? ['node', 'eata', ...Object.entries(argsOverride).flatMap(([k, v]) => [`--${k}`, String(v)])] : process.argv;
  const help = new CLIHelp({ colorized: true });

  // Handle help flags
  if (argv.includes('--help') || argv.includes('-h')) {
    const commandIndex = argv.findIndex((arg) => !arg.startsWith('-'));
    const command = commandIndex > 1 ? argv.slice(commandIndex).join(' ') : undefined;
    help.showHelp(command);
    return 0;
  }

  // Handle config init command
  if (argv[2] === 'config' && argv[3] === 'init') {
    logger.info('Starting configuration wizard...');
    const result = await runConfigWizard({
      interactive: !argv.includes('--non-interactive'),
    });
    return result.success ? 0 : 1;
  }

  // Handle replay command
  const replayArgs = parseReplayArgs(process.argv);
  if (replayArgs) {
    return handleReplayCommand(replayArgs);
  }

  // Handle export command
  const exportArgs = parseExportArgs(process.argv);
  if (exportArgs) {
    return handleExportCommand(exportArgs);
  }

  // Handle import command
  const importArgs = parseImportArgs(process.argv);
  if (importArgs) {
    return handleImportCommand(importArgs);
  }

  // Parse and validate arguments
  const args = argsOverride ?? parseArgs(process.argv);
  const validation = validateArgs(args);

  if (!validation.ok) {
    const eataError = new EataError(
      ErrorCode.CLI_INVALID_ARGS,
      'Invalid command line arguments',
      { context: { issues: validation.error } },
    );
    logger.error('Validation failed', eataError);
    return 1;
  }

  const { goal, targetAppPath, llmModel, maxSteps, providerId } = validation.data;

  logger.info('Starting test execution', {
    goal: goal.slice(0, 50) + (goal.length > 50 ? '...' : ''),
    targetAppPath,
    llmModel,
    maxSteps,
  });

  // Setup SIGINT handler for graceful shutdown
  let interrupted = false;
  const sigintHandler = () => {
    if (!interrupted) {
      interrupted = true;
      logger.warn('Interrupted by user. Printing partial results...');
    }
  };
  process.on('SIGINT', sigintHandler);

  // Initialize progress tracking
  const progressTracker = new ProgressTracker();
  const spinner = new Spinner({ text: 'Initializing test execution...' });
  spinner.start();

  let taskId = '';

  try {
    // Run the AI loop
    const result = await runTest({
      goal,
      targetAppPath,
      llmModel,
      maxSteps,
      providerId,
    });

    taskId = result.taskId;
    spinner.succeed('Test execution completed');

    const history: StepRecord[] = result.history ?? [];
    const status = result.status as string;

    // Track progress
    progressTracker.startTask(taskId, maxSteps, 'executing');

    // Print step progress with enhanced formatting
    let stepNum = 0;
    for (const record of history) {
      stepNum++;
      progressTracker.updateTask(taskId, stepNum, record.phase, record.reasoning ?? record.observation);

      const icon = record.status === 'success' ? '\x1b[32m✓\x1b[0m' : record.status === 'failed' ? '\x1b[31m✗\x1b[0m' : '\x1b[33m○\x1b[0m';
      const prefix = `[${stepNum}/${maxSteps}]`;
      const phase = record.phase.padEnd(10);
      const message = (record.reasoning ?? record.observation ?? '').slice(0, 60);
      const duration = record.duration ? `(${record.duration}ms)` : '';

      process.stdout.write(`${icon} ${prefix} ${phase} ${message} ${duration}\n`);
    }

    // Complete progress tracking
    progressTracker.completeTask(taskId, status);

    // Print final result
    const endMs = Date.now();
    const totalDuration = endMs - startMs;
    const statusDisplay = status === 'completed' ? '\x1b[32mPASS\x1b[0m' : status.toUpperCase();
    const durationStr = formatDuration(totalDuration);

    process.stdout.write(`\n${'─'.repeat(50)}\n`);
    process.stdout.write(`Result: ${statusDisplay} (${stepNum} steps, ${durationStr})\n`);
    process.stdout.write(`${'─'.repeat(50)}\n\n`);

    // Save report
    const reportDir = join('data', 'reports', taskId);
    const saveSpinner = new Spinner({ text: 'Saving report...' });
    saveSpinner.start();

    saveManifest(
      reportDir,
      taskId,
      goal,
      status,
      history,
      startTime,
      new Date().toISOString(),
      totalDuration,
    );
    saveTimeline(reportDir, history);

    saveSpinner.succeed(`Report saved to: ${reportDir}/`);

    // Save feedback patterns
    const feedbackDir = join('data', 'feedback');
    savePatterns(feedbackDir, taskId, history, goal);

    logger.info('Test execution completed', {
      taskId,
      status,
      steps: stepNum,
      duration: durationStr,
    });

    // Return exit code based on result
    if (status === 'completed' || status === 'passed') {
      return 0;
    }
    return 1;
  } catch (err: unknown) {
    spinner.fail('Test execution failed');

    const eataError = wrapError(err, ErrorCode.TASK_EXECUTION_FAILED);
    logger.error('Test execution failed', eataError);

    // Save partial report on failure if taskId was generated
    if (taskId) {
      try {
        const reportDir = join('data', 'reports', taskId);
        mkdirSync(reportDir, { recursive: true });
        writeFileSync(
          join(reportDir, 'error.json'),
          JSON.stringify({
            error: eataError.toJSON(),
            timestamp: new Date().toISOString(),
          }, null, 2),
        );
      } catch (reportErr: unknown) {
        logger.error(`Failed to save error report: ${reportErr instanceof Error ? reportErr.message : String(reportErr)}`);
      }
    }

    return 1;
  } finally {
    process.off('SIGINT', sigintHandler);
  }
}

// ─── Auto-Run ────────────────────────────────────────────

// When executed directly (not imported), run the CLI
const isDirectExecution =
  process.argv[1] &&
  (process.argv[1].endsWith('cli.ts') ||
    process.argv[1].endsWith('cli.js'));

if (isDirectExecution) {
  const cliLogger = getLogger({ source: 'cli' });
  cliMain().then((code) => {
    process.exit(code);
  }).catch((err: unknown) => {
    cliLogger.error(`Fatal: ${String(err)}`);
    process.exit(1);
  });
}
