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

function renderStep(step: StepRecord, _taskId: string): string {
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

/**
 * Generate an HTML report customized by a ReportTemplate.
 *
 * Filters and orders sections according to the template, applies styling,
 * and renders each section type appropriately.
 */
export function generateTemplatedHTMLReport(
  task: Task,
  steps: StepRecord[],
  template: import('../types/report-template.js').ReportTemplate,
): string {
  const { sections, styling } = template;
  const enabledSections = sections
    .filter((s) => s.enabled)
    .sort((a, b) => a.order - b.order);

  const statusColor = STATUS_COLORS[task.status] ?? '#71717a';
  const totalDuration = steps.reduce((sum, s) => sum + s.duration, 0);

  // Build section HTML blocks
  const sectionBlocks: string[] = [];

  for (const section of enabledSections) {
    switch (section.type) {
      case 'summary': {
        let summaryContent = '';
        if (task.resultSummary) {
          summaryContent = `
            <p><strong>Success:</strong> ${task.resultSummary.success ? 'Yes' : 'No'}</p>
            <p>${escapeHtml(task.resultSummary.summary)}</p>
            ${task.resultSummary.error ? `<p class="error">${escapeHtml(task.resultSummary.error)}</p>` : ''}`;
        } else {
          summaryContent = `<p>No summary available.</p>`;
        }
        sectionBlocks.push(`
          <div class="section">
            <div class="section-title">${escapeHtml(section.title)}</div>
            <div class="summary-card">${summaryContent}</div>
          </div>`);
        break;
      }
      case 'steps': {
        const stepsHtml = steps.map((s) => renderStep(s, task.id)).join('\n');
        sectionBlocks.push(`
          <div class="section">
            <div class="section-title">${escapeHtml(section.title)}</div>
            ${stepsHtml || '<p style="color:#71717a">No steps recorded.</p>'}
          </div>`);
        break;
      }
      case 'screenshots': {
        const screenshotSteps = steps.filter((s) => s.screenshotPath);
        if (screenshotSteps.length > 0) {
          const refs = screenshotSteps
            .map((s) => `<span class="screenshot-ref">Step #${s.stepIndex}: ${escapeHtml(s.screenshotPath ?? '')}</span>`)
            .join('<br>');
          sectionBlocks.push(`
            <div class="section">
              <div class="section-title">${escapeHtml(section.title)}</div>
              <div class="summary-card">${refs}</div>
            </div>`);
        } else {
          sectionBlocks.push(`
            <div class="section">
              <div class="section-title">${escapeHtml(section.title)}</div>
              <p style="color:#71717a">No screenshots captured.</p>
            </div>`);
        }
        break;
      }
      case 'errors': {
        const failedSteps = steps.filter((s) => s.status === 'failed');
        if (failedSteps.length > 0) {
          const errorsHtml = failedSteps
            .map((s) => {
              const result = s.result as Record<string, unknown> | undefined;
              const errorMsg = result?.error ? escapeHtml(String(result.error)) : 'Unknown error';
              return `<div class="step" style="border-left-color: #f87171">
                <div class="step-title">Step #${s.stepIndex} (${escapeHtml(s.phase)})</div>
                <div class="step-detail error">${errorMsg}</div>
              </div>`;
            })
            .join('\n');
          sectionBlocks.push(`
            <div class="section">
              <div class="section-title">${escapeHtml(section.title)}</div>
              ${errorsHtml}
            </div>`);
        } else {
          sectionBlocks.push(`
            <div class="section">
              <div class="section-title">${escapeHtml(section.title)}</div>
              <p style="color:#71717a">No errors recorded.</p>
            </div>`);
        }
        break;
      }
      case 'performance': {
        const avgDuration = steps.length > 0 ? Math.round(totalDuration / steps.length) : 0;
        sectionBlocks.push(`
          <div class="section">
            <div class="section-title">${escapeHtml(section.title)}</div>
            <div class="summary-card">
              <p><strong>Total Duration:</strong> ${formatDuration(totalDuration)}</p>
              <p><strong>Steps:</strong> ${task.stepCount}</p>
              <p><strong>Avg Step Duration:</strong> ${formatDuration(avgDuration)}</p>
            </div>
          </div>`);
        break;
      }
      case 'suggestions': {
        const suggestions: string[] = [];
        const failedSteps = steps.filter((s) => s.status === 'failed');
        if (failedSteps.length > 0) {
          suggestions.push('Review failed steps for potential flakiness or environment issues.');
        }
        if (task.stepCount > 30) {
          suggestions.push('Consider breaking this test into smaller, focused test cases.');
        }
        if (totalDuration > 120_000) {
          suggestions.push('Test duration exceeds 2 minutes — look for optimization opportunities.');
        }
        if (suggestions.length === 0) {
          suggestions.push('No specific suggestions. The test execution looks healthy.');
        }
        const suggestionsHtml = suggestions.map((s) => `<li>${escapeHtml(s)}</li>`).join('');
        sectionBlocks.push(`
          <div class="section">
            <div class="section-title">${escapeHtml(section.title)}</div>
            <div class="summary-card"><ul>${suggestionsHtml}</ul></div>
          </div>`);
        break;
      }
      case 'raw': {
        const rawJson = JSON.stringify({ task, steps }, null, 2);
        sectionBlocks.push(`
          <div class="section">
            <div class="section-title">${escapeHtml(section.title)}</div>
            <pre style="background:#27272a;border:1px solid #3f3f46;border-radius:0.5rem;padding:1rem;font-size:0.75rem;overflow-x:auto;color:#a1a1aa">${escapeHtml(rawJson)}</pre>
          </div>`);
        break;
      }
    }
  }

  // Apply template styling
  const theme = styling.theme === 'dark' || styling.theme === 'auto' ? '#18181b' : '#ffffff';
  const textColor = styling.theme === 'dark' || styling.theme === 'auto' ? '#e4e4e7' : '#1a1a1a';
  const mutedColor = styling.theme === 'dark' || styling.theme === 'auto' ? '#a1a1aa' : '#6b7280';
  const borderColor = styling.theme === 'dark' || styling.theme === 'auto' ? '#3f3f46' : '#e5e7eb';
  const cardBg = styling.theme === 'dark' || styling.theme === 'auto' ? '#27272a' : '#f9fafb';
  const primaryColor = styling.primaryColor;
  const logoHtml = styling.logoUrl ? `<img src="${escapeHtml(styling.logoUrl)}" alt="Logo" style="height:2rem;margin-right:0.75rem">` : '';
  const companyHtml = styling.companyName ? `<span style="font-weight:600">${escapeHtml(styling.companyName)}</span>` : '';
  const footerText = styling.footerText ?? 'Generated by ElectronHound';

  const themedCSS = CSS
    .replace('background: #18181b', `background: ${theme}`)
    .replace('color: #e4e4e7', `color: ${textColor}`)
    .replace('border: 1px solid #3f3f46', `border: 1px solid ${borderColor}`)
    .replace('background: #27272a', `background: ${cardBg}`)
    .replace('color: #a1a1aa', `color: ${mutedColor}`);

  const primaryCSS = `:root { --primary-color: ${primaryColor}; }
  .section-title { color: ${primaryColor}; }
  a, .screenshot-ref { color: ${primaryColor}; }`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Task Report - ${escapeHtml(task.id)}</title>
  <style>${themedCSS}${primaryCSS}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${logoHtml}${companyHtml}
      <h1>${escapeHtml(task.goal)}</h1>
      <div class="meta">
        <span class="badge" style="background: ${statusColor}22; color: ${statusColor}">${task.status}</span>
        <span class="meta-item">Model: ${escapeHtml(task.llmModel)}</span>
        <span class="meta-item">Steps: ${task.stepCount}</span>
        <span class="meta-item">Duration: ${formatDuration(totalDuration)}</span>
        <span class="meta-item">Created: ${formatDate(task.createdAt)}</span>
      </div>
    </div>

    ${sectionBlocks.join('\n')}

    <div class="footer">
      ${escapeHtml(footerText)} &middot; Generated at ${formatDate(new Date().toISOString())} &middot; Task ID: ${escapeHtml(task.id)}
    </div>
  </div>
</body>
</html>`;
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
