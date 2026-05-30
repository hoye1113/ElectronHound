import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HandlebarsReportTemplateService } from '../services/handlebarsTemplate.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';

function createTempTemplateDir(): string {
  const tmpDir = mkdtempSync(join(tmpdir(), 'eata-handlebars-test-'));
  const templatesDir = join(tmpDir, 'templates');
  mkdirSync(templatesDir, { recursive: true });
  return templatesDir;
}

describe('HandlebarsReportTemplateService', () => {
  let service: HandlebarsReportTemplateService;
  let templateDir: string;

  beforeEach(() => {
    templateDir = createTempTemplateDir();
    service = new HandlebarsReportTemplateService(templateDir);
  });

  afterEach(() => {
    try {
      rmSync(templateDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('template loading', () => {
    it('loads templates from the configured directory', () => {
      writeFileSync(
        join(templateDir, 'test-template.hbs'),
        '<h1>{{title}}</h1>'
      );

      const templates = service.listTemplates();
      expect(templates).toContain('test-template');
    });

    it('ignores non-.hbs files', () => {
      writeFileSync(join(templateDir, 'readme.txt'), 'not a template');
      writeFileSync(
        join(templateDir, 'valid.hbs'),
        '<p>{{content}}</p>'
      );

      const templates = service.listTemplates();
      expect(templates).toContain('valid');
      expect(templates).not.toContain('readme');
    });

    it('returns empty array when no templates exist', () => {
      const templates = service.listTemplates();
      expect(templates).toEqual([]);
    });

    it('loads multiple templates', () => {
      writeFileSync(join(templateDir, 'task-report.hbs'), '<h1>Task</h1>');
      writeFileSync(join(templateDir, 'batch-report.hbs'), '<h1>Batch</h1>');
      writeFileSync(join(templateDir, 'comparison.hbs'), '<h1>Compare</h1>');

      const templates = service.listTemplates();
      expect(templates).toHaveLength(3);
      expect(templates).toContain('task-report');
      expect(templates).toContain('batch-report');
      expect(templates).toContain('comparison');
    });
  });

  describe('template compilation and rendering', () => {
    it('compiles and renders a simple template', () => {
      writeFileSync(
        join(templateDir, 'simple.hbs'),
        '<h1>{{title}}</h1><p>{{description}}</p>'
      );

      const result = service.render('simple', {
        title: 'Test Report',
        description: 'This is a test',
      });

      expect(result).toContain('<h1>Test Report</h1>');
      expect(result).toContain('<p>This is a test</p>');
    });

    it('renders task report with all variables', () => {
      writeFileSync(
        join(templateDir, 'task.hbs'),
        [
          '<div class="task-report">',
          '  <h1>{{taskId}}</h1>',
          '  <p>Goal: {{goal}}</p>',
          '  <p>Status: {{status}}</p>',
          '  <p>Verdict: {{verdict}}</p>',
          '</div>',
        ].join('\n')
      );

      const result = service.render('task', {
        taskId: 'abc-123',
        goal: 'Test login flow',
        status: 'completed',
        verdict: 'PASS',
      });

      expect(result).toContain('abc-123');
      expect(result).toContain('Test login flow');
      expect(result).toContain('completed');
      expect(result).toContain('PASS');
    });

    it('handles loops over steps array', () => {
      writeFileSync(
        join(templateDir, 'steps.hbs'),
        '{{#each steps}}\n  <div>Step {{@index}}: {{this.action}}</div>\n{{/each}}'
      );

      const result = service.render('steps', {
        steps: [
          { action: 'click' },
          { action: 'type' },
          { action: 'verify' },
        ],
      });

      expect(result).toContain('Step 0: click');
      expect(result).toContain('Step 1: type');
      expect(result).toContain('Step 2: verify');
    });

    it('handles empty steps array gracefully', () => {
      writeFileSync(
        join(templateDir, 'empty-steps.hbs'),
        '{{#if steps}}\n  {{#each steps}}\n    <p>{{this.action}}</p>\n  {{/each}}\n{{else}}\n  <p>No steps recorded.</p>\n{{/if}}'
      );

      const result = service.render('empty-steps', { steps: [] });
      expect(result).toContain('No steps recorded');
    });
  });

  describe('custom helpers', () => {
    it('formatDate helper formats ISO dates', () => {
      writeFileSync(
        join(templateDir, 'date.hbs'),
        '<span>{{formatDate createdAt}}</span>'
      );

      const result = service.render('date', {
        createdAt: '2026-01-15T10:30:00.000Z',
      });

      // Should produce some formatted date string (not the raw ISO string)
      expect(result).toContain('<span>');
      expect(result).not.toContain('2026-01-15T10:30:00.000Z');
    });

    it('statusBadge helper renders styled badge', () => {
      writeFileSync(
        join(templateDir, 'badge.hbs'),
        '<span>{{statusBadge status}}</span>'
      );

      const result = service.render('badge', { status: 'completed' });
      expect(result).toContain('completed');
      expect(result).toContain('<span');
    });

    it('stepNumber helper renders 1-indexed step number', () => {
      writeFileSync(
        join(templateDir, 'stepnum.hbs'),
        '{{#each steps}}\n  <p>Step {{stepNumber @index}}</p>\n{{/each}}'
      );

      const result = service.render('stepnum', {
        steps: [{}, {}, {}],
      });

      expect(result).toContain('Step 1');
      expect(result).toContain('Step 2');
      expect(result).toContain('Step 3');
    });
  });

  describe('partials support', () => {
    it('loads and uses partials from templates directory', () => {
      writeFileSync(
        join(templateDir, '_header.hbs'),
        '<header><h1>{{title}}</h1></header>'
      );
      writeFileSync(
        join(templateDir, 'with-partial.hbs'),
        '{{> header}}\n<main>{{content}}</main>'
      );

      service.reloadTemplates();

      const result = service.render('with-partial', {
        title: 'Report Title',
        content: 'Main content here',
      });

      expect(result).toContain('<header>');
      expect(result).toContain('Report Title');
      expect(result).toContain('Main content here');
    });

    it('supports footer partial', () => {
      writeFileSync(
        join(templateDir, '_footer.hbs'),
        '<footer>Generated {{formatDate generatedAt}}</footer>'
      );
      writeFileSync(
        join(templateDir, 'with-footer.hbs'),
        '<main>{{content}}</main>\n{{> footer}}'
      );

      service.reloadTemplates();

      const result = service.render('with-footer', {
        content: 'Body',
        generatedAt: '2026-01-01T00:00:00Z',
      });

      expect(result).toContain('<main>Body</main>');
      expect(result).toContain('<footer>');
    });

    it('supports step-detail partial', () => {
      writeFileSync(
        join(templateDir, '_step-detail.hbs'),
        '<div class="step">{{stepNumber index}}: {{action}}</div>'
      );
      writeFileSync(
        join(templateDir, 'custom-report.hbs'),
        '{{#each steps}}\n{{> step-detail index=@index action=this.action}}\n{{/each}}'
      );

      service.reloadTemplates();

      const result = service.render('custom-report', {
        steps: [{ action: 'click' }, { action: 'verify' }],
      });

      expect(result).toContain('1: click');
      expect(result).toContain('2: verify');
    });
  });

  describe('preview with sample data', () => {
    it('renders template with sample data for preview', () => {
      writeFileSync(
        join(templateDir, 'task-report.hbs'),
        '<h1>{{taskId}}</h1><p>{{goal}}</p><p>Status: {{status}}</p>'
      );

      const result = service.preview('task-report');

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('preview returns meaningful content for batch report', () => {
      writeFileSync(
        join(templateDir, 'batch-report.hbs'),
        '<h1>Batch {{batchId}}</h1><p>Total: {{totalTasks}}</p><p>Passed: {{passedTasks}}</p>'
      );

      const result = service.preview('batch-report');

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('throws for non-existent template', () => {
      expect(() => service.render('nonexistent', {})).toThrow();
    });

    it('throws for invalid Handlebars syntax', () => {
      writeFileSync(
        join(templateDir, 'invalid.hbs'),
        '{{#if unclosed'
      );

      expect(() => service.render('invalid', {})).toThrow();
    });

    it('handles missing variables gracefully (renders empty)', () => {
      writeFileSync(
        join(templateDir, 'missing-vars.hbs'),
        '<p>{{missingVar}}</p>'
      );

      const result = service.render('missing-vars', {});
      expect(result).toContain('<p></p>');
    });

    it('reloadTemplates does not throw when directory has mixed files', () => {
      writeFileSync(join(templateDir, 'good.hbs'), '<p>OK</p>');
      writeFileSync(join(templateDir, 'notes.txt'), 'not a template');

      expect(() => service.reloadTemplates()).not.toThrow();
    });
  });
});
