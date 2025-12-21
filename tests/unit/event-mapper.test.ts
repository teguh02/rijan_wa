import { describe, it, expect } from 'vitest';
import {
  mapBaileysEvent,
  getStandardEventType,
  shouldProcessEvent,
  StandardEventType,
} from '../../src/utils/event-mapper';

describe('Event Mapper', () => {
  describe('getStandardEventType', () => {
    it('should map messages.upsert to MESSAGE_RECEIVED', () => {
      const type = getStandardEventType('messages.upsert', { messages: [] });
      expect(type).toBe(StandardEventType.MESSAGE_RECEIVED);
    });

    it('should map messages.update to MESSAGE_UPDATED', () => {
      const type = getStandardEventType('messages.update', { messages: [{}] });
      expect(type).toBe(StandardEventType.MESSAGE_UPDATED);
    });

    it('should map messages.update with status 2 to MESSAGE_SENT', () => {
      const type = getStandardEventType('messages.update', {
        messages: [{ update: { status: 2 } }],
      });
      expect(type).toBe(StandardEventType.MESSAGE_SENT);
    });

    it('should map message-receipt.update with read type to RECEIPT_READ', () => {
      const type = getStandardEventType('message-receipt.update', {
        receipts: [{ receiptType: 'read' }],
      });
      expect(type).toBe(StandardEventType.RECEIPT_READ);
    });

    it('should map message-receipt.update with read-receipt to RECEIPT_READ', () => {
      const type = getStandardEventType('message-receipt.update', {
        receipts: [{ receiptType: 'read-receipt' }],
      });
      expect(type).toBe(StandardEventType.RECEIPT_READ);
    });

    it('should map message-receipt.update with played type to RECEIPT_PLAYED', () => {
      const type = getStandardEventType('message-receipt.update', {
        receipts: [{ receiptType: 'played' }],
      });
      expect(type).toBe(StandardEventType.RECEIPT_PLAYED);
    });

    it('should map message-receipt.update with unknown type to RECEIPT_DELIVERED', () => {
      const type = getStandardEventType('message-receipt.update', {
        receipts: [{ receiptType: 'unknown' }],
      });
      expect(type).toBe(StandardEventType.RECEIPT_DELIVERED);
    });

    it('should map connection.update open to DEVICE_CONNECTED', () => {
      const type = getStandardEventType('connection.update', { connection: 'open' });
      expect(type).toBe(StandardEventType.DEVICE_CONNECTED);
    });

    it('should map connection.update close to DEVICE_DISCONNECTED', () => {
      const type = getStandardEventType('connection.update', { connection: 'close' });
      expect(type).toBe(StandardEventType.DEVICE_DISCONNECTED);
    });

    it('should map presence.update to PRESENCE_UPDATE', () => {
      const type = getStandardEventType('presence.update', {});
      expect(type).toBe(StandardEventType.PRESENCE_UPDATE);
    });

    it('should map groups.upsert to GROUP_CREATED', () => {
      const type = getStandardEventType('groups.upsert', {});
      expect(type).toBe(StandardEventType.GROUP_CREATED);
    });

    it('should map groups.update to GROUP_UPDATED', () => {
      const type = getStandardEventType('groups.update', {});
      expect(type).toBe(StandardEventType.GROUP_UPDATED);
    });

    it('should map group-participants.update add to GROUP_PARTICIPANT_ADD', () => {
      const type = getStandardEventType('group-participants.update', {
        action: 'add',
      });
      expect(type).toBe(StandardEventType.GROUP_PARTICIPANT_ADD);
    });

    it('should map group-participants.update remove to GROUP_PARTICIPANT_REMOVE', () => {
      const type = getStandardEventType('group-participants.update', {
        action: 'remove',
      });
      expect(type).toBe(StandardEventType.GROUP_PARTICIPANT_REMOVE);
    });

    it('should map unknown events to UNKNOWN', () => {
      const type = getStandardEventType('unknown.event', {});
      expect(type).toBe(StandardEventType.UNKNOWN);
    });

    it('should be case-sensitive', () => {
      const type1 = getStandardEventType('messages.upsert', {});
      const type2 = getStandardEventType('Messages.Upsert', {});

      expect(type1).toBe(StandardEventType.MESSAGE_RECEIVED);
      expect(type2).toBe(StandardEventType.UNKNOWN);
    });
  });

  describe('mapBaileysEvent', () => {
    it('should return complete mapping result', () => {
      const data = { messages: [] };
      const result = mapBaileysEvent('messages.upsert', data);

      expect(result).toEqual({
        type: StandardEventType.MESSAGE_RECEIVED,
        baileyEventName: 'messages.upsert',
        baileyEventData: data,
      });
    });

    it('should preserve original Baileys data', () => {
      const data = {
        messages: [
          { key: { id: '123' }, message: { conversation: 'Hello' } },
        ],
      };
      const result = mapBaileysEvent('messages.upsert', data);

      expect(result.baileyEventData).toBe(data);
    });

    it('should map all Baileys event names consistently', () => {
      const eventMappings = [
        ['messages.upsert', StandardEventType.MESSAGE_RECEIVED],
        ['message-receipt.update', StandardEventType.RECEIPT_DELIVERED],
        ['connection.update', StandardEventType.UNKNOWN],
        ['groups.upsert', StandardEventType.GROUP_CREATED],
      ];

      eventMappings.forEach(([baileyEvent, expectedType]) => {
        const result = mapBaileysEvent(baileyEvent, {});
        expect(result.type).toBe(expectedType);
      });
    });
  });

  describe('shouldProcessEvent', () => {
    it('should process MESSAGE_RECEIVED', () => {
      expect(shouldProcessEvent(StandardEventType.MESSAGE_RECEIVED)).toBe(true);
    });

    it('should process MESSAGE_SENT', () => {
      expect(shouldProcessEvent(StandardEventType.MESSAGE_SENT)).toBe(true);
    });

    it('should process RECEIPT_READ', () => {
      expect(shouldProcessEvent(StandardEventType.RECEIPT_READ)).toBe(true);
    });

    it('should process DEVICE_CONNECTED', () => {
      expect(shouldProcessEvent(StandardEventType.DEVICE_CONNECTED)).toBe(true);
    });

    it('should process GROUP_CREATED', () => {
      expect(shouldProcessEvent(StandardEventType.GROUP_CREATED)).toBe(true);
    });

    it('should skip UNKNOWN events', () => {
      expect(shouldProcessEvent(StandardEventType.UNKNOWN)).toBe(false);
    });

    it('should process all defined event types except UNKNOWN', () => {
      const eventTypes = Object.values(StandardEventType);
      eventTypes.forEach((type) => {
        const shouldProcess = shouldProcessEvent(type);
        if (type === StandardEventType.UNKNOWN) {
          expect(shouldProcess).toBe(false);
        } else {
          expect(shouldProcess).toBe(true);
        }
      });
    });
  });

  describe('Event Type Determinism', () => {
    it('should map same Baileys event consistently', () => {
      const data = { messages: [{ key: { id: '1' } }] };
      
      const result1 = mapBaileysEvent('messages.upsert', data);
      const result2 = mapBaileysEvent('messages.upsert', data);

      expect(result1.type).toBe(result2.type);
    });

    it('should handle missing optional data fields', () => {
      expect(() => getStandardEventType('messages.update', {})).not.toThrow();
      expect(() => getStandardEventType('message-receipt.update', {})).not.toThrow();
      expect(() =>getStandardEventType('connection.update', {})).not.toThrow();
    });

    it('should handle null/undefined data gracefully', () => {
      expect(() => getStandardEventType('messages.upsert', null as any)).not.toThrow();
      expect(() => getStandardEventType('messages.upsert', undefined as any)).not.toThrow();
    });
  });

  describe('Real-world Event Scenarios', () => {
    it('should map incoming WhatsApp message', () => {
      const eventData = {
        messages: [
          {
            key: { id: '3EB0000000000001', fromMe: false },
            messageTimestamp: 1699000000,
            message: {
              conversation: 'Hello from WhatsApp',
            },
          },
        ],
      };

      const result = mapBaileysEvent('messages.upsert', eventData);
      expect(result.type).toBe(StandardEventType.MESSAGE_RECEIVED);
      expect(result.baileyEventData.messages).toBeDefined();
    });

    it('should map sent message confirmation', () => {
      const eventData = {
        messages: [
          {
            key: { id: '3EB0000000000002', fromMe: true },
            update: {
              status: 2, // sent status
            },
          },
        ],
      };

      const result = mapBaileysEvent('messages.update', eventData);
      expect(result.type).toBe(StandardEventType.MESSAGE_SENT);
    });

    it('should map read receipt', () => {
      const eventData = {
        receipts: [
          {
            jid: '62812345678@s.whatsapp.net',
            receipt: 'read',
            receiptType: 'read',
            timestamp: 1699000001,
          },
        ],
      };

      const result = mapBaileysEvent('message-receipt.update', eventData);
      expect(result.type).toBe(StandardEventType.RECEIPT_READ);
    });

    it('should map device connection state', () => {
      const connectedData = { connection: 'open' };
      const connectedResult = mapBaileysEvent('connection.update', connectedData);
      expect(connectedResult.type).toBe(StandardEventType.DEVICE_CONNECTED);

      const disconnectedData = { connection: 'close' };
      const disconnectedResult = mapBaileysEvent('connection.update', disconnectedData);
      expect(disconnectedResult.type).toBe(StandardEventType.DEVICE_DISCONNECTED);
    });

    it('should map group participant changes', () => {
      const addData = {
        id: '120363021234567890@g.us',
        participants: ['62812345678@s.whatsapp.net'],
        action: 'add',
      };
      const addResult = mapBaileysEvent('group-participants.update', addData);
      expect(addResult.type).toBe(StandardEventType.GROUP_PARTICIPANT_ADD);

      const removeData = {
        ...addData,
        action: 'remove',
      };
      const removeResult = mapBaileysEvent('group-participants.update', removeData);
      expect(removeResult.type).toBe(StandardEventType.GROUP_PARTICIPANT_REMOVE);
    });
  });
});
