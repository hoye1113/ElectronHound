import {
  mkdirSync,
  writeFileSync,
  appendFileSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { validatePath } from './fileSecurity.js';
import type { Manifest, TimelineEntry } from '@eata/shared-types';

export class ReportService {
  constructor(private dataDir: string) {}

  createReportDir(taskId: string): string {
    const dir = validatePath(join(this.dataDir, 'reports'), taskId);
    mkdirSync(join(dir, 'screenshots'), { recursive: true });
    mkdirSync(join(dir, 'accessibility'), { recursive: true });
    return dir;
  }

  writeManifest(taskId: string, data: Manifest): void {
    const dir = this.getReportDir(taskId);
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(data, null, 2));
  }

  appendTimeline(taskId: string, entry: TimelineEntry): void {
    const dir = this.getReportDir(taskId);
    const line = JSON.stringify(entry) + '\n';
    appendFileSync(join(dir, 'timeline.jsonl'), line);
  }

  saveScreenshot(
    taskId: string,
    stepIndex: number,
    phase: string,
    buffer: Buffer,
  ): string {
    const dir = validatePath(join(this.dataDir, 'reports'), taskId);
    const filename = `step-${stepIndex}-${phase}.png`;
    const filepath = join(dir, 'screenshots', filename);
    writeFileSync(filepath, buffer);
    return filepath;
  }

  saveAccessibilitySnapshot(
    taskId: string,
    stepIndex: number,
    phase: string,
    json: object,
  ): string {
    const dir = validatePath(join(this.dataDir, 'reports'), taskId);
    const filename = `step-${stepIndex}-${phase}.json`;
    const filepath = join(dir, 'accessibility', filename);
    writeFileSync(filepath, JSON.stringify(json, null, 2));
    return filepath;
  }

  readReport(taskId: string): { manifest: Manifest; timeline: TimelineEntry[] } {
    const dir = this.getReportDir(taskId);
    const manifestPath = join(dir, 'manifest.json');
    const timelinePath = join(dir, 'timeline.jsonl');

    if (!existsSync(manifestPath) || !existsSync(timelinePath)) {
      throw new Error(`Report not found for task ${taskId}`);
    }

    const manifest = JSON.parse(
      readFileSync(manifestPath, 'utf-8'),
    ) as Manifest;
    const timelineRaw = readFileSync(timelinePath, 'utf-8');
    const timeline = timelineRaw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as TimelineEntry);
    return { manifest, timeline };
  }

  private getReportDir(taskId: string): string {
    return validatePath(join(this.dataDir, 'reports'), taskId);
  }
}
