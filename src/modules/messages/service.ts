import { WASocket } from '@whiskeysockets/baileys';
import { MessageRepository, OutboxMessage } from './repository';
import {
  MessageType,
  MessageStatus,
  SendTextMessageRequest,
  SendMediaMessageRequest,
  SendLocationMessageRequest,
  SendContactMessageRequest,
  SendReactionMessageRequest,
  DeleteMessageRequest,
} from './types';
import { deviceManager } from '../../baileys/device-manager';
import logger from '../../utils/logger';
import crypto from 'crypto';
import axios from 'axios';

export class MessageService {
  private messageRepo = new MessageRepository();

  /**
   * Send text message
   */
  async sendText(
    tenantId: string,
      deviceId: string,
    request: SendTextMessageRequest,
    idempotencyKey?: string
  ): Promise<{ messageId: string; status: MessageStatus }> {
    // Check idempotency
    if (idempotencyKey) {
      const existing = this.messageRepo.getByIdempotencyKey(deviceId, idempotencyKey);
      if (existing) {
        return { messageId: existing.id, status: existing.status as MessageStatus };
      }
    }

    // Validate device connected
    const connectionInfo = deviceManager.getConnectionInfo(deviceId);
    if (!connectionInfo.isConnected) {
      throw new Error('Device is not connected');
    }

    // Validate JID
    const jid = this.normalizeJid(request.to);

    // Add to outbox
    const message = this.messageRepo.addToOutbox({
      tenant_id: tenantId,
      device_id: deviceId,
      jid,
      message_type: MessageType.TEXT,
      payload: JSON.stringify(request),
      status: MessageStatus.QUEUED,
      retries: 0,
      idempotency_key: idempotencyKey,
    });

    // Send immediately (or queue for background processing)
    this.processSendText(deviceId, message).catch((error) => {
      logger.error({ error, messageId: message.id }, 'Failed to send text message');
    });

    return { messageId: message.id, status: MessageStatus.QUEUED };
  }

  /**
   * Process send text message
   */
  private async processSendText(deviceId: string, message: OutboxMessage): Promise<void> {
    try {
      const socket = this.getSocket(deviceId);
      const payload = JSON.parse(message.payload) as SendTextMessageRequest;

      const sentMsg = await socket.sendMessage(message.jid, {
        text: payload.text,
        mentions: payload.mentions,
      });

      // Update status
      this.messageRepo.updateStatus(
        message.id,
        MessageStatus.SENT,
          sentMsg?.key?.id || undefined,
        undefined
      );

      logger.info({ messageId: message.id, waMessageId: sentMsg?.key?.id }, 'Text message sent');
    } catch (error) {
      this.handleSendError(message.id, error);
    }
  }

  /**
   * Send media message
   */
  async sendMedia(
      deviceId: string,
    tenantId: string,
    request: SendMediaMessageRequest,
    idempotencyKey?: string
  ): Promise<{ messageId: string; status: MessageStatus }> {
    // Check idempotency
    if (idempotencyKey) {
      const existing = this.messageRepo.getByIdempotencyKey(deviceId, idempotencyKey);
      if (existing) {
        return { messageId: existing.id, status: existing.status as MessageStatus };
      }
    }

    // Validate device connected
    const connectionInfo = deviceManager.getConnectionInfo(deviceId);
    if (!connectionInfo.isConnected) {
      throw new Error('Device is not connected');
    }

    const jid = this.normalizeJid(request.to);

    // Add to outbox
    const message = this.messageRepo.addToOutbox({
      tenant_id: tenantId,
      device_id: deviceId,
      jid,
      message_type: request.mediaType.toUpperCase() as MessageType,
      payload: JSON.stringify(request),
      status: MessageStatus.QUEUED,
      retries: 0,
      idempotency_key: idempotencyKey,
    });

    // Process send
    this.processSendMedia(deviceId, message, request.mediaType.toUpperCase() as MessageType).catch((error) => {
      logger.error({ error, messageId: message.id }, 'Failed to send media message');
    });

    return { messageId: message.id, status: MessageStatus.QUEUED };
  }

