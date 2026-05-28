/**
 * Configuration Wizard for ElectronHound
 *
 * Provides an interactive configuration wizard for setting up
 * LLM providers, API keys, and other settings.
 */

import { createInterface } from 'node:readline';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_DIR, PROVIDERS_FILE } from '../config-paths.js';
import type { LLMProviderConfig, ProvidersConfig } from '../llm-types.js';
import { Spinner } from './progress.js';
import { getLogger } from './logger.js';
import { toErrorMessage } from '../utils/error.js';

// ─── Types ─────────────────────────────────────────────────────────────

export interface WizardOptions {
  interactive?: boolean;
  defaultProvider?: string;
  skipConfirmation?: boolean;
  outputDir?: string;
}

export interface WizardResult {
  success: boolean;
  config?: ProvidersConfig;
  error?: string;
  configPath?: string;
}

interface ProviderTemplate {
  id: string;
  name: string;
  baseURL: string;
  model: string;
  description: string;
}

// ─── Provider Templates ────────────────────────────────────────────────

const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    description: 'OpenAI GPT-4o - Best for complex reasoning tasks',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    description: 'DeepSeek Chat - Cost-effective with good performance',
  },
  {
    id: 'qwen',
    name: 'Qwen (通义千问)',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    description: 'Alibaba Qwen Plus - Good for Chinese language tasks',
  },
  {
    id: 'groq',
    name: 'Groq',
    baseURL: 'https://api.groq.com/openai/v1',
    model: 'llama-3.1-70b-versatile',
    description: 'Groq Llama - Ultra-fast inference',
  },
  {
    id: 'custom',
    name: 'Custom Provider',
    baseURL: '',
    model: '',
    description: 'Configure a custom OpenAI-compatible provider',
  },
];

// ─── Config Wizard Class ───────────────────────────────────────────────

export class ConfigWizard {
  private options: WizardOptions;
  private logger = getLogger({ source: 'config-wizard' });
  private rl: ReturnType<typeof createInterface> | null = null;

  constructor(options?: WizardOptions) {
    this.options = {
      interactive: true,
      skipConfirmation: false,
      ...options,
    };
  }

  /**
   * Run the configuration wizard.
   */
  async run(): Promise<WizardResult> {
    const spinner = new Spinner({ text: 'Initializing configuration wizard...' });
    spinner.start();

    try {
      // Check if config already exists
      if (existsSync(PROVIDERS_FILE) && !this.options.skipConfirmation) {
        spinner.stop();
        const overwrite = await this.confirm(
          'Configuration file already exists. Overwrite?',
        );
        if (!overwrite) {
          return { success: false, error: 'Configuration cancelled by user' };
        }
      }

      spinner.update('Selecting provider...');

      // Select provider template
      const template = await this.selectProvider();
      if (!template) {
        return { success: false, error: 'No provider selected' };
      }

      spinner.update('Configuring provider...');

      // Get API key
      const apiKey = await this.getApiKey(template);
      if (!apiKey) {
        return { success: false, error: 'API key is required' };
      }

      // Get custom settings if needed
      let baseURL = template.baseURL;
      let model = template.model;

      if (template.id === 'custom') {
        baseURL = await this.getInput('Enter base URL (e.g., https://api.example.com/v1)');
        model = await this.getInput('Enter model name (e.g., gpt-4o)');
      }

      // Create provider config
      const provider: LLMProviderConfig = {
        id: `${template.id}-${Date.now()}`,
        name: template.name,
        type: 'openai-compatible',
        apiKey,
        baseURL,
        model,
        enabled: true,
      };

      // Create providers config
      const config: ProvidersConfig = {
        version: 1,
        providers: [provider],
        activeId: provider.id,
      };

      // Save configuration
      spinner.update('Saving configuration...');
      const configPath = this.saveConfig(config);

      spinner.succeed('Configuration saved successfully!');

      // Display summary
      this.displaySummary(config, configPath);

      return {
        success: true,
        config,
        configPath,
      };
    } catch (err: unknown) {
      spinner.fail('Configuration wizard failed');
      const message = toErrorMessage(err);
      this.logger.error('Wizard failed', err instanceof Error ? err : new Error(message));
      return { success: false, error: message };
    } finally {
      this.close();
    }
  }

  /**
   * Quick setup with a specific provider.
   */
  async quickSetup(
    providerId: string,
    apiKey: string,
    baseURL?: string,
    model?: string,
  ): Promise<WizardResult> {
    const template = PROVIDER_TEMPLATES.find((t) => t.id === providerId);
    if (!template) {
      return {
        success: false,
        error: `Unknown provider: ${providerId}. Available: ${PROVIDER_TEMPLATES.map((t) => t.id).join(', ')}`,
      };
    }

    const provider: LLMProviderConfig = {
      id: `${template.id}-${Date.now()}`,
      name: template.name,
      type: 'openai-compatible',
      apiKey,
      baseURL: baseURL ?? template.baseURL,
      model: model ?? template.model,
      enabled: true,
    };

    const config: ProvidersConfig = {
      version: 1,
      providers: [provider],
      activeId: provider.id,
    };

    try {
      const configPath = this.saveConfig(config);
      return { success: true, config, configPath };
    } catch (err: unknown) {
      return {
        success: false,
        error: toErrorMessage(err),
      };
    }
  }

