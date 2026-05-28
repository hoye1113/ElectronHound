import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import {
  Search,
  Plus,
  Trash2,
  Lock,
  X,
  Check,
  ChevronDown,
  LayoutTemplate,
  ExternalLink,
} from 'lucide-react';
import { api, type Template, type TemplateCategory } from '../lib/api';

const CATEGORIES: TemplateCategory[] = [
  'login',
  'crud',
  'form',
  'navigation',
  'file',
  'settings',
  'custom',
];

const categoryColors: Record<TemplateCategory, string> = {
  login: 'bg-blue-500/20 text-blue-300',
  crud: 'bg-emerald-500/20 text-emerald-300',
  form: 'bg-amber-500/20 text-amber-300',
  navigation: 'bg-purple-500/20 text-purple-300',
  file: 'bg-cyan-500/20 text-cyan-300',
  settings: 'bg-zinc-500/20 text-zinc-300',
  custom: 'bg-indigo-500/20 text-indigo-300',
};

// ─── Create Template Dialog ─────────────────────────────────────────────────

interface CreateTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function CreateTemplateDialog({ open, onOpenChange, onSuccess }: CreateTemplateDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TemplateCategory>('custom');
  const [variables, setVariables] = useState('');
  const [goal, setGoal] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setCategory('custom');
      setVariables('');
      setGoal('');
      setErrors({});
      setSubmitError(null);
    }
  }, [open]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = t('templates.nameRequired');
    if (!description.trim()) errs.description = t('templates.descriptionRequired');
    if (!goal.trim()) errs.goal = t('templates.goalRequired');
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const vars = variables
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
      await api.templates.create({
        name: name.trim(),
        description: description.trim(),
        category,
        variables: vars,
        goal: goal.trim(),
      });
      onSuccess();
      onOpenChange(false);
    } catch {
      setSubmitError(t('common.error', 'Failed to create template'));
    } finally {
      setSubmitting(false);
    }
  };

  const inputBase =
    'w-full rounded-lg border bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-zinc-100">
              {t('templates.formTitle')}
            </Dialog.Title>
            <Dialog.Close className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tpl-name" className="text-sm font-medium text-zinc-300">
                {t('templates.formName')}
              </label>
              <input
                id="tpl-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('templates.formNamePlaceholder')}
                className={`${inputBase} ${errors.name ? 'border-red-500' : 'border-zinc-700'}`}
              />
              {errors.name && <p className="text-xs text-red-400">{errors.name}</p>}
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tpl-desc" className="text-sm font-medium text-zinc-300">
                {t('templates.formDescription')}
              </label>
              <textarea
                id="tpl-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('templates.formDescriptionPlaceholder')}
                rows={2}
                className={`${inputBase} ${errors.description ? 'border-red-500' : 'border-zinc-700'}`}
              />
              {errors.description && <p className="text-xs text-red-400">{errors.description}</p>}
            </div>

            {/* Category */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-300">
                {t('templates.formCategory')}
              </label>
              <Select.Root value={category} onValueChange={(v) => setCategory(v as TemplateCategory)}>
                <Select.Trigger className="inline-flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 outline-none transition-colors focus:ring-1 focus:ring-indigo-500">
                  <Select.Value />
                  <Select.Icon>
                    <ChevronDown className="size-4 text-zinc-500" />
                  </Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 shadow-xl z-[100]">
                    <Select.Viewport className="p-1">
                      {CATEGORIES.map((cat) => (
                        <Select.Item
                          key={cat}
                          value={cat}
                          className="relative flex cursor-pointer items-center rounded-md px-8 py-2 text-sm text-zinc-200 outline-none select-none hover:bg-zinc-800 data-[highlighted]:bg-zinc-800"
                        >
                          <Select.ItemText>{t(`templates.category_${cat}`)}</Select.ItemText>
                          <Select.ItemIndicator className="absolute left-2">
                            <Check className="size-3.5 text-indigo-400" />
                          </Select.ItemIndicator>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>

            {/* Variables */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tpl-vars" className="text-sm font-medium text-zinc-300">
                {t('templates.formVariables')}
              </label>
              <input
                id="tpl-vars"
                type="text"
                value={variables}
                onChange={(e) => setVariables(e.target.value)}
                placeholder={t('templates.formVariablesPlaceholder')}
                className={`${inputBase} border-zinc-700`}
              />
            </div>

            {/* Goal Template */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tpl-goal" className="text-sm font-medium text-zinc-300">
                {t('templates.formGoal')}
              </label>
              <textarea
                id="tpl-goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder={t('templates.formGoalPlaceholder')}
                rows={3}
                className={`${inputBase} ${errors.goal ? 'border-red-500' : 'border-zinc-700'}`}
              />
              {errors.goal && <p className="text-xs text-red-400">{errors.goal}</p>}
            </div>

            {/* Error */}
            {submitError && (
              <p className="text-sm text-red-400">{submitError}</p>
            )}

            {/* Actions */}
            <div className="mt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
              >
                <Check className="size-4" />
                {t('common.save')}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── Delete Confirm Dialog ──────────────────────────────────────────────────

interface DeleteConfirmDialogProps {
  template: Template | null;
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
            {t('templates.deleteTemplate')}
          </Dialog.Title>
          <Dialog.Description className="mt-3 text-sm text-zinc-400">
            {t('templates.deleteConfirm', { name: template?.name })}
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

interface TemplateCardProps {
  template: Template;
  onUse: () => void;
  onDelete: () => void;
}

function TemplateCard({ template, onUse, onDelete }: TemplateCardProps) {
  const { t } = useTranslation();

  return (
    <div className="group relative rounded-xl border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:border-zinc-700">
      {/* Lock icon for builtin */}
      {template.builtin && (
        <div className="absolute right-3 top-3">
          <Lock className="size-4 text-zinc-600" />
        </div>
      )}

      {/* Category badge */}
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${categoryColors[template.category]}`}
      >
        {t(`templates.category_${template.category}`)}
      </span>

      {/* Name & description */}
      <h3 className="mt-3 text-sm font-semibold text-zinc-100">{template.name}</h3>
      <p className="mt-1 text-xs text-zinc-400 line-clamp-2">{template.description}</p>

      {/* Variables */}
      {template.variables.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-zinc-500">{t('templates.variables')}:</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {template.variables.map((v) => (
              <span
                key={v}
                className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400"
              >
                {`{{${v}}}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={onUse}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500"
        >
          <ExternalLink className="size-3" />
          {t('templates.useTemplate')}
        </button>
        {!template.builtin && (
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:border-red-500/50 hover:text-red-400"
          >
            <Trash2 className="size-3" />
            {t('templates.deleteTemplate')}
          </button>
        )}
      </div>

      {/* Badge */}
      <div className="absolute right-3 bottom-3">
        <span className="text-[10px] text-zinc-600">
          {template.builtin ? t('templates.builtinBadge') : t('templates.customBadge')}
        </span>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function Templates() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const params: { category?: string; search?: string } = {};
      if (activeCategory !== 'all') params.category = activeCategory;
      if (search.trim()) params.search = search.trim();
      const res = await api.templates.list(params);
      setTemplates(res.data ?? []);
    } catch {
      // Templates fetch failed
    } finally {
      setLoading(false);
    }
  }, [activeCategory, search]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleUseTemplate = (templateId: string) => {
    navigate(`/?templateId=${templateId}`);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.templates.delete(deleteTarget.id);
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
            {t('templates.title')}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">{t('templates.subtitle')}</p>
        </div>
        <button
          onClick={() => setCreateDialogOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          <Plus className="size-4" />
          {t('templates.createCustom')}
        </button>
      </div>

      {/* Search & filters */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('templates.searchPlaceholder')}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2.5 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Category filter */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setActiveCategory('all')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeCategory === 'all'
                ? 'bg-indigo-500/15 text-indigo-300'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
            }`}
          >
            {t('templates.allCategories')}
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-indigo-500/15 text-indigo-300'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
              }`}
            >
              {t(`templates.category_${cat}`)}
            </button>
          ))}
        </div>
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
          <LayoutTemplate className="mb-3 size-10 text-zinc-600" />
          <p className="text-sm text-zinc-400">{t('templates.empty')}</p>
          <p className="mt-1 text-xs text-zinc-600">{t('templates.emptyHint')}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onUse={() => handleUseTemplate(template.id)}
              onDelete={() => setDeleteTarget(template)}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <CreateTemplateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={fetchTemplates}
      />
      <DeleteConfirmDialog
        template={deleteTarget}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
