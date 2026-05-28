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

// ─── Types ───────────────────────────────────────────────

interface CliArgs {
  goal: string;
  targetAppPath: string;
  llmModel: string;
  maxSteps: number;
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

  const { goal, targetAppPath, llmModel, maxSteps } = validation.data;

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