  /**
   * Validate an existing configuration.
   */
  validateConfig(config: ProvidersConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.version || config.version < 1) {
      errors.push('Invalid configuration version');
    }

    if (!Array.isArray(config.providers) || config.providers.length === 0) {
      errors.push('No providers configured');
    }

    for (const provider of config.providers) {
      if (!provider.id) {
        errors.push(`Provider missing ID: ${provider.name}`);
      }
      if (!provider.name) {
        errors.push(`Provider missing name: ${provider.id}`);
      }
      if (!provider.baseURL) {
        errors.push(`Provider missing base URL: ${provider.name}`);
      }
      if (!provider.model) {
        errors.push(`Provider missing model: ${provider.name}`);
      }
    }

    if (config.activeId) {
      const activeExists = config.providers.some((p) => p.id === config.activeId);
      if (!activeExists) {
        errors.push(`Active provider not found: ${config.activeId}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // ─── Private Methods ──────────────────────────────────────────────────

  private async selectProvider(): Promise<ProviderTemplate | null> {
    if (!this.options.interactive) {
      return PROVIDER_TEMPLATES[0]; // Default to OpenAI
    }

    this.displayProviderMenu();
    const choice = await this.getInput('Select provider (1-5)');

    const index = parseInt(choice, 10) - 1;
    if (index < 0 || index >= PROVIDER_TEMPLATES.length) {
      this.logger.warn('Invalid selection, defaulting to OpenAI');
      return PROVIDER_TEMPLATES[0];
    }

    return PROVIDER_TEMPLATES[index];
  }

  private displayProviderMenu(): void {
    console.log('\n=== LLM Provider Selection ===\n');
    PROVIDER_TEMPLATES.forEach((template, index) => {
      console.log(`  ${index + 1}. ${template.name}`);
      console.log(`     ${template.description}`);
      console.log('');
    });
  }

  private async getApiKey(template: ProviderTemplate): Promise<string | null> {
    if (!this.options.interactive) {
      return process.env.OPENAI_API_KEY ?? null;
    }

    const envKey = process.env.OPENAI_API_KEY;
    if (envKey) {
      const useEnv = await this.confirm(
        `Found OPENAI_API_KEY in environment. Use it?`,
      );
      if (useEnv) return envKey;
    }

    const apiKey = await this.getInput(`Enter API key for ${template.name}`);
    return apiKey || null;
  }

  private saveConfig(config: ProvidersConfig): string {
    const configDir = this.options.outputDir ?? CONFIG_DIR;

    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    const configPath = join(configDir, 'providers.json');
    writeFileSync(configPath, JSON.stringify(config, null, 2));

    this.logger.info('Configuration saved', { path: configPath });
    return configPath;
  }

  private displaySummary(config: ProvidersConfig, configPath: string): void {
    console.log('\n=== Configuration Summary ===\n');
    console.log(`  Config path: ${configPath}`);
    console.log(`  Active provider: ${config.providers[0]?.name ?? 'None'}`);
    console.log(`  Model: ${config.providers[0]?.model ?? 'None'}`);
    console.log(`  Base URL: ${config.providers[0]?.baseURL ?? 'None'}`);
    console.log('\nTo modify configuration, run: eata config edit');
    console.log('To add more providers, run: eata provider add\n');
  }

  private async getInput(prompt: string): Promise<string> {
    if (!this.rl) {
      this.rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });
    }

    return new Promise((resolve) => {
      this.rl!.question(`${prompt}: `, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  private async confirm(message: string): Promise<boolean> {
    const answer = await this.getInput(`${message} (y/N)`);
    return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
  }

  private close(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }
}

// ─── Convenience Functions ─────────────────────────────────────────────

/**
 * Run the configuration wizard with default options.
 */
export async function runConfigWizard(options?: WizardOptions): Promise<WizardResult> {
  const wizard = new ConfigWizard(options);
  return wizard.run();
}

/**
 * Quick setup a specific provider without interactive prompts.
 */
export async function quickSetupProvider(
  providerId: string,
  apiKey: string,
  baseURL?: string,
  model?: string,
): Promise<WizardResult> {
  const wizard = new ConfigWizard({ interactive: false });
  return wizard.quickSetup(providerId, apiKey, baseURL, model);
}

/**
 * Get available provider templates.
 */
export function getProviderTemplates(): ProviderTemplate[] {
  return [...PROVIDER_TEMPLATES];
}
