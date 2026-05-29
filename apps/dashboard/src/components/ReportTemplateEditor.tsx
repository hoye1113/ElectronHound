import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import * as Dialog from '@radix-ui/react-dialog';
import {
  X,
  Check,
  Plus,
  Trash2,
  GripVertical,
} from 'lucide-react';
import type {
  ReportTemplate,
  ReportSection,
  ReportSectionType,
  ReportTheme,
  ReportStyling,
} from '../lib/api';

const SECTION_TYPES: ReportSectionType[] = [
  'summary',
  'steps',
  'screenshots',
  'errors',
  'performance',
  'suggestions',
  'raw',
];

const THEME_OPTIONS: ReportTheme[] = ['light', 'dark', 'auto'];

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function defaultStyling(): ReportStyling {
  return { theme: 'auto', primaryColor: '#3b82f6' };
}

function defaultSections(): ReportSection[] {
  return [
    { id: generateId(), type: 'summary', title: 'Summary', enabled: true, order: 0 },
    { id: generateId(), type: 'steps', title: 'Steps', enabled: true, order: 1 },
    { id: generateId(), type: 'screenshots', title: 'Screenshots', enabled: true, order: 2 },
  ];
}

// ─── Editor Dialog ─────────────────────────────────────────────────────────

interface ReportTemplateEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: ReportTemplate | null; // null = create mode
  onSave: (data: {
    name: string;
    description?: string;
    sections: ReportSection[];
    styling: ReportStyling;
  }) => void;
}

export default function ReportTemplateEditor({
  open,
  onOpenChange,
  template,
  onSave,
}: ReportTemplateEditorProps) {
  const { t } = useTranslation();
  const isEdit = template !== null;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sections, setSections] = useState<ReportSection[]>(defaultSections());
  const [styling, setStyling] = useState<ReportStyling>(defaultStyling());
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      if (template) {
        setName(template.name);
        setDescription(template.description ?? '');
        setSections(template.sections.length > 0 ? template.sections : defaultSections());
        setStyling(template.styling ?? defaultStyling());
      } else {
        setName('');
        setDescription('');
        setSections(defaultSections());
        setStyling(defaultStyling());
      }
      setErrors({});
    }
  }, [open, template]);

  const inputBase =
    'w-full rounded-lg border bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500';

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = t('reportTemplates.nameRequired');
    if (sections.filter((s) => s.enabled).length === 0) {
      errs.sections = t('reportTemplates.sectionsRequired');
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      sections: sections.map((s, i) => ({ ...s, order: i })),
      styling,
    });
    onOpenChange(false);
  };

  const addSection = () => {
    setSections([
      ...sections,
      {
        id: generateId(),
        type: 'summary',
        title: t('reportTemplates.section_summary'),
        enabled: true,
        order: sections.length,
      },
    ]);
  };

  const removeSection = (id: string) => {
    setSections(sections.filter((s) => s.id !== id));
  };

  const updateSection = (id: string, updates: Partial<ReportSection>) => {
    setSections(sections.map((s) => (s.id === id ? { ...s, ...updates } : s)));
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
              {isEdit ? t('reportTemplates.editorEditTitle') : t('reportTemplates.editorTitle')}
            </Dialog.Title>
            <Dialog.Close className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="rt-name" className="text-sm font-medium text-zinc-300">
                {t('reportTemplates.nameLabel')}
              </label>
              <input
                id="rt-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('reportTemplates.namePlaceholder')}
                className={`${inputBase} ${errors.name ? 'border-red-500' : 'border-zinc-700'}`}
              />
              {errors.name && <p className="text-xs text-red-400">{errors.name}</p>}
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="rt-desc" className="text-sm font-medium text-zinc-300">
                {t('reportTemplates.descriptionLabel')}
              </label>
              <input
                id="rt-desc"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('reportTemplates.descriptionPlaceholder')}
                className={`${inputBase} border-zinc-700`}
              />
            </div>

            {/* Sections */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-zinc-300">
                {t('reportTemplates.sectionsLabel')}
              </label>
              {sections.map((section) => (
                <div
                  key={section.id}
                  className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-800/50 p-3"
                >
                  <GripVertical className="size-4 shrink-0 text-zinc-600" />
                  <select
                    value={section.type}
                    onChange={(e) =>
                      updateSection(section.id, {
                        type: e.target.value as ReportSectionType,
                        title: t(`reportTemplates.section_${e.target.value}`),
                      })
                    }
                    className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-indigo-500"
                  >
                    {SECTION_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {t(`reportTemplates.section_${type}`)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={section.title}
                    onChange={(e) => updateSection(section.id, { title: e.target.value })}
                    className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-indigo-500"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-zinc-400">
                    <input
                      type="checkbox"
                      checked={section.enabled}
                      onChange={(e) => updateSection(section.id, { enabled: e.target.checked })}
                      className="size-3.5 rounded border-zinc-600 bg-zinc-800 text-indigo-500 focus:ring-indigo-500"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeSection(section.id)}
                    aria-label={t('reportTemplates.removeSection')}
                    className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-red-400"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              {errors.sections && <p className="text-xs text-red-400">{errors.sections}</p>}
              <button
                type="button"
                onClick={addSection}
                className="inline-flex items-center gap-1.5 self-start rounded-md px-2.5 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              >
                <Plus className="size-3" />
                {t('reportTemplates.addSection')}
              </button>
            </div>

            {/* Styling */}
            <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-800/30 p-4">
              <p className="text-sm font-medium text-zinc-300">
                {t('reportTemplates.stylingLabel')}
              </p>

              {/* Theme */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-400">
                  {t('reportTemplates.themeLabel')}
                </label>
                <div className="flex gap-2">
                  {THEME_OPTIONS.map((theme) => (
                    <button
                      key={theme}
                      type="button"
                      onClick={() => setStyling({ ...styling, theme })}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        styling.theme === theme
                          ? 'bg-indigo-500/15 text-indigo-300'
                          : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
                      }`}
                    >
                      {t(`reportTemplates.theme_${theme}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Primary Color */}
              <div className="flex items-center gap-3">
                <label htmlFor="rt-color" className="text-xs font-medium text-zinc-400">
                  {t('reportTemplates.primaryColorLabel')}
                </label>
                <input
                  id="rt-color"
                  type="color"
                  value={styling.primaryColor}
                  onChange={(e) => setStyling({ ...styling, primaryColor: e.target.value })}
                  className="size-8 cursor-pointer rounded border border-zinc-700 bg-zinc-800"
                />
                <span className="text-xs font-mono text-zinc-500">{styling.primaryColor}</span>
              </div>

              {/* Company Name */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="rt-company" className="text-xs font-medium text-zinc-400">
                  {t('reportTemplates.companyNameLabel')}
                </label>
                <input
                  id="rt-company"
                  type="text"
                  value={styling.companyName ?? ''}
                  onChange={(e) => setStyling({ ...styling, companyName: e.target.value || undefined })}
                  placeholder={t('reportTemplates.companyNamePlaceholder')}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Footer Text */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="rt-footer" className="text-xs font-medium text-zinc-400">
                  {t('reportTemplates.footerTextLabel')}
                </label>
                <input
                  id="rt-footer"
                  type="text"
                  value={styling.footerText ?? ''}
                  onChange={(e) => setStyling({ ...styling, footerText: e.target.value || undefined })}
                  placeholder={t('reportTemplates.footerTextPlaceholder')}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
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
                {t('common.save')}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
