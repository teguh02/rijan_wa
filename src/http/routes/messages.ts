import { FastifyPluginAsync } from 'fastify';
import { verifyTenantApiKey } from '../../middlewares/tenant-auth.js';
import { verifyDeviceOwnership } from '../../middlewares/device-ownership.js';
import { messageService } from '../../modules/messages/service.js';
import { chatService } from '../../modules/messages/chat-service.js';
import { BAD_REQUEST, INTERNAL_SERVER_ERROR, NOT_FOUND, TOO_MANY_REQUESTS } from '../../utils/http-errors.js';
import { requireDeviceConnected, validateJidInBody } from '../../middlewares/message-validation.js';
import { checkMessageRateLimit } from '../../utils/rate-limit.js';
import type {
  SendTextMessageRequest,
  SendMediaMessageRequest,
  SendLocationMessageRequest,
  SendContactMessageRequest,
  SendReactionMessageRequest,
  SendPollMessageRequest,
} from '../../modules/messages/types.js';

interface MessageParams {
  deviceId: string;
}

interface MessageIdParams {
  deviceId: string;
  messageId: string;
}

interface JidParams {
  deviceId: string;
  jid: string;
}

export const messagesRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply tenant auth and device ownership to all routes
  fastify.addHook('preHandler', verifyTenantApiKey);
  fastify.addHook('preHandler', verifyDeviceOwnership);

  /**
   * Send text message
   * POST /v1/devices/:deviceId/messages/text
   */
  fastify.post<{ Params: MessageParams; Body: SendTextMessageRequest }>(
    '/:deviceId/messages/text',
    {
      schema: {
        description: 'Send a text message (with optional mentions)',
        tags: ['Messages'],
        params: {
          type: 'object',
          properties: {
            deviceId: { type: 'string' },
          },
          required: ['deviceId'],
        },
        body: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Recipient JID (e.g., 6281234567890@s.whatsapp.net)' },
            text: { type: 'string', description: 'Message text' },
            mentions: { type: 'array', items: { type: 'string' }, description: 'JIDs to mention' },
            quotedMessageId: { type: 'string', description: 'Message ID to quote' },
            idempotencyKey: { type: 'string', description: 'Unique key to prevent duplicate sends' },
          },
          required: ['to', 'text'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Internal message ID' },
              messageId: { type: 'string', description: 'Internal message ID (alias of id)' },
              status: { type: 'string' },
              timestamp: { type: 'number' },
              idempotencyKey: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, _reply) => {
      await requireDeviceConnected(request as any, _reply as any);
      await validateJidInBody(request as any, _reply as any);
      const { deviceId } = request.params;
      const tenantId = request.tenant!.id;
      const body = request.body;

      // Check rate limit
      const rateLimitCheck = checkMessageRateLimit(tenantId, deviceId, 'text');
      _reply.header('X-RateLimit-Limit', rateLimitCheck.headers['X-RateLimit-Limit']);
      _reply.header('X-RateLimit-Remaining', rateLimitCheck.headers['X-RateLimit-Remaining']);
      _reply.header('X-RateLimit-Reset', rateLimitCheck.headers['X-RateLimit-Reset']);

      if (!rateLimitCheck.allowed) {
        _reply.header('Retry-After', rateLimitCheck.headers['Retry-After']);
        throw TOO_MANY_REQUESTS(rateLimitCheck.message);
      }

      const headerIdem = (request.headers['idempotency-key'] as string | undefined) || undefined;
      const idempotencyKey = headerIdem || (body as any)?.idempotencyKey;

      try {
        const result = await messageService.sendText(tenantId, deviceId, body, idempotencyKey);
        return _reply.send({
          id: result.messageId,
          messageId: result.messageId,
          status: result.status,
          timestamp: Date.now(),
          idempotencyKey,
        });
      } catch (error: any) {
        request.log.error(error, 'Failed to send text message');
        throw INTERNAL_SERVER_ERROR(error.message || 'Failed to send message');
      }
    }
  );

  /**
   * Send media message (image, video, audio, document)
   * POST /v1/devices/:deviceId/messages/media
   */
  fastify.post<{ Params: MessageParams; Body: SendMediaMessageRequest }>(
    '/:deviceId/messages/media',
    {
      schema: {
        description: 'Send a media message (image, video, audio, or document)',
        tags: ['Messages'],
        params: {
          type: 'object',
          properties: {
            deviceId: { type: 'string' },
          },
          required: ['deviceId'],
        },
        body: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Recipient JID' },
            mediaType: {
              type: 'string',
              enum: ['image', 'video', 'audio', 'document'],
              description: 'Type of media',
            },
            mediaUrl: { type: 'string', description: 'URL to download media (mutually exclusive with mediaBuffer)' },
            mediaBuffer: { type: 'string', description: 'Base64 encoded media buffer' },
            mimeType: { type: 'string', description: 'MIME type (e.g., image/jpeg)' },
            caption: { type: 'string', description: 'Optional caption for the media' },
            fileName: { type: 'string', description: 'File name for documents' },
            quotedMessageId: { type: 'string' },
            idempotencyKey: { type: 'string' },
          },
          required: ['to'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Internal message ID' },
              messageId: { type: 'string', description: 'Internal message ID (alias of id)' },
              status: { type: 'string' },
              timestamp: { type: 'number' },
              idempotencyKey: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, _reply) => {
      await requireDeviceConnected(request as any, _reply as any);
      await validateJidInBody(request as any, _reply as any);
      const { deviceId } = request.params;
      const tenantId = request.tenant!.id;
      const body = request.body;

      // Check rate limit
      const rateLimitCheck = checkMessageRateLimit(tenantId, deviceId, 'media');
      _reply.header('X-RateLimit-Limit', rateLimitCheck.headers['X-RateLimit-Limit']);
      _reply.header('X-RateLimit-Remaining', rateLimitCheck.headers['X-RateLimit-Remaining']);
      _reply.header('X-RateLimit-Reset', rateLimitCheck.headers['X-RateLimit-Reset']);

      if (!rateLimitCheck.allowed) {
        _reply.header('Retry-After', rateLimitCheck.headers['Retry-After']);
        throw TOO_MANY_REQUESTS(rateLimitCheck.message);
      }

      const headerIdem = (request.headers['idempotency-key'] as string | undefined) || undefined;
      const idempotencyKey = headerIdem || (body as any)?.idempotencyKey;

      // Validate that either mediaUrl or mediaBuffer is provided
      if (!body.mediaUrl && !body.mediaBuffer) {
        throw BAD_REQUEST('Either mediaUrl or mediaBuffer must be provided');
      }
      if (body.mediaUrl && body.mediaBuffer) {
        throw BAD_REQUEST('Only one of mediaUrl or mediaBuffer can be provided');
      }

      try {
        const result = await messageService.sendMedia(tenantId, deviceId, body, idempotencyKey);
        return _reply.send({
          id: result.messageId,
          messageId: result.messageId,
          status: result.status,
          timestamp: Date.now(),
          idempotencyKey,
        });
      } catch (error: any) {
        request.log.error(error, 'Failed to send media message');
        throw INTERNAL_SERVER_ERROR(error.message || 'Failed to send media');
      }
    }
  );

  /**
   * Send location message
   * POST /v1/devices/:deviceId/messages/location
   */
  fastify.post<{ Params: MessageParams; Body: SendLocationMessageRequest }>(
    '/:deviceId/messages/location',
    {
      schema: {
        description: 'Send a location message',
        tags: ['Messages'],
        params: {
          type: 'object',
          properties: {
            deviceId: { type: 'string' },
          },
          required: ['deviceId'],
        },
        body: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Recipient JID' },
            latitude: { type: 'number', description: 'GPS latitude' },
            longitude: { type: 'number', description: 'GPS longitude' },
            name: { type: 'string', description: 'Location name' },
            address: { type: 'string', description: 'Location address' },
            quotedMessageId: { type: 'string' },
            idempotencyKey: { type: 'string' },
          },
          required: ['to', 'latitude', 'longitude'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              status: { type: 'string' },
              timestamp: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, _reply) => {
      await requireDeviceConnected(request as any, _reply as any);
      const { deviceId } = request.params;
      const tenantId = request.tenant!.id;
      const body = request.body;

      // Check rate limit
      const rateLimitCheck = checkMessageRateLimit(tenantId, deviceId, 'location');
      _reply.header('X-RateLimit-Limit', rateLimitCheck.headers['X-RateLimit-Limit']);
      _reply.header('X-RateLimit-Remaining', rateLimitCheck.headers['X-RateLimit-Remaining']);
      _reply.header('X-RateLimit-Reset', rateLimitCheck.headers['X-RateLimit-Reset']);

      if (!rateLimitCheck.allowed) {
        _reply.header('Retry-After', rateLimitCheck.headers['Retry-After']);
        throw TOO_MANY_REQUESTS(rateLimitCheck.message);
      }

      try {
        const result = await messageService.sendLocation(tenantId, deviceId, body);
        return _reply.send(result);
      } catch (error: any) {
        request.log.error(error, 'Failed to send location message');
        throw INTERNAL_SERVER_ERROR(error.message || 'Failed to send location');
      }
    }
  );

  /**
   * Send contact message
   * POST /v1/devices/:deviceId/messages/contact
   */
  fastify.post<{ Params: MessageParams; Body: SendContactMessageRequest }>(
    '/:deviceId/messages/contact',
    {
      schema: {
        description: 'Send a contact message (vCard)',
        tags: ['Messages'],
        params: {
          type: 'object',
          properties: {
            deviceId: { type: 'string' },
          },
          required: ['deviceId'],
        },
        body: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Recipient JID' },
            contacts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  displayName: { type: 'string' },
                  vcard: { type: 'string', description: 'vCard string' },
                },
              },
              description: 'Array of contacts to send',
            },
            quotedMessageId: { type: 'string' },
            idempotencyKey: { type: 'string' },
          },
          required: ['to', 'contacts'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              status: { type: 'string' },
              timestamp: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, _reply) => {
      await requireDeviceConnected(request as any, _reply as any);
      const { deviceId } = request.params;
      const tenantId = request.tenant!.id;
      const body = request.body;

      // Check rate limit
      const rateLimitCheck = checkMessageRateLimit(tenantId, deviceId, 'contact');
      _reply.header('X-RateLimit-Limit', rateLimitCheck.headers['X-RateLimit-Limit']);
      _reply.header('X-RateLimit-Remaining', rateLimitCheck.headers['X-RateLimit-Remaining']);
      _reply.header('X-RateLimit-Reset', rateLimitCheck.headers['X-RateLimit-Reset']);

      if (!rateLimitCheck.allowed) {
        _reply.header('Retry-After', rateLimitCheck.headers['Retry-After']);
        throw TOO_MANY_REQUESTS(rateLimitCheck.message);
      }

      if (!body.contacts || body.contacts.length === 0) {
        throw BAD_REQUEST('At least one contact must be provided');
      }

      try {
        const result = await messageService.sendContact(tenantId, deviceId, body);
        return _reply.send(result);
      } catch (error: any) {
        request.log.error(error, 'Failed to send contact message');
        throw INTERNAL_SERVER_ERROR(error.message || 'Failed to send contact');
      }
    }
  );

  /**
   * Send reaction (emoji) to a message
   * POST /v1/devices/:deviceId/messages/reaction
   */
  fastify.post<{ Params: MessageParams; Body: SendReactionMessageRequest }>(
    '/:deviceId/messages/reaction',
    {
      schema: {
        description: 'Send a reaction (emoji) to a message',
        tags: ['Messages'],
        params: {
          type: 'object',
          properties: {
            deviceId: { type: 'string' },
          },
          required: ['deviceId'],
        },
        body: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Chat JID where the message is' },
            messageId: { type: 'string', description: 'Message ID to react to' },
            emoji: { type: 'string', description: 'Emoji reaction (empty string to remove)' },
            fromMe: { type: 'boolean', description: 'Whether the referenced message was sent by this device (used when messageId is a WA id)' },
            participant: { type: 'string', description: 'Group participant JID (optional; used for group message references)' },
          },
          required: ['to', 'messageId', 'emoji'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'WA message key id used for reaction reference' },
              messageId: { type: 'string', description: 'WA message key id used for reaction reference (alias of id)' },
              status: { type: 'string' },
              timestamp: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, _reply) => {
      await requireDeviceConnected(request as any, _reply as any);
      await validateJidInBody(request as any, _reply as any);
      const { deviceId } = request.params;
      const tenantId = request.tenant!.id;
      const body = request.body;

      // Check rate limit
      const rateLimitCheck = checkMessageRateLimit(tenantId, deviceId, 'reaction');
      _reply.header('X-RateLimit-Limit', rateLimitCheck.headers['X-RateLimit-Limit']);
      _reply.header('X-RateLimit-Remaining', rateLimitCheck.headers['X-RateLimit-Remaining']);
      _reply.header('X-RateLimit-Reset', rateLimitCheck.headers['X-RateLimit-Reset']);

      if (!rateLimitCheck.allowed) {
        _reply.header('Retry-After', rateLimitCheck.headers['Retry-After']);
        throw TOO_MANY_REQUESTS(rateLimitCheck.message);
      }

      try {
        const result = await messageService.sendReaction(tenantId, deviceId, body);
        return _reply.send({
          id: result.messageId,
          messageId: result.messageId,
          status: result.status,
          timestamp: Date.now(),
        });
      } catch (error: any) {
        request.log.error(error, 'Failed to send reaction');
        throw INTERNAL_SERVER_ERROR(error.message || 'Failed to send reaction');
      }
    }
  );

  /**
   * Send poll message
   * POST /v1/devices/:deviceId/messages/poll
   */
  fastify.post<{ Params: MessageParams; Body: SendPollMessageRequest }>(
    '/:deviceId/messages/poll',
    {
      schema: {
        description: 'Send a poll message',
        tags: ['Messages'],
        params: {
          type: 'object',
          properties: {
            deviceId: { type: 'string' },
          },
          required: ['deviceId'],
        },
        body: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Recipient JID' },
            question: { type: 'string', description: 'Poll question' },
            options: {
              type: 'array',
              items: { type: 'string' },
              description: 'Poll options (2-12 items)',
            },
            selectableCount: {
              type: 'number',
              description: 'Number of options that can be selected (1 for single choice)',
            },
            idempotencyKey: { type: 'string' },
          },
          required: ['to', 'question', 'options'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              status: { type: 'string' },
              timestamp: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, _reply) => {
      await requireDeviceConnected(request as any, _reply as any);
      const { deviceId } = request.params;
      const tenantId = request.tenant!.id;
      const body = request.body;

      // Check rate limit
      const rateLimitCheck = checkMessageRateLimit(tenantId, deviceId, 'poll');
      _reply.header('X-RateLimit-Limit', rateLimitCheck.headers['X-RateLimit-Limit']);
      _reply.header('X-RateLimit-Remaining', rateLimitCheck.headers['X-RateLimit-Remaining']);
      _reply.header('X-RateLimit-Reset', rateLimitCheck.headers['X-RateLimit-Reset']);

      if (!rateLimitCheck.allowed) {
        _reply.header('Retry-After', rateLimitCheck.headers['Retry-After']);
        throw TOO_MANY_REQUESTS(rateLimitCheck.message);
      }

      if (!body.options || body.options.length < 2 || body.options.length > 12) {
        throw BAD_REQUEST('Poll must have between 2 and 12 options');
      }

      try {
        // Poll sending will be implemented in messageService
        throw INTERNAL_SERVER_ERROR('Poll sending not yet implemented');
      } catch (error: any) {
        request.log.error(error, 'Failed to send poll');
        throw INTERNAL_SERVER_ERROR(error.message || 'Failed to send poll');
      }
    }
  );

  /**
   * Delete a message (for everyone)
   * DELETE /v1/devices/:deviceId/messages/:messageId
   */
  fastify.delete<{ Params: MessageIdParams; Querystring: { to: string } }>(
    '/:deviceId/messages/:messageId',
    {
      schema: {
        description: 'Delete a message for everyone',
        tags: ['Messages'],
        params: {
          type: 'object',
          properties: {
            deviceId: { type: 'string' },
            messageId: { type: 'string', description: 'WhatsApp message ID to delete' },
          },
          required: ['deviceId', 'messageId'],
        },
        querystring: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Chat JID where the message is' },
          },
          required: ['to'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              timestamp: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, _reply) => {
      const { deviceId, messageId } = request.params;
      const tenantId = request.tenant!.id;
      const { to } = request.query;

      try {
        const result = await messageService.deleteMessage(tenantId, deviceId, {
          to,
          messageId,
        });
        return _reply.send(result);
      } catch (error: any) {
        request.log.error(error, 'Failed to delete message');
        throw INTERNAL_SERVER_ERROR(error.message || 'Failed to delete message');
      }
    }
  );

  /**
   * Get message status
   * GET /v1/devices/:deviceId/messages/:messageId/status
   */
  fastify.get<{ Params: MessageIdParams }>(
    '/:deviceId/messages/:messageId/status',
    {
      schema: {
        description: 'Get the status of a sent message',
        tags: ['Messages'],
        params: {
          type: 'object',
          properties: {
            deviceId: { type: 'string' },
            messageId: { type: 'string', description: 'Internal message ID' },
          },
          required: ['deviceId', 'messageId'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              status: { type: 'string' },
              waMessageId: { type: 'string' },
              attempts: { type: 'number' },
              lastError: { type: 'string' },
              createdAt: { type: 'number' },
              updatedAt: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, _reply) => {
      const { deviceId, messageId } = request.params;
      const tenantId = request.tenant!.id;

      try {
        const status = await messageService.getMessageStatus(tenantId, deviceId, messageId);
        if (!status) {
          throw NOT_FOUND('Message not found');
        }
        return _reply.send(status);
      } catch (error: any) {
        request.log.error(error, 'Failed to get message status');
        throw INTERNAL_SERVER_ERROR(error.message || 'Failed to get message status');
      }
    }
  );

  /**
   * List all chats
   * GET /v1/devices/:deviceId/chats
   */
  fastify.get<{ Params: MessageParams }>(
    '/:deviceId/chats',
    {
      schema: {
        description: 'Get all chats for the device',
        tags: ['Chats'],
        params: {
          type: 'object',
          properties: {
            deviceId: { type: 'string' },
          },
          required: ['deviceId'],
        },
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 200, default: 50 },
            offset: { type: 'number', minimum: 0, default: 0 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              synced: { type: 'boolean' },
              lastHistorySyncAt: { type: ['number', 'null'] },
              count: { type: 'number' },
              limit: { type: 'number' },
              offset: { type: 'number' },
              chats: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    jid: { type: 'string' },
                    name: { type: 'string' },
                    isGroup: { type: 'boolean' },
                    unreadCount: { type: 'number' },
                    lastMessageTime: { type: 'number' },
                    archived: { type: 'boolean' },
                    muted: { type: 'boolean' },
                    phoneNumber: { type: ['string', 'null'] },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, _reply) => {
      const { deviceId } = request.params;
      const { limit = 50, offset = 0 } = request.query as { limit?: number; offset?: number };

      try {
        const result = await chatService.getChats(deviceId, limit, offset);
        return _reply.send({
          synced: result.synced,
          lastHistorySyncAt: result.lastHistorySyncAt ?? null,
          count: result.count,
          limit,
          offset,
          chats: result.chats,
        });
      } catch (error: any) {
        request.log.error(error, 'Failed to get chats');
        throw INTERNAL_SERVER_ERROR(error.message || 'Failed to get chats');
      }
    }
  );

  /**
   * Get messages from a specific chat
   * GET /v1/devices/:deviceId/chats/:jid/messages
   */
  fastify.get<{
    Params: JidParams;
    Querystring: { limit?: number; before?: string };
  }>(
    '/:deviceId/chats/:jid/messages',
    {
      schema: {
        description: 'Get messages from a specific chat with pagination',
        tags: ['Chats'],
        params: {
          type: 'object',
          properties: {
            deviceId: { type: 'string' },
            jid: { type: 'string', description: 'Chat JID' },
          },
          required: ['deviceId', 'jid'],
        },
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Number of messages to return (default 50)' },
            before: { type: 'string', description: 'Message ID to paginate before' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              messages: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', description: 'Internal inbox row ID' },
                    waMessageId: { type: 'string', description: 'WhatsApp message ID' },
                    from: { type: 'string' },
                    to: { type: 'string' },
                    type: { type: 'string' },
                    text: { type: 'string' },
                    caption: { type: 'string' },
                    mediaUrl: { type: 'string' },
                    timestamp: { type: 'number' },
                    fromMe: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, _reply) => {
      const { deviceId, jid } = request.params;
      const { limit = 50, before } = request.query;

      try {
        const messages = await chatService.getMessages(deviceId, jid, {
          limit,
          before,
        });
        return _reply.send({ messages });
      } catch (error: any) {
        request.log.error(error, 'Failed to get messages');
        throw INTERNAL_SERVER_ERROR(error.message || 'Failed to get messages');
      }
    }
  );

  /**
   * Mark chat as read
   * POST /v1/devices/:deviceId/chats/:jid/mark-read
   */
  fastify.post<{ Params: JidParams }>(
    '/:deviceId/chats/:jid/mark-read',
    {
      schema: {
        description: 'Mark all messages in a chat as read',
        tags: ['Chats'],
        params: {
          type: 'object',
          properties: {
            deviceId: { type: 'string' },
            jid: { type: 'string', description: 'Chat JID' },
          },
          required: ['deviceId', 'jid'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (request, _reply) => {
      const { deviceId, jid } = request.params;

      try {
        await chatService.markAsRead(deviceId, jid);
        return _reply.send({ success: true });
      } catch (error: any) {
        request.log.error(error, 'Failed to mark chat as read');
        throw INTERNAL_SERVER_ERROR(error.message || 'Failed to mark as read');
      }
    }
  );

  /**
   * Archive/unarchive a chat
   * POST /v1/devices/:deviceId/chats/:jid/archive
   */
  fastify.post<{ Params: JidParams; Body: { archive: boolean } }>(
    '/:deviceId/chats/:jid/archive',
    {
      schema: {
        description: 'Archive or unarchive a chat',
        tags: ['Chats'],
        params: {
          type: 'object',
          properties: {
            deviceId: { type: 'string' },
            jid: { type: 'string', description: 'Chat JID' },
          },
          required: ['deviceId', 'jid'],
        },
        body: {
          type: 'object',
          properties: {
            archive: { type: 'boolean', description: 'true to archive, false to unarchive' },
          },
          required: ['archive'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (request, _reply) => {
      const { deviceId, jid } = request.params;
      const { archive } = request.body;

      try {
        await chatService.archiveChat(deviceId, jid, archive);
        return _reply.send({ success: true });
      } catch (error: any) {
        request.log.error(error, 'Failed to archive chat');
        throw INTERNAL_SERVER_ERROR(error.message || 'Failed to archive chat');
      }
    }
  );

  /**
   * Mute/unmute a chat
   * POST /v1/devices/:deviceId/chats/:jid/mute
   */
  fastify.post<{
    Params: JidParams;
    Body: { mute: boolean; durationMs?: number };
  }>(
    '/:deviceId/chats/:jid/mute',
    {
      schema: {
        description: 'Mute or unmute a chat',
        tags: ['Chats'],
        params: {
          type: 'object',
          properties: {
            deviceId: { type: 'string' },
            jid: { type: 'string', description: 'Chat JID' },
          },
          required: ['deviceId', 'jid'],
        },
        body: {
          type: 'object',
          properties: {
            mute: { type: 'boolean', description: 'true to mute, false to unmute' },
            durationMs: {
              type: 'number',
              description: 'Duration in milliseconds (null for permanent)',
            },
          },
          required: ['mute'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (request, _reply) => {
      const { deviceId, jid } = request.params;
      const { mute, durationMs: durationParam } = request.body;
      const duration = mute ? durationParam : undefined;

      try {
        await chatService.muteChat(deviceId, jid, duration);
        return _reply.send({ success: true });
      } catch (error: any) {
        request.log.error(error, 'Failed to mute chat');
        throw INTERNAL_SERVER_ERROR(error.message || 'Failed to mute chat');
      }
    }
  );

  /**
   * Send presence update (typing, recording, available)
   * POST /v1/devices/:deviceId/presence
   */
  fastify.post<{
    Params: MessageParams;
    Body: { to: string; type: 'available' | 'unavailable' | 'composing' | 'recording' | 'paused' };
  }>(
    '/:deviceId/presence',
    {
      schema: {
        description: 'Send presence update (typing, recording, online, offline)',
        tags: ['Presence'],
        params: {
          type: 'object',
          properties: {
            deviceId: { type: 'string' },
          },
          required: ['deviceId'],
        },
        body: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Chat JID' },
            type: {
              type: 'string',
              enum: ['available', 'unavailable', 'composing', 'recording', 'paused'],
              description: 'Presence type',
            },
          },
          required: ['to', 'type'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (request, _reply) => {
      const { deviceId } = request.params;
      const { to, type } = request.body;

      try {
        await chatService.sendPresence(deviceId, to, type);
        return _reply.send({ success: true });
      } catch (error: any) {
        request.log.error(error, 'Failed to send presence');
        throw INTERNAL_SERVER_ERROR(error.message || 'Failed to send presence');
      }
    }
  );
};
