/**
 * Handlebars Report Template Service
 *
 * Loads, compiles, and renders Handlebars templates from a configurable
 * templates directory. Supports partials (files prefixed with `_`) and
 * custom helpers for report formatting.
 */
import Handlebars from 'handlebars';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename, extname } from 'node:path';

const TEMPLATE_EXTENSION = '.hbs';

// ── Sample data for previews ──────────────────────────────────────────

const SAMPLE_TASK_DATA = {
  taskId: '550e8400-e29b-41d4-a716-446655440000',
  goal: 'Verify login form works with valid credentials',
  status: 'completed',
  verdict: 'PASS',
  llmModel: 'gpt-4o',
  stepCount: 3,
  createdAt: '2026-05-30T10:00:00.000Z',
  updatedAt: '2026-05-30T10:05:00.000Z',
  steps: [
    {
      index: 0,
      phase: 'observe',
      action: 'screenshot',
      status: 'success',
      observation: 'Login form visible with username and password fields',
      duration: 1500,
    },
    {
      index: 1,
      phase: 'execute',
      action: 'type',
      status: 'success',
      observation: 'Entered test credentials',
      duration: 800,
    },
    {
      index: 2,
      phase: 'verify',
      action: 'assert',
      status: 'success',
      observation: 'Dashboard page loaded successfully',
      duration: 1200,
    },
  ],
  resultSummary: {
    success: true,
    summary: 'Login form works correctly with valid credentials',
  },
};

const SAMPLE_BATCH_DATA = {
  batchId: 'batch-001',
  name: 'Smoke Test Suite',
  totalTasks: 5,
  passedTasks: 4,
  failedTasks: 1,
  duration: '2m 30s',
  createdAt: '2026-05-30T09:00:00.000Z',
  tasks: [
    { taskId: 'task-001', goal: 'Login test', status: 'completed', verdict: 'PASS', duration: '30s' },
    { taskId: 'task-002', goal: 'Navigation test', status: 'completed', verdict: 'PASS', duration: '25s' },
    { taskId: 'task-003', goal: 'Form submission', status: 'completed', verdict: 'PASS', duration: '40s' },
    { taskId: 'task-004', goal: 'File upload', status: 'failed', verdict: 'FAIL', duration: '35s' },
    { taskId: 'task-005', goal: 'Logout test', status: 'completed', verdict: 'PASS', duration: '20s' },
  ],
};

// ── Status color mapping ──────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  queued: '#71717a',
  running: '#60a5fa',
  completed: '#34d399',
  failed: '#f87171',
  cancelled: '#fbbf24',
  aborted: '#a1a1aa',
  success: '#34d399',
  retry: '#fbbf24',
  skipped: '#71717a',
  pass: '#34d399',
};

// ── Default partials ──────────────────────────────────────────────────

const DEFAULT_HEADER_PARTIAL = `<header class="report-header">
  <h1>{{title}}</h1>
  {{#if subtitle}}<p class="subtitle">{{subtitle}}</p>{{/if}}
</header>`;

const DEFAULT_FOOTER_PARTIAL = `<footer class="report-footer">
  <p>Generated {{formatDate generatedAt}}</p>
</footer>`;

const DEFAULT_STEP_DETAIL_PARTIAL = `<div class="step" style="border-left: 3px solid {{statusColor status}}">
  <div class="step-header">
    <span class="step-title">#{{stepNumber index}} {{phase}}</span>
    <span class="step-meta">{{statusBadge status}} &middot; {{duration}}ms</span>
  </div>
  {{#if observation}}<div class="step-detail"><strong>Observation:</strong> {{observation}}</div>{{/if}}
  {{#if action}}<div class="step-detail"><strong>Action:</strong> {{action}}</div>{{/if}}
</div>`;

// ── Service class ─────────────────────────────────────────────────────

export class HandlebarsReportTemplateService {
  private templatesDir: string;
  private compiledCache: Map<string, Handlebars.TemplateDelegate> = new Map();
  private helpersRegistered = false;

