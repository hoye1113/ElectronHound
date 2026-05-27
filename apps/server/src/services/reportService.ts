import { writeFile, appendFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { validatePath } from './fileSecurity.js';
import { ManifestSchema, TimelineEntrySchema, type Manifest, type TimelineEntry } from '@eata/shared-types';

export class ReportService {
  constructor(private dataDir: string) {}

  async createReportDir(taskId: string): Promise<string> {
    const dir = validatePath(join(this.dataDir, 'reports'), taskId);
    await mkdir(join(dir, 'screenshots'), { recursive: true });
    await mkdir(join(dir, 'accessibility'), { recursive: true });
    return dir;
  }

  async writeManifest(taskId: string, data: Manifest): Promise<void> {
    const dir = this.getReportDir(taskId);
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(data, null, 2));
  }

  async appendTimeline(taskId: string, entry: TimelineEntry): Promise<void> {
    const dir = this.getReportDir(taskId);
    const line = JSON.stringify(entry) + '\n';
    await appendFile(join(dir, 'timeline.jsonl'), line);
  }

  async saveScreenshot(
    taskId: string,
    stepIndex: number,
    phase: string,
    buffer: Buffer,
  ): Promise<string> {
    const dir = validatePath(join(this.dataDir, 'reports'), taskId);
    const filename = `step-${stepIndex}-${phase}.png`;
    const filepath = join(dir, 'screenshots', filename);
    await writeFile(filepath, buffer);
    return filepath;
  }

  async saveAccessibilitySnapshot(
    taskId: string,
    stepIndex: number,
    phase: string,
    json: object,
  ): Promise<string> {
    const dir = validatePath(join(this.dataDir, 'reports'), taskId);
    const filename = `step-${stepIndex}-${phase}.json`;
    const filepath = join(dir, 'accessibility', filename);
    await writeFile(filepath, JSON.stringify(json, null, 2));
    return filepath;
  }

  async readReport(taskId: string): Promise<{ manifest: Manifest; timeline: TimelineEntry[] }> {
    const dir = this.getReportDir(taskId);
    const manifestPath = join(dir, 'manifest.json');
    const timelinePath = join(dir, 'timeline.jsonl');

    try {
      const [manifestRaw, timelineRaw] = await Promise.all([
        readFile(manifestPath, 'utf-8'),
        readFile(timelinePath, 'utf-8'),
      ]);
      const manifest = ManifestSchema.parse(JSON.parse(manifestRaw));
      const timeline = timelineRaw
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => TimelineEntrySchema.parse(JSON.parse(line)));
      return { manifest, timeline };
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        throw new Error(`Report not found for task ${taskId}`);
      }
      throw err;
    }
  }

  private getReportDir(taskId: string): string {
    return validatePath(join(this.dataDir, 'reports'), taskId);
  }
}
