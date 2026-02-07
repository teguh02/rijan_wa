/**
 * Message types dan interfaces
 */

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  DOCUMENT = 'document',
  STICKER = 'sticker',
  LOCATION = 'location',
  CONTACT = 'contact',
  REACTION = 'reaction',
  POLL = 'poll',
}

export enum MessageStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  SENDING = 'sending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
  EXPIRED = 'expired',
}

export interface SendTextMessageRequest {
  to: string; // JID
  text: string;
  quotedMessageId?: string;
  mentions?: string[];
}

export interface SendMediaMessageRequest {
  to: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  mediaUrl?: string;
  mediaBuffer?: Buffer;
  caption?: string;
  mimeType?: string;
  fileName?: string;
  ptt?: boolean; // Push to talk (voice note)
}

export interface SendLocationMessageRequest {
  to: string;
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface SendContactMessageRequest {
  to: string;
  contacts: Array<{
    displayName: string;
    vcard: string;
  }>;
}

export interface SendReactionMessageRequest {
  to: string;
  messageId: string;
  emoji: string;
  /**
   * Optional: only needed when reacting to messages not created by this gateway.
   * Defaults to true for WA message IDs, and true when messageId is an internal `msg_...`.
   */
  fromMe?: boolean;
  /**
   * Optional: group participant JID (required by WhatsApp for some group message references)
   */
  participant?: string;
}

export interface EditMessageRequest {
  to: string;
  messageId: string;
  newText: string;
}

export interface DeleteMessageRequest {
  to: string;
  messageId: string;
  forEveryone?: boolean;
}

export interface SendPollMessageRequest {
  to: string;
  question: string;
  options: string[];
  selectableCount?: number;
}

export interface MessageStatusResponse {
  id: string;
  status: MessageStatus;
  to: string;
  messageType: MessageType;
  waMessageId?: string;
  error?: string;
  createdAt: number;
  sentAt?: number;
  retries: number;
}

export interface Chat {
  jid: string;
  name?: string;
  isGroup: boolean;
  unreadCount: number;
  lastMessageTime?: number;
  archived?: boolean;
  muted?: boolean;
  phoneNumber?: string | null;
}

export interface Message {
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
