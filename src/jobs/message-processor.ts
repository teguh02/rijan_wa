import logger from '../utils/logger.js';
import { MessageRepository, OutboxMessage } from '../modules/messages/repository.js';
import { MessageService } from '../modules/messages/service.js';
import { MessageStatus, MessageType, SendTextMessageRequest, SendMediaMessageRequest, SendLocationMessageRequest, SendContactMessageRequest, SendReactionMessageRequest } from '../modules/messages/types.js';

export class MessageProcessor {
  private repo = new MessageRepository();
  private service = new MessageService();
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  start(intervalMs = 3000) {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), intervalMs);
    logger.info({ intervalMs }, 'Message processor started');
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info('Message processor stopped');
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const batch = this.repo.getPendingMessages(50);
      for (const msg of batch) {
        await this.processMessage(msg);
      }
    } catch (error) {
      logger.error({ error }, 'Message processor tick error');
    } finally {
      this.running = false;
    }
  }

  private async processMessage(msg: OutboxMessage) {
    try {
      this.repo.updateStatus(msg.id, MessageStatus.SENDING);
      const payload = JSON.parse(msg.payload);

      switch (msg.message_type) {
        case MessageType.TEXT: {
          const req = payload as SendTextMessageRequest;
          await this.service.sendText(msg.tenant_id, msg.device_id, req, msg.idempotency_key);
          break;
        }
        case MessageType.IMAGE:
        case MessageType.VIDEO:
        case MessageType.AUDIO:
        case MessageType.DOCUMENT: {
          const req = payload as SendMediaMessageRequest;
          // Ensure mediaType exists in payload to match MessageService expectations
          if (!req.mediaType) {
            req.mediaType = (msg.message_type.toLowerCase() as any);
          }
          await this.service.sendMedia(msg.tenant_id, msg.device_id, req, msg.idempotency_key);
          break;
        }
        case MessageType.LOCATION: {
          await this.service.sendLocation(msg.tenant_id, msg.device_id, payload as SendLocationMessageRequest, msg.idempotency_key);
          break;
        }
        case MessageType.CONTACT: {
          await this.service.sendContact(msg.tenant_id, msg.device_id, payload as SendContactMessageRequest, msg.idempotency_key);
          break;
        }
        case MessageType.REACTION: {
          await this.service.sendReaction(msg.tenant_id, msg.device_id, payload as SendReactionMessageRequest);
          break;
        }
        default:
          this.repo.updateStatus(msg.id, MessageStatus.FAILED, undefined, 'Unsupported message type');
          return;
      }

      this.repo.updateStatus(msg.id, MessageStatus.SENT);
    } catch (error) {
      logger.error({ error, messageId: msg.id }, 'Message processing error');
      this.repo.incrementRetry(msg.id);
      this.repo.updateStatus(msg.id, MessageStatus.FAILED, undefined, error instanceof Error ? error.message : 'Unknown error');
    }
  }
}

export const messageProcessor = new MessageProcessor();
