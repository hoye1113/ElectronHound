import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentLoop, runTest } from '../loop/agentLoop.js';
import type { AgentLoopOptions, ToolRegistry, TestResult } from '../loop/types.js';
import type { LLMProvider } from '../llm/provider.js';

// Mock compaction modules
vi.mock('../compaction/trigger.js', () => ({
  shouldTriggerCompaction: vi.fn(() => false),
  estimateTokens: vi.fn(() => 0),
  createCompactionTrigger: vi.fn(),
  COMPACTION_DEFAULTS: {
    contextWindow: 128000, reserveTokens: 16384, keepRecentTokens: 20000,
    thresholdPercentage: 0.8, toolResultMaxChars: 2000,
  },
}));
vi.mock('../compaction/summary.js', () => ({
  generateSummary: vi.fn().mockResolvedValue('[compacted summary]'),
}));
vi.mock('../compaction/cut-point.js', () => ({}));

function mockLLM(): LLMProvider & { generateText: ReturnType<typeof vi.fn> } {
  return {
    name: 'test', model: 'test', generateText: vi.fn(),
    generateObject: vi.fn(), streamText: vi.fn(),
  } as any;
}

function mockTools(): ToolRegistry {
  return { tools: {}, execute: vi.fn().mockResolvedValue({ ok: true }) } as any;
}

function passFlow(llm: any, obs?: any, plan?: any) {
  llm.generateText
    .mockResolvedValueOnce(JSON.stringify(obs ?? { ariaTree: '<div>X</div>', pageTitle: 'P', url: '/' }))
    .mockResolvedValueOnce(JSON.stringify(plan ?? { reasoning: 'Go', toolCall: { name: 'click', args: {} }, expectedOutcome: 'Done' }))
    .mockResolvedValueOnce(JSON.stringify({ verdict: 'pass', reasoning: 'OK' }))
    .mockResolvedValueOnce('Report');
}

