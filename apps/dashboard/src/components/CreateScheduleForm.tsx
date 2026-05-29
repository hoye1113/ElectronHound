import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Check } from 'lucide-react';
import type { Schedule, Template } from '../lib/api';
import { api } from '../lib/api';

interface CreateScheduleFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: Schedule | null;
  onSuccess: () => void;
}

export default function CreateScheduleForm({ open, onOpenChange, schedule, onSuccess }: CreateScheduleFormProps) {
  const { t } = useTranslation();
  const isEdit = schedule !== null;

  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [cronExpression, setCronExpression] = useState('0 9 * * *');
  const [enabled, setEnabled] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      api.templates.list().then((res) => setTemplates(res.data ?? [])).catch(() => {});
      if (schedule) {
        setName(schedule.name);
        setTemplateId(schedule.templateId);
        setCronExpression(schedule.cronExpression);
        setEnabled(schedule.enabled);
      } else {
        setName('');
        setTemplateId('');
        setCronExpression('0 9 * * *');
        setEnabled(true);
      }
      setErrors({});
    }
  }, [open, schedule]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = t('scheduleForm.nameRequired');
    if (!templateId) errs.templateId = t('scheduleForm.templateRequired');
    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length !== 5) errs.cron = t('scheduleForm.cronInvalid');
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      if (isEdit) {
        await api.schedules.update(schedule.id, { name: name.trim(), templateId, cronExpression: cronExpression.trim(), enabled });
      } else {
        await api.schedules.create({ name: name.trim(), templateId, cronExpression: cronExpression.trim(), enabled });
      }
      onSuccess();
      onOpenChange(false);
    } catch {
      // submit failed
    } finally {
      setSubmitting(false);
    }
  };

  const inputBase = 'w-full rounded-lg border bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-zinc-100">
              {isEdit ? t('scheduleForm.editTitle') : t('scheduleForm.createTitle')}
            </Dialog.Title>
            <Dialog.Close className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="sch-name" className="text-sm font-medium text-zinc-300">{t('scheduleForm.nameLabel')}</label>
              <input id="sch-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('scheduleForm.namePlaceholder')} className={`${inputBase} ${errors.name ? 'border-red-500' : 'border-zinc-700'}`} />
              {errors.name && <p className="text-xs text-red-400">{errors.name}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="sch-template" className="text-sm font-medium text-zinc-300">{t('scheduleForm.templateLabel')}</label>
              <select id="sch-template" value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={`${inputBase} ${errors.templateId ? 'border-red-500' : 'border-zinc-700'}`}>
                <option value="">{t('scheduleForm.templatePlaceholder')}</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                ))}
              </select>
              {errors.templateId && <p className="text-xs text-red-400">{errors.templateId}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="sch-cron" className="text-sm font-medium text-zinc-300">{t('scheduleForm.cronLabel')}</label>
              <input id="sch-cron" type="text" value={cronExpression} onChange={(e) => setCronExpression(e.target.value)} placeholder="0 9 * * *" className={`${inputBase} font-mono ${errors.cron ? 'border-red-500' : 'border-zinc-700'}`} />
              <p className="text-[10px] text-zinc-500">{t('scheduleForm.cronHint')}</p>
              {errors.cron && <p className="text-xs text-red-400">{errors.cron}</p>}
            </div>

            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-4 rounded border-zinc-600 bg-zinc-800 text-indigo-500 focus:ring-indigo-500" />
              {t('scheduleForm.enabledLabel')}
            </label>

            <div className="mt-2 flex items-center justify-end gap-3">
              <button type="button" onClick={() => onOpenChange(false)} className="rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800">
                {t('common.cancel')}
              </button>
              <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
                <Check className="size-4" />
                {submitting ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
