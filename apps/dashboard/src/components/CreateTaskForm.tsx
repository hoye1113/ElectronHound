import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, X, Plus } from 'lucide-react';
import { CreateTaskRequestSchema } from '@eata/shared-types';
import type { CreateTaskRequest } from '@eata/shared-types';
import { useTaskStore } from '../stores/taskStore';

const LLM_MODELS = ['gpt-4o', 'gpt-4o-mini', 'claude-3.5-sonnet'] as const;

interface CreateTaskFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function CreateTaskForm({ open, onOpenChange, onSuccess }: CreateTaskFormProps) {
  const createTask = useTaskStore((s) => s.createTask);
  const [goal, setGoal] = useState('');
  const [targetAppPath, setTargetAppPath] = useState('');
  const [llmModel, setLlmModel] = useState<string>('gpt-4o');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setGoal('');
    setTargetAppPath('');
    setLlmModel('gpt-4o');
    setErrors({});
  };

  const validate = (): CreateTaskRequest | null => {
    const result = CreateTaskRequestSchema.safeParse({
      goal,
      targetAppPath,
      llmModel,
    });

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join('.') || 'form';
        fieldErrors[path] = issue.message;
      }
      setErrors(fieldErrors);
      return null;
    }

    setErrors({});
    return result.data;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = validate();
    if (!data) return;

    setSubmitting(true);
    try {
      await createTask(data);
      reset();
      onOpenChange(false);
      onSuccess?.();
    } catch {
      setErrors({ form: 'Failed to create task. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  // Reset form when dialog is closed (handles controlled open prop changes)
  useEffect(() => {
    if (!open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-zinc-100">New Task</Dialog.Title>
            <Dialog.Close className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
            {/* Goal */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="goal" className="text-sm font-medium text-zinc-300">
                Goal
              </label>
              <textarea
                id="goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="What should the AI agent accomplish?"
                rows={3}
                className={`rounded-lg border bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:ring-1 focus:ring-indigo-500 ${
                  errors.goal ? 'border-red-500' : 'border-zinc-700'
                }`}
              />
              {errors.goal && <p className="text-xs text-red-400">{errors.goal}</p>}
            </div>

            {/* Target App Path */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="targetAppPath" className="text-sm font-medium text-zinc-300">
                Target App Path
              </label>
              <input
                id="targetAppPath"
                type="text"
                value={targetAppPath}
                onChange={(e) => setTargetAppPath(e.target.value)}
                placeholder="/path/to/electron/app"
                className={`rounded-lg border bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:ring-1 focus:ring-indigo-500 ${
                  errors.targetAppPath ? 'border-red-500' : 'border-zinc-700'
                }`}
              />
              {errors.targetAppPath && <p className="text-xs text-red-400">{errors.targetAppPath}</p>}
            </div>

            {/* LLM Model */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-300">LLM Model</label>
              <Select.Root value={llmModel} onValueChange={setLlmModel}>
                <Select.Trigger
                  className={`inline-flex items-center justify-between rounded-lg border bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors focus:ring-1 focus:ring-indigo-500 ${
                    errors.llmModel ? 'border-red-500' : 'border-zinc-700'
                  }`}
                >
                  <Select.Value />
                  <Select.Icon>
                    <ChevronDown className="size-4 text-zinc-500" />
                  </Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 shadow-xl">
                    <Select.Viewport className="p-1">
                      {LLM_MODELS.map((model) => (
                        <Select.Item
                          key={model}
                          value={model}
                          className="relative flex cursor-pointer items-center rounded-md px-8 py-2 text-sm text-zinc-200 outline-none select-none hover:bg-zinc-800 data-[highlighted]:bg-zinc-800"
                        >
                          <Select.ItemText>{model}</Select.ItemText>
                          <Select.ItemIndicator className="absolute left-2">
                            <Check className="size-3.5 text-indigo-400" />
                          </Select.ItemIndicator>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
              {errors.llmModel && <p className="text-xs text-red-400">{errors.llmModel}</p>}
            </div>

            {/* Form error */}
            {errors.form && <p className="text-xs text-red-400">{errors.form}</p>}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="size-4" />
              {submitting ? 'Creating...' : 'Create Task'}
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