describe('AgentLoop core', () => {
  it('constructor sets defaults', () => {
    const loop = new AgentLoop({ llm: mockLLM(), tools: mockTools() });
    expect(loop).toBeDefined();
  });

  it('run returns TestResult with goal', async () => {
    const llm = mockLLM();
    passFlow(llm);
    const loop = new AgentLoop({ llm, tools: mockTools(), maxSteps: 5 });
    const r = await loop.run('test goal');
    expect(r.goal).toBe('test goal');
  });

  it('full cycle produces 4 step records', async () => {
    const llm = mockLLM();
    passFlow(llm);
    const r = await new AgentLoop({ llm, tools: mockTools(), maxSteps: 5 }).run('g');
    expect(r.steps).toHaveLength(4);
  });

  it('step records contain observe phase', async () => {
    const llm = mockLLM();
    passFlow(llm);
    const r = await new AgentLoop({ llm, tools: mockTools(), maxSteps: 3 }).run('g');
    expect(r.steps.some(s => s.phase === 'observe')).toBe(true);
  });

  it('step records contain plan phase', async () => {
    const llm = mockLLM();
    passFlow(llm);
    const r = await new AgentLoop({ llm, tools: mockTools(), maxSteps: 3 }).run('g');
    expect(r.steps.some(s => s.phase === 'plan')).toBe(true);
  });

  it('step records contain execute phase', async () => {
    const llm = mockLLM();
    passFlow(llm);
    const r = await new AgentLoop({ llm, tools: mockTools(), maxSteps: 3 }).run('g');
    expect(r.steps.some(s => s.phase === 'execute')).toBe(true);
  });

  it('step records contain verify phase', async () => {
    const llm = mockLLM();
    passFlow(llm);
    const r = await new AgentLoop({ llm, tools: mockTools(), maxSteps: 3 }).run('g');
    expect(r.steps.some(s => s.phase === 'verify')).toBe(true);
  });

  it('pass verdict terminates loop', async () => {
    const llm = mockLLM();
    passFlow(llm);
    const r = await new AgentLoop({ llm, tools: mockTools(), maxSteps: 10 }).run('g');
    expect(r.verdict).toBe('pass');
  });

  it('fail verdict terminates loop', async () => {
    const llm = mockLLM();
    llm.generateText
      .mockResolvedValueOnce(JSON.stringify({ ariaTree: '<div/>', pageTitle: 'P', url: '/' }))
      .mockResolvedValueOnce(JSON.stringify({ reasoning: 'R', toolCall: { name: 'x', args: {} }, expectedOutcome: 'E' }))
      .mockResolvedValueOnce(JSON.stringify({ verdict: 'fail', reasoning: 'nope' }))
      .mockResolvedValueOnce('Report');
    const r = await new AgentLoop({ llm, tools: mockTools(), maxSteps: 10 }).run('g');
    expect(r.verdict).toBe('fail');
  });

  it('escalate verdict terminates loop', async () => {
    const llm = mockLLM();
    llm.generateText
      .mockResolvedValueOnce(JSON.stringify({ ariaTree: '<div/>', pageTitle: 'P', url: '/' }))
      .mockResolvedValueOnce(JSON.stringify({ reasoning: 'R', toolCall: { name: 'x', args: {} }, expectedOutcome: 'E' }))
      .mockResolvedValueOnce(JSON.stringify({ verdict: 'escalate', reasoning: 'help' }))
      .mockResolvedValueOnce('Report');
    const r = await new AgentLoop({ llm, tools: mockTools(), maxSteps: 10 }).run('g');
    expect(r.verdict).toBe('escalate');
  });

  it('retry verdict continues loop', async () => {
    const llm = mockLLM();
    let n = 0;
    llm.generateText.mockImplementation((prompt: string) => {
      n++;
      if (prompt.includes('Observe')) return Promise.resolve(JSON.stringify({ ariaTree: `<d>${n}</d>`, pageTitle: 'P', url: `/${n}` }));
      if (prompt.includes('Decide')) return Promise.resolve(JSON.stringify({ reasoning: 'R', toolCall: { name: 'x', args: {} }, expectedOutcome: 'E' }));
      if (prompt.includes('Success')) return Promise.resolve(JSON.stringify({ verdict: n < 6 ? 'retry' : 'pass', reasoning: 'ok' }));
      return Promise.resolve('Report');
    });
    const r = await new AgentLoop({ llm, tools: mockTools(), maxSteps: 10 }).run('g');
    expect(r.verdict).toBe('pass');
    expect(r.steps.length).toBeGreaterThan(4);
  });

  it('observe failure returns escalate', async () => {
    const llm = mockLLM();
    llm.generateText.mockRejectedValue(new Error('LLM error'));
    const r = await new AgentLoop({ llm, tools: mockTools(), maxSteps: 3 }).run('g');
    expect(r.verdict).toBe('escalate');
    expect(r.reason).toContain('Observe step failed');
  });

  it('plan failure returns escalate', async () => {
    const llm = mockLLM();
    llm.generateText
      .mockResolvedValueOnce(JSON.stringify({ ariaTree: '<div/>', pageTitle: 'P', url: '/' }))
      .mockResolvedValueOnce('NOT JSON');
    const r = await new AgentLoop({ llm, tools: mockTools(), maxSteps: 3 }).run('g');
    expect(r.verdict).toBe('escalate');
    expect(r.reason).toContain('Plan step failed');
  });

  it('verify failure returns escalate', async () => {
    const llm = mockLLM();
    llm.generateText
      .mockResolvedValueOnce(JSON.stringify({ ariaTree: '<div/>', pageTitle: 'P', url: '/' }))
      .mockResolvedValueOnce(JSON.stringify({ reasoning: 'R', toolCall: { name: 'x', args: {} }, expectedOutcome: 'E' }))
      .mockRejectedValue(new Error('verify err'));
    const r = await new AgentLoop({ llm, tools: mockTools(), maxSteps: 3 }).run('g');
    expect(r.verdict).toBe('escalate');
    expect(r.reason).toContain('Verify step failed');
  });

  it('tool execution failure records failed step', async () => {
    const llm = mockLLM();
    passFlow(llm);
    const tools = { tools: {}, execute: vi.fn().mockRejectedValue(new Error('tool err')) } as any;
    const r = await new AgentLoop({ llm, tools, maxSteps: 3 }).run('g');
    const execStep = r.steps.find(s => s.phase === 'execute');
    expect(execStep?.status).toBe('failed');
  });

  it('maxSteps exhausted returns fail', async () => {
    const llm = mockLLM();
    let n = 0;
    llm.generateText.mockImplementation((prompt: string) => {
      n++;
      if (prompt.includes('Observe')) return Promise.resolve(JSON.stringify({ ariaTree: `<d>${n}</d>`, pageTitle: 'P', url: `/x` }));
      if (prompt.includes('Decide')) return Promise.resolve(JSON.stringify({ reasoning: 'R', toolCall: { name: 'x', args: {} }, expectedOutcome: 'E' }));
      return Promise.resolve(JSON.stringify({ verdict: 'retry', reasoning: 'again' }));
    });
    const r = await new AgentLoop({ llm, tools: mockTools(), maxSteps: 2 }).run('g');
    expect(r.verdict).toBe('fail');
    expect(r.reason).toContain('maxSteps');
  });

  it('custom maxRetries is accepted', () => {
    const loop = new AgentLoop({ llm: mockLLM(), tools: mockTools(), maxRetries: 5 });
    expect(loop).toBeDefined();
  });

  it('compaction disabled skips check', async () => {
    const { shouldTriggerCompaction } = await import('../compaction/trigger.js');
    (shouldTriggerCompaction as any).mockClear();
    const llm = mockLLM();
    passFlow(llm);
    const loop = new AgentLoop({ llm, tools: mockTools(), maxSteps: 3, compaction: { enabled: false } });
    await loop.run('g');
    expect(shouldTriggerCompaction).not.toHaveBeenCalled();
  });

  it('compaction triggers when threshold met', async () => {
    const { shouldTriggerCompaction } = await import('../compaction/trigger.js');
    const { generateSummary } = await import('../compaction/summary.js');
    (shouldTriggerCompaction as any).mockReturnValueOnce(true);
    const llm = mockLLM();
    passFlow(llm);
    const loop = new AgentLoop({ llm, tools: mockTools(), maxSteps: 5, compaction: { contextWindow: 100, reserveTokens: 10, enabled: true } });
    const r = await loop.run('g');
    expect(generateSummary).toHaveBeenCalled();
    expect(r.verdict).toBe('pass');
  });

  it('stuck detection returns escalate after 3 identical obs', async () => {
    const llm = mockLLM();
    const sameObs = JSON.stringify({ ariaTree: '<div>stuck</div>', pageTitle: 'S', url: '/s' });
    llm.generateText.mockImplementation((prompt: string) => {
      if (prompt.includes('Observe')) return Promise.resolve(sameObs);
      if (prompt.includes('Decide')) return Promise.resolve(JSON.stringify({ reasoning: 'R', toolCall: { name: 'x', args: {} }, expectedOutcome: 'E' }));
      if (prompt.includes('Success')) return Promise.resolve(JSON.stringify({ verdict: 'retry', reasoning: 'again' }));
      return Promise.resolve('Report');
    });
    const r = await new AgentLoop({ llm, tools: mockTools(), maxSteps: 10 }).run('g');
    expect(r.verdict).toBe('escalate');
    expect(r.reason).toContain('Stuck detected');
  });

  it('non-JSON observe falls back to raw text', async () => {
    const llm = mockLLM();
    llm.generateText
      .mockResolvedValueOnce('raw observation text not json')
      .mockResolvedValueOnce(JSON.stringify({ reasoning: 'R', toolCall: { name: 'x', args: {} }, expectedOutcome: 'E' }))
      .mockResolvedValueOnce(JSON.stringify({ verdict: 'pass', reasoning: 'ok' }))
      .mockResolvedValueOnce('Report');
    const r = await new AgentLoop({ llm, tools: mockTools(), maxSteps: 3 }).run('g');
    // Non-JSON observe returns raw fallback, loop continues to plan
    expect(r.verdict).toBe('pass');
    expect(r.steps.length).toBeGreaterThanOrEqual(3); // plan, execute, verify (observe not recorded for non-JSON)
  });

  it('JSON in code block is parsed correctly', async () => {
    const llm = mockLLM();
    llm.generateText
      .mockResolvedValueOnce('```json\n{"ariaTree":"<div>CB</div>","pageTitle":"CB","url":"/cb"}\n```')
      .mockResolvedValueOnce(JSON.stringify({ reasoning: 'R', toolCall: { name: 'x', args: {} }, expectedOutcome: 'E' }))
      .mockResolvedValueOnce(JSON.stringify({ verdict: 'pass', reasoning: 'cb ok' }))
      .mockResolvedValueOnce('Report');
    const r = await new AgentLoop({ llm, tools: mockTools(), maxSteps: 3 }).run('g');
    expect(r.verdict).toBe('pass');
  });

  it('runTest convenience function works', async () => {
    const llm = mockLLM();
    passFlow(llm);
    const r = await runTest('convenience goal', { llm, tools: mockTools(), maxSteps: 5 });
    expect(r.goal).toBe('convenience goal');
    expect(r.verdict).toBe('pass');
  });

  it('reason field populated from verdict', async () => {
    const llm = mockLLM();
    passFlow(llm);
    const r = await new AgentLoop({ llm, tools: mockTools(), maxSteps: 3 }).run('g');
    expect(r.reason).toBeTruthy();
  });

  it('steps array is populated', async () => {
    const llm = mockLLM();
    passFlow(llm);
    const r = await new AgentLoop({ llm, tools: mockTools(), maxSteps: 3 }).run('g');
    expect(Array.isArray(r.steps)).toBe(true);
    expect(r.steps.length).toBeGreaterThan(0);
  });

  it('each step has id', async () => {
    const llm = mockLLM();
    passFlow(llm);
    const r = await new AgentLoop({ llm, tools: mockTools(), maxSteps: 3 }).run('g');
    r.steps.forEach(s => expect(s.id).toBeDefined());
  });

  it('each step has timestamp', async () => {
    const llm = mockLLM();
    passFlow(llm);
    const r = await new AgentLoop({ llm, tools: mockTools(), maxSteps: 3 }).run('g');
    r.steps.forEach(s => expect(s.timestamp).toBeDefined());
  });

  it('each step has duration', async () => {
    const llm = mockLLM();
    passFlow(llm);
    const r = await new AgentLoop({ llm, tools: mockTools(), maxSteps: 3 }).run('g');
    r.steps.forEach(s => expect(typeof s.duration).toBe('number'));
  });

  it('execute step records tool name', async () => {
    const llm = mockLLM();
    passFlow(llm, { ariaTree: '<div/>', pageTitle: 'P', url: '/' },
      { reasoning: 'R', toolCall: { name: 'browser_click', args: { selector: '#btn' } }, expectedOutcome: 'E' });
    const r = await new AgentLoop({ llm, tools: mockTools(), maxSteps: 3 }).run('g');
    const exec = r.steps.find(s => s.phase === 'execute');
    expect(exec?.action?.name).toBe('browser_click');
  });

  it('varying observations prevent stuck detection', async () => {
    const llm = mockLLM();
    let n = 0;
    llm.generateText.mockImplementation((p: string) => {
      n++;
      if (p.includes('Observe')) return Promise.resolve(JSON.stringify({ ariaTree: `<d>${n}</d>`, pageTitle: `P${n}`, url: `/${n}` }));
      if (p.includes('Decide')) return Promise.resolve(JSON.stringify({ reasoning: 'R', toolCall: { name: 'x', args: {} }, expectedOutcome: 'E' }));
      if (n <= 9) return Promise.resolve(JSON.stringify({ verdict: 'retry', reasoning: 'r' }));
      return Promise.resolve(JSON.stringify({ verdict: 'pass', reasoning: 'done' }));
    });
    const r = await new AgentLoop({ llm, tools: mockTools(), maxSteps: 20 }).run('g');
    expect(r.verdict).not.toBe('escalate');
  });

  it('report is called before terminating', async () => {
    const llm = mockLLM();
    passFlow(llm);
    const r = await new AgentLoop({ llm, tools: mockTools(), maxSteps: 3 }).run('g');
    // 4 LLM calls: observe, plan, verify, report
    expect(llm.generateText).toHaveBeenCalledTimes(4);
  });

  it('invalid verdict defaults to retry', async () => {
    const llm = mockLLM();
    llm.generateText
      .mockResolvedValueOnce(JSON.stringify({ ariaTree: '<div/>', pageTitle: 'P', url: '/' }))
      .mockResolvedValueOnce(JSON.stringify({ reasoning: 'R', toolCall: { name: 'x', args: {} }, expectedOutcome: 'E' }))
      .mockResolvedValueOnce(JSON.stringify({ verdict: 'invalidverdict', reasoning: 'ok' }))
      .mockResolvedValueOnce(JSON.stringify({ verdict: 'pass', reasoning: 'recover' }))
      .mockResolvedValueOnce('Report');
    const r = await new AgentLoop({ llm, tools: mockTools(), maxSteps: 5 }).run('g');
    // Invalid verdict → retry → continues → pass on second iteration
    expect(r.steps.length).toBeGreaterThan(4);
  });
});
