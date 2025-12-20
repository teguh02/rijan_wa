export type EventType =
  | 'messages.upsert'
  | 'messages.update'
  | 'message-receipt.update'
  | 'groups.update'
  | 'group-participants.update'
  | 'contacts.update'
  | 'chats.update'
  | 'connection.update'
  | 'creds.update';

export interface Event {
  id: string;
  tenantId: string;
  deviceId: string;
  type: EventType;
  payload: any;
  receivedAt: number;
}

export interface InboxMessage {
  id: string;
  tenantId: string;
  deviceId: string;
  jid: string;
  messageId: string;
  messageType: string;
  payload: any;
  receivedAt: number;
}
