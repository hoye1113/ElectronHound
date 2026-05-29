import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Plus,
  Pencil,
  Trash2,
  FileText,
  Palette,
} from 'lucide-react';
import { api, type ReportTemplate, type ReportSection, type ReportStyling } from '../lib/api';
import ReportTemplateEditor from '../components/ReportTemplateEditor';

// ─── Delete Confirm Dialog ──────────────────────────────────────────────────

interface DeleteConfirmDialogProps {
  template: ReportTemplate | null;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmDialog({ template, onConfirm, onCancel }: DeleteConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog.Root open={template !== null} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        >
          <Dialog.Title className="text-lg font-semibold text-zinc-100">
            {t('reportTemplates.deleteTitle')}
          </Dialog.Title>
          <Dialog.Description className="mt-3 text-sm text-zinc-400">
            {t('reportTemplates.deleteConfirm', { name: template?.name })}
          </Dialog.Description>
          <div className="mt-5 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-500"
            >
              <Trash2 className="size-4" />
              {t('common.delete')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── Template Card ──────────────────────────────────────────────────────────

interface ReportTemplateCardProps {
  template: ReportTemplate;
  onEdit: () => void;
  onDelete: () => void;
}

function ReportTemplateCard({ template, onEdit, onDelete }: ReportTemplateCardProps) {
  const { t } = useTranslation();

  const enabledSections = template.sections.filter((s) => s.enabled);

  return (
    <div className="group relative rounded-xl border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:border-zinc-700">
      {/* Default badge */}
      {template.isDefault && (
        <div className="absolute right-3 top-3">
          <span className="inline-flex items-center rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-[10px] font-medium text-indigo-300">
            {t('reportTemplates.defaultBadge')}
          </span>
        </div>
      )}

      {/* Name & description */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
          <FileText className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-zinc-100">{template.name}</h3>
          {template.description && (
            <p className="mt-1 text-xs text-zinc-400 line-clamp-2">{template.description}</p>
          )}
        </div>
      </div>

      {/* Sections summary */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {enabledSections.slice(0, 4).map((section) => (
          <span
            key={section.id}
            className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400"
          >
            {t(`reportTemplates.section_${section.type}`)}
          </span>
        ))}
        {enabledSections.length > 4 && (
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
            +{enabledSections.length - 4}
          </span>
        )}
      </div>

      {/* Styling preview */}
      <div className="mt-3 flex items-center gap-2">
        <Palette className="size-3 text-zinc-500" />
        <span
          className="inline-block size-3 rounded-full"
          style={{ backgroundColor: template.styling.primaryColor }}
        />
        <span className="text-[10px] text-zinc-500">
          {t(`reportTemplates.theme_${template.styling.theme}`)}
        </span>
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
        >
          <Pencil className="size-3" />
          {t('common.edit')}
        </button>
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:border-red-500/50 hover:text-red-400"
        >
          <Trash2 className="size-3" />
          {t('common.delete')}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function ReportTemplates() {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ReportTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReportTemplate | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.reportTemplates.list();
      setTemplates(res.data ?? []);
    } catch {
      // Report templates fetch failed
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleCreate = () => {
    setEditingTemplate(null);
    setEditorOpen(true);
  };

  const handleEdit = (template: ReportTemplate) => {
    setEditingTemplate(template);
    setEditorOpen(true);
  };

  const handleSave = async (data: {
    name: string;
    description?: string;
    sections: ReportSection[];
    styling: ReportStyling;
  }) => {
    if (editingTemplate) {
      await api.reportTemplates.update(editingTemplate.id, data);
    } else {
      await api.reportTemplates.create(data);
    }
    setEditingTemplate(null);
    fetchTemplates();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.reportTemplates.delete(deleteTarget.id);
      setTemplates((prev) => prev.filter((t) => t.id !== deleteTarget.id));
    } catch {
      // Delete failed
    }
    setDeleteTarget(null);
  };

  return (
    <div className="mx-auto max-w-5xl p-8">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            {t('reportTemplates.title')}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">{t('reportTemplates.subtitle')}</p>
        </div>
        <button
          onClick={handleCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          <Plus className="size-4" />
          {t('reportTemplates.newTemplate')}
        </button>
      </div>

      {/* Template grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <p className="text-sm text-zinc-500">{t('common.loading')}</p>
          </div>
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50 py-16">
          <FileText className="mb-3 size-10 text-zinc-600" />
          <p className="text-sm text-zinc-400">{t('reportTemplates.empty')}</p>
          <p className="mt-1 text-xs text-zinc-600">{t('reportTemplates.emptyHint')}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <ReportTemplateCard
              key={template.id}
              template={template}
              onEdit={() => handleEdit(template)}
              onDelete={() => setDeleteTarget(template)}
            />
          ))}
        </div>
      )}

      {/* Editor Dialog */}
      <ReportTemplateEditor
        open={editorOpen}
        onOpenChange={(open) => { setEditorOpen(open); if (!open) setEditingTemplate(null); }}
        template={editingTemplate}
        onSave={handleSave}
      />

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        template={deleteTarget}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
