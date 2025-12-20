import { getDatabase } from '../../storage/database';
import { generateId } from '../../utils/crypto';
import { MessageType, MessageStatus } from './types';

export interface OutboxMessage {
  id: string;
  tenant_id: string;
  device_id: string;
  jid: string;
  message_type: MessageType;
  payload: string; // JSON
  status: MessageStatus;
  retries: number;
  error_message?: string;
  idempotency_key?: string;
  wa_message_id?: string;
  created_at: number;
    updated_at: number;
  sent_at?: number;
}

export class MessageRepository {
  private db = getDatabase();

  /**
   * Add message to outbox
   */
  addToOutbox(message: Omit<OutboxMessage, 'id' | 'created_at' | 'updated_at'>): OutboxMessage {
    const id = generateId('msg');
    const now = Math.floor(Date.now() / 1000);

    const stmt = this.db.prepare(`
      INSERT INTO messages_outbox 
      (id, tenant_id, device_id, jid, message_type, payload, status, retries, error_message, idempotency_key, wa_message_id, created_at, updated_at, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      message.tenant_id,
      message.device_id,
      message.jid,
      message.message_type,
      message.payload,
      message.status,
      message.retries,
      message.error_message || null,
      message.idempotency_key || null,
      message.wa_message_id || null,
      now,
        now,
      message.sent_at || null
    );

    return {
      id,
      ...message,
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * Get message by ID
   */
  getById(id: string): OutboxMessage | null {
    const stmt = this.db.prepare(`
      SELECT * FROM messages_outbox WHERE id = ?
    `);

    return stmt.get(id) as OutboxMessage | null;
  }

  /**
   * Get message by idempotency key
   */
  getByIdempotencyKey(deviceId: string, idempotencyKey: string): OutboxMessage | null {
    const stmt = this.db.prepare(`
      SELECT * FROM messages_outbox 
      WHERE device_id = ? AND idempotency_key = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);

    return stmt.get(deviceId, idempotencyKey) as OutboxMessage | null;
  }

  /**
   * Get pending messages for processing
   */
  getPendingMessages(limit = 100): OutboxMessage[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages_outbox 
      WHERE status IN ('pending', 'queued')
      AND retries < 5
      ORDER BY created_at ASC
      LIMIT ?
    `);

    return stmt.all(limit) as OutboxMessage[];
  }

  /**
   * Update message status
   */
  updateStatus(
    id: string,
    status: MessageStatus,
    waMessageId?: string,
    error?: string
  ): void {
    const now = Math.floor(Date.now() / 1000);
    const sentAt = status === MessageStatus.SENT ? now : null;

    const stmt = this.db.prepare(`
      UPDATE messages_outbox 
      SET status = ?, 
          wa_message_id = COALESCE(?, wa_message_id),
          error_message = ?,
                    updated_at = ?,
          sent_at = COALESCE(?, sent_at)
      WHERE id = ?
    `);

    stmt.run(status, waMessageId || null, error || null, now, sentAt, id);
  }

  /**
   * Increment retry count
   */
  incrementRetry(id: string): void {
      const now = Math.floor(Date.now() / 1000);

    const stmt = this.db.prepare(`
      UPDATE messages_outbox 
        SET retries = retries + 1,
          updated_at = ?
      WHERE id = ?
    `);

    stmt.run(now, id);
  }

  /**
   * Save incoming message
   */
  saveIncomingMessage(message: {
    tenant_id: string;
    device_id: string;
    jid: string;
    message_id: string;
    message_type: MessageType;
    payload: string;
  }): string {
    const id = generateId('inmsg');
    const now = Math.floor(Date.now() / 1000);

    const stmt = this.db.prepare(`
      INSERT INTO messages_inbox 
      (id, tenant_id, device_id, jid, message_id, message_type, payload, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      message.tenant_id,
      message.device_id,
      message.jid,
      message.message_id,
      message.message_type,
      message.payload,
      now
    );

    return id;
  }

  /**
   * Get messages by device and JID
   */
  getMessagesByJid(
    deviceId: string,
    jid: string,
    limit = 50,
    offset = 0
  ): Message[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages_inbox 
      WHERE device_id = ? AND jid = ?
      ORDER BY received_at DESC
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(deviceId, jid, limit, offset) as any[];
    
    return rows.map(row => {
      const payload = JSON.parse(row.payload);
      return {
        id: row.id,
        waMessageId: row.message_id,
        from: payload.from || jid,
        to: payload.to || '',
        type: row.message_type,
        text: payload.text,
        caption: payload.caption,
        mediaUrl: payload.mediaUrl,
        timestamp: row.received_at,
        fromMe: payload.fromMe || false,
      };
    });
  }
}

interface Message {
  id: string;
  waMessageId: string;
  from: string;
  to: string;
  type: MessageType;
  text?: string;
  caption?: string;
  mediaUrl?: string;
  timestamp: number;
  fromMe: boolean;
  status?: MessageStatus;
}
