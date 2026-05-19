import { StateGraph, END, START } from '@langchain/langgraph';
import { TestState } from './state.js';
import { observeNode } from './nodes/observe.js';
import { planNode } from './nodes/plan.js';
import { executeNode } from './nodes/execute.js';
import { verifyNode } from './nodes/verify.js';
import { abortNode } from './nodes/abort.js';
import { reportNode } from './nodes/report.js';

const routeAfterVerify = (
  state: typeof TestState.State,
): string => {
  if (state.stepCount >= state.maxSteps) {
    return 'fail';
  }
  if (state.stuckCounter >= 3) {
    return 'escalate';
  }
  const verdict = state.currentVerdict?.verdict;
  if (verdict === 'pass') return 'pass';
  if (verdict === 'fail') return 'fail';
  if (verdict === 'escalate') return 'escalate';
  return 'retry';
};

const routeAfterObserve = (
  state: typeof TestState.State,
): string => {
  if (state.stuckCounter >= 3) return 'stuck';
  if (state.stepCount >= state.maxSteps) return 'stuck';
  return 'normal';
};

export function createTestGraph() {
  return new StateGraph(TestState)
    .addNode('observe', observeNode)
    .addNode('plan', planNode)
    .addNode('execute', executeNode)
    .addNode('verify', verifyNode)
    .addNode('abort', abortNode)
    .addNode('report', reportNode)
    .addEdge(START, 'observe')
    .addConditionalEdges('observe', routeAfterObserve, {
      normal: 'plan',
      stuck: 'abort',
    })
    .addEdge('plan', 'execute')
    .addEdge('execute', 'verify')
    .addConditionalEdges('verify', routeAfterVerify, {
      retry: 'observe',
      pass: 'report',
      fail: 'report',
      escalate: 'abort',
    })
    .addEdge('abort', END)
    .addEdge('report', END);
}
