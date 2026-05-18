import { z } from 'zod';

export const configSchema = z.object({
  port: z.number().default(3000),
  host: z.string().default('0.0.0.0'),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  databasePath: z.string().default('./data/db.sqlite3'),
  checkpointPath: z.string().default('./data/agent-checkpoints.sqlite3'),
  dataDir: z.string().default('./data'),
});

export type ServerConfig = z.infer<typeof configSchema>;
