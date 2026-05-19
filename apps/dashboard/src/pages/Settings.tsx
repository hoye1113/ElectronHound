import { useState, useEffect } from 'react';
import { Eye, EyeOff, Save, Check } from 'lucide-react';

interface Settings {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const STORAGE_KEY = 'eata-settings';

const defaultSettings: Settings = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o',
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [showApiKey, setShowApiKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setSettings({ ...defaultSettings, ...JSON.parse(stored) });
      } catch {
        // Ignore localStorage parse errors
      }
    }
  }, []);

  const handleChange = (field: keyof Settings) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setSettings(prev => ({ ...prev, [field]: e.target.value }));
    setSaved(false);
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-zinc-400">Configure LLM API settings</p>
      </div>

      <div className="space-y-6 rounded-lg border border-zinc-800 bg-zinc-900 p-6">
        {/* API Key */}
        <div>
          <label htmlFor="apiKey" className="mb-2 block text-sm font-medium text-zinc-300">
            API Key
          </label>
          <div className="relative">
            <input
              id="apiKey"
              type={showApiKey ? 'text' : 'password'}
              value={settings.apiKey}
              onChange={handleChange('apiKey')}
              placeholder="sk-..."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 pr-10 text-sm text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-300"
              aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
            >
              {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-zinc-500">
            Your API key is stored locally in your browser
          </p>
        </div>

        {/* Base URL */}
        <div>
          <label htmlFor="baseUrl" className="mb-2 block text-sm font-medium text-zinc-300">
            Base URL
          </label>
          <input
            id="baseUrl"
            type="text"
            value={settings.baseUrl}
            onChange={handleChange('baseUrl')}
            placeholder="https://api.openai.com/v1"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Model */}
        <div>
          <label htmlFor="model" className="mb-2 block text-sm font-medium text-zinc-300">
            Model
          </label>
          <input
            id="model"
            type="text"
            value={settings.model}
            onChange={handleChange('model')}
            placeholder="gpt-4o"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Save button */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
          >
            {saved ? <Check className="size-4" /> : <Save className="size-4" />}
            {saved ? 'Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
