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

    const safeJsonParse = (value: any): any => {
      if (typeof value !== 'string') return value;
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    };

    const inferTypeFromBaileys = (baileysMsg: any): MessageType => {
      const msg = baileysMsg?.message;
      if (!msg) return (baileysMsg?.message_type as MessageType) || MessageType.TEXT;

      if (msg.conversation || msg.extendedTextMessage?.text) return MessageType.TEXT;
      if (msg.imageMessage) return MessageType.IMAGE;
      if (msg.videoMessage) return MessageType.VIDEO;
      if (msg.audioMessage) return MessageType.AUDIO;
      if (msg.documentMessage) return MessageType.DOCUMENT;
      if (msg.stickerMessage) return MessageType.STICKER;
      if (msg.locationMessage || msg.liveLocationMessage) return MessageType.LOCATION;
      if (msg.contactMessage || msg.contactsArrayMessage) return MessageType.CONTACT;
      if (msg.reactionMessage) return MessageType.REACTION;
      if (msg.pollCreationMessage || msg.pollUpdateMessage) return MessageType.POLL;

      // fallback
      const dbType = String(baileysMsg?.message_type || '').toLowerCase();
      if (Object.values(MessageType).includes(dbType as MessageType)) return dbType as MessageType;
      return MessageType.TEXT;
    };

    const extractTextAndCaption = (baileysMsg: any): { text?: string; caption?: string } => {
      const msg = baileysMsg?.message;
      if (!msg) return {};
      const text = msg.conversation || msg.extendedTextMessage?.text;
      const caption =
        msg.imageMessage?.caption ||
        msg.videoMessage?.caption ||
        msg.documentMessage?.caption;
      return { text, caption };
    };

    return rows
      .map((row) => {
        const payload = safeJsonParse(row.payload);

        // Newer shape (Baileys WAMessage-ish): { key, message, pushName, messageTimestamp, ... }
        if (payload && payload.key && payload.message) {
          const key = payload.key;
          const fromMe = Boolean(key.fromMe);
          const from = key.participant || key.remoteJid || jid;
          const inferredType = inferTypeFromBaileys(payload);
          const { text, caption } = extractTextAndCaption(payload);

          return {
            id: row.id,
            waMessageId: row.message_id,
            from,
            to: jid,
            type: inferredType,
            text,
            caption,
            mediaUrl: undefined,
            timestamp: row.received_at,
            fromMe,
          } as Message;
        }

        // Legacy/simple normalized shape: { from, to, text, caption, mediaUrl, fromMe }
        if (payload && typeof payload === 'object') {
          const from = payload.from || jid;
          const to = payload.to || jid;
          const fromMe = Boolean(payload.fromMe);
          const dbType = String(row.message_type || '').toLowerCase();
          const type = (Object.values(MessageType).includes(dbType as MessageType)
            ? (dbType as MessageType)
            : MessageType.TEXT);

          return {
            id: row.id,
            waMessageId: row.message_id,
            from,
            to,
            type,
            text: payload.text,
            caption: payload.caption,
            mediaUrl: payload.mediaUrl,
            timestamp: row.received_at,
            fromMe,
          } as Message;
        }

        // If payload is corrupt, still return something useful
        return {
          id: row.id,
          waMessageId: row.message_id,
          from: jid,
          to: jid,
          type: MessageType.TEXT,
          timestamp: row.received_at,
          fromMe: false,
        } as Message;
      })
      .filter(Boolean);
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
