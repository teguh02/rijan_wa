import logger from '../utils/logger.js';
import { getDatabase } from '../storage/database.js';
import { eventRepository } from '../modules/events/repository.js';

/**
 * InboundMessageMonitor
 *
 * Tujuan:
 * - Memantau event inbound (`messages.upsert`) yang sudah tersimpan di `event_logs`.
 * - Memastikan message tersebut juga masuk ke `messages_inbox` (eventual consistency).
 *
 * Kenapa perlu:
 * - Saat runtime sibuk / DB lock / error transient, handler realtime bisa gagal insert inbox.
 * - Worker ini melakukan pengecekan & upsert ulang secara kontinyu.
 */
export class InboundMessageMonitor {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  // Cursor sederhana berbasis timestamp (detik)
  private lastProcessedAtSec: number | null = null;

  start(intervalMs = 1000, lookbackSec = 600) {
    if (this.timer) return;

    const nowSec = Math.floor(Date.now() / 1000);
    this.lastProcessedAtSec = nowSec - lookbackSec;

    this.timer = setInterval(() => this.tick(), intervalMs);
    logger.info({ intervalMs, lookbackSec }, 'Inbound message monitor started');
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info('Inbound message monitor stopped');
  }

  private normalizeInboxJid(payload: any): string {
    const remoteJidRaw = payload?.key?.remoteJid || 'unknown';
    const senderPn = payload?.key?.senderPn as string | undefined;
    if (typeof remoteJidRaw === 'string' && remoteJidRaw.endsWith('@lid') && senderPn) {
      return senderPn;
    }
    return remoteJidRaw;
  }

  private inferMessageType(payload: any): string {
    const msg = payload?.message;
    if (!msg) return 'text';
    if (msg.conversation || msg.extendedTextMessage?.text) return 'text';
    if (msg.imageMessage) return 'image';
    if (msg.videoMessage) return 'video';
    if (msg.audioMessage) return 'audio';
    if (msg.documentMessage) return 'document';
    if (msg.stickerMessage) return 'sticker';
    if (msg.locationMessage || msg.liveLocationMessage) return 'location';
    if (msg.contactMessage || msg.contactsArrayMessage) return 'contact';
    if (msg.reactionMessage) return 'reaction';
    if (msg.pollCreationMessage || msg.pollUpdateMessage) return 'poll';
    return 'text';
  }

  private async tick() {
    if (this.running) return;
    this.running = true;

    try {
      const db = getDatabase();
      const since = this.lastProcessedAtSec ?? Math.floor(Date.now() / 1000) - 600;

      const rows = db
        .prepare(
          `
          SELECT id, tenant_id, device_id, event_type, payload, received_at
          FROM event_logs
          WHERE event_type = 'messages.upsert'
            AND received_at >= ?
          ORDER BY received_at ASC
          LIMIT 200
        `
        )
        .all(since) as Array<{
        id: string;
        tenant_id: string;
        device_id: string;
        event_type: string;
        payload: string;
        received_at: number;
      }>;

      let maxSeen = since;
      let ensured = 0;

      for (const row of rows) {
        maxSeen = Math.max(maxSeen, row.received_at);

        let payload: any;
        try {
          payload = JSON.parse(row.payload);
        } catch {
          continue;
        }

        // payload dari event handler: { key, message, pushName, ... }
        const msgKey = payload?.key;
        const messageId = msgKey?.id as string | undefined;
        const fromMe = Boolean(msgKey?.fromMe);

        // Jika tidak ada message terdekripsi, kita tidak bisa insert inbox
        if (!messageId || fromMe || !payload?.message) continue;

        const jid = this.normalizeInboxJid(payload);

        const exists = db
          .prepare('SELECT 1 FROM messages_inbox WHERE device_id = ? AND message_id = ? LIMIT 1')
          .get(row.device_id, messageId);

        if (exists) continue;

        try {
          eventRepository.saveInboxMessage(
            row.tenant_id,
            row.device_id,
            jid,
            messageId,
            this.inferMessageType(payload),
            payload
          );
          ensured++;

          // Trigger webhook for backfilled inbound message (best-effort)
          try {
            const { webhookService } = await import('../modules/webhooks/service.js');
            await webhookService.queueDelivery({
              id: messageId,
              eventType: 'message.received',
              tenantId: row.tenant_id,
              deviceId: row.device_id,
              timestamp: payload?.messageTimestamp
                ? Number(payload.messageTimestamp)
                : Math.floor(Date.now() / 1000),
              data: payload,
            });
          } catch (error) {
            logger.error(
              { error, deviceId: row.device_id, tenantId: row.tenant_id, messageId },
              'Inbound monitor failed to send message.received webhook'
            );
          }
        } catch (error) {
          logger.error(
            {
              error,
              deviceId: row.device_id,
              tenantId: row.tenant_id,
              messageId,
              jid,
            },
            'Inbound monitor failed to ensure inbox message'
          );
        }
      }

      // Move cursor forward (keep small overlap to avoid missing same-second writes)
      this.lastProcessedAtSec = Math.max(maxSeen - 1, since);

      if (ensured > 0) {
        logger.info({ ensured, cursor: this.lastProcessedAtSec }, 'Inbound monitor ensured inbox messages');
      }
    } catch (error) {
      logger.error({ error }, 'Inbound message monitor tick error');
    } finally {
      this.running = false;
    }
  }
}

export const inboundMessageMonitor = new InboundMessageMonitor();
