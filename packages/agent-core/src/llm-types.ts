/**
 * EATA v0.3: Multi-Provider LLM Configuration (OpenAI-Compatible Only)
 *
 * 所有 OpenAI 兼容供应商统一使用 createOpenAI()，仅通过 baseURL 区分。
 */

export type LLMProviderType = 'openai-compatible';

export interface LLMProviderConfig {
  id: string;
  name: string;
  type: LLMProviderType;
  apiKey: string;
  baseURL: string;
  model: string;
  enabled?: boolean;
  /** When false, omit response_format json_object (for models that don't support it well). Defaults to true. */
  jsonMode?: boolean;
}

export interface ProvidersConfig {
  version: number;
  providers: LLMProviderConfig[];
  activeId: string;
  taskLevel?: {
    [taskId: string]: string;
  };
}

export const BUILTIN_TEMPLATES: LLMProviderConfig[] = [
  {
    id: 'openai-template',
    name: 'OpenAI',
    type: 'openai-compatible',
    apiKey: 'sk-',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    enabled: true,
  },
  {
    id: 'deepseek-template',
    name: 'DeepSeek',
    type: 'openai-compatible',
    apiKey: 'sk-',
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    enabled: true,
  },
  {
    id: 'qwen-template',
    name: '通义千问 (Qwen)',
    type: 'openai-compatible',
    apiKey: 'sk-',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    enabled: true,
  },
  {
    id: 'groq-template',
    name: 'Groq',
    type: 'openai-compatible',
    apiKey: 'gsk_',
    baseURL: 'https://api.groq.com/openai/v1',
    model: 'llama-3.1-70b-versatile',
    enabled: true,
  },
  {
    id: 'minimax-template',
    name: 'MiniMax',
    type: 'openai-compatible',
    apiKey: 'sk-',
    baseURL: 'https://api.minimaxi.com/v1',
    model: 'MiniMax-M2.7',
    enabled: true,
    jsonMode: false,
  },
];
