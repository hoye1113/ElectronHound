import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import {
  Plus,
  Pencil,
  Trash2,
  Star,
  Eye,
  EyeOff,
  X,
  Check,
  AlertCircle,
  Loader2,
  Zap,
  CircleDot,
  ChevronDown,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LLMProviderConfig {
  id: string;
  name: string;
  type: 'openai-compatible';
  apiKey: string;
  baseURL: string;
  model: string;
  enabled?: boolean;
}

interface ProvidersConfig {
  version: number;
  providers: LLMProviderConfig[];
  activeId: string;
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

interface BuiltinTemplate {
  label: string;
  baseURL: string;
  model: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'eata-providers';
const OLD_STORAGE_KEY = 'eata-settings';

const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  { label: 'OpenAI', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o' },
  { label: 'DeepSeek', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { label: '通义千问 (Qwen)', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { label: 'Groq', baseURL: 'https://api.groq.com/openai/v1', model: 'llama-3.1-70b-versatile' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `provider-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function maskApiKey(key: string): string {
  if (key.length <= 8) return '••••••••';
  return key.slice(0, 4) + '••••' + key.slice(-4);
}

function loadConfig(): ProvidersConfig {
  // Migrate old config
  const oldRaw = localStorage.getItem(OLD_STORAGE_KEY);
  if (oldRaw && !localStorage.getItem(STORAGE_KEY)) {
    try {
      const old = JSON.parse(oldRaw);
      const migrated: ProvidersConfig = {
        version: 1,
        providers: [
          {
            id: 'default',
            name: old.model || 'Default Provider',
            type: 'openai-compatible',
            apiKey: old.apiKey || '',
            baseURL: old.baseUrl || old.baseURL || 'https://api.openai.com/v1',
            model: old.model || 'gpt-4o',
            enabled: true,
          },
        ],
        activeId: 'default',
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      localStorage.removeItem(OLD_STORAGE_KEY);
      return migrated;
    } catch {
      // Ignore migration errors
    }
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // Ignore parse errors
    }
  }

  return { version: 1, providers: [], activeId: '' };
}

function saveConfig(config: ProvidersConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

// ─── Provider Form Dialog ─────────────────────────────────────────────────────

interface ProviderFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: LLMProviderConfig | null; // null = add mode
  onSave: (provider: LLMProviderConfig) => void;
}

function ProviderFormDialog({ open, onOpenChange, provider, onSave }: ProviderFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [baseURL, setBaseURL] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');

  const isEdit = provider !== null;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (provider) {
        setName(provider.name);
        setBaseURL(provider.baseURL);
        setModel(provider.model);
        setApiKey(provider.apiKey);
      } else {
        setName('');
        setBaseURL('');
        setModel('');
        setApiKey('');
        setSelectedTemplate('');
      }
      setShowApiKey(false);
      setErrors({});
    }
  }, [open, provider]);

  const handleTemplateSelect = (templateLabel: string) => {
    const tpl = BUILTIN_TEMPLATES.find(t => t.label === templateLabel);
    if (tpl) {
      setSelectedTemplate(templateLabel);
      setName(tpl.label);
      setBaseURL(tpl.baseURL);
      setModel(tpl.model);
      setApiKey('');
    }
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = t('settings.nameRequired');
    if (!baseURL.trim()) errs.baseURL = t('settings.baseUrlRequired');
    if (!model.trim()) errs.model = t('settings.modelRequired');
    if (!apiKey.trim()) errs.apiKey = t('settings.apiKeyRequired');
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    onSave({
      id: provider?.id ?? generateId(),
      name: name.trim(),
      type: 'openai-compatible',
      apiKey,
      baseURL: baseURL.trim(),
      model: model.trim(),
      enabled: provider?.enabled ?? true,
    });
    onOpenChange(false);
  };

  const inputBase =
    'w-full rounded-lg border bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-zinc-100">
              {isEdit ? t('settings.editTitle') : t('settings.addTitle')}
            </Dialog.Title>
            <Dialog.Close className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
            {/* Template selector (add mode only) */}
            {!isEdit && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-zinc-300">{t('settings.quickTemplate')}</label>
                <Select.Root value={selectedTemplate} onValueChange={handleTemplateSelect}>
                  <Select.Trigger className="inline-flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 outline-none transition-colors focus:ring-1 focus:ring-indigo-500">
                    <Select.Value placeholder={t('settings.templatePlaceholder')} />
                    <Select.Icon>
                      <ChevronDown className="size-4 text-zinc-500" />
                    </Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 shadow-xl z-[100]">
                      <Select.Viewport className="p-1">
                        {BUILTIN_TEMPLATES.map(tpl => (
                          <Select.Item
                            key={tpl.label}
                            value={tpl.label}
                            className="relative flex cursor-pointer items-center rounded-md px-8 py-2 text-sm text-zinc-200 outline-none select-none hover:bg-zinc-800 data-[highlighted]:bg-zinc-800"
                          >
                            <Select.ItemText>{tpl.label}</Select.ItemText>
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
            )}

            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="provider-name" className="text-sm font-medium text-zinc-300">
                {t('settings.nameLabel')}
              </label>
              <input
                id="provider-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('settings.providerNamePlaceholder')}
                className={`${inputBase} ${errors.name ? 'border-red-500' : 'border-zinc-700'}`}
              />
              {errors.name && <p className="text-xs text-red-400">{errors.name}</p>}
            </div>

            {/* Base URL */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="provider-baseURL" className="text-sm font-medium text-zinc-300">
                {t('settings.baseUrlLabel')}
              </label>
              <input
                id="provider-baseURL"
                type="text"
                value={baseURL}
                onChange={e => setBaseURL(e.target.value)}
                placeholder={t('settings.baseUrlPlaceholder')}
                className={`${inputBase} ${errors.baseURL ? 'border-red-500' : 'border-zinc-700'}`}
              />
              {errors.baseURL && <p className="text-xs text-red-400">{errors.baseURL}</p>}
            </div>

            {/* Model */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="provider-model" className="text-sm font-medium text-zinc-300">
                {t('settings.modelLabel')}
              </label>
              <input
                id="provider-model"
                type="text"
                value={model}
                onChange={e => setModel(e.target.value)}
                placeholder={t('settings.modelPlaceholder')}
                className={`${inputBase} ${errors.model ? 'border-red-500' : 'border-zinc-700'}`}
              />
              {errors.model && <p className="text-xs text-red-400">{errors.model}</p>}
            </div>

            {/* API Key */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="provider-apiKey" className="text-sm font-medium text-zinc-300">
                {t('settings.apiKeyLabel')}
              </label>
              <div className="relative">
                <input
                  id="provider-apiKey"
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder={t('settings.apiKeyPlaceholder')}
                  className={`${inputBase} pr-10 ${errors.apiKey ? 'border-red-500' : 'border-zinc-700'}`}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-300"
                  aria-label={showApiKey ? t('settings.hideApiKey') : t('settings.showApiKey')}
                >
                  {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {errors.apiKey && <p className="text-xs text-red-400">{errors.apiKey}</p>}
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
                {isEdit ? t('common.save') : t('settings.addTitle')}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── Delete Confirm Dialog ────────────────────────────────────────────────────

interface DeleteConfirmProps {
  provider: LLMProviderConfig | null;
  isDefault: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmDialog({ provider, isDefault, onConfirm, onCancel }: DeleteConfirmProps) {
  const { t } = useTranslation();

  return (
    <Dialog.Root open={provider !== null} onOpenChange={open => { if (!open) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        >
          <Dialog.Title className="text-lg font-semibold text-zinc-100">{t('settings.deleteTitle')}</Dialog.Title>

          {isDefault ? (
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-400" />
              <p className="text-sm text-amber-200">
                {t('settings.cannotDeleteActive')}
              </p>
            </div>
          ) : (
            <Dialog.Description className="mt-3 text-sm text-zinc-400">
              {t('settings.deleteConfirm', { name: provider?.name })}
              {t('settings.deleteConfirmWarning')}
            </Dialog.Description>
          )}

          <div className="mt-5 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              {t('common.cancel')}
            </button>
            {!isDefault && (
              <button
                type="button"
                onClick={onConfirm}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-500"
              >
                <Trash2 className="size-4" />
                {t('common.delete')}
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── Provider Card ────────────────────────────────────────────────────────────

interface ProviderCardProps {
  provider: LLMProviderConfig;
  isActive: boolean;
  showKey: boolean;
  testStatus: TestStatus;
  onEdit: () => void;
  onDelete: () => void;
  onToggleKey: () => void;
  onTest: () => void;
  onSetActive: () => void;
}

function ProviderCard({
  provider,
  isActive,
  showKey,
  testStatus,
  onEdit,
  onDelete,
  onToggleKey,
  onTest,
  onSetActive,
}: ProviderCardProps) {
  const { t } = useTranslation();

  return (
    <div
      className={`rounded-lg border p-5 transition-colors ${
        isActive
          ? 'border-indigo-500/50 bg-zinc-900 ring-1 ring-indigo-500/20'
          : 'border-zinc-800 bg-zinc-900'
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          {isActive ? (
            <CircleDot className="size-4 shrink-0 text-indigo-400" />
          ) : (
            <div className="size-2 shrink-0 rounded-full bg-zinc-600" />
          )}
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-zinc-100">{provider.name}</h3>
            <span className="inline-block mt-0.5 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 uppercase tracking-wide">
              {provider.type}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onEdit}
            aria-label={t('settings.editProvider', { name: provider.name })}
            className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={t('settings.deleteProvider', { name: provider.name })}
            className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-red-400"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Details */}
      <div className="mt-3 space-y-1.5 pl-6.5">
        <p className="text-xs text-zinc-500">
          <span className="text-zinc-400">Model:</span> {provider.model}
        </p>
        <p className="text-xs text-zinc-500 truncate">
          <span className="text-zinc-400">Base URL:</span> {provider.baseURL}
        </p>
        <div className="flex items-center gap-2">
          <p className="text-xs text-zinc-500">
            <span className="text-zinc-400">API Key:</span>{' '}
            <span className="font-mono">{showKey ? provider.apiKey : maskApiKey(provider.apiKey)}</span>
          </p>
          <button
            type="button"
            onClick={onToggleKey}
            aria-label={showKey ? t('settings.hideApiKey') : t('settings.showApiKey')}
            className="text-zinc-500 transition-colors hover:text-zinc-300"
          >
            {showKey ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2 pl-6.5">
        <button
          type="button"
          onClick={onTest}
          disabled={testStatus === 'testing'}
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            testStatus === 'success'
              ? 'bg-emerald-500/10 text-emerald-400'
              : testStatus === 'error'
                ? 'bg-red-500/10 text-red-400'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
          } disabled:opacity-50`}
          aria-label={t('settings.testProvider', { name: provider.name })}
        >
          {testStatus === 'testing' ? (
            <Loader2 className="size-3 animate-spin" />
          ) : testStatus === 'success' ? (
            <Check className="size-3" />
          ) : testStatus === 'error' ? (
            <AlertCircle className="size-3" />
          ) : (
            <Zap className="size-3" />
          )}
          {testStatus === 'testing' ? t('settings.testing') : testStatus === 'success' ? t('common.ok') : testStatus === 'error' ? t('common.failed') : t('common.test')}
        </button>

        {!isActive && (
          <button
            type="button"
            onClick={onSetActive}
            aria-label={t('settings.setDefaultProvider', { name: provider.name })}
            className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
          >
            <Star className="size-3" />
            {t('settings.setAsDefault')}
          </button>
        )}

        {isActive && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-300">
            <Star className="size-3 fill-current" />
            {t('common.active')}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<ProvidersConfig>({ version: 1, providers: [], activeId: '' });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<LLMProviderConfig | null>(null);
  const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({});
  const [testStatus, setTestStatus] = useState<Record<string, TestStatus>>({});
  const [deleteTarget, setDeleteTarget] = useState<LLMProviderConfig | null>(null);

  // Load config on mount
  useEffect(() => {
    setConfig(loadConfig());
  }, []);

  const persist = useCallback((next: ProvidersConfig) => {
    setConfig(next);
    saveConfig(next);
  }, []);

  // ─── CRUD operations ────────────────────────────────────────────────────────

  const handleAdd = (provider: LLMProviderConfig) => {
    const next: ProvidersConfig = {
      ...config,
      providers: [...config.providers, provider],
      activeId: config.activeId || provider.id, // First provider becomes active
    };
    persist(next);
  };

  const handleUpdate = (provider: LLMProviderConfig) => {
    const next: ProvidersConfig = {
      ...config,
      providers: config.providers.map(p => (p.id === provider.id ? provider : p)),
    };
    persist(next);
  };

  const handleSaveFromDialog = (provider: LLMProviderConfig) => {
    const exists = config.providers.some(p => p.id === provider.id);
    if (exists) {
      handleUpdate(provider);
    } else {
      handleAdd(provider);
    }
    setEditingProvider(null);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.id === config.activeId) return; // Cannot delete active

    const next: ProvidersConfig = {
      ...config,
      providers: config.providers.filter(p => p.id !== deleteTarget.id),
      activeId:
        config.activeId === deleteTarget.id
          ? config.providers.find(p => p.id !== deleteTarget.id)?.id ?? ''
          : config.activeId,
    };
    persist(next);
    setDeleteTarget(null);
  };

  const handleSetActive = (id: string) => {
    persist({ ...config, activeId: id });
  };

  const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

  const handleTest = async (provider: LLMProviderConfig) => {
    setTestStatus(prev => ({ ...prev, [provider.id]: 'testing' }));
    try {
      const res = await fetch(`${API_BASE}/api/providers/${provider.id}/test`, {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
      });
      const data = await res.json();
      setTestStatus(prev => ({
        ...prev,
        [provider.id]: data.success ? 'success' : 'error',
      }));
    } catch {
      setTestStatus(prev => ({ ...prev, [provider.id]: 'error' }));
    }
  };

  const toggleKeyVisibility = (id: string) => {
    setShowApiKeys(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const openAddDialog = () => {
    setEditingProvider(null);
    setDialogOpen(true);
  };

  const openEditDialog = (provider: LLMProviderConfig) => {
    setEditingProvider(provider);
    setDialogOpen(true);
  };

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">{t('settings.title')}</h1>
        <p className="mt-1 text-sm text-zinc-400">{t('settings.subtitle')}</p>
      </div>

      {/* Provider list */}
      <div className="space-y-3">
        {config.providers.length === 0 && (
          <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 p-8 text-center">
            <p className="text-sm text-zinc-500">{t('settings.empty')}</p>
            <p className="mt-1 text-xs text-zinc-600">{t('settings.emptyHint')}</p>
          </div>
        )}

        {config.providers.map(provider => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            isActive={provider.id === config.activeId}
            showKey={!!showApiKeys[provider.id]}
            testStatus={testStatus[provider.id] ?? 'idle'}
            onEdit={() => openEditDialog(provider)}
            onDelete={() => setDeleteTarget(provider)}
            onToggleKey={() => toggleKeyVisibility(provider.id)}
            onTest={() => handleTest(provider)}
            onSetActive={() => handleSetActive(provider.id)}
          />
        ))}
      </div>

      {/* Add button */}
      <button
        type="button"
        onClick={openAddDialog}
        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-dashed border-zinc-700 px-4 py-3 text-sm font-medium text-zinc-400 transition-colors hover:border-indigo-500/50 hover:text-indigo-300 w-full justify-center"
      >
        <Plus className="size-4" />
        {t('settings.addNew')}
      </button>

      {/* Add/Edit Dialog */}
      <ProviderFormDialog
        open={dialogOpen}
        onOpenChange={open => {
          setDialogOpen(open);
          if (!open) setEditingProvider(null);
        }}
        provider={editingProvider}
        onSave={handleSaveFromDialog}
      />

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        provider={deleteTarget}
        isDefault={deleteTarget?.id === config.activeId}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
