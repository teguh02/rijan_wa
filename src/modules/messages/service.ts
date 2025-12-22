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
import { URL } from 'url';

export class MessageService {
  private messageRepo = new MessageRepository();

  private mapMimeTypeToMediaType(mimeType: string): 'image' | 'video' | 'audio' | 'document' {
    const normalized = mimeType.toLowerCase().split(';')[0].trim();
    if (normalized.startsWith('image/')) return 'image';
    if (normalized.startsWith('video/')) return 'video';
    if (normalized.startsWith('audio/')) return 'audio';
    return 'document';
  }

  private guessMimeTypeFromUrl(mediaUrl: string): string | undefined {
    try {
      const url = new URL(mediaUrl);
      const pathname = url.pathname.toLowerCase();

      if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg';
      if (pathname.endsWith('.png')) return 'image/png';
      if (pathname.endsWith('.gif')) return 'image/gif';
      if (pathname.endsWith('.webp')) return 'image/webp';

      if (pathname.endsWith('.mp4')) return 'video/mp4';
      if (pathname.endsWith('.webm')) return 'video/webm';
      if (pathname.endsWith('.mov')) return 'video/quicktime';

      if (pathname.endsWith('.mp3')) return 'audio/mpeg';
      if (pathname.endsWith('.wav')) return 'audio/wav';
      if (pathname.endsWith('.ogg')) return 'audio/ogg';
      if (pathname.endsWith('.m4a')) return 'audio/mp4';

      if (pathname.endsWith('.pdf')) return 'application/pdf';
      if (pathname.endsWith('.txt')) return 'text/plain';

      return undefined;
    } catch {
      return undefined;
    }
  }

  private async inferMediaFromUrl(mediaUrl: string): Promise<{ mediaType: 'image' | 'video' | 'audio' | 'document'; mimeType: string }> {
    // Validate URL early to prevent SSRF for the HEAD request as well.
    this.validateMediaUrl(mediaUrl);

    // Prefer Content-Type from server.
    try {
      const response = await axios.head(mediaUrl, {
        timeout: 8000,
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 400,
      });

      const header = response.headers?.['content-type'];
      if (typeof header === 'string' && header.trim().length > 0) {
        const mimeType = header.split(';')[0].trim().toLowerCase();
        return { mediaType: this.mapMimeTypeToMediaType(mimeType), mimeType };
      }
    } catch {
      // Some hosts don't support HEAD; fall back to URL extension.
    }

    const guessedMimeType = this.guessMimeTypeFromUrl(mediaUrl) || 'application/octet-stream';
    return { mediaType: this.mapMimeTypeToMediaType(guessedMimeType), mimeType: guessedMimeType };
  }

  private async normalizeSendMediaRequest(request: SendMediaMessageRequest): Promise<SendMediaMessageRequest> {
    let mediaType = request.mediaType;
    let mimeType = request.mimeType;

    if (request.mediaUrl && (!mediaType || !mimeType)) {
      const inferred = await this.inferMediaFromUrl(request.mediaUrl);
      mediaType = mediaType || inferred.mediaType;
      mimeType = mimeType || inferred.mimeType;
    }

    if (mimeType && !mediaType) {
      mediaType = this.mapMimeTypeToMediaType(mimeType);
    }

    // If mediaBuffer is used, we can't safely infer without mimeType.
    if (request.mediaBuffer && !mimeType) {
      throw new Error('mimeType is required when mediaBuffer is provided');
    }

    if (!mediaType) {
      throw new Error('mediaType is required (or provide mediaUrl so it can be inferred)');
    }
    if (!mimeType) {
      throw new Error('mimeType is required (or provide mediaUrl so it can be inferred)');
    }

    return {
      ...request,
      mediaType,
      mimeType,
    };
  }

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

      deviceManager.recordProtocolOut(deviceId, 'sendMessage', {
        jid: message.jid,
        type: 'text',
        hasMentions: Boolean(payload.mentions?.length),
        hasQuoted: Boolean(payload.quotedMessageId),
      });

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
    tenantId: string,
    deviceId: string,
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

    const normalizedRequest = await this.normalizeSendMediaRequest(request);
    const jid = this.normalizeJid(normalizedRequest.to);
    const messageType = normalizedRequest.mediaType as MessageType;

    // Add to outbox
    const message = this.messageRepo.addToOutbox({
      tenant_id: tenantId,
      device_id: deviceId,
      jid,
      message_type: messageType,
      payload: JSON.stringify(normalizedRequest),
      status: MessageStatus.QUEUED,
      retries: 0,
      idempotency_key: idempotencyKey,
    });

    // Process send
    this.processSendMedia(deviceId, message, messageType).catch((error) => {
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

      deviceManager.recordProtocolOut(deviceId, 'sendMessage', {
        jid: message.jid,
        type: mediaType,
        hasCaption: Boolean(payload.caption),
        hasUrl: Boolean(payload.mediaUrl),
        mimeType: payload.mimeType,
      });

      let mediaBuffer: Buffer;

      // Download media if URL provided
      if (payload.mediaUrl) {
        // Validate URL to prevent SSRF
        this.validateMediaUrl(payload.mediaUrl);
        
        const response = await axios.get(payload.mediaUrl, {
          responseType: 'arraybuffer',
          timeout: 30000,
          maxContentLength: 50 * 1024 * 1024, // 50MB max
          maxRedirects: 5,
          validateStatus: (status) => status >= 200 && status < 400,
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
    tenantId: string,
    deviceId: string,
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

      deviceManager.recordProtocolOut(deviceId, 'sendMessage', {
        jid: message.jid,
        type: 'location',
      });

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
    tenantId: string,
    deviceId: string,
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

      deviceManager.recordProtocolOut(deviceId, 'sendMessage', {
        jid: message.jid,
        type: 'contact',
        contactsCount: payload.contacts?.length || 0,
      });

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
    _tenantId: string,
    deviceId: string,
    request: SendReactionMessageRequest
  ): Promise<{ messageId: string; status: MessageStatus }> {
    const socket = this.getSocket(deviceId);
    const jid = this.normalizeJid(request.to);

    try {
      deviceManager.recordProtocolOut(deviceId, 'sendMessage', {
        jid,
        type: 'reaction',
        emoji: request.emoji,
      });

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
      deviceManager.recordProtocolOut(deviceId, 'deleteMessage', {
        jid,
        messageId: request.messageId,
        forEveryone: Boolean(request.forEveryone),
      });

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

    return deviceManager.getSocketOrThrow(deviceId);
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

  /**   * Validate media URL to prevent SSRF attacks
   */
  private validateMediaUrl(urlString: string): void {
    try {
      const url = new URL(urlString);
      
      // Only allow http/https
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Only HTTP/HTTPS URLs are allowed');
      }
      
      // Block private IP ranges and localhost
      const hostname = url.hostname.toLowerCase();
      
      // Block localhost variants
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname === '0.0.0.0'
      ) {
        throw new Error('Localhost URLs are not allowed');
      }
      
      // Block private IPv4 ranges
      if (
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
        hostname.startsWith('169.254.') // Link-local
      ) {
        throw new Error('Private IP ranges are not allowed');
      }
      
      // Block IPv6 private ranges (simplified check)
      if (
        hostname.startsWith('fc00:') ||
        hostname.startsWith('fd00:') ||
        hostname.startsWith('fe80:')
      ) {
        throw new Error('Private IPv6 ranges are not allowed');
      }
      
    } catch (error: any) {
      if (error.message && error.message.includes('not allowed')) {
        throw error;
      }
      throw new Error('Invalid media URL format');
    }
  }

  /**   * Handle send error
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
