import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  BookOpen,
  Tag,
  Target,
  ListChecks,
  ChevronDown,
} from 'lucide-react';
import type { FewShotExample, FewShotStep } from '../lib/api';
import { api } from '../lib/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DOMAINS = ['testing', 'navigation', 'general'] as const;
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

function emptyStep(): FewShotStep {
  return { action: '', observation: '' };
}

function emptyExample(): Omit<FewShotExample, 'id'> {
  return {
    goal: '',
    steps: [emptyStep()],
    expectedResult: '',
    metadata: { tags: [], domain: 'general', difficulty: 'medium' },
  };
}

// ─── Delete Confirm Dialog ────────────────────────────────────────────────────

interface DeleteConfirmProps {
  example: FewShotExample | null;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmDialog({ example, onConfirm, onCancel }: DeleteConfirmProps) {
  const { t } = useTranslation();

  return (
    <Dialog.Root open={example !== null} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        >
          <Dialog.Title className="text-lg font-semibold text-zinc-100">
            {t('fewShot.deleteTitle')}
          </Dialog.Title>
          <Dialog.Description className="mt-3 text-sm text-zinc-400">
            {t('fewShot.deleteConfirm', { goal: example?.goal })}
            &nbsp;{t('settings.deleteConfirmWarning')}
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

// ─── Example Form Dialog ──────────────────────────────────────────────────────

interface ExampleFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: FewShotExample | null; // null = add mode
  onSave: (data: Omit<FewShotExample, 'id'>) => void;
}

function ExampleFormDialog({ open, onOpenChange, initial, onSave }: ExampleFormProps) {
  const { t } = useTranslation();
  const isEdit = initial !== null;

  const [goal, setGoal] = useState('');
  const [expectedResult, setExpectedResult] = useState('');
  const [steps, setSteps] = useState<FewShotStep[]>([emptyStep()]);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [domain, setDomain] = useState<string>('general');
  const [difficulty, setDifficulty] = useState<string>('medium');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      if (initial) {
        setGoal(initial.goal);
        setExpectedResult(initial.expectedResult);
        setSteps(initial.steps.length > 0 ? initial.steps : [emptyStep()]);
        setTags(initial.metadata.tags ?? []);
        setDomain(initial.metadata.domain ?? 'general');
        setDifficulty(initial.metadata.difficulty ?? 'medium');
      } else {
        const blank = emptyExample();
        setGoal(blank.goal);
        setExpectedResult(blank.expectedResult);
        setSteps(blank.steps);
        setTags([]);
        setDomain('general');
        setDifficulty('medium');
      }
      setTagInput('');
      setErrors({});
    }
  }, [open, initial]);

  const inputBase =
    'w-full rounded-lg border bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500';

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    }
  };

  const addStep = () => setSteps([...steps, emptyStep()]);
  const removeStep = (index: number) => setSteps(steps.filter((_, i) => i !== index));
  const updateStep = (index: number, field: keyof FewShotStep, value: string) =>
    setSteps(steps.map((s, i) => (i === index ? { ...s, [field]: value } : s)));

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!goal.trim()) errs.goal = t('fewShot.goalRequired');
    if (!expectedResult.trim()) errs.expectedResult = t('fewShot.expectedResultRequired');
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSave({
      goal: goal.trim(),
      expectedResult: expectedResult.trim(),
      steps: steps.filter((s) => s.action.trim() || s.observation.trim()),
      metadata: {
        tags: tags.length > 0 ? tags : [],
        domain,
        difficulty: difficulty as 'easy' | 'medium' | 'hard',
      },
    });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-zinc-100">
              {isEdit ? t('fewShot.editTitle') : t('fewShot.addTitle')}
            </Dialog.Title>
            <Dialog.Close className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
            {/* Goal */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="fs-goal" className="text-sm font-medium text-zinc-300">
                {t('fewShot.goalLabel')}
              </label>
              <textarea
                id="fs-goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder={t('fewShot.goalPlaceholder')}
                rows={2}
                className={`${inputBase} resize-none ${errors.goal ? 'border-red-500' : 'border-zinc-700'}`}
              />
              {errors.goal && <p className="text-xs text-red-400">{errors.goal}</p>}
            </div>

            {/* Steps */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-zinc-300">
                {t('fewShot.stepsLabel')}
              </label>
              {steps.map((step, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-800/50 p-3"
                >
                  <span className="mt-2.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-[10px] font-semibold text-zinc-300">
                    {index + 1}
                  </span>
                  <div className="flex-1 flex flex-col gap-2">
                    <input
                      type="text"
                      value={step.action}
                      onChange={(e) => updateStep(index, 'action', e.target.value)}
                      placeholder={t('fewShot.stepActionPlaceholder')}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                    <input
                      type="text"
                      value={step.observation}
                      onChange={(e) => updateStep(index, 'observation', e.target.value)}
                      placeholder={t('fewShot.stepObservationPlaceholder')}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  {steps.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeStep(index)}
                      aria-label={t('fewShot.removeStep')}
                      className="mt-2 rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-300"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addStep}
                className="inline-flex items-center gap-1.5 self-start rounded-md px-2.5 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              >
                <Plus className="size-3" />
                {t('fewShot.addStep')}
              </button>
            </div>

            {/* Expected Result */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="fs-result" className="text-sm font-medium text-zinc-300">
                {t('fewShot.expectedResultLabel')}
              </label>
              <textarea
                id="fs-result"
                value={expectedResult}
                onChange={(e) => setExpectedResult(e.target.value)}
                placeholder={t('fewShot.expectedResultPlaceholder')}
                rows={2}
                className={`${inputBase} resize-none ${errors.expectedResult ? 'border-red-500' : 'border-zinc-700'}`}
              />
              {errors.expectedResult && <p className="text-xs text-red-400">{errors.expectedResult}</p>}
            </div>

            {/* Tags */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="fs-tags" className="text-sm font-medium text-zinc-300">
                {t('fewShot.tagsLabel')}
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-xs font-medium text-indigo-300"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      aria-label={t('fewShot.removeTag', { tag })}
                      className="rounded-full p-0.5 transition-colors hover:bg-indigo-500/25"
                    >
                      <X className="size-2.5" />
                    </button>
                  </span>
                ))}
                <input
                  id="fs-tags"
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={addTag}
                  placeholder={tags.length === 0 ? t('fewShot.tagsPlaceholder') : ''}
                  className="min-w-24 flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <p className="text-xs text-zinc-500">{t('fewShot.tagsHint')}</p>
            </div>

            {/* Domain + Difficulty */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="fs-domain" className="text-sm font-medium text-zinc-300">
                  {t('fewShot.domainLabel')}
                </label>
                <div className="relative">
                  <select
                    id="fs-domain"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    className={`${inputBase} appearance-none pr-8`}
                  >
                    {DOMAINS.map((d) => (
                      <option key={d} value={d}>{t(`fewShot.domain_${d}`)}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="fs-difficulty" className="text-sm font-medium text-zinc-300">
                  {t('fewShot.difficultyLabel')}
                </label>
                <div className="relative">
                  <select
                    id="fs-difficulty"
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className={`${inputBase} appearance-none pr-8`}
                  >
                    {DIFFICULTIES.map((d) => (
                      <option key={d} value={d}>{t(`fewShot.difficulty_${d}`)}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
                </div>
              </div>
            </div>

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
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
              >
                <Check className="size-4" />
                {isEdit ? t('common.save') : t('common.add')}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── Example Card ─────────────────────────────────────────────────────────────

interface ExampleCardProps {
  example: FewShotExample;
  onEdit: () => void;
  onDelete: () => void;
}

function ExampleCard({ example, onEdit, onDelete }: ExampleCardProps) {
  const { t } = useTranslation();

  const difficultyColors: Record<string, string> = {
    easy: 'bg-emerald-500/15 text-emerald-300',
    medium: 'bg-amber-500/15 text-amber-300',
    hard: 'bg-red-500/15 text-red-300',
  };

  const domainColors: Record<string, string> = {
    testing: 'bg-indigo-500/15 text-indigo-300',
    navigation: 'bg-purple-500/15 text-purple-300',
    general: 'bg-zinc-700 text-zinc-300',
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:border-zinc-700">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
            <Target className="size-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-zinc-100 leading-relaxed">{example.goal}</h3>

            {/* Metadata chips */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {example.metadata.domain && (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${domainColors[example.metadata.domain] ?? domainColors.general}`}>
                  {example.metadata.domain}
                </span>
              )}
              {example.metadata.difficulty && (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${difficultyColors[example.metadata.difficulty] ?? ''}`}>
                  {t(`fewShot.difficulty_${example.metadata.difficulty}`)}
                </span>
              )}
              {(example.metadata.tags ?? []).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400"
                >
                  <Tag className="size-2" />
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onEdit}
            aria-label={t('fewShot.editExample', { goal: example.goal })}
            className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={t('fewShot.deleteExample', { goal: example.goal })}
            className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-red-400"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Expected Result */}
      <div className="mt-3 pl-9.5">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1">
          {t('fewShot.expectedResultShort')}
        </p>
        <p className="text-sm text-zinc-300 leading-relaxed line-clamp-2">
          {example.expectedResult}
        </p>
      </div>

      {/* Steps count */}
      {example.steps.length > 0 && (
        <div className="mt-3 pl-9.5">
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <ListChecks className="size-3" />
            <span>
              {example.steps.length} {t('fewShot.stepsCount', { count: example.steps.length })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FewShotPage() {
  const { t } = useTranslation();
  const [examples, setExamples] = useState<FewShotExample[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExample, setEditingExample] = useState<FewShotExample | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FewShotExample | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const reload = useCallback(async () => {
    try {
      const result = await api.fewShot.list();
      setExamples(result.data);
    } catch {
      // fallback: try localStorage
      const stored = localStorage.getItem('eata-few-shot-examples');
      if (stored) {
        try { setExamples(JSON.parse(stored)); } catch { /* ignore */ }
      }
    }
  }, []);

  useEffect(() => {
    // Check for localStorage data to migrate
    const stored = localStorage.getItem('eata-few-shot-examples');
    if (stored) {
      try {
        const examples = JSON.parse(stored);
        if (Array.isArray(examples) && examples.length > 0) {
          api.fewShot.migrate(examples).then(() => {
            localStorage.removeItem('eata-few-shot-examples');
            reload();
          }).catch(() => {
            // Migration failed, keep localStorage data as fallback
          });
        }
      } catch { /* invalid JSON, ignore */ }
    }
    reload();
  }, [reload]);

  const handleSave = async (data: Omit<FewShotExample, 'id'>) => {
    if (editingExample) {
      await api.fewShot.update(editingExample.id, data);
    } else {
      await api.fewShot.add(data);
    }
    setEditingExample(null);
    reload();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await api.fewShot.remove(deleteTarget.id);
    setDeleteTarget(null);
    reload();
  };

  const openAdd = () => {
    setEditingExample(null);
    setDialogOpen(true);
  };

  const openEdit = (example: FewShotExample) => {
    setEditingExample(example);
    setDialogOpen(true);
  };

  const filteredExamples = searchQuery.trim()
    ? examples.filter((ex) => {
        const q = searchQuery.toLowerCase();
        return (
          ex.goal.toLowerCase().includes(q) ||
          ex.expectedResult.toLowerCase().includes(q) ||
          (ex.metadata.tags ?? []).some((tag) => tag.toLowerCase().includes(q)) ||
          (ex.metadata.domain ?? '').toLowerCase().includes(q)
        );
      })
    : examples;

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">
            <BookOpen className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t('fewShot.title')}</h1>
            <p className="text-sm text-zinc-400">{t('fewShot.subtitle')}</p>
          </div>
        </div>
      </div>

      {/* Search */}
      {examples.length > 0 && (
        <div className="relative mb-4">
          <input
            type="text"
            placeholder={t('fewShot.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 py-2.5 pl-4 pr-4 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
            aria-label={t('fewShot.searchPlaceholder')}
          />
        </div>
      )}

      {/* Example list */}
      {examples.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 p-10 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-zinc-800 mb-4">
            <BookOpen className="size-7 text-zinc-500" />
          </div>
          <p className="text-sm font-medium text-zinc-400">{t('fewShot.empty')}</p>
          <p className="mt-1 text-xs text-zinc-600">{t('fewShot.emptyHint')}</p>
          <button
            type="button"
            onClick={openAdd}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            <Plus className="size-4" />
            {t('fewShot.addFirst')}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredExamples.map((example) => (
            <ExampleCard
              key={example.id}
              example={example}
              onEdit={() => openEdit(example)}
              onDelete={() => setDeleteTarget(example)}
            />
          ))}
          {searchQuery.trim() && filteredExamples.length === 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 text-center">
              <p className="text-sm text-zinc-500">{t('fewShot.noResults')}</p>
            </div>
          )}
        </div>
      )}

      {/* Add button */}
      {examples.length > 0 && (
        <button
          type="button"
          onClick={openAdd}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-dashed border-zinc-700 px-4 py-3 text-sm font-medium text-zinc-400 transition-colors hover:border-indigo-500/50 hover:text-indigo-300 w-full justify-center"
        >
          <Plus className="size-4" />
          {t('fewShot.addNew')}
        </button>
      )}

      {/* Add/Edit Dialog */}
      <ExampleFormDialog
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingExample(null); }}
        initial={editingExample}
        onSave={handleSave}
      />

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        example={deleteTarget}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
