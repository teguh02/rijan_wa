export type WebhookEvent =
  | 'message.received'
  | 'message.updated'
  | 'message.deleted'
  | 'receipt.delivery'
  | 'receipt.read'
  | 'group.created'
  | 'group.updated'
  | 'group.deleted'
  | 'participant.added'
  | 'participant.removed'
  | 'contact.updated'
  | 'device.connected'
  | 'device.disconnected';

export interface Webhook {
  id: string;
  tenantId: string;
  url: string;
  secret: string;
  events: WebhookEvent[];
  enabled: boolean;
  retryCount: number;
  timeout: number;
  createdAt: number;
  updatedAt: number;
}

export interface WebhookPayload {
  id: string;
  eventType: WebhookEvent;
  tenantId: string;
  deviceId: string;
  timestamp: number;
  data: any;
}

export interface WebhookLog {
  id: string;
  webhookId: string;
  eventId: string | null;
  statusCode: number | null;
  attempts: number;
  lastError: string | null;
  sentAt: number | null;
}

export interface DLQEntry {
  id: string;
  webhookId: string;
  eventPayload: WebhookPayload;
  reason: string;
  createdAt: number;
}

export interface CreateWebhookRequest {
  url: string;
  events: WebhookEvent[];
  secret?: string;
  retryCount?: number;
  timeout?: number;
}

export interface UpdateWebhookRequest {
  url?: string;
  events?: WebhookEvent[];
  secret?: string;
  enabled?: boolean;
  retryCount?: number;
  timeout?: number;
}
