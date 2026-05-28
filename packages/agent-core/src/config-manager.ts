import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { CONFIG_DIR, PROVIDERS_FILE } from './config-paths.js';
import type { LLMProviderConfig, ProvidersConfig } from './llm-types.js';

const ENCRYPTION_ALGO = 'aes-256-cbc';
const ENCRYPTION_KEY = scryptSync('eata-provider-key', 'eata-salt', 32);

function encryptApiKey(plain: string): string {
  if (!plain) return '';
  const iv = randomBytes(16);
  const cipher = createCipheriv(ENCRYPTION_ALGO, ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `enc:${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptApiKey(cipher: string): string {
  if (!cipher || !cipher.startsWith('enc:')) return cipher;
  const parts = cipher.split(':');
  if (parts.length !== 3) return cipher;
  const iv = Buffer.from(parts[1], 'hex');
  const encrypted = Buffer.from(parts[2], 'hex');
  const decipher = createDecipheriv(ENCRYPTION_ALGO, ENCRYPTION_KEY, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

const DEFAULT_PROVIDERS: ProvidersConfig = {
  version: 1,
  providers: [
    {
      id: 'openai-default',
      name: 'OpenAI GPT-4o',
      type: 'openai-compatible',
      apiKey: '',
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      enabled: true,
    },
    {
      id: 'deepseek-default',
      name: 'DeepSeek Chat',
      type: 'openai-compatible',
      apiKey: '',
      baseURL: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      enabled: true,
    },
    {
      id: 'qwen-default',
      name: '通义千问 Plus',
      type: 'openai-compatible',
      apiKey: '',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen-plus',
      enabled: true,
    },
  ],
  activeId: 'openai-default',
};

function decryptConfig(config: ProvidersConfig): ProvidersConfig {
  return {
    ...config,
    providers: config.providers.map((p) => ({
      ...p,
      apiKey: decryptApiKey(p.apiKey),
    })),
  };
}

function encryptConfig(config: ProvidersConfig): ProvidersConfig {
  return {
    ...config,
    providers: config.providers.map((p) => ({
      ...p,
      apiKey: p.apiKey.startsWith('enc:') ? p.apiKey : encryptApiKey(p.apiKey),
    })),
  };
}

export function loadProvidersConfig(): ProvidersConfig {
  if (!existsSync(PROVIDERS_FILE)) {
    return DEFAULT_PROVIDERS;
  }
  try {
    const content = readFileSync(PROVIDERS_FILE, 'utf-8');
    const raw = JSON.parse(content) as ProvidersConfig;
    return decryptConfig(raw);
  } catch (err: unknown) {
    console.warn(`Failed to parse providers.json: ${err instanceof Error ? err.message : String(err)}. Using defaults.`);
    return DEFAULT_PROVIDERS;
  }
}

export function saveProvidersConfig(config: ProvidersConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  const encrypted = encryptConfig(config);
  writeFileSync(PROVIDERS_FILE, JSON.stringify(encrypted, null, 2));
}

export function addProvider(config: LLMProviderConfig): ProvidersConfig {
  const current = loadProvidersConfig();
  const newConfig: ProvidersConfig = {
    ...current,
    providers: [...current.providers, config],
  };
  saveProvidersConfig(newConfig);
  return newConfig;
}

export function updateProvider(id: string, updates: Partial<LLMProviderConfig>): ProvidersConfig | null {
  const current = loadProvidersConfig();
  const index = current.providers.findIndex(p => p.id === id);
  if (index === -1) return null;
  
  const updated = [...current.providers];
  updated[index] = { ...updated[index], ...updates };
  const newConfig: ProvidersConfig = { ...current, providers: updated };
  saveProvidersConfig(newConfig);
  return newConfig;
}

export function deleteProvider(id: string): ProvidersConfig | null {
  const current = loadProvidersConfig();
  const providers = current.providers.filter(p => p.id !== id);
  if (providers.length === current.providers.length) return null;
  
  const activeId = current.activeId === id ? providers[0]?.id || '' : current.activeId;
  const newConfig: ProvidersConfig = { ...current, providers, activeId };
  saveProvidersConfig(newConfig);
  return newConfig;
}

export function setActiveProvider(id: string): ProvidersConfig | null {
  const current = loadProvidersConfig();
  const exists = current.providers.some(p => p.id === id);
  if (!exists) return null;
  
  const newConfig: ProvidersConfig = { ...current, activeId: id };
  saveProvidersConfig(newConfig);
  return newConfig;
}

export function getActiveProviderConfig(): LLMProviderConfig | null {
  const current = loadProvidersConfig();
  return current.providers.find(p => p.id === current.activeId) || null;
}
