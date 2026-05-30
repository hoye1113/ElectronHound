import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MCPClient } from './mcp/client.js';
import { createLLMProviderAdapter, createLLMProviderAdapterForProvider } from './llm/adapter.js';
import { loadProvidersConfig } from './config-manager.js';
import { AgentLoop } from './runtime/agentLoop.js';
import { SessionManager } from './session/sessionManager.js';
import { CheckpointManager } from './session/checkpointManager.js';
import { entriesToStepRecords, extractLastStep, type StepArtifactPath } from './session/entryConverter.js';
import { runAuditChain } from './sub-agents/audit-chain.js';
import type { RunTestResult } from './runner-types.js';
import { toErrorMessage } from './utils/error.js';
import { createStderrLogger } from './utils/logger.js';

const logger = createStderrLogger('runner');

export interface RunTestOptions {
  goal: string;
  targetAppPath: string;
  llmModel?: string;
  maxSteps?: number;
  taskId?: string;
  checkpointPath?: string;
  cdpUrl?: string;
  providerId?: string;
  /** Base directory for saving reports, screenshots, etc. Defaults to './data'. */
  dataDir?: string;
}

export async function runTest(
  options: RunTestOptions,
): Promise<RunTestResult> {
  // Resolve LLM provider
  let llmProvider;

  if (options.providerId) {
    // Use the specified provider
    const config = loadProvidersConfig();
    const provider = config.providers.find(p => p.id === options.providerId);
    if (!provider) {
      throw new Error(`Provider '${options.providerId}' not found`);
    }
    llmProvider = createLLMProviderAdapterForProvider(provider);
  } else {
    // Fall back to env-based or default provider
    llmProvider = createLLMProviderAdapter({ model: options.llmModel });
  }

  if (!llmProvider) {
    throw new Error('No LLM provider available — set OPENAI_API_KEY or configure a provider');
  }

  // Resolve MCP client (for tool execution)
  let mcpClient;
  if (options.cdpUrl) {
    // Legacy: connect to an already-running CDP endpoint
    const mcp = new MCPClient();
    await mcp.connect({ playwrightCdpUrl: options.cdpUrl });
    mcpClient = mcp;
  } else if (options.targetAppPath) {
    // Launch the Electron app via electron-bridge-mcp
    const mcp = new MCPClient();
    await mcp.connect({ electron: { appPath: options.targetAppPath } });
    mcpClient = mcp;
  }

  // Create session manager
  const sessionManager = new SessionManager(options.checkpointPath);

  // Create checkpoint manager for per-step persistence
  let checkpointManager: CheckpointManager | null = null;
  if (options.checkpointPath) {
    try {
      checkpointManager = new CheckpointManager(options.checkpointPath);
    } catch (err: unknown) {
      logger.warn(`Failed to initialize CheckpointManager: ${toErrorMessage(err)}`);
    }
  }

  // Track screenshot/accessibility artifact paths per step
  const stepArtifactPaths = new Map<number, StepArtifactPath>();
  const dataDir = options.dataDir ?? './data';

  // Create AgentLoop with per-step checkpoint + screenshot callback
  const agentLoop = new AgentLoop({
    llmProvider,
    sessionManager,
    mcpClient,
    maxSteps: options.maxSteps ?? 50,
    onStepComplete: (stepCount, state) => {
      // Checkpoint save (if manager available)
      if (checkpointManager) {
        checkpointManager.save({
          sessionId: state.sessionId,
          currentStep: stepCount,
          maxSteps: options.maxSteps ?? 50,
          taskPrompt: state.taskPrompt,
          config: { maxSteps: options.maxSteps ?? 50 },
          lastObservation: state.currentObservation,
          lastPlan: state.lastPlan,
          lastExecutionResult: state.lastExecution,
          sessionEntries: sessionManager.getSession(state.sessionId)?.entries ?? [],
          timestamp: new Date().toISOString(),
        });
      }

      // Capture screenshot and accessibility snapshot (fire-and-forget)
      if (mcpClient) {
        captureStepArtifacts(mcpClient, dataDir, taskId, stepCount, stepArtifactPaths)
          .catch((err: unknown) => {
            logger.warn(`Screenshot capture failed for step ${stepCount}: ${toErrorMessage(err)}`);
          });
      }
    },
  });

  const taskId = options.taskId ?? crypto.randomUUID();

  // Check for existing checkpoint
  let result;
  const existingCheckpoint = checkpointManager?.get(taskId);
  if (existingCheckpoint) {
    // Resume from checkpoint
    logger.info(`Resuming from checkpoint for session ${taskId}, step ${existingCheckpoint.currentStep + 1}`);
    result = await agentLoop.resume(existingCheckpoint);
    // Delete checkpoint after successful resume
    checkpointManager?.delete(taskId);
  } else {
    // Run the agent loop (include target app path in the goal for context)
    const goalWithContext = `Target app path: ${options.targetAppPath}\nGoal: ${options.goal}`;
    result = await agentLoop.run(goalWithContext);
  }

  // Read session entries and convert to StepRecords (with screenshot paths)
  const session = sessionManager.getSession(result.sessionId);
  const history = session ? entriesToStepRecords(session.entries, taskId, stepArtifactPaths) : [];
  const lastStep = history.length > 0 ? extractLastStep(history) : null;

  // Persist step records to disk for server consumption
  if (history.length > 0) {
    try {
      const stepsDir = join(dataDir, 'reports', taskId);
      await mkdir(stepsDir, { recursive: true });
      await writeFile(
        join(stepsDir, 'steps.json'),
        JSON.stringify(history, null, 2),
        'utf-8',
      );
    } catch (err: unknown) {
      logger.warn(`Failed to write step records: ${toErrorMessage(err)}`);
    }
  }

  // Run audit chain (4-role sub-agent pipeline)
  let auditChainResult = null;
  try {
    auditChainResult = await runAuditChain({
      goal: options.goal,
      targetAppPath: options.targetAppPath,
      context: { history, stepCount: result.report?.stepCount ?? 0 },
    });
  } catch (err: unknown) {
    logger.warn(`Audit chain failed: ${toErrorMessage(err)}`);
  }

  // Clean up checkpoint manager
  checkpointManager?.close();

  // Convert AgentLoop result to RunTestResult (backward-compatible with worker-entry.ts)
  const runTestResult: RunTestResult = {
    goal: options.goal,
    targetAppPath: options.targetAppPath,
    llmModel: options.llmModel ?? 'gpt-4o',
    maxSteps: options.maxSteps ?? 50,
    taskId,
    history,
    currentObservation: lastStep?.observation ?? null,
    currentPlan: lastStep?.plan ?? null,
    currentExecResult: lastStep?.execution ?? null,
    currentVerdict: result.verdict
      ? { verdict: result.verdict, reasoning: result.report?.reasoning ?? '' }
      : null,
    stepCount: result.report?.stepCount ?? 0,
    stuckCounter: result.verdict === 'stuck' ? 3 : 0,
    status: result.verdict === 'pass'
      ? 'completed'
      : result.verdict === 'fail'
        ? 'failed'
        : result.verdict === 'stuck'
          ? 'failed'
          : 'aborted',
    lastObservationHash: lastStep?.observationHash ?? '',
    auditChainResult,
  };

  return runTestResult;
}

