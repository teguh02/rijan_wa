import { getDatabase } from '../../storage/database';
import { generateId } from '../../utils/crypto';
import type { Webhook, WebhookLog, DLQEntry, CreateWebhookRequest, UpdateWebhookRequest } from './types';

export class WebhookRepository {
  create(tenantId: string, req: CreateWebhookRequest): Webhook {
    const db = getDatabase();
    const id = generateId();
    const now = Math.floor(Date.now() / 1000);
    const secret = req.secret || generateId();

    db.prepare(`
      INSERT INTO webhooks (id, tenant_id, url, secret, events, enabled, retry_count, timeout, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      tenantId,
      req.url,
      secret,
      JSON.stringify(req.events),
      1,
      req.retryCount ?? 3,
      req.timeout ?? 5000,
      now,
      now
    );

    return this.getById(id)!;
  }

  getById(webhookId: string): Webhook | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(webhookId) as any;
    if (!row) return null;

    return {
      id: row.id,
      tenantId: row.tenant_id,
      url: row.url,
      secret: row.secret,
      events: JSON.parse(row.events),
      enabled: row.enabled === 1,
      retryCount: row.retry_count,
      timeout: row.timeout,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  getByTenantId(tenantId: string): Webhook[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM webhooks WHERE tenant_id = ? AND enabled = 1').all(tenantId) as any[];

    return rows.map(row => ({
      id: row.id,
      tenantId: row.tenant_id,
      url: row.url,
      secret: row.secret,
      events: JSON.parse(row.events),
      enabled: row.enabled === 1,
      retryCount: row.retry_count,
      timeout: row.timeout,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  update(webhookId: string, req: UpdateWebhookRequest): Webhook {
    const db = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    const updates: string[] = [];
    const values: any[] = [];

    if (req.url !== undefined) {
      updates.push('url = ?');
      values.push(req.url);
    }
    if (req.events !== undefined) {
      updates.push('events = ?');
      values.push(JSON.stringify(req.events));
    }
    if (req.secret !== undefined) {
      updates.push('secret = ?');
      values.push(req.secret);
    }
    if (req.enabled !== undefined) {
      updates.push('enabled = ?');
      values.push(req.enabled ? 1 : 0);
    }
    if (req.retryCount !== undefined) {
      updates.push('retry_count = ?');
      values.push(req.retryCount);
    }
    if (req.timeout !== undefined) {
      updates.push('timeout = ?');
      values.push(req.timeout);
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      values.push(now);
      values.push(webhookId);

      db.prepare(`UPDATE webhooks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    return this.getById(webhookId)!;
  }

  delete(webhookId: string): void {
    const db = getDatabase();
    db.prepare('DELETE FROM webhooks WHERE id = ?').run(webhookId);
  }

  logDelivery(webhookId: string, eventId: string, statusCode: number | null, error: string | null, attempts: number = 1): WebhookLog {
    const db = getDatabase();
    const id = generateId();
    const sentAt = statusCode && statusCode < 400 ? Math.floor(Date.now() / 1000) : null;

    db.prepare(`
      INSERT INTO webhook_logs (id, webhook_id, event_id, status_code, attempts, last_error, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, webhookId, eventId, statusCode, attempts, error, sentAt);

    return {
      id,
      webhookId,
      eventId,
      statusCode,
      attempts,
      lastError: error,
      sentAt,
    };
  }

  addToDLQ(webhookId: string, eventPayload: any, reason: string): DLQEntry {
    const db = getDatabase();
    const id = generateId();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO dlq (id, webhook_id, event_payload, reason, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, webhookId, JSON.stringify(eventPayload), reason, now);

    return {
      id,
      webhookId,
      eventPayload,
      reason,
      createdAt: now,
    };
  }

  getDLQEntries(webhookId: string, limit: number = 100): DLQEntry[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM dlq 
      WHERE webhook_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(webhookId, limit) as any[];

    return rows.map(row => ({
      id: row.id,
      webhookId: row.webhook_id,
      eventPayload: JSON.parse(row.event_payload),
      reason: row.reason,
      createdAt: row.created_at,
    }));
  }

  deleteDLQEntry(dlqId: string): void {
    const db = getDatabase();
    db.prepare('DELETE FROM dlq WHERE id = ?').run(dlqId);
  }
}

export const webhookRepository = new WebhookRepository();
