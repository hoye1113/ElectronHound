import { z } from 'zod';

export const configSchema = z.object({
  port: z.number().default(3000),
  host: z.string().default('0.0.0.0'),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  databasePath: z.string().default('./data/db.sqlite3'),
  checkpointPath: z.string().default('./data/agent-checkpoints.sqlite3'),
  dataDir: z.string().default('./data'),
  apiKey: z.string().optional(),
  cors: z
    .object({
      origin: z.array(z.string()).default(['http://localhost:5173']),
      credentials: z.boolean().default(true),
    })
    .default({}),
  rateLimit: z
    .object({
      max: z.number().default(100),
      timeWindow: z.string().default('1 minute'),
    })
    .default({}),
  maxConcurrency: z.number().min(1).default(3),
});

export type ServerConfig = z.infer<typeof configSchema>;
