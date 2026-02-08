import { FastifyPluginAsync } from 'fastify';
import { verifyTenantApiKey } from '../../middlewares/tenant-auth.js';
import { webhookRepository } from '../../modules/webhooks/repository.js';
import { BAD_REQUEST, NOT_FOUND } from '../../utils/http-errors.js';
import type { CreateWebhookRequest, UpdateWebhookRequest } from '../../modules/webhooks/types.js';

export const webhooksRoutes: FastifyPluginAsync = async (fastify) => {
  // Auth
  fastify.addHook('preHandler', verifyTenantApiKey);

  /**
   * Create webhook
   * POST /v1/webhooks
   */
  fastify.post<{ Body: CreateWebhookRequest }>(
    '/',
    {
      schema: {
        description: 'Register a webhook for tenant events',
        tags: ['Webhooks'],
        body: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            events: { type: 'array', items: { type: 'string' } },
            secret: { type: 'string' },
            retryCount: { type: 'number' },
            timeout: { type: 'number' },
          },
          required: ['url', 'events'],
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              url: { type: 'string' },
              events: { type: 'array' },
              enabled: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (_request, _reply) => {
      const tenantId = _request.tenant!.id;
      const body = _request.body;

      if (!body.url || !body.events || body.events.length === 0) {
        throw BAD_REQUEST('url and events are required');
      }

      try {
        const webhook = webhookRepository.create(tenantId, body);
        return _reply.code(201).send(webhook);
      } catch (error: any) {
        _request.log.error(error, 'Failed to create webhook');
        throw BAD_REQUEST(error.message || 'Failed to create webhook');
      }
    }
  );

  /**
   * List webhooks
   * GET /v1/webhooks
   */
  fastify.get(
    '/',
    {
      schema: {
        description: 'List webhooks for the tenant',
        tags: ['Webhooks'],
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                url: { type: 'string' },
                events: { type: 'array' },
                enabled: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
    async (_request, _reply) => {
      const tenantId = _request.tenant!.id;
      const webhooks = webhookRepository.getByTenantId(tenantId);
      return _reply.send(webhooks);
    }
  );

  /**
   * Get webhook
   * GET /v1/webhooks/:id
   */
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    {
      schema: {
        description: 'Get webhook details',
        tags: ['Webhooks'],
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
    },
    async (_request, _reply) => {
      const { id } = _request.params;
      const webhook = webhookRepository.getById(id);

      if (!webhook || webhook.tenantId !== _request.tenant!.id) {
        throw NOT_FOUND('Webhook not found');
      }

      return _reply.send(webhook);
    }
  );

  /**
   * Update webhook
   * PUT /v1/webhooks/:id
   */
  fastify.put<{ Params: { id: string }; Body: UpdateWebhookRequest }>(
    '/:id',
    {
      schema: {
        description: 'Update webhook configuration',
        tags: ['Webhooks'],
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
        body: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            events: { type: 'array' },
            secret: { type: 'string' },
            enabled: { type: 'boolean' },
            retryCount: { type: 'number' },
            timeout: { type: 'number' },
          },
        },
      },
    },
    async (_request, _reply) => {
      const { id } = _request.params;
      const webhook = webhookRepository.getById(id);

      if (!webhook || webhook.tenantId !== _request.tenant!.id) {
        throw NOT_FOUND('Webhook not found');
      }

      try {
        const updated = webhookRepository.update(id, _request.body);
        return _reply.send(updated);
      } catch (error: any) {
        _request.log.error(error, 'Failed to update webhook');
        throw BAD_REQUEST(error.message || 'Failed to update webhook');
      }
    }
  );

  /**
   * Delete webhook
   * DELETE /v1/webhooks/:id
   */
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    {
      schema: {
        description: 'Delete webhook',
        tags: ['Webhooks'],
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
        response: {
          204: { type: 'null' },
        },
      },
    },
    async (_request, _reply) => {
      const { id } = _request.params;
      const webhook = webhookRepository.getById(id);

      if (!webhook || webhook.tenantId !== _request.tenant!.id) {
        throw NOT_FOUND('Webhook not found');
      }

      webhookRepository.delete(id);
      return _reply.code(204).send();
    }
  );
};
