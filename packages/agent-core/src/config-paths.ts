import { homedir } from 'node:os';
import { join } from 'node:path';

export const CONFIG_DIR = join(homedir(), '.eata');
export const PROVIDERS_FILE = join(CONFIG_DIR, 'providers.json');
export const DASHBOARD_CONFIG_KEY = 'eata-providers';
