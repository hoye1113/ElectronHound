import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { IdParam } from '../utils/validation.js';

// ── Types ────────────────────────────────────────────────────────────

interface NotificationConfigRow {
  id: string;
  webhook_urls: string;
  sse_enabled: number;
  event_types: string;
  created_at: string;
  updated_at: string;
}

interface NotificationLogRow {
  id: string;
  event_type: string;
  channel: string;
  target: string | null;
  status: string;
  error: string | null;
  payload: string | null;
  created_at: string;
}

// ── Mappers ──────────────────────────────────────────────────────────

function mapConfig(row: NotificationConfigRow) {
  return {
    id: row.id,
    webhookUrls: JSON.parse(row.webhook_urls) as string[],
    sseEnabled: row.sse_enabled === 1,
    eventTypes: JSON.parse(row.event_types) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLog(row: NotificationLogRow) {
  return {
    id: row.id,
    eventType: row.event_type,
    channel: row.channel,
    target: row.target,
    status: row.status,
    error: row.error,
    payload: row.payload ? JSON.parse(row.payload) : null,
    createdAt: row.created_at,
  };
}

// ── Validation ───────────────────────────────────────────────────────

const UpdateConfigSchema = z.object({
  webhookUrls: z.array(z.string().url()).optional(),
  sseEnabled: z.boolean().optional(),
  eventTypes: z.array(z.string()).optional(),
});

// ── Route ────────────────────────────────────────────────────────────

export async function notificationRoutes(server: FastifyInstance) {
  // GET /notifications/config — Returns the singleton config (creates default if missing)
  server.get('/notifications/config', async (_request, reply) => {
    let row = server.db
      .prepare('SELECT * FROM notification_config LIMIT 1')
      .get() as NotificationConfigRow | undefined;

    if (!row) {
      const id = randomUUID();
      server.db
        .prepare(
          `INSERT INTO notification_config (id, webhook_urls, sse_enabled, event_types)
           VALUES (@id, '[]', 1, '["task.completed","task.failed","batch.completed"]')`
        )
        .run({ id });

      row = server.db
        .prepare('SELECT * FROM notification_config WHERE id = ?')
        .get(id) as NotificationConfigRow;
    }

    return mapConfig(row);
  });

  // PUT /notifications/config — Updates the config
  server.put('/notifications/config', async (request, reply) => {
    const parseResult = UpdateConfigSchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return { error: 'Validation failed', details: parseResult.error.issues };
    }

    const data = parseResult.data;

    // Ensure config exists
    let row = server.db
      .prepare('SELECT * FROM notification_config LIMIT 1')
      .get() as NotificationConfigRow | undefined;

    if (!row) {
      const id = randomUUID();
      server.db
        .prepare(
          `INSERT INTO notification_config (id, webhook_urls, sse_enabled, event_types)
           VALUES (@id, '[]', 1, '["task.completed","task.failed","batch.completed"]')`
        )
        .run({ id });
      row = server.db
        .prepare('SELECT * FROM notification_config WHERE id = ?')
        .get(id) as NotificationConfigRow;
    }

    const updates: string[] = [];
    const params: Record<string, unknown> = { id: row.id };

    if (data.webhookUrls !== undefined) {
      updates.push('webhook_urls = @webhookUrls');
      params.webhookUrls = JSON.stringify(data.webhookUrls);
    }
    if (data.sseEnabled !== undefined) {
      updates.push('sse_enabled = @sseEnabled');
      params.sseEnabled = data.sseEnabled ? 1 : 0;
    }
    if (data.eventTypes !== undefined) {
      updates.push('event_types = @eventTypes');
      params.eventTypes = JSON.stringify(data.eventTypes);
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      server.db
        .prepare(`UPDATE notification_config SET ${updates.join(', ')} WHERE id = @id`)
        .run(params);
    }

    const updated = server.db
      .prepare('SELECT * FROM notification_config WHERE id = ?')
      .get(row.id) as NotificationConfigRow;

    return mapConfig(updated);
  });

  // POST /notifications/test — Sends a test webhook
  server.post('/notifications/test', async (_request, reply) => {
    const row = server.db
      .prepare('SELECT * FROM notification_config LIMIT 1')
      .get() as NotificationConfigRow | undefined;

    if (!row) {
      reply.code(400);
      return { error: 'No notification config found' };
    }

    const webhookUrls = JSON.parse(row.webhook_urls) as string[];

    if (webhookUrls.length === 0) {
      reply.code(400);
      return { error: 'No webhook URLs configured' };
    }

    const targetUrl = webhookUrls[0];
    const logId = randomUUID();
    const payload = {
      type: 'test',
      message: 'This is a test notification from ElectronHound',
      timestamp: new Date().toISOString(),
    };

    let status: 'sent' | 'failed' = 'sent';
    let error: string | null = null;

    try {
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        status = 'failed';
        error = `HTTP ${res.status}: ${res.statusText}`;
      }
    } catch (err: unknown) {
      status = 'failed';
      error = err instanceof Error ? err.message : String(err);
    }

    server.db
      .prepare(
        `INSERT INTO notification_log (id, event_type, channel, target, status, error, payload)
         VALUES (@id, 'test', 'webhook', @target, @status, @error, @payload)`
      )
      .run({
        id: logId,
        target: targetUrl,
        status,
        error,
        payload: JSON.stringify(payload),
      });

    if (status === 'failed') {
      return { success: false, message: `Test failed: ${error}` };
    }

    return { success: true, message: 'Test notification sent successfully' };
  });

  // GET /notifications/history — Returns last 50 notification log entries
  server.get('/notifications/history', async () => {
    const rows = server.db
      .prepare('SELECT * FROM notification_log ORDER BY created_at DESC LIMIT 50')
      .all() as NotificationLogRow[];

    return { data: rows.map(mapLog) };
  });
}
