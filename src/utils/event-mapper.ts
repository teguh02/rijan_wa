/**
 * Event type mapping dari Baileys ke standardized event format
 */

export enum StandardEventType {
  MESSAGE_RECEIVED = 'message.received',
  MESSAGE_SENT = 'message.sent',
  MESSAGE_UPDATED = 'message.updated',
  RECEIPT_DELIVERED = 'receipt.delivered',
  RECEIPT_READ = 'receipt.read',
  RECEIPT_PLAYED = 'receipt.played',
  DEVICE_CONNECTED = 'device.connected',
  DEVICE_DISCONNECTED = 'device.disconnected',
  PRESENCE_UPDATE = 'presence.update',
  GROUP_CREATED = 'group.created',
  GROUP_UPDATED = 'group.updated',
  GROUP_PARTICIPANT_ADD = 'group.participant.added',
  GROUP_PARTICIPANT_REMOVE = 'group.participant.removed',
  UNKNOWN = 'event.unknown',
}

export interface EventMappingResult {
  type: StandardEventType;
  baileyEventName: string;
  baileyEventData: Record<string, any>;
}

/**
 * Map Baileys event names and data to standard event type
 */
export function mapBaileysEvent(
  baileyEventName: string,
  baileyEventData: Record<string, any>
): EventMappingResult {
  const type = getStandardEventType(baileyEventName, baileyEventData);

  return {
    type,
    baileyEventName,
    baileyEventData,
  };
}

/**
 * Determine standard event type from Baileys event
 */
export function getStandardEventType(
  baileyEventName: string,
  baileyEventData: Record<string, any>
): StandardEventType {
  switch (baileyEventName) {
    case 'messages.upsert':
      return StandardEventType.MESSAGE_RECEIVED;

    case 'messages.update': {
      // Check update type from messages.update event
      const update = baileyEventData.messages?.[0];
      if (update?.update?.status === 2) {
        // status 2 = sent
        return StandardEventType.MESSAGE_SENT;
      }
      return StandardEventType.MESSAGE_UPDATED;
    }

    case 'message-receipt.update': {
      // Map based on receipt type
      const receipt = baileyEventData.receipts?.[0];
      const receiptType = receipt?.receiptType;

      if (receiptType === 'read' || receiptType === 'read-receipt') {
        return StandardEventType.RECEIPT_READ;
      } else if (receiptType === 'played') {
        return StandardEventType.RECEIPT_PLAYED;
      }
      // Default to delivered
      return StandardEventType.RECEIPT_DELIVERED;
    }

    case 'connection.update': {
      const connection = baileyEventData.connection;
      if (connection === 'open') {
        return StandardEventType.DEVICE_CONNECTED;
      } else if (connection === 'close') {
        return StandardEventType.DEVICE_DISCONNECTED;
      }
      return StandardEventType.UNKNOWN;
    }

    case 'presence.update':
      return StandardEventType.PRESENCE_UPDATE;

    case 'groups.upsert':
      return StandardEventType.GROUP_CREATED;

    case 'groups.update':
      return StandardEventType.GROUP_UPDATED;

    case 'group-participants.update': {
      const action = baileyEventData.action;
      if (action === 'add') {
        return StandardEventType.GROUP_PARTICIPANT_ADD;
      } else if (action === 'remove') {
        return StandardEventType.GROUP_PARTICIPANT_REMOVE;
      }
      return StandardEventType.UNKNOWN;
    }

    default:
      return StandardEventType.UNKNOWN;
  }
}

/**
 * Check if event should be logged/sent to webhooks
 */
export function shouldProcessEvent(type: StandardEventType): boolean {
  // Skip unknown events
  if (type === StandardEventType.UNKNOWN) {
    return false;
  }

  return true;
}