  /**
   * Process send media message
   */
  private async processSendMedia(
    deviceId: string,
    message: OutboxMessage,
    mediaType: MessageType
  ): Promise<void> {
    try {
      const socket = this.getSocket(deviceId);
      const payload = JSON.parse(message.payload) as SendMediaMessageRequest;

      let mediaBuffer: Buffer;

      // Download media if URL provided
      if (payload.mediaUrl) {
        const response = await axios.get(payload.mediaUrl, {
          responseType: 'arraybuffer',
          timeout: 30000,
          maxContentLength: 50 * 1024 * 1024, // 50MB max
        });
        mediaBuffer = Buffer.from(response.data);
      } else if (payload.mediaBuffer) {
        mediaBuffer = payload.mediaBuffer;
      } else {
        throw new Error('No media provided');
      }

      // Prepare message content
      const messageContent: any = {
        caption: payload.caption,
      };

      // Set media type
      switch (mediaType) {
        case MessageType.IMAGE:
          messageContent.image = mediaBuffer;
          messageContent.mimetype = payload.mimeType || 'image/jpeg';
          break;
        case MessageType.VIDEO:
          messageContent.video = mediaBuffer;
          messageContent.mimetype = payload.mimeType || 'video/mp4';
          break;
        case MessageType.AUDIO:
          messageContent.audio = mediaBuffer;
          messageContent.mimetype = payload.mimeType || 'audio/mp4';
          messageContent.ptt = payload.ptt || false;
          break;
        case MessageType.DOCUMENT:
          messageContent.document = mediaBuffer;
          messageContent.mimetype = payload.mimeType || 'application/pdf';
          messageContent.fileName = payload.fileName || 'document';
          break;
      }

      const sentMsg = await socket.sendMessage(message.jid, messageContent);

      this.messageRepo.updateStatus(
        message.id,
        MessageStatus.SENT,
          sentMsg?.key?.id || undefined,
        undefined
      );

      logger.info({ messageId: message.id, waMessageId: sentMsg?.key?.id }, 'Media message sent');
    } catch (error) {
      this.handleSendError(message.id, error);
    }
  }

  /**
   * Send location message
   */
  async sendLocation(
      deviceId: string,
    tenantId: string,
    request: SendLocationMessageRequest,
    idempotencyKey?: string
  ): Promise<{ messageId: string; status: MessageStatus }> {
    const connectionInfo = deviceManager.getConnectionInfo(deviceId);
    if (!connectionInfo.isConnected) {
      throw new Error('Device is not connected');
    }

    const jid = this.normalizeJid(request.to);

    const message = this.messageRepo.addToOutbox({
      tenant_id: tenantId,
      device_id: deviceId,
      jid,
      message_type: MessageType.LOCATION,
      payload: JSON.stringify(request),
      status: MessageStatus.QUEUED,
      retries: 0,
      idempotency_key: idempotencyKey,
    });

    this.processSendLocation(deviceId, message).catch((error) => {
      logger.error({ error, messageId: message.id }, 'Failed to send location');
    });

    return { messageId: message.id, status: MessageStatus.QUEUED };
  }

  private async processSendLocation(deviceId: string, message: OutboxMessage): Promise<void> {
    try {
      const socket = this.getSocket(deviceId);
      const payload = JSON.parse(message.payload) as SendLocationMessageRequest;

      const sentMsg = await socket.sendMessage(message.jid, {
        location: {
          degreesLatitude: payload.latitude,
          degreesLongitude: payload.longitude,
          name: payload.name,
          address: payload.address,
        },
      });

      this.messageRepo.updateStatus(message.id, MessageStatus.SENT, sentMsg?.key?.id || undefined);
      logger.info({ messageId: message.id }, 'Location message sent');
    } catch (error) {
      this.handleSendError(message.id, error);
    }
  }

  /**
   * Send contact message
   */
  async sendContact(
      deviceId: string,
    tenantId: string,
    request: SendContactMessageRequest,
    idempotencyKey?: string
  ): Promise<{ messageId: string; status: MessageStatus }> {
    const connectionInfo = deviceManager.getConnectionInfo(deviceId);
    if (!connectionInfo.isConnected) {
      throw new Error('Device is not connected');
    }

    const jid = this.normalizeJid(request.to);

    const message = this.messageRepo.addToOutbox({
      tenant_id: tenantId,
      device_id: deviceId,
      jid,
      message_type: MessageType.CONTACT,
      payload: JSON.stringify(request),
      status: MessageStatus.QUEUED,
      retries: 0,
      idempotency_key: idempotencyKey,
    });

    this.processSendContact(deviceId, message).catch((error) => {
      logger.error({ error, messageId: message.id }, 'Failed to send contact');
    });

    return { messageId: message.id, status: MessageStatus.QUEUED };
  }

