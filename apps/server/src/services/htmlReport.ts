import type { Task, StepRecord } from '@eata/shared-types';

const STATUS_COLORS: Record<string, string> = {
  // Task status
  queued: '#71717a',
  running: '#60a5fa',
  completed: '#34d399',
  failed: '#f87171',
  cancelled: '#fbbf24',
  aborted: '#a1a1aa',
  // Step status
  success: '#34d399',
  retry: '#fbbf24',
  skipped: '#71717a',
};

const PHASE_LABELS: Record<string, string> = {
  observe: 'Observe',
  plan: 'Plan',
  execute: 'Execute',
  verify: 'Verify',
};

const CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #18181b;
    color: #e4e4e7;
    line-height: 1.6;
    padding: 2rem;
  }
  .container { max-width: 960px; margin: 0 auto; }
  .header {
    border-bottom: 1px solid #3f3f46;
    padding-bottom: 1.5rem;
    margin-bottom: 2rem;
  }
  .header h1 { font-size: 1.5rem; font-weight: 700; color: #fafafa; }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin-top: 0.75rem;
  }
  .meta-item {
    font-size: 0.8rem;
    color: #a1a1aa;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .badge {
    display: inline-block;
    padding: 0.15rem 0.6rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
  }
  .section { margin-bottom: 2rem; }
  .section-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: #a1a1aa;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 1rem;
  }
  .summary-card {
    background: #27272a;
    border: 1px solid #3f3f46;
    border-radius: 0.5rem;
    padding: 1.25rem;
  }
  .summary-card p { font-size: 0.9rem; color: #d4d4d8; }
  .summary-card .error { color: #f87171; margin-top: 0.5rem; }
  .step {
    background: #27272a;
    border: 1px solid #3f3f46;
    border-radius: 0.5rem;
    padding: 1rem 1.25rem;
    margin-bottom: 0.5rem;
    border-left: 3px solid #3f3f46;
  }
  .step-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }
  .step-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: #fafafa;
  }
  .step-meta {
    font-size: 0.75rem;
    color: #71717a;
  }
  .step-detail {
    font-size: 0.8rem;
    color: #a1a1aa;
    margin-top: 0.4rem;
  }
  .step-detail strong { color: #d4d4d8; }
  .screenshot-ref {
    display: inline-block;
    margin-top: 0.4rem;
    font-size: 0.75rem;
    color: #60a5fa;
  }
  .footer {
    border-top: 1px solid #3f3f46;
    padding-top: 1rem;
    margin-top: 2rem;
    font-size: 0.75rem;
    color: #52525b;
    text-align: center;
  }
`;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return `${min}m ${remSec}s`;
}

function renderStep(step: StepRecord, taskId: string): string {
  const statusColor = STATUS_COLORS[step.status] ?? '#71717a';
  const phaseLabel = PHASE_LABELS[step.phase] ?? step.phase;

  let detail = '';
  if (step.observation) {
    detail += `<div class="step-detail"><strong>Observation:</strong> ${escapeHtml(step.observation)}</div>`;
  }
  if (step.action) {
    detail += `<div class="step-detail"><strong>Action:</strong> ${escapeHtml(step.action.name)}(${escapeHtml(JSON.stringify(step.action.args))})</div>`;
  }
  if (step.reasoning) {
    detail += `<div class="step-detail"><strong>Reasoning:</strong> ${escapeHtml(step.reasoning)}</div>`;
  }
  if (step.screenshotPath) {
    detail += `<span class="screenshot-ref">[Screenshot: step ${step.stepIndex}]</span>`;
  }

  return `
    <div class="step" style="border-left-color: ${statusColor}">
      <div class="step-header">
        <span class="step-title">#${step.stepIndex} ${escapeHtml(phaseLabel)}</span>
        <span class="step-meta">
          <span class="badge" style="background: ${statusColor}22; color: ${statusColor}">${step.status}</span>
          &nbsp;${escapeHtml(formatDuration(step.duration))}
        </span>
      </div>
      ${detail}
    </div>`;
}

export function generateHTMLReport(task: Task, steps: StepRecord[]): string {
  const statusColor = STATUS_COLORS[task.status] ?? '#71717a';
  const totalDuration = steps.reduce((sum, s) => sum + s.duration, 0);

  const stepsHtml = steps.map((s) => renderStep(s, task.id)).join('\n');

  let summaryHtml = '';
  if (task.resultSummary) {
    summaryHtml = `
      <div class="section">
        <div class="section-title">Result Summary</div>
        <div class="summary-card">
          <p><strong>Success:</strong> ${task.resultSummary.success ? 'Yes' : 'No'}</p>
          <p>${escapeHtml(task.resultSummary.summary)}</p>
          ${task.resultSummary.error ? `<p class="error">${escapeHtml(task.resultSummary.error)}</p>` : ''}
        </div>
      </div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Task Report - ${escapeHtml(task.id)}</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${escapeHtml(task.goal)}</h1>
      <div class="meta">
        <span class="badge" style="background: ${statusColor}22; color: ${statusColor}">${task.status}</span>
        <span class="meta-item">Model: ${escapeHtml(task.llmModel)}</span>
        <span class="meta-item">Steps: ${task.stepCount}</span>
        <span class="meta-item">Duration: ${formatDuration(totalDuration)}</span>
        <span class="meta-item">Created: ${formatDate(task.createdAt)}</span>
      </div>
    </div>

    ${summaryHtml}

    <div class="section">
      <div class="section-title">Steps Timeline</div>
      ${stepsHtml || '<p style="color:#71717a">No steps recorded.</p>'}
    </div>

    <div class="footer">
      Generated at ${formatDate(new Date().toISOString())} &middot; Task ID: ${escapeHtml(task.id)}
    </div>
  </div>
</body>
</html>`;
}
