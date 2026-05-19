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
  const startTime = new Date().toISOString();
  const startMs = Date.now();

  // Parse and validate arguments
  const args = argsOverride ?? parseArgs(process.argv);
  const validation = validateArgs(args);

  if (!validation.ok) {
    process.stderr.write(validation.error + '\n');
    return 1;
  }

  const { goal, targetAppPath, llmModel, maxSteps } = validation.data;

  // Setup SIGINT handler for graceful shutdown
  let interrupted = false;
  const sigintHandler = () => {
    if (!interrupted) {
      interrupted = true;
      process.stdout.write('\n\nInterrupted. Printing partial results...\n');
    }
  };
  process.on('SIGINT', sigintHandler);

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

    const history: StepRecord[] = result.history ?? [];
    const status = result.status as string;

    // Print step progress
    let stepNum = 0;
    for (const record of history) {
      stepNum++;
      process.stdout.write(
        formatStepProgress(record, stepNum, maxSteps) + '\n',
      );
    }

    // Print final result
    const endMs = Date.now();
    const totalDuration = endMs - startMs;
    process.stdout.write(formatResult(status, stepNum, totalDuration) + '\n');

    // Save report
    const reportDir = join('data', 'reports', taskId);
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
    process.stdout.write(`Report saved to: ${reportDir}/\n`);

    // Save feedback patterns
    const feedbackDir = join('data', 'feedback');
    savePatterns(feedbackDir, taskId, history, goal);

    // Return exit code based on result
    if (status === 'completed' || status === 'passed') {
      return 0;
    }
    return 1;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);

    // Save partial report on failure if taskId was generated
    if (taskId) {
      try {
        const reportDir = join('data', 'reports', taskId);
        mkdirSync(reportDir, { recursive: true });
        writeFileSync(
          join(reportDir, 'error.json'),
          JSON.stringify({ error: message, timestamp: new Date().toISOString() }, null, 2),
        );
      } catch {
        // Silently ignore filesystem errors during error reporting
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
  cliMain().then((code) => {
    process.exit(code);
  }).catch((err) => {
    process.stderr.write(`Fatal: ${String(err)}\n`);
    process.exit(1);
  });
}
