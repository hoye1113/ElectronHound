import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ReportService } from '../services/reportService.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import type { Manifest, TimelineEntry } from '@eata/shared-types';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'eata-report-test-'));
}

function makeManifest(overrides?: Partial<Manifest>): Manifest {
  return {
    taskId: '550e8400-e29b-41d4-a716-446655440000',
    goal: 'Test task goal',
    status: 'completed',
    totalSteps: 5,
    passedSteps: 4,
    failedSteps: 1,
    retriedSteps: 0,
    startTime: '2026-05-18T10:00:00.000Z',
    endTime: '2026-05-18T10:05:00.000Z',
    totalDuration: 300_000,
    ...overrides,
  };
}

function makeTimelineEntry(overrides?: Partial<TimelineEntry>): TimelineEntry {
  return {
    stepIndex: 0,
    phase: 'observe',
    status: 'success',
    action: 'screenshot',
    resultSummary: 'Captured main window',
    timestamp: '2026-05-18T10:00:01.000Z',
    duration: 1000,
    ...overrides,
  };
}

describe('ReportService', () => {
  let service: ReportService;
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    service = new ReportService(tempDir);
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('createReportDir', () => {
    it('creates correct directory structure', async () => {
      const dir = await service.createReportDir('task-001');

      expect(existsSync(dir)).toBe(true);
      expect(existsSync(join(dir, 'screenshots'))).toBe(true);
      expect(existsSync(join(dir, 'accessibility'))).toBe(true);
    });

    it('returns the report directory path', async () => {
      const dir = await service.createReportDir('task-002');
      expect(dir).toContain('task-002');
      expect(dir).toContain('reports');
    });

    it('creates nested subdirectories with recursive', async () => {
      // Should work even for deeply nested task IDs
      const dir = await service.createReportDir('parent/child/task-003');
      expect(existsSync(dir)).toBe(true);
      expect(existsSync(join(dir, 'screenshots'))).toBe(true);
    });

    it('throws PathTraversalError for malicious task ID', async () => {
      await expect(service.createReportDir('../../../escape')).rejects.toThrow();
      await expect(service.createReportDir('..')).rejects.toThrow();
    });
  });

  describe('writeManifest', () => {
    it('creates valid JSON file', async () => {
      await service.createReportDir('task-010');
      const manifest = makeManifest({ goal: 'Test manifest write' });

      await service.writeManifest('task-010', manifest);

      const filePath = join(
        tempDir,
        'reports',
        'task-010',
        'manifest.json',
      );
      expect(existsSync(filePath)).toBe(true);

      const content = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.taskId).toBe(manifest.taskId);
      expect(parsed.goal).toBe('Test manifest write');
      expect(parsed.status).toBe('completed');
      expect(parsed.totalSteps).toBe(5);
    });

    it('overwrites existing manifest', async () => {
      await service.createReportDir('task-011');
      await service.writeManifest('task-011', makeManifest({ goal: 'First' }));
      await service.writeManifest('task-011', makeManifest({ goal: 'Second' }));

      const filePath = join(
        tempDir,
        'reports',
        'task-011',
        'manifest.json',
      );
      const content = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.goal).toBe('Second');
    });
  });

  describe('appendTimeline', () => {
    it('creates valid JSONL file with 3 entries', async () => {
      await service.createReportDir('task-020');

      await service.appendTimeline(
        'task-020',
        makeTimelineEntry({ stepIndex: 0, phase: 'observe' }),
      );
      await service.appendTimeline(
        'task-020',
        makeTimelineEntry({ stepIndex: 0, phase: 'plan' }),
      );
      await service.appendTimeline(
        'task-020',
        makeTimelineEntry({ stepIndex: 0, phase: 'execute' }),
      );

      const filePath = join(
        tempDir,
        'reports',
        'task-020',
        'timeline.jsonl',
      );
      expect(existsSync(filePath)).toBe(true);

      const content = readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      expect(lines).toHaveLength(3);

      // Each line should be valid JSON
      for (const line of lines) {
        const entry = JSON.parse(line);
        expect(entry).toHaveProperty('stepIndex');
        expect(entry).toHaveProperty('phase');
        expect(entry).toHaveProperty('timestamp');
      }
    });

    it('each line is newline-terminated JSON object', async () => {
      await service.createReportDir('task-021');

      await service.appendTimeline('task-021', makeTimelineEntry({ stepIndex: 1 }));

      const filePath = join(
        tempDir,
        'reports',
        'task-021',
        'timeline.jsonl',
      );
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toMatch(/\n$/);
      const parsed = JSON.parse(content.trim());
      expect(parsed.stepIndex).toBe(1);
    });
  });

  describe('saveScreenshot', () => {
    it('writes binary file and returns path', async () => {
      await service.createReportDir('task-030');
      const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header

      const filepath = await service.saveScreenshot('task-030', 0, 'observe', buffer);

      expect(existsSync(filepath)).toBe(true);
      expect(filepath).toContain('step-0-observe.png');
      expect(filepath).toContain('screenshots');

      const written = readFileSync(filepath);
      expect(written).toEqual(buffer);
    });

    it('writes different step indices correctly', async () => {
      await service.createReportDir('task-031');
      const buffer = Buffer.from('screenshot-data');

      const path1 = await service.saveScreenshot('task-031', 3, 'execute', buffer);
      expect(path1).toContain('step-3-execute.png');

      const path2 = await service.saveScreenshot('task-031', 7, 'verify', buffer);
      expect(path2).toContain('step-7-verify.png');
    });
  });

  describe('saveAccessibilitySnapshot', () => {
    it('writes JSON file and returns path', async () => {
      await service.createReportDir('task-040');
      const snapshot = {
        role: 'window',
        name: 'Main',
        children: [{ role: 'button', name: 'Submit' }],
      };

      const filepath = await service.saveAccessibilitySnapshot(
        'task-040',
        1,
        'observe',
        snapshot,
      );

      expect(existsSync(filepath)).toBe(true);
      expect(filepath).toContain('step-1-observe.json');
      expect(filepath).toContain('accessibility');

      const content = readFileSync(filepath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed).toEqual(snapshot);
      // Verify pretty-printing (2-space indent)
      expect(content).toContain('\n  ');
    });
  });

  describe('readReport', () => {
    it('returns manifest and parsed timeline', async () => {
      await service.createReportDir('task-050');

      const manifest = makeManifest({
        taskId: '550e8400-e29b-41d4-a716-446655440001',
        goal: 'Read report test',
      });
      await service.writeManifest('task-050', manifest);

      const entry1 = makeTimelineEntry({ stepIndex: 0, phase: 'observe' });
      const entry2 = makeTimelineEntry({ stepIndex: 0, phase: 'plan' });
      await service.appendTimeline('task-050', entry1);
      await service.appendTimeline('task-050', entry2);

      const report = await service.readReport('task-050');

      expect(report.manifest.goal).toBe('Read report test');
      expect(report.manifest.taskId).toBe(
        '550e8400-e29b-41d4-a716-446655440001',
      );
      expect(report.timeline).toHaveLength(2);
      expect(report.timeline[0].phase).toBe('observe');
      expect(report.timeline[1].phase).toBe('plan');
    });

    it('throws when report does not exist', async () => {
      await expect(service.readReport('nonexistent-task')).rejects.toThrow(
        'Report not found',
      );
    });

    it('timeline entries are parsed in order', async () => {
      await service.createReportDir('task-051');

      const manifest = makeManifest();
      await service.writeManifest('task-051', manifest);

      await service.appendTimeline(
        'task-051',
        makeTimelineEntry({ stepIndex: 0, phase: 'observe' }),
      );
      await service.appendTimeline(
        'task-051',
        makeTimelineEntry({ stepIndex: 1, phase: 'observe' }),
      );
      await service.appendTimeline(
        'task-051',
        makeTimelineEntry({ stepIndex: 2, phase: 'observe' }),
      );

      const report = await service.readReport('task-051');
      expect(report.timeline).toHaveLength(3);
      expect(report.timeline[0].stepIndex).toBe(0);
      expect(report.timeline[1].stepIndex).toBe(1);
      expect(report.timeline[2].stepIndex).toBe(2);
    });

    it('handles timeline with single entry', async () => {
      await service.createReportDir('task-052');
      await service.writeManifest('task-052', makeManifest());
      await service.appendTimeline('task-052', makeTimelineEntry({ stepIndex: 0 }));

      const report = await service.readReport('task-052');
      expect(report.timeline).toHaveLength(1);
    });
  });

  describe('security integration', () => {
    it('rejects path traversal in saveScreenshot', async () => {
      await expect(
        service.saveScreenshot(
          '../../../escape',
          0,
          'observe',
          Buffer.from('data'),
        ),
      ).rejects.toThrow();
    });

    it('rejects path traversal in saveAccessibilitySnapshot', async () => {
      await expect(
        service.saveAccessibilitySnapshot('../../../escape', 0, 'observe', {}),
      ).rejects.toThrow();
    });

    it('rejects path traversal in readReport', async () => {
      await expect(service.readReport('../../../escape')).rejects.toThrow();
    });
  });
});
