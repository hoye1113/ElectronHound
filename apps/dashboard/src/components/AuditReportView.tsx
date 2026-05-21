import { useTranslation } from 'react-i18next';
import {
  TestTube2,
  Activity,
  Shield,
  FileText,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
} from 'lucide-react';

// ── Local types (mirrors packages/agent-core/src/sub-agents/types.ts) ──────
// These types are duplicated here because the dashboard does not depend on
// @eata/agent-core. Keep in sync if the upstream types change.

type SubAgentRole =
  | 'test-planner'
  | 'execution-analyst'
  | 'security-reviewer'
  | 'report-synthesizer';

type Severity = 'pass' | 'info' | 'warn' | 'fail';

interface AuditFinding {
  category: string;
  description: string;
  severity: 'info' | 'warn' | 'fail';
  evidence?: string;
}

interface AuditReport {
  severity: Severity;
  summary: string;
  findings: AuditFinding[];
  timestamp: string;
}

interface SubAgentOutput {
  role: SubAgentRole;
  auditReport: AuditReport;
  analysis: string;
  recommendations: string[];
}

export interface AuditChainData {
  goal: string;
  testPlanner: SubAgentOutput;
  executionAnalyst: SubAgentOutput;
  securityReviewer: SubAgentOutput;
  reportSynthesizer: SubAgentOutput;
  chainOrder: SubAgentRole[];
  durationMs: number;
  completedAt: string;
}

// ── Config maps ────────────────────────────────────────────────────────────

const verdictConfig: Record<Severity, { labelKey: string; classes: string }> = {
  pass: { labelKey: 'auditReport.verdict.pass', classes: 'bg-emerald-500/20 text-emerald-300' },
  info: { labelKey: 'auditReport.verdict.info', classes: 'bg-blue-500/20 text-blue-300' },
  warn: { labelKey: 'auditReport.verdict.warn', classes: 'bg-amber-500/20 text-amber-300' },
  fail: { labelKey: 'auditReport.verdict.fail', classes: 'bg-red-500/20 text-red-300' },
};

const findingSeverityConfig: Record<'info' | 'warn' | 'fail', { classes: string }> = {
  info: { classes: 'text-blue-400' },
  warn: { classes: 'text-amber-400' },
  fail: { classes: 'text-red-400' },
};

// Lucide icons are tree-shakeable; each mapped via SubAgentRole.
const roleIconMap: Record<SubAgentRole, typeof TestTube2> = {
  'test-planner': TestTube2,
  'execution-analyst': Activity,
  'security-reviewer': Shield,
  'report-synthesizer': FileText,
};

// ── Component ──────────────────────────────────────────────────────────────

interface AuditReportViewProps {
  auditData: AuditChainData | undefined;
}

export default function AuditReportView({ auditData }: AuditReportViewProps) {
  const { t } = useTranslation();

  if (!auditData) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-zinc-800/60">
          <FileText className="size-5 text-zinc-500" />
        </div>
        <p className="text-sm text-zinc-500">{t('auditReport.noData')}</p>
        <p className="mt-1 text-xs text-zinc-600">{t('auditReport.noDataHint')}</p>
      </div>
    );
  }

  const roleOutputs: SubAgentOutput[] = auditData.chainOrder.map((role) => {
    switch (role) {
      case 'test-planner':
        return auditData.testPlanner;
      case 'execution-analyst':
        return auditData.executionAnalyst;
      case 'security-reviewer':
        return auditData.securityReviewer;
      case 'report-synthesizer':
        return auditData.reportSynthesizer;
    }
  });

  return (
    <div className="flex flex-col gap-3">
      {/* Chain summary bar */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
        <span>
          {t('auditReport.duration', { ms: auditData.durationMs })}
        </span>
        <span>&middot;</span>
        <span>
          {t('auditReport.completedAt', { time: formatTimestamp(auditData.completedAt) })}
        </span>
      </div>

      {/* Role cards */}
      {roleOutputs.map((output, index) => (
        <RoleCard key={output.role} output={output} index={index} />
      ))}
    </div>
  );
}

// ── Role card ──────────────────────────────────────────────────────────────

interface RoleCardProps {
  output: SubAgentOutput;
  index: number;
}

function RoleCard({ output, index }: RoleCardProps) {
  const { t } = useTranslation();
  const Icon = roleIconMap[output.role];
  const verdict = verdictConfig[output.auditReport.severity];
  const roleLabelKey = `auditReport.role.${output.role}`;

  return (
    <div
      className="rounded-lg border border-zinc-800/60 bg-zinc-900/40"
      role="listitem"
    >
      {/* Card header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-full bg-zinc-800/80">
            <Icon className="size-3.5 text-zinc-400" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-400">
              {index + 1}.
            </span>
            <span className="text-sm font-medium text-zinc-200">
              {t(roleLabelKey)}
            </span>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${verdict.classes}`}
        >
          <VerdictIcon severity={output.auditReport.severity} />
          {t(verdict.labelKey)}
        </span>
      </div>

      {/* Summary */}
      <div className="border-t border-zinc-800/40 px-4 py-2.5">
        <p className="text-xs leading-relaxed text-zinc-400">
          {output.auditReport.summary}
        </p>
      </div>

      {/* Findings (collapsible) */}
      {output.auditReport.findings.length > 0 && (
        <details className="border-t border-zinc-800/40">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800/30 hover:text-zinc-200 [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-3.5 shrink-0 transition-transform [[open]>&]:rotate-90" />
            {t('auditReport.findingsLabel', { count: output.auditReport.findings.length })}
          </summary>
          <ul className="flex flex-col gap-2 px-4 pb-3">
            {output.auditReport.findings.map((finding, i) => (
              <li
                key={i}
                className="rounded-md border border-zinc-800/30 bg-zinc-800/20 px-3 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-zinc-300">{finding.description}</p>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${findingSeverityConfig[finding.severity].classes}`}>
                    {finding.severity}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-600">
                  <span className="rounded bg-zinc-800/60 px-1.5 py-0.5 font-mono">
                    {finding.category}
                  </span>
                </div>
                {finding.evidence && (
                  <pre className="mt-1.5 overflow-x-auto rounded bg-zinc-800/40 p-2 text-[11px] leading-snug text-zinc-500">
                    {finding.evidence}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Recommendations (collapsible) */}
      {output.recommendations.length > 0 && (
        <details className="border-t border-zinc-800/40">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800/30 hover:text-zinc-200 [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-3.5 shrink-0 transition-transform [[open]>&]:rotate-90" />
            {t('auditReport.recommendationsLabel', { count: output.recommendations.length })}
          </summary>
          <ul className="flex flex-col gap-1 px-4 pb-3">
            {output.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                <span className="mt-0.5 block size-1.5 shrink-0 rounded-full bg-zinc-600" />
                {rec}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function VerdictIcon({ severity }: { severity: Severity }) {
  const size = 'size-3';
  switch (severity) {
    case 'pass':
      return <CheckCircle2 className={size} />;
    case 'info':
      return <Info className={size} />;
    case 'warn':
      return <AlertTriangle className={size} />;
    case 'fail':
      return <XCircle className={size} />;
  }
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