// ── Screenshot / Accessibility capture ─────────────────────────────────────

/**
 * Capture a screenshot and accessibility snapshot for a completed step.
 *
 * Uses the MCP client to call `browser_snapshot` (screenshot format) and
 * `browser_snapshot` (aria format), saves the results to disk, and records
 * the paths in the provided map.
 *
 * Errors are caught and logged — screenshot capture is best-effort and must
 * never abort the agent loop.
 */
async function captureStepArtifacts(
  mcpClient: MCPClient,
  dataDir: string,
  taskId: string,
  stepIndex: number,
  paths: Map<number, StepArtifactPath>,
): Promise<void> {
  const screenshotDir = join(dataDir, 'reports', taskId, 'screenshots');
  const accessibilityDir = join(dataDir, 'reports', taskId, 'accessibility');

  const artifact: StepArtifactPath = {};

  // ── Screenshot ────────────────────────────────────────────────────────────
  try {
    const screenshotResult = await mcpClient.callTool(
      'playwright',
      'browser_snapshot',
      { format: 'screenshot' },
    );

    if (screenshotResult.success && screenshotResult.result) {
      const data = screenshotResult.result as Record<string, unknown>;
      // The MCP result may contain base64 image data or a buffer
      const imageBase64 = typeof data === 'string'
        ? data
        : typeof data.data === 'string'
          ? data.data
          : null;

      if (imageBase64) {
        await mkdir(screenshotDir, { recursive: true });
        const filepath = join(screenshotDir, `step-${stepIndex}.png`);
        const buffer = Buffer.from(imageBase64, 'base64');
        await writeFile(filepath, buffer);
        artifact.screenshotPath = filepath;
      }
    }
  } catch (err: unknown) {
    logger.warn(`Screenshot capture failed for step ${stepIndex}: ${toErrorMessage(err)}`);
  }

  // ── Accessibility snapshot ────────────────────────────────────────────────
  try {
    const ariaResult = await mcpClient.callTool(
      'playwright',
      'browser_snapshot',
      { format: 'aria' },
    );

    if (ariaResult.success && ariaResult.result) {
      await mkdir(accessibilityDir, { recursive: true });
      const filepath = join(accessibilityDir, `step-${stepIndex}.json`);
      const jsonStr = typeof ariaResult.result === 'string'
        ? ariaResult.result
        : JSON.stringify(ariaResult.result, null, 2);
      await writeFile(filepath, jsonStr, 'utf-8');
      artifact.accessibilitySnapshotPath = filepath;
    }
  } catch (err: unknown) {
    logger.warn(`Accessibility snapshot failed for step ${stepIndex}: ${toErrorMessage(err)}`);
  }

  // Store paths if at least one artifact was captured
  if (artifact.screenshotPath || artifact.accessibilitySnapshotPath) {
    paths.set(stepIndex, artifact);
  }
}
