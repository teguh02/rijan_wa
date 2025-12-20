import { FastifyPluginAsync } from 'fastify';
import { verifyTenantApiKey } from '../../middlewares/tenant-auth';
import { verifyDeviceOwnership } from '../../middlewares/device-ownership';
import { deviceManager } from '../../baileys/device-manager';
import { BAD_REQUEST, NOT_FOUND, INTERNAL_SERVER_ERROR } from '../../utils/http-errors';
import { logAudit } from '../../utils/audit';

export const groupsRoutes: FastifyPluginAsync = async (fastify) => {
  // Auth
  fastify.addHook('preHandler', verifyTenantApiKey);
  fastify.addHook('preHandler', verifyDeviceOwnership);

  /**
   * Create group
   * POST /v1/devices/:deviceId/groups/create
   */
  fastify.post<{ Params: { deviceId: string }; Body: { subject: string; participants: string[] } }>(
    '/create',
    {
      schema: {
        description: 'Create a new group',
        tags: ['Groups'],
        params: {
          type: 'object',
          properties: { deviceId: { type: 'string' } },
          required: ['deviceId'],
        },
        body: {
          type: 'object',
          properties: {
            subject: { type: 'string' },
            participants: { type: 'array', items: { type: 'string' } },
          },
          required: ['subject', 'participants'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              groupJid: { type: 'string' },
              subject: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request, _reply) => {
      const { deviceId } = _request.params;
      const tenantId = _request.tenant!.id;
      const { subject, participants } = _request.body;

      if (!subject || !participants || participants.length === 0) {
        throw BAD_REQUEST('subject and participants are required');
      }

      try {
        const instance = deviceManager.getDeviceState(deviceId);
        if (!instance) {
          throw NOT_FOUND('Device not connected');
        }

        // Get socket
        const stmt = (deviceManager as any).devices.get(deviceId);
        if (!stmt?.socket) {
          throw NOT_FOUND('Device socket not available');
        }

        const socket = stmt.socket;

        // Ensure participants are properly formatted
        const formattedParticipants = participants.map(p => {
          if (!p.includes('@')) {
            return `${p}@s.whatsapp.net`;
          }
          return p;
        });

        // Create group
        const group = await socket.groupCreate(subject, formattedParticipants);

        logAudit(tenantId, {
          actor: `device:${deviceId}`,
          action: 'group.created',
          resourceType: 'group',
          resourceId: group.gid,
          meta: { subject, participants: formattedParticipants },
        }, _request.ip);

        return _reply.send({
          groupJid: group.gid,
          subject: group.subject,
        });
      } catch (error: any) {
        _request.log.error(error, 'Failed to create group');
        throw INTERNAL_SERVER_ERROR(error.message || 'Failed to create group');
      }
    }
  );

  /**
   * Get group info
   * GET /v1/devices/:deviceId/groups/:groupJid
   */
  fastify.get<{ Params: { deviceId: string; groupJid: string } }>(
    '/:groupJid',
    {
      schema: {
        description: 'Get group information',
        tags: ['Groups'],
        params: {
          type: 'object',
          properties: {
            deviceId: { type: 'string' },
            groupJid: { type: 'string' },
          },
          required: ['deviceId', 'groupJid'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              subject: { type: 'string' },
              owner: { type: 'string' },
              participants: { type: 'array' },
              creation: { type: 'number' },
            },
          },
        },
      },
    },
    async (_request, _reply) => {
      const { deviceId, groupJid } = _request.params;

      try {
        const stmt = (deviceManager as any).devices.get(deviceId);
        if (!stmt?.socket) {
          throw NOT_FOUND('Device socket not available');
        }

        const socket = stmt.socket;
        const groupInfo = await socket.groupMetadata(groupJid);

        return _reply.send({
          id: groupInfo.id,
          subject: groupInfo.subject,
          owner: groupInfo.owner,
          participants: groupInfo.participants,
          creation: groupInfo.creation,
        });
      } catch (error: any) {
        _request.log.error(error, 'Failed to get group info');
        throw INTERNAL_SERVER_ERROR(error.message || 'Failed to get group info');
      }
    }
  );

  /**
   * Add participants to group
   * POST /v1/devices/:deviceId/groups/:groupJid/participants/add
   */
  fastify.post<{ Params: { deviceId: string; groupJid: string }; Body: { participants: string[] } }>(
    '/:groupJid/participants/add',
    {
      schema: {
        description: 'Add participants to group',
        tags: ['Groups'],
        params: {
          type: 'object',
          properties: {
            deviceId: { type: 'string' },
            groupJid: { type: 'string' },
          },
          required: ['deviceId', 'groupJid'],
        },
        body: {
          type: 'object',
          properties: {
            participants: { type: 'array', items: { type: 'string' } },
          },
          required: ['participants'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              added: { type: 'array' },
            },
          },
        },
      },
    },
    async (_request, _reply) => {
      const { deviceId, groupJid } = _request.params;
      const tenantId = _request.tenant!.id;
      const { participants } = _request.body;

      if (!participants || participants.length === 0) {
        throw BAD_REQUEST('participants array is required');
      }

      try {
        const stmt = (deviceManager as any).devices.get(deviceId);
        if (!stmt?.socket) {
          throw NOT_FOUND('Device socket not available');
        }

        const socket = stmt.socket;

        const formattedParticipants = participants.map(p => {
          if (!p.includes('@')) {
            return `${p}@s.whatsapp.net`;
          }
          return p;
        });

        await socket.groupParticipantsUpdate(groupJid, formattedParticipants, 'add');

        logAudit(tenantId, {
          actor: `device:${deviceId}`,
          action: 'group.participant.added',
          resourceType: 'group',
          resourceId: groupJid,
          meta: { participants: formattedParticipants },
        }, _request.ip);

        return _reply.send({
          success: true,
          added: formattedParticipants,
        });
      } catch (error: any) {
        _request.log.error(error, 'Failed to add participants');
        throw INTERNAL_SERVER_ERROR(error.message || 'Failed to add participants');
      }
    }
  );

  /**
   * Remove participants from group
   * POST /v1/devices/:deviceId/groups/:groupJid/participants/remove
   */
  fastify.post<{ Params: { deviceId: string; groupJid: string }; Body: { participants: string[] } }>(
    '/:groupJid/participants/remove',
    {
      schema: {
        description: 'Remove participants from group',
        tags: ['Groups'],
        params: {
          type: 'object',
          properties: {
            deviceId: { type: 'string' },
            groupJid: { type: 'string' },
          },
          required: ['deviceId', 'groupJid'],
        },
        body: {
          type: 'object',
          properties: {
            participants: { type: 'array', items: { type: 'string' } },
          },
          required: ['participants'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              removed: { type: 'array' },
            },
          },
        },
      },
    },
    async (_request, _reply) => {
      const { deviceId, groupJid } = _request.params;
      const tenantId = _request.tenant!.id;
      const { participants } = _request.body;

      if (!participants || participants.length === 0) {
        throw BAD_REQUEST('participants array is required');
      }

      try {
        const stmt = (deviceManager as any).devices.get(deviceId);
        if (!stmt?.socket) {
          throw NOT_FOUND('Device socket not available');
        }

        const socket = stmt.socket;

        const formattedParticipants = participants.map(p => {
          if (!p.includes('@')) {
            return `${p}@s.whatsapp.net`;
          }
          return p;
        });

        await socket.groupParticipantsUpdate(groupJid, formattedParticipants, 'remove');

        logAudit(tenantId, {
          actor: `device:${deviceId}`,
          action: 'group.participant.removed',
          resourceType: 'group',
          resourceId: groupJid,
          meta: { participants: formattedParticipants },
        }, _request.ip);

        return _reply.send({
          success: true,
          removed: formattedParticipants,
        });
      } catch (error: any) {
        _request.log.error(error, 'Failed to remove participants');
        throw INTERNAL_SERVER_ERROR(error.message || 'Failed to remove participants');
      }
    }
  );
};
