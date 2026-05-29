import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NotificationService } from '../services/notificationService.js';

describe('NotificationService', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NOTIFICATION_WEBHOOK_URL;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.NOTIFICATION_WEBHOOK_URL = originalEnv;
    } else {
      delete process.env.NOTIFICATION_WEBHOOK_URL;
    }
    vi.restoreAllMocks();
  });

  it('sends webhook when NOTIFICATION_WEBHOOK_URL is set', async () => {
    process.env.NOTIFICATION_WEBHOOK_URL = 'https://example.com/webhook';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 })
    );

    const service = new NotificationService();
    await service.send({
      event: 'schedule.completed',
      title: 'Test Notification',
      message: 'Schedule executed successfully',
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com/webhook',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(body.event).toBe('schedule.completed');
    expect(body.title).toBe('Test Notification');
    expect(body.message).toBe('Schedule executed successfully');
    expect(body.timestamp).toBeDefined();
  });

  it('skips webhook when NOTIFICATION_WEBHOOK_URL is not set', async () => {
    delete process.env.NOTIFICATION_WEBHOOK_URL;

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const service = new NotificationService();
    await service.send({
      event: 'schedule.completed',
      title: 'Test',
      message: 'Should not webhook',
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('broadcasts via SSE when broadcast function is set', async () => {
    delete process.env.NOTIFICATION_WEBHOOK_URL;

    const broadcastFn = vi.fn();
    const service = new NotificationService();
    service.setSSEBroadcast(broadcastFn);

    await service.send({
      event: 'schedule.completed',
      title: 'SSE Test',
      message: 'Broadcasting via SSE',
      data: { scheduleId: 'test-123' },
    });

    expect(broadcastFn).toHaveBeenCalledOnce();
    expect(broadcastFn).toHaveBeenCalledWith(
      'notification',
      expect.objectContaining({
        event: 'schedule.completed',
        title: 'SSE Test',
        message: 'Broadcasting via SSE',
        data: { scheduleId: 'test-123' },
      })
    );
  });
});
