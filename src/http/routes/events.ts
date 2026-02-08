import { FastifyPluginAsync } from 'fastify';
import { verifyTenantApiKey } from '../../middlewares/tenant-auth.js';
import { verifyDeviceOwnership } from '../../middlewares/device-ownership.js';
import { eventRepository } from '../../modules/events/repository.js';
import { BAD_REQUEST } from '../../utils/http-errors.js';

export const eventsRoutes: FastifyPluginAsync = async (fastify) => {
  // Auth
  fastify.addHook('preHandler', verifyTenantApiKey);
  fastify.addHook('preHandler', verifyDeviceOwnership);

  /**
   * Get events
   * GET /v1/devices/:deviceId/events?since=...&type=...
   */
  fastify.get<{ Params: { deviceId: string }; Querystring: { since?: string; type?: string; limit?: string } }>(
    '/',
    {
      schema: {
        description: 'Get inbound events for a device',
        tags: ['Events'],
        params: {
          type: 'object',
          properties: { deviceId: { type: 'string' } },
          required: ['deviceId'],
        },
        querystring: {
          type: 'object',
          properties: {
            since: { type: 'string', description: 'Unix timestamp (seconds)' },
            type: { type: 'string' },
            limit: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                type: { type: 'string' },
                payload: { type: 'object' },
                receivedAt: { type: 'number' },
              },
            },
          },
        },
      },
    },
    async (_request, _reply) => {
      const { deviceId } = _request.params;
      const tenantId = _request.tenant!.id;
      const since = _request.query.since ? parseInt(_request.query.since, 10) : undefined;
      const type = _request.query.type as any;
      const limit = _request.query.limit ? Math.min(parseInt(_request.query.limit, 10), 500) : 100;

      try {
        const events = eventRepository.getEvents(tenantId, deviceId, since, type, limit);
        return _reply.send(events);
      } catch (error: any) {
        _request.log.error(error, 'Failed to get events');
        throw BAD_REQUEST(error.message || 'Failed to get events');
      }
    }
  );
};
