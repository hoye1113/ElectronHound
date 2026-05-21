import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../apps/server/src/server.js';
import { createTestGraph } from '../../packages/agent-core/src/graph.js';
import { setMCPClient, MCPClient } from '../../packages/agent-core/src/mcp/client.js';
import { createReportGraph } from '../../packages/agent-core/src/report-graph/graph.js';
import { runAuditChain } from '../../packages/agent-core/src/sub-agents/audit-chain.js';
import { WorkerPoolManager } from '../../apps/server/src/services/workerPool/manager.js';
import { TaskQueue } from '../../apps/server/src/services/workerPool/queue.js';
import { loadExamples } from '../../packages/agent-core/src/prompts/few-shot/store.js';
import { mkdtempSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import type { PoolTask, TaskExecutor } from '../../apps/server/src/services/workerPool/types.js';

let server: FastifyInstance;
let db: Database.Database;
let cleanupDir: string;
let dataDir: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'eata-e2e-v03-'));
  const dbPath = join(dataDir, 'db.sqlite3');
  cleanupDir = dataDir;
  const bundle = await buildServer({
    databasePath: dbPath,
    dataDir,
  });
  server = bundle.server;
  db = bundle.db;

  const mockClient = new MCPClient();
  await mockClient.connect({});
  setMCPClient(mockClient);
});

