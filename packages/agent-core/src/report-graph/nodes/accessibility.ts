import type { ReportState } from '../state.js';
import type { AccessibilityReport } from '@eata/shared-types';
import { AccessibilityReportSchema } from '@eata/shared-types';

export interface AccessibilityNodeOptions {
  generateObject?: (params: {
    model: unknown;
    schema: typeof AccessibilityReportSchema;
    prompt: string;
    system: string;
  }) => Promise<{ object: Partial<AccessibilityReport> }>;
}

export function createAccessibilityNode(
  options: AccessibilityNodeOptions,
): (state: typeof ReportState.State) => Promise<Partial<typeof ReportState.State>> {
  return async (state: typeof ReportState.State): Promise<Partial<typeof ReportState.State>> => {
    const a11ySnapshots = state.history
      .filter((h) => h.accessibilitySnapshotPath)
      .map((h) => `Step ${h.stepIndex}: snapshot at ${h.accessibilitySnapshotPath}`);

    const historyContext = state.history
      .slice(-10)
      .map((h) => `Step ${h.stepIndex} [${h.phase}/${h.status}]: ${h.observation ?? 'N/A'}`)
      .join('\n');

    const prompt = [
      `Goal: ${state.goal}`,
      `Total steps: ${state.history.length}`,
      `Accessibility snapshots collected: ${a11ySnapshots.length}`,
      a11ySnapshots.length > 0
        ? `Snapshots:\n${a11ySnapshots.join('\n')}`
        : 'No accessibility snapshots were collected.',
      `\nStep history:\n${historyContext}`,
    ].join('\n\n');

    let accessibilityReport: AccessibilityReport;

    if (options.generateObject) {
      const result = await options.generateObject({
        model: {} as unknown,
        schema: AccessibilityReportSchema,
        prompt,
        system: 'Analyze the test execution for accessibility concerns. Check for missing ARIA labels, color contrast issues, keyboard navigation problems, and WCAG compliance. If no snapshots were collected, return empty issues and wcagLevel "none".',
      });
      accessibilityReport = result.object as AccessibilityReport;
    } else {
      accessibilityReport = {
        issues: [],
        wcagLevel: 'none',
      };
    }

    return {
      accessibilityReport,
    };
  };
}

export const accessibilityNode = createAccessibilityNode({});
