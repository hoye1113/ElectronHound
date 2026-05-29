import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ChevronDown, Shield, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import type { AuditChainData } from '../components/AuditReportView';
import { api } from '../lib/api';

type Severity = 'pass' | 'info' | 'warn' | 'fail';

const severityConfig: Record<Severity, { icon: typeof CheckCircle2; classes: string }> = {
  pass: { icon: CheckCircle2, classes: 'text-emerald-400' },
  info: { icon: Shield, classes: 'text-blue-400' },
  warn: { icon: AlertTriangle, classes: 'text-amber-400' },
  fail: { icon: XCircle, classes: 'text-red-400' },
};

export default function AuditTreeView() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<AuditChainData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!id) return;
    const fetchAudit = async () => {
      try {
        setIsLoading(true);
        const result = (await api.reports.get(id)) as { audit?: AuditChainData } | null;
        setData(result?.audit ?? null);
      } catch {
        setError(t('auditTree.loadError'));
      } finally {
        setIsLoading(false);
      }
    };
    fetchAudit();
  }, [id]);

  const toggleRole = (role: string) => {
    setExpandedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-sm text-zinc-500">{t('auditTree.loading')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Shield className="mb-2 size-6 text-zinc-600" />
        <p className="text-sm text-zinc-500">{t('auditTree.noData')}</p>
      </div>
    );
  }

  const roles = data.chainOrder.map((role) => {
    const output = data[role === 'test-planner' ? 'testPlanner' : role === 'execution-analyst' ? 'executionAnalyst' : role === 'security-reviewer' ? 'securityReviewer' : 'reportSynthesizer'];
    return { role, output };
  });

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-lg font-bold text-zinc-100">{t('auditTree.title')}</h1>
      <div className="flex flex-col gap-2" role="tree">
        {roles.map(({ role, output }) => {
          const expanded = expandedRoles.has(role);
          const severity = output.auditReport.severity as Severity;
          const config = severityConfig[severity] ?? severityConfig.info;
          const Icon = config.icon;
          return (
            <div key={role} role="treeitem" aria-expanded={expanded} className="rounded-lg border border-zinc-800/60 bg-zinc-900/40">
              <button onClick={() => toggleRole(role)} className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-zinc-800/30">
                {expanded ? <ChevronDown className="size-4 text-zinc-500" /> : <ChevronRight className="size-4 text-zinc-500" />}
                <Icon className={`size-4 ${config.classes}`} />
                <span className="text-sm font-medium text-zinc-200">{role}</span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${config.classes}`}>{severity}</span>
              </button>
              {expanded && (
                <div className="border-t border-zinc-800/40 px-4 py-3">
                  <p className="text-xs text-zinc-400">{output.auditReport.summary}</p>
                  {output.auditReport.findings.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1">
                      {output.auditReport.findings.map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                          <span className={`mt-0.5 size-1.5 shrink-0 rounded-full ${f.severity === 'fail' ? 'bg-red-400' : f.severity === 'warn' ? 'bg-amber-400' : 'bg-blue-400'}`} />
                          {f.description}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
