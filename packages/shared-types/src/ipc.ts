import { z } from 'zod/v4';

export const JsonRpcNotificationSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.enum([
    'step_start',
    'step_complete',
    'log',
    'heartbeat',
    'task_end',
    'error',
  ]),
  params: z.record(z.string(), z.unknown()).optional(),
});

export const JsonRpcControlSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.enum(['pause', 'resume', 'cancel', 'inject_context']),
  params: z.record(z.string(), z.unknown()).optional(),
  id: z.union([z.number().int(), z.string()]),
});

export type JsonRpcNotification = z.infer<typeof JsonRpcNotificationSchema>;
export type JsonRpcControl = z.infer<typeof JsonRpcControlSchema>;
