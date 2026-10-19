import { config } from '../config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Attempts external delivery of a notification (webhook sink).
 * - In-app channel is always "delivered".
 * - If NOTIFICATION_WEBHOOK_URL is not configured, the webhook channel is
 *   recorded as 'skipped' (explicit, auditable — not silently dropped).
 * - If configured, it tries up to 2 attempts with backoff; failures are
 *   recorded with attempts count and last error. NEVER throws.
 */
export async function deliverNotification(notification) {
  const deliveries = [{ channel: 'in-app', status: 'delivered', attempts: 1, at: new Date() }];

  if (!config.notificationWebhookUrl) {
    deliveries.push({ channel: 'webhook', status: 'skipped', attempts: 0, lastError: 'NOTIFICATION_WEBHOOK_URL not configured', at: new Date() });
  } else {
    let attempts = 0;
    let lastError = null;
    let delivered = false;
    const payload = {
      id: String(notification._id),
      type: notification.type,
      severity: notification.severity,
      title: notification.title,
      message: notification.message,
      targetRoles: notification.targetRoles,
      targetUser: notification.targetUser ? String(notification.targetUser) : undefined,
      createdAt: notification.createdAt,
    };
    for (let i = 0; i < 2 && !delivered; i++) {
      attempts++;
      if (i > 0) await sleep(1500); // backoff before retry
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 5000);
        const resp = await fetch(config.notificationWebhookUrl, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).finally(() => clearTimeout(t));
        if (resp.ok) delivered = true;
        else lastError = `HTTP ${resp.status}`;
      } catch (err) {
        lastError = err.name === 'AbortError' ? 'timeout (5s)' : err.message;
      }
    }
    deliveries.push({
      channel: 'webhook',
      status: delivered ? 'delivered' : 'failed',
      attempts,
      lastError: delivered ? undefined : lastError,
      at: new Date(),
    });
  }

  try {
    notification.delivery = deliveries;
    await notification.save();
  } catch (err) {
    console.error('[delivery] failed to record delivery status:', err.message);
  }
  return deliveries;
}