  private async processSendContact(deviceId: string, message: OutboxMessage): Promise<void> {
    try {
      const socket = this.getSocket(deviceId);
      const payload = JSON.parse(message.payload) as SendContactMessageRequest;

      const sentMsg = await socket.sendMessage(message.jid, {
        contacts: {
          displayName: payload.contacts[0]?.displayName || 'Contact',
          contacts: payload.contacts.map((c) => ({ vcard: c.vcard })),
        },
      });

      this.messageRepo.updateStatus(message.id, MessageStatus.SENT, sentMsg?.key?.id || undefined);
      logger.info({ messageId: message.id }, 'Contact message sent');
    } catch (error) {
      this.handleSendError(message.id, error);
    }
  }

  /**
   * Send reaction
   */
  async sendReaction(
      deviceId: string,
    _tenantId: string,
    request: SendReactionMessageRequest
  ): Promise<{ messageId: string; status: MessageStatus }> {
    const socket = this.getSocket(deviceId);
    const jid = this.normalizeJid(request.to);

    try {
      await socket.sendMessage(jid, {
        react: {
          text: request.emoji,
          key: { id: request.messageId, remoteJid: jid },
        },
      });

      return { messageId: crypto.randomBytes(16).toString('hex'), status: MessageStatus.SENT };
    } catch (error) {
      logger.error({ error }, 'Failed to send reaction');
      throw error;
    }
  }

  /**
   * Delete message
   */
  async deleteMessage(
    _tenantId: string,
    deviceId: string,
    request: DeleteMessageRequest
  ): Promise<{ success: boolean }> {
    const socket = this.getSocket(deviceId);
    const jid = this.normalizeJid(request.to);

    try {
      await socket.sendMessage(jid, { delete: { id: request.messageId, remoteJid: jid } });
      return { success: true };
    } catch (error) {
      logger.error({ error }, 'Failed to delete message');
      throw error;
    }
  }

  /**
   * Get message status
   */
  async getMessageStatus(
    _tenantId: string,
    deviceId: string,
    messageId: string
  ): Promise<{
    id: string;
    status: string;
    waMessageId: string | null;
    attempts: number;
    lastError: string | null;
    createdAt: number;
    updatedAt: number;
  } | null> {
    const message = this.messageRepo.getById(messageId);
    if (!message || message.device_id !== deviceId) {
      return null;
    }

    return {
      id: message.id,
      status: message.status,
      waMessageId: message.wa_message_id || null,
      attempts: message.retries,
      lastError: message.error_message || null,
      createdAt: message.created_at,
      updatedAt: message.updated_at,
    };
  }

  /**
   * Get socket for device
   */
  private getSocket(deviceId: string): WASocket {
    const state = deviceManager.getDeviceState(deviceId);
    if (!state) {
      throw new Error('Device not found');
    }

    // Access socket from device manager (need to expose it)
    const instance = (deviceManager as any).devices.get(deviceId);
    if (!instance?.socket) {
      throw new Error('Device socket not available');
    }

    return instance.socket;
  }

  /**
   * Normalize JID
   */
  private normalizeJid(jid: string): string {
    // Add @s.whatsapp.net if not present
    if (!jid.includes('@')) {
      return `${jid}@s.whatsapp.net`;
    }
    return jid;
  }

  /**
   * Handle send error
   */
  private handleSendError(messageId: string, error: any): void {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    this.messageRepo.incrementRetry(messageId);

    const message = this.messageRepo.getById(messageId);
    if (message && message.retries >= 4) {
      this.messageRepo.updateStatus(messageId, MessageStatus.FAILED, undefined, errorMessage);
    } else {
      this.messageRepo.updateStatus(messageId, MessageStatus.PENDING, undefined, errorMessage);
    }

    logger.error({ error, messageId }, 'Send message error');
  }
}

export const messageService = new MessageService();
