import { getLogger } from '@eata/agent-core/dx';

export interface NotificationPayload {
  event: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp?: string;
}

type SSEBroadcastFn = (event: string, data: Record<string, unknown>) => void;

export class NotificationService {
  private webhookUrl: string | undefined;
  private sseBroadcast: SSEBroadcastFn | null = null;
  private logger = getLogger({ source: 'notificationService' });

  constructor() {
    this.webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL;
  }

  /**
   * Set the SSE broadcast function for real-time notifications.
   */
  setSSEBroadcast(fn: SSEBroadcastFn): void {
    this.sseBroadcast = fn;
  }

  /**
   * Send notification via webhook and SSE.
   */
  async send(payload: NotificationPayload): Promise<void> {
    const timestamp = payload.timestamp ?? new Date().toISOString();
    const fullPayload = { ...payload, timestamp };

    // Send webhook if configured
    if (this.webhookUrl) {
      await this.sendWebhook(fullPayload);
    }

    // Send via SSE
    this.sendSSE(fullPayload);
  }

  /**
   * Send notification to webhook URL.
   */
  private async sendWebhook(payload: NotificationPayload): Promise<void> {
    try {
      const response = await fetch(this.webhookUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        this.logger.warn(`Webhook returned status ${response.status}`);
      }
    } catch (err: unknown) {
      this.logger.error('Webhook notification failed', err instanceof Error ? err : undefined);
    }
  }

  /**
   * Broadcast notification via SSE.
   */
  private sendSSE(payload: NotificationPayload): void {
    if (!this.sseBroadcast) {
      return;
    }

    try {
      this.sseBroadcast('notification', payload as unknown as Record<string, unknown>);
    } catch (err: unknown) {
      this.logger.error('SSE broadcast failed', err instanceof Error ? err : undefined);
    }
  }
}
