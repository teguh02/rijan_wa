import crypto from 'crypto';
import axios from 'axios';
import { webhookRepository } from './repository.js';
import logger from '../../utils/logger.js';
import type { Webhook, WebhookPayload, WebhookEvent } from './types.js';

const WEBHOOK_TIMEOUT = 5000;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [1000, 5000, 15000]; // exponential backoff in ms

export class WebhookService {
  /**
   * Sign webhook payload with HMAC-SHA256
   */
  static signPayload(payload: WebhookPayload, secret: string): string {
    const body = JSON.stringify(payload);
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
  }

  /**
   * Get webhooks interested in an event
   */
  getInterested(tenantId: string, eventType: WebhookEvent): Webhook[] {
    const webhooks = webhookRepository.getByTenantId(tenantId);
    const statusAliasTargets: WebhookEvent[] = ['message.updated', 'receipt.delivery', 'receipt.read'];

    return webhooks.filter((w) => {
      if (w.events.includes(eventType)) return true;
      // Backward-compatible alias: `message.status` receives delivery/read/update status events.
      if (w.events.includes('message.status') && statusAliasTargets.includes(eventType)) return true;
      return false;
    });
  }

  /**
   * Queue webhook delivery
   */
  async queueDelivery(payload: WebhookPayload): Promise<void> {
    const interested = this.getInterested(payload.tenantId, payload.eventType);

    for (const webhook of interested) {
      try {
        await this.deliverWithRetry(webhook, payload);
      } catch (error) {
        logger.error({ error, webhookId: webhook.id }, 'Webhook delivery failed after max retries');
        // Move to DLQ
        webhookRepository.addToDLQ(webhook.id, payload, error instanceof Error ? error.message : 'Unknown error');
      }
    }
  }

  /**
   * Deliver webhook with retry logic
   */
  private async deliverWithRetry(webhook: Webhook, payload: WebhookPayload, attempt: number = 0): Promise<void> {
    const signature = WebhookService.signPayload(payload, webhook.secret);

    try {
      const response = await axios.post(webhook.url, payload, {
        timeout: webhook.timeout || WEBHOOK_TIMEOUT,
        headers: {
          'X-Rijan-Signature': signature,
          'X-Rijan-Attempt': String(attempt + 1),
        },
        validateStatus: () => true, // Don't throw on any status
      });

      webhookRepository.logDelivery(webhook.id, payload.id, response.status, null, attempt + 1);

      if (response.status >= 200 && response.status < 300) {
        logger.info({ webhookId: webhook.id, eventId: payload.id }, 'Webhook delivered');
      } else if (response.status >= 500 || response.status === 429) {
        // Retry on server errors and rate limits
        if (attempt < (webhook.retryCount || MAX_RETRIES) - 1) {
          const delay = RETRY_BACKOFF_MS[attempt] || RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
          logger.warn({ webhookId: webhook.id, status: response.status, attempt }, 'Webhook failed, retrying...');
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.deliverWithRetry(webhook, payload, attempt + 1);
        } else {
          throw new Error(`Webhook failed with status ${response.status} after max retries`);
        }
      } else {
        // Don't retry on client errors
        logger.warn({ webhookId: webhook.id, status: response.status }, 'Webhook rejected with client error');
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
        // Timeout
        if (attempt < (webhook.retryCount || MAX_RETRIES) - 1) {
          const delay = RETRY_BACKOFF_MS[attempt] || RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
          logger.warn({ webhookId: webhook.id, attempt }, 'Webhook timeout, retrying...');
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.deliverWithRetry(webhook, payload, attempt + 1);
        }
      }

      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      webhookRepository.logDelivery(webhook.id, payload.id, null, errorMsg, attempt + 1);

      if (attempt < (webhook.retryCount || MAX_RETRIES) - 1) {
        const delay = RETRY_BACKOFF_MS[attempt] || RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
        logger.warn({ webhookId: webhook.id, error: errorMsg, attempt }, 'Webhook delivery error, retrying...');
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.deliverWithRetry(webhook, payload, attempt + 1);
      } else {
        throw error;
      }
    }
  }
}

// Export singleton instance
export const webhookService = new WebhookService();
