import { createInterface, type Interface } from 'readline';
import { runTest } from './runner.js';
import { toErrorMessage } from './utils/error.js';
import { createStderrLogger } from './utils/logger.js';

const logger = createStderrLogger('worker-entry');

// ── JSON-RPC 输出 ────────────────────────────────────────

export function emit(method: string, params: Record<string, unknown> = {}): void {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

// ── 参数解析 ─────────────────────────────────────────────

export function parseArgs(argv: string[]): Record<string, string> {
  const args = argv.slice(2);
  const parsed: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    parsed[args[i].replace(/^--/, '')] = args[i + 1];
  }
  return parsed;
}

export function resolveArgs(
  parsed: Record<string, string>,
): {
  taskId: string;
  goal: string;
  targetAppPath: string;
  llmModel?: string;
  maxSteps?: number;
  providerId?: string;
  dataDir?: string;
} {
  // Set env vars for LLM config (runner reads from env)
  if (parsed['llm-base-url']) process.env.OPENAI_BASE_URL = parsed['llm-base-url'];
  if (parsed['llm-api-key']) process.env.OPENAI_API_KEY = parsed['llm-api-key'];

  return {
    taskId: parsed['task-id'] || process.env.TASK_ID || 'default',
    goal: parsed['goal'] || process.env.GOAL || 'test',
    targetAppPath: parsed['target-app'] || process.env.TARGET_APP || './fixtures/test-electron-app',
    llmModel: parsed['llm-model'] || process.env.LLM_MODEL,
    maxSteps: parsed['max-steps'] ? Number(parsed['max-steps']) : process.env.MAX_STEPS ? Number(process.env.MAX_STEPS) : undefined,
    providerId: parsed['provider-id'] || process.env.PROVIDER_ID,
    dataDir: parsed['data-dir'] || process.env.DATA_DIR || undefined,
  };
}

// ── 主入口 ───────────────────────────────────────────────

export async function workerMain(argv: string[] = process.argv): Promise<number> {
  const parsed = parseArgs(argv);
  const args = resolveArgs(parsed);

  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let rl: Interface | null = null;
  let exitCode = 0;

  // 心跳每 2s
  heartbeatTimer = setInterval(() => emit('heartbeat', {}), 2000);

  // 监听 stdin cancel
  rl = createInterface({ input: process.stdin });
  rl.on('line', (line: string) => {
    try {
      const msg = JSON.parse(line);
      if (msg.jsonrpc === '2.0' && msg.method === 'cancel') {
        clearInterval(heartbeatTimer!);
        rl?.close();
        emit('task_end', { status: 'cancelled' });
        process.exit(0);
      }
    } catch (err: unknown) {
      logger.error(`Error: ${toErrorMessage(err)}`);
    }
  });

  // SIGINT / SIGTERM
  const onSignal = () => {
    clearInterval(heartbeatTimer!);
    rl?.close();
    emit('task_end', { status: 'cancelled' });
    process.exit(0);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  emit('step_start', { taskId: args.taskId, phase: 'init' });

  try {
    const result = await runTest({
      goal: args.goal,
      targetAppPath: args.targetAppPath,
      llmModel: args.llmModel,
      maxSteps: args.maxSteps,
      taskId: args.taskId,
      providerId: args.providerId,
      dataDir: args.dataDir,
    });
    emit('step_complete', { taskId: args.taskId, phase: 'completed', status: result.status });
    emit('task_end', { taskId: args.taskId, success: result.status === 'completed', status: result.status, stepCount: result.stepCount });
    exitCode = 0;
  } catch (error: unknown) {
    const message = toErrorMessage(error);
    emit('error', { taskId: args.taskId, message });
    emit('task_end', { taskId: args.taskId, success: false, status: 'failed', message });
    exitCode = 1;
  } finally {
    clearInterval(heartbeatTimer!);
    rl?.close();
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }

  return exitCode;
}

// ── Auto-run ─────────────────────────────────────────────

const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('worker-entry.ts') ||
  process.argv[1].endsWith('worker-entry.js')
);

if (isDirectRun) {
  workerMain().then((code) => process.exit(code)).catch((err: unknown) => {
    emit('error', { message: String(err) });
    emit('task_end', { status: 'failed' });
    process.exit(1);
  });
}
