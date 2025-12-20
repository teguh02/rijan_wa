import { getDatabase } from '../../storage/database';
import { generateId } from '../../utils/crypto';
import type { Event, EventType, InboxMessage } from './types';

export class EventRepository {
  saveEvent(tenantId: string, deviceId: string, type: EventType, payload: any): Event {
    const db = getDatabase();
    const id = generateId();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO event_logs (id, tenant_id, device_id, event_type, payload, received_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, tenantId, deviceId, type, JSON.stringify(payload), now);

    return {
      id,
      tenantId,
      deviceId,
      type,
      payload,
      receivedAt: now,
    };
  }

  getEvents(tenantId: string, deviceId: string, since?: number, eventType?: EventType, limit: number = 100): Event[] {
    const db = getDatabase();
    let query = 'SELECT * FROM event_logs WHERE tenant_id = ? AND device_id = ?';
    const params: any[] = [tenantId, deviceId];

    if (since !== undefined) {
      query += ' AND received_at > ?';
      params.push(since);
    }

    if (eventType !== undefined) {
      query += ' AND event_type = ?';
      params.push(eventType);
    }

    query += ' ORDER BY received_at DESC LIMIT ?';
    params.push(limit);

    const rows = db.prepare(query).all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      tenantId: row.tenant_id,
      deviceId: row.device_id,
      type: row.event_type,
      payload: JSON.parse(row.payload),
      receivedAt: row.received_at,
    }));
  }

  saveInboxMessage(tenantId: string, deviceId: string, jid: string, messageId: string, messageType: string, payload: any): InboxMessage {
    const db = getDatabase();
    const id = generateId();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO messages_inbox (id, tenant_id, device_id, jid, message_id, message_type, payload, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, tenantId, deviceId, jid, messageId, messageType, JSON.stringify(payload), now);

    return {
      id,
      tenantId,
      deviceId,
      jid,
      messageId,
      messageType,
      payload,
      receivedAt: now,
    };
  }

  getInboxMessages(tenantId: string, deviceId: string, since?: number, fromJid?: string, limit: number = 100): InboxMessage[] {
    const db = getDatabase();
    let query = 'SELECT * FROM messages_inbox WHERE tenant_id = ? AND device_id = ?';
    const params: any[] = [tenantId, deviceId];

    if (since !== undefined) {
      query += ' AND received_at > ?';
      params.push(since);
    }

    if (fromJid !== undefined) {
      query += ' AND jid = ?';
      params.push(fromJid);
    }

    query += ' ORDER BY received_at DESC LIMIT ?';
    params.push(limit);

    const rows = db.prepare(query).all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      tenantId: row.tenant_id,
      deviceId: row.device_id,
      jid: row.jid,
      messageId: row.message_id,
      messageType: row.message_type,
      payload: JSON.parse(row.payload),
      receivedAt: row.received_at,
    }));
  }
}

export const eventRepository = new EventRepository();