  constructor(templatesDir: string) {
    this.templatesDir = templatesDir;
    this.registerHelpers();
    this.registerDefaultPartials();
  }

  /**
   * Register custom Handlebars helpers for report formatting.
   */
  private registerHelpers(): void {
    if (this.helpersRegistered) return;

    Handlebars.registerHelper('formatDate', (isoDate: unknown) => {
      if (typeof isoDate !== 'string') return '';
      try {
        return new Date(isoDate).toLocaleString();
      } catch {
        return String(isoDate);
      }
    });

    Handlebars.registerHelper('statusBadge', (status: unknown) => {
      const s = String(status ?? '');
      const color = STATUS_COLORS[s] ?? '#71717a';
      return new Handlebars.SafeString(
        `<span class="badge" style="background: ${color}22; color: ${color}">${Handlebars.Utils.escapeExpression(s)}</span>`
      );
    });

    Handlebars.registerHelper('stepNumber', (index: unknown) => {
      const n = typeof index === 'number' ? index : Number(index);
      return n + 1;
    });

    Handlebars.registerHelper('statusColor', (status: unknown) => {
      return STATUS_COLORS[String(status ?? '')] ?? '#71717a';
    });

    this.helpersRegistered = true;
  }

  /**
   * Register default partials (header, footer, step-detail).
   */
  private registerDefaultPartials(): void {
    Handlebars.registerPartial('header', DEFAULT_HEADER_PARTIAL);
    Handlebars.registerPartial('footer', DEFAULT_FOOTER_PARTIAL);
    Handlebars.registerPartial('step-detail', DEFAULT_STEP_DETAIL_PARTIAL);
  }

  /**
   * Load and register partials from files prefixed with `_` in the templates directory.
   */
  private loadPartials(): void {
    try {
      const files = readdirSync(this.templatesDir);
      for (const file of files) {
        if (file.startsWith('_') && extname(file) === TEMPLATE_EXTENSION) {
          const partialName = basename(file, TEMPLATE_EXTENSION).slice(1); // Remove leading _
          const content = readFileSync(join(this.templatesDir, file), 'utf-8');
          Handlebars.registerPartial(partialName, content);
        }
      }
    } catch {
      // Directory may not exist yet; that's fine
    }
  }

  /**
   * List all available template names (excluding partials).
   */
  listTemplates(): string[] {
    try {
      const files = readdirSync(this.templatesDir);
      return files
        .filter(
          (f) =>
            extname(f) === TEMPLATE_EXTENSION &&
            !f.startsWith('_')
        )
        .map((f) => basename(f, TEMPLATE_EXTENSION));
    } catch {
      return [];
    }
  }

  /**
   * Read a template file from disk.
   */
  private readTemplateFile(name: string): string {
    const filePath = join(this.templatesDir, `${name}${TEMPLATE_EXTENSION}`);
    try {
      const stat = statSync(filePath);
      if (!stat.isFile()) {
        throw new Error(`Template "${name}" is not a file`);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Template "${name}" not found`);
      }
      throw err;
    }
    return readFileSync(filePath, 'utf-8');
  }

  /**
   * Compile a template, using cache when available.
   */
  compile(name: string): Handlebars.TemplateDelegate {
    const cached = this.compiledCache.get(name);
    if (cached) return cached;

    const source = this.readTemplateFile(name);
    const compiled = Handlebars.compile(source);
    this.compiledCache.set(name, compiled);
    return compiled;
  }

  /**
   * Render a template with the given data.
   */
  render(name: string, data: Record<string, unknown>): string {
    // Ensure file-based partials are loaded
    this.loadPartials();

    const template = this.compile(name);
    return template(data);
  }

  /**
   * Preview a template with sample data appropriate to its type.
   */
  preview(name: string): string {
    const sampleData = name.includes('batch')
      ? SAMPLE_BATCH_DATA
      : SAMPLE_TASK_DATA;
    return this.render(name, sampleData);
  }

  /**
   * Force-reload all templates (clears cache and re-reads partials).
   */
  reloadTemplates(): void {
    this.compiledCache.clear();
    this.loadPartials();
  }
}
