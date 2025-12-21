import { WASocket } from '@whiskeysockets/baileys';
import { deviceManager } from '../../baileys/device-manager';
import { Chat, Message } from './types';
import { MessageRepository } from './repository';
import logger from '../../utils/logger';

export class ChatService {
  private messageRepo = new MessageRepository();
  private chatCache = new Map<string, Chat[]>(); // deviceId => chats

  /**
   * Get chats for device
   */
  async getChats(deviceId: string, limit = 50, offset = 0): Promise<Chat[]> {
    try {
      // Try cache first
      const cached = this.chatCache.get(deviceId);
      if (cached && cached.length > 0) {
        return cached.slice(offset, offset + limit);
      }

      // DeviceManager maintains an in-memory chat index populated from Baileys events.
      const rawChats = deviceManager.getChatsSnapshot(deviceId);
      const chats: Chat[] = rawChats
        .map((chat: any) => {
          const jid = chat?.id || chat?.jid;
          if (!jid) return null;

          return {
            jid,
            name: chat?.name || jid,
            isGroup: typeof jid === 'string' ? jid.endsWith('@g.us') : false,
            unreadCount: chat?.unreadCount || 0,
            lastMessageTime: chat?.conversationTimestamp,
            archived: chat?.archived || false,
            muted: Boolean(chat?.muteEndTime),
          } as Chat;
        })
        .filter(Boolean) as Chat[];

      chats.sort((a, b) => Number(b.lastMessageTime || 0) - Number(a.lastMessageTime || 0));
      this.chatCache.set(deviceId, chats);
      return chats.slice(offset, offset + limit);
    } catch (error) {
      logger.error({ error, deviceId }, 'Failed to get chats');
      throw error;
    }
  }

  /**
   * Get messages for a chat
   */
  async getMessages(
    deviceId: string,
    jid: string,
    options: { limit?: number; before?: string } = {}
  ): Promise<Message[]> {
      const { limit = 50 } = options;

    try {
      // Get from database
      const messages = this.messageRepo.getMessagesByJid(deviceId, jid, limit, 0);
      return messages;
    } catch (error) {
      logger.error({ error, deviceId, jid }, 'Failed to get messages');
      throw error;
    }
  }

  /**
   * Mark chat as read
   */
  async markAsRead(deviceId: string, jid: string, messageId?: string): Promise<void> {
    const socket = this.getSocket(deviceId);

    try {
      if (messageId) {
        await socket.readMessages([{ remoteJid: jid, id: messageId, participant: undefined }]);
      } else {
        // For marking all as read, we need to provide at least one message key
        // In production, this should fetch recent unread messages from the store
        logger.warn({ deviceId, jid }, 'Mark all as read requires specific message IDs');
      }

      logger.info({ deviceId, jid }, 'Marked chat as read');
    } catch (error) {
      logger.error({ error, deviceId, jid }, 'Failed to mark as read');
      throw error;
    }
  }

  /**
   * Archive chat
   */
  async archiveChat(deviceId: string, jid: string, archive = true): Promise<void> {
    const socket = this.getSocket(deviceId);

    try {
      await socket.chatModify(
        {
          archive,
          lastMessages: [],
        },
        jid
      );

      logger.info({ deviceId, jid, archive }, 'Chat archived status changed');
    } catch (error) {
      logger.error({ error, deviceId, jid }, 'Failed to archive chat');
      throw error;
    }
  }

  /**
   * Mute chat
   */
  async muteChat(deviceId: string, jid: string, duration?: number): Promise<void> {
    const socket = this.getSocket(deviceId);

    try {
      const muteEndTime = duration ? Date.now() + duration * 1000 : null;

      await socket.chatModify(
        {
          mute: muteEndTime,
        },
        jid
      );

      logger.info({ deviceId, jid, duration }, 'Chat mute status changed');
    } catch (error) {
      logger.error({ error, deviceId, jid }, 'Failed to mute chat');
      throw error;
    }
  }

  /**
   * Send presence update
   */
  async sendPresence(
    deviceId: string,
    jid: string,
    type: 'available' | 'unavailable' | 'composing' | 'recording' | 'paused'
  ): Promise<void> {
    const socket = this.getSocket(deviceId);

    try {
      await socket.sendPresenceUpdate(type, jid);
      logger.debug({ deviceId, jid, type }, 'Presence update sent');
    } catch (error) {
      logger.error({ error, deviceId, jid, type }, 'Failed to send presence');
      throw error;
    }
  }

  /**
   * Clear chat cache for device
   */
  clearCache(deviceId: string): void {
    this.chatCache.delete(deviceId);
  }

  /**
   * Get socket for device
   */
  private getSocket(deviceId: string): WASocket {
    const state = deviceManager.getDeviceState(deviceId);
    if (!state) throw new Error('Device not found');
    return deviceManager.getSocketOrThrow(deviceId);
  }
}

export const chatService = new ChatService();