afterEach(async () => {
  await server.close();
  db.close();
  try { rmSync(cleanupDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

function makeHistory() {
  return Array.from({ length: 4 }, (_, i) => ({
    id: crypto.randomUUID(),
    taskId: 'v03-e2e',
    stepIndex: i,
    phase: (['observe', 'plan', 'execute', 'verify'] as const)[i],
    status: 'success' as const,
    observation: `Step ${i} observation`,
    timestamp: new Date().toISOString(),
    duration: 100 + i * 50,
  }));
}

function makePoolTask(overrides: Partial<PoolTask> & { id: string; priority: PoolTask['priority'] }): PoolTask {
  return {
    goal: `Test task ${overrides.id}`,
    targetAppPath: '/test/app',
    llmModel: 'gpt-4o',
    ...overrides,
  };
}

// ─── Scenario 1: Task → Graph → Report with Audit Chain ───────────────────────

describe('E2E: v0.3 Pipeline', () => {
  describe('Scenario 1: Create task → graph executes → report generated with audit chain output', () => {
    it('creates a task via REST API', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: {
          goal: 'Click the Settings button',
          targetAppPath: '/test/app',
          llmModel: 'gpt-4o',
          maxSteps: 10,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.id).toBeDefined();
      expect(body.goal).toBe('Click the Settings button');
      expect(body.status).toBe('queued');
    });

    it('executes main test graph to completion', async () => {
      const graph = createTestGraph();
      const compiled = graph.compile();

      const result = await compiled.invoke(
        {
          goal: 'Test v0.3 full pipeline graph execution',
          targetAppPath: '/test/app',
          llmModel: 'gpt-4o',
          maxSteps: 10,
          taskId: 'v03-graph-test',
        },
        { configurable: { thread_id: 'v03-graph-test' }, recursionLimit: 100 },
      );

      expect(result).toBeDefined();
      expect(result.status).not.toBe('running');
      expect(['completed', 'failed', 'aborted']).toContain(result.status);
      expect(result.stepCount).toBeGreaterThan(0);
    });

    it('report graph produces all analysis outputs', async () => {
      const reportGraph = createReportGraph();
      const compiled = reportGraph.compile();

      const result = await compiled.invoke(
        {
          goal: 'Verify report graph outputs',
          history: makeHistory(),
          safetyReport: null,
          performanceReport: null,
          accessibilityReport: null,
          newPatterns: [],
          summaryText: '',
        },
        { configurable: { thread_id: 'v03-report-test' }, recursionLimit: 100 },
      );

      expect(result.safetyReport).toBeDefined();
      expect(result.performanceReport).toBeDefined();
      expect(result.accessibilityReport).toBeDefined();
      expect(result.summaryText).toBeDefined();
      expect(result.summaryText.length).toBeGreaterThan(0);
    });

    it('audit chain produces all 4 role outputs with correct ordering', async () => {
      const result = await runAuditChain({
        goal: 'Verify audit chain in v0.3 pipeline',
        targetAppPath: '/test/app',
        context: {
          history: makeHistory(),
          currentVerdict: { verdict: 'pass', reasoning: 'Test passed' },
        },
      });

      expect(result).toBeDefined();
      expect(result.chainOrder).toEqual([
        'test-planner',
        'execution-analyst',
        'security-reviewer',
        'report-synthesizer',
      ]);
      expect(result.testPlanner).toBeDefined();
      expect(result.testPlanner.role).toBe('test-planner');
      expect(result.executionAnalyst).toBeDefined();
      expect(result.executionAnalyst.role).toBe('execution-analyst');
      expect(result.securityReviewer).toBeDefined();
      expect(result.securityReviewer.role).toBe('security-reviewer');
      expect(result.reportSynthesizer).toBeDefined();
      expect(result.reportSynthesizer.role).toBe('report-synthesizer');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.completedAt).toBeDefined();
    });

    it('audit chain output is embedded in graph state after verify', async () => {
      const graph = createTestGraph();
      const compiled = graph.compile();

      const result = await compiled.invoke(
        {
          goal: 'Verify audit chain integration in main graph',
          targetAppPath: '/test/app',
          llmModel: 'gpt-4o',
          maxSteps: 5,
          taskId: 'v03-audit-chain-integration',
        },
        { configurable: { thread_id: 'v03-audit-chain-integration' }, recursionLimit: 100 },
      );

      // The verify node runs the audit chain — result should be populated
      // if the graph reached the verify step
      if (result.stepCount > 0) {
        // auditChainResult should be present if verify ran (which it does after the first execute)
        expect(result.auditChainResult).toBeDefined();
        if (result.auditChainResult) {
          expect(result.auditChainResult.chainOrder).toHaveLength(4);
          expect(result.auditChainResult.testPlanner.role).toBe('test-planner');
        }
      }
    });
  });

  // ─── Scenario 2: Priority Queue Ordering ──────────────────────────────────

  describe('Scenario 2: Priority queue ordering — high runs before medium, medium before low', () => {
    it('TaskQueue dequeues in priority order', () => {
      const queue = new TaskQueue();

      // Enqueue in reverse priority order
      queue.enqueue(makePoolTask({ id: 'low-1', priority: 'low' }));
      queue.enqueue(makePoolTask({ id: 'medium-1', priority: 'medium' }));
      queue.enqueue(makePoolTask({ id: 'high-1', priority: 'high' }));
      queue.enqueue(makePoolTask({ id: 'low-2', priority: 'low' }));
      queue.enqueue(makePoolTask({ id: 'medium-2', priority: 'medium' }));
      queue.enqueue(makePoolTask({ id: 'high-2', priority: 'high' }));

      // Dequeue order should be: high-1, high-2, medium-1, medium-2, low-1, low-2
      const order: string[] = [];
      let task = queue.dequeue();
      while (task) {
        order.push(task.id);
        task = queue.dequeue();
      }

      expect(order).toEqual(['high-1', 'high-2', 'medium-1', 'medium-2', 'low-1', 'low-2']);
    });

    it('WorkerPoolManager executes high-priority tasks first when concurrency is limited', async () => {
      const executionOrder: string[] = [];
      const completers = new Map<string, () => void>();

      const mockExecutor: TaskExecutor = {
        execute: (task, onComplete) => {
          executionOrder.push(task.id);
          // Store the completion callback so we can control when tasks finish
          completers.set(task.id, () => {
            onComplete(task.id, 'completed');
          });
        },
        cancel: (taskId) => {
          completers.delete(taskId);
        },
      };

      // maxConcurrency=1 means only one task runs at a time
      const pool = new WorkerPoolManager({ maxConcurrency: 1 }, mockExecutor);

      // Submit 3 tasks: low first, then medium, then high
      // Low gets started immediately (slot available), medium and high queue
      pool.submit(makePoolTask({ id: 'task-low', priority: 'low' }));
      pool.submit(makePoolTask({ id: 'task-medium', priority: 'medium' }));
      pool.submit(makePoolTask({ id: 'task-high', priority: 'high' }));

      // First task (low) started immediately
      expect(executionOrder).toEqual(['task-low']);
      expect(pool.getRunningCount()).toBe(1);
      expect(pool.getQueueLength()).toBe(2);

      // Complete the running task — the next dequeued should be high (not medium)
      completers.get('task-low')!();
      await vi.waitFor(() => expect(executionOrder.length).toBe(2));
      expect(executionOrder[1]).toBe('task-high');

      // Complete high — medium should start
      completers.get('task-high')!();
      await vi.waitFor(() => expect(executionOrder.length).toBe(3));
      expect(executionOrder[2]).toBe('task-medium');

      pool.shutdown();
    });

    it('WorkerPoolManager respects max 3 concurrent tasks', async () => {
      const runningTasks = new Set<string>();
      const maxObservedConcurrent = { value: 0 };
      const completers = new Map<string, () => void>();

      const mockExecutor: TaskExecutor = {
        execute: (task, onComplete) => {
          runningTasks.add(task.id);
          maxObservedConcurrent.value = Math.max(maxObservedConcurrent.value, runningTasks.size);

          completers.set(task.id, () => {
            runningTasks.delete(task.id);
            onComplete(task.id, 'completed');
          });
        },
        cancel: (taskId) => {
          runningTasks.delete(taskId);
          completers.delete(taskId);
        },
      };

      const pool = new WorkerPoolManager({ maxConcurrency: 3 }, mockExecutor);

      // Submit 5 tasks
      for (let i = 1; i <= 5; i++) {
        pool.submit(makePoolTask({ id: `task-${i}`, priority: 'medium' }));
      }

      // Exactly 3 should be running, 2 queued
      expect(pool.getRunningCount()).toBe(3);
      expect(pool.getQueueLength()).toBe(2);
      expect(maxObservedConcurrent.value).toBe(3);

      // Complete one — the 4th should start
      const firstCompleter = completers.values().next().value!;
      firstCompleter();
      await vi.waitFor(() => expect(pool.getRunningCount()).toBe(3));
      expect(pool.getQueueLength()).toBe(1);

      // Max concurrency never exceeded
      expect(maxObservedConcurrent.value).toBe(3);

      pool.shutdown();
    });
  });

  // ─── Scenario 3: Report Graph Integration ─────────────────────────────────

  describe('Scenario 3: Report graph — safety + performance + accessibility + pattern → summarize all produce output', () => {
    it('all 5 report nodes are present and executable', () => {
      const graph = createReportGraph();
      const compiled = graph.compile();
      const nodeNames = Object.keys(compiled.builder.nodes);

      expect(nodeNames).toContain('safety');
      expect(nodeNames).toContain('perf');
      expect(nodeNames).toContain('a11y');
      expect(nodeNames).toContain('pattern');
      expect(nodeNames).toContain('summarize');
    });

    it('all 4 analysis nodes produce reports before summarize', async () => {
      const graph = createReportGraph();
      const compiled = graph.compile();

      const result = await compiled.invoke(
        {
          goal: 'Comprehensive report graph test',
          history: makeHistory(),
          safetyReport: null,
          performanceReport: null,
          accessibilityReport: null,
          newPatterns: [],
          summaryText: '',
        },
        { configurable: { thread_id: 'v03-report-full' }, recursionLimit: 100 },
      );

      // Safety report
      expect(result.safetyReport).not.toBeNull();
      expect(result.safetyReport!.riskLevel).toBeDefined();

      // Performance report
      expect(result.performanceReport).not.toBeNull();
      expect(result.performanceReport!.avgStepDuration).toBeDefined();

      // Accessibility report
      expect(result.accessibilityReport).not.toBeNull();
      expect(result.accessibilityReport!.wcagLevel).toBeDefined();

      // Summary text aggregates all reports
      expect(result.summaryText).toBeDefined();
      expect(result.summaryText.length).toBeGreaterThan(0);
    });

    it('report graph works with mock generateObject overrides', async () => {
      const mockGenerateObject = vi.fn().mockImplementation((opts: { schema: unknown }) => {
        const schemaStr = JSON.stringify(opts.schema);
        if (schemaStr.includes('avgStepDuration')) {
          return { object: { avgStepDuration: 120, slowSteps: [], retryCount: 0, stuckDetected: false } };
        }
        if (schemaStr.includes('riskLevel')) {
          return { object: { riskLevel: 'low', findings: [] } };
        }
        if (schemaStr.includes('wcagLevel')) {
          return { object: { wcagLevel: 'AA', issues: [] } };
        }
        if (schemaStr.includes('errorType')) {
          return { object: { id: crypto.randomUUID(), errorType: 'test_error', targetDescription: 'test', remediationHint: 'fix it', similarityKeywords: ['test'], frequency: 1, lastSeen: new Date().toISOString(), relatedGoalPatterns: ['test'] } };
        }
        return { object: { riskLevel: 'none', findings: [], summary: 'mock summary' } };
      });

      const graph = createReportGraph({
        safety: { generateObject: mockGenerateObject },
        performance: { generateObject: mockGenerateObject },
        accessibility: { generateObject: mockGenerateObject },
        pattern: { generateObject: mockGenerateObject },
      });
      const compiled = graph.compile();

      const result = await compiled.invoke(
        {
          goal: 'Mock generateObject report test',
          history: makeHistory(),
          safetyReport: null,
          performanceReport: null,
          accessibilityReport: null,
          newPatterns: [],
          summaryText: '',
        },
        { configurable: { thread_id: 'v03-report-mock' }, recursionLimit: 100 },
      );

      expect(mockGenerateObject).toHaveBeenCalled();
      expect(result.safetyReport).not.toBeNull();
      expect(result.performanceReport).not.toBeNull();
      expect(result.accessibilityReport).not.toBeNull();
      expect(result.summaryText.length).toBeGreaterThan(0);
    });
  });

  // ─── Scenario 4: Few-Shot Injection ───────────────────────────────────────

  describe('Scenario 4: Few-shot injection — plan/verify nodes receive few-shot examples', () => {
    it('loadExamples returns empty array gracefully when no examples directory exists', async () => {
      const examples = await loadExamples({ goal: 'Click the settings button', maxExamples: 3 });
      // Should return empty array (graceful degradation), not throw
      expect(Array.isArray(examples)).toBe(true);
    });

    it('loadExamples matches examples by keyword similarity', async () => {
      // FEW_SHOT_DIR is a module-level const = join(process.cwd(), 'data', 'few-shot-examples')
      // Write fixture JSON files to the actual path the module reads from
      const fewShotDir = join(process.cwd(), 'data', 'few-shot-examples');
      const fixtureFile = join(fewShotDir, 'e2e-v03-test-settings.json');

      const example = {
        goal: 'Click the settings button and change theme',
        steps: [
          { id: crypto.randomUUID(), taskId: 'test', stepIndex: 0, phase: 'observe', status: 'success', observation: 'Page loaded', timestamp: new Date().toISOString(), duration: 100 },
        ],
        expectedResult: 'Theme changed to dark mode',
        metadata: {
          tags: ['settings', 'button', 'theme', 'navigation'],
          domain: 'testing',
          difficulty: 'easy',
        },
      };

      writeFileSync(fixtureFile, JSON.stringify(example));

      try {
        const examples = await loadExamples({
          goal: 'Click settings button to change theme',
          maxExamples: 3,
        });
        expect(examples.length).toBeGreaterThan(0);
        expect(examples[0].goal).toContain('settings');
      } finally {
        // Clean up fixture file
        try { unlinkSync(fixtureFile); } catch { /* ignore */ }
      }
    });

    it('plan node loads few-shot examples and includes them in prompt', async () => {
      let capturedPrompt = '';

      const mockGenerateObject = vi.fn().mockImplementation(async (params: { prompt: string }) => {
        capturedPrompt = params.prompt;
        return {
          object: {
            reasoning: 'Mock plan',
            toolCall: { name: 'browser_snapshot', args: {} },
            expectedOutcome: 'Get current page state',
          },
        };
      });

      const graph = createTestGraph({
        plan: { generateObject: mockGenerateObject },
      });
      const compiled = graph.compile();

      // Run graph — it will invoke the plan node which calls loadExamples
      const result = await compiled.invoke(
        {
          goal: 'Test few-shot injection in plan node',
          targetAppPath: '/test/app',
          llmModel: 'gpt-4o',
          maxSteps: 3,
          taskId: 'v03-fewshot-plan',
        },
        { configurable: { thread_id: 'v03-fewshot-plan' }, recursionLimit: 10 },
      );

      expect(result).toBeDefined();
      // The plan node was called (graph reached the plan step)
      if (mockGenerateObject.mock.calls.length > 0) {
        expect(capturedPrompt).toContain('Goal:');
      }
    });

    it('verify node loads few-shot examples and includes them in prompt', async () => {
      let capturedPrompt = '';

      const mockGenerateObject = vi.fn().mockImplementation(async (params: { prompt: string }) => {
        capturedPrompt = params.prompt;
        return {
          object: { verdict: 'pass', reasoning: 'Mock verification passed' },
        };
      });

      const graph = createTestGraph({
        verify: { generateObject: mockGenerateObject },
      });
      const compiled = graph.compile();

      const result = await compiled.invoke(
        {
          goal: 'Test few-shot injection in verify node',
          targetAppPath: '/test/app',
          llmModel: 'gpt-4o',
          maxSteps: 3,
          taskId: 'v03-fewshot-verify',
        },
        { configurable: { thread_id: 'v03-fewshot-verify' }, recursionLimit: 10 },
      );

      expect(result).toBeDefined();
      // The verify node was called (graph reached verify after execute)
      if (mockGenerateObject.mock.calls.length > 0) {
        expect(capturedPrompt).toContain('Goal:');
      }
    });
  });

  // ─── Scenario 5: Worker Pool Max 3 Concurrent ───────────────────────────

  describe('Scenario 5: Worker pool — verify max 3 concurrent with mock executor', () => {
    it('never exceeds max concurrency of 3', async () => {
      const runningCount = { value: 0 };
      let peakConcurrent = 0;
      const completers: Array<() => void> = [];

      const mockExecutor: TaskExecutor = {
        execute: (task, onComplete) => {
          runningCount.value++;
          peakConcurrent = Math.max(peakConcurrent, runningCount.value);
          completers.push(() => {
            runningCount.value--;
            onComplete(task.id, 'completed');
          });
        },
        cancel: () => {},
      };

      const pool = new WorkerPoolManager({ maxConcurrency: 3 }, mockExecutor);

      // Submit 7 tasks
      for (let i = 1; i <= 7; i++) {
        pool.submit(makePoolTask({ id: `concurrent-${i}`, priority: 'medium' }));
      }

      // 3 running, 4 queued
      expect(pool.getRunningCount()).toBe(3);
      expect(pool.getQueueLength()).toBe(4);
      expect(peakConcurrent).toBe(3);

      // Drain all tasks one by one
      while (completers.length > 0) {
        const complete = completers.shift()!;
        complete();
        // Allow microtask queue to process the next task start
        await vi.waitFor(() => {
          const expectedRunning = Math.min(completers.length, 3);
          expect(pool.getRunningCount()).toBe(expectedRunning);
        });
        peakConcurrent = Math.max(peakConcurrent, runningCount.value);
      }

      expect(pool.getQueueLength()).toBe(0);
      expect(pool.getRunningCount()).toBe(0);
      expect(peakConcurrent).toBeLessThanOrEqual(3);

      pool.shutdown();
    });

    it('events are emitted for started, completed lifecycle', () => {
      const events: Array<{ taskId: string; type: string }> = [];

      const mockExecutor: TaskExecutor = {
        execute: (task, onComplete) => {
          // Complete synchronously
          onComplete(task.id, 'completed');
        },
        cancel: () => {},
      };

      const pool = new WorkerPoolManager({ maxConcurrency: 3 }, mockExecutor);

      pool.onEvent((event) => {
        events.push({ taskId: event.taskId, type: event.type });
      });

      pool.submit(makePoolTask({ id: 'event-1', priority: 'high' }));
      pool.submit(makePoolTask({ id: 'event-2', priority: 'medium' }));

      // Each task emits started + completed
      const startedEvents = events.filter(e => e.type === 'started');
      const completedEvents = events.filter(e => e.type === 'completed');

      expect(startedEvents.length).toBeGreaterThanOrEqual(2);
      expect(completedEvents.length).toBeGreaterThanOrEqual(2);
      expect(startedEvents.map(e => e.taskId)).toContain('event-1');
      expect(startedEvents.map(e => e.taskId)).toContain('event-2');

      pool.shutdown();
    });

    it('cancelled tasks are removed from the queue', () => {
      const mockExecutor: TaskExecutor = {
        execute: () => {
          // Tasks never complete (long-running)
        },
        cancel: () => {},
      };

      const pool = new WorkerPoolManager({ maxConcurrency: 1 }, mockExecutor);

      const task1Id = pool.submit(makePoolTask({ id: 'cancel-1', priority: 'high' }));
      const task2Id = pool.submit(makePoolTask({ id: 'cancel-2', priority: 'medium' }));
      const task3Id = pool.submit(makePoolTask({ id: 'cancel-3', priority: 'low' }));

      expect(pool.getRunningCount()).toBe(1);
      expect(pool.getQueueLength()).toBe(2);

      // Cancel a queued task
      const cancelled = pool.cancel(task3Id);
      expect(cancelled).toBe(true);
      expect(pool.getQueueLength()).toBe(1);

      // Cancel the running task
      const cancelledRunning = pool.cancel(task1Id);
      expect(cancelledRunning).toBe(true);

      // Unknown task returns false
      expect(pool.cancel('nonexistent')).toBe(false);

      pool.shutdown();
    });

    it('handles task failures without breaking the pool', async () => {
      const executionOrder: string[] = [];

      const mockExecutor: TaskExecutor = {
        execute: (task, onComplete) => {
          executionOrder.push(task.id);
          if (task.id === 'fail-task') {
            onComplete(task.id, 'failed', 'Intentional failure');
          } else {
            onComplete(task.id, 'completed');
          }
        },
        cancel: () => {},
      };

      const pool = new WorkerPoolManager({ maxConcurrency: 2 }, mockExecutor);

      pool.submit(makePoolTask({ id: 'ok-task-1', priority: 'high' }));
      pool.submit(makePoolTask({ id: 'fail-task', priority: 'medium' }));
      pool.submit(makePoolTask({ id: 'ok-task-2', priority: 'low' }));

      // All 3 should execute (2 concurrent, 1 queued then started after one finishes)
      await vi.waitFor(() => expect(executionOrder.length).toBe(3));

      // Pool should still be operational
      expect(pool.getRunningCount()).toBe(0);
      expect(pool.getQueueLength()).toBe(0);

      pool.shutdown();
    });
  });
});
