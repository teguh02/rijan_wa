import { FastifyPluginAsync } from 'fastify';
import { verifyTenantApiKey } from '../../middlewares/tenant-auth';
import { verifyDeviceOwnership } from '../../middlewares/device-ownership';
import { deviceManager } from '../../baileys/device-manager';
import { NOT_FOUND, INTERNAL_SERVER_ERROR } from '../../utils/http-errors';
import { logAudit } from '../../utils/audit';

export const privacyRoutes: FastifyPluginAsync = async (fastify) => {
  // Auth
  fastify.addHook('preHandler', verifyTenantApiKey);
  fastify.addHook('preHandler', verifyDeviceOwnership);

  /**
   * Get privacy settings
   * GET /v1/devices/:deviceId/privacy/settings
   */
  fastify.get<{ Params: { deviceId: string } }>(
    '/settings',
    {
      schema: {
        description: 'Get device privacy settings',
        tags: ['Privacy'],
        params: {
          type: 'object',
          properties: { deviceId: { type: 'string' } },
          required: ['deviceId'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              readreceipts: { type: 'string' },
              online: { type: 'string' },
              lastSeen: { type: 'string' },
              groupAdd: { type: 'string' },
              statusPrivacy: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request, _reply) => {
      const { deviceId } = _request.params;

      try {
        const stmt = (deviceManager as any).devices.get(deviceId);
        if (!stmt?.socket) {
          throw NOT_FOUND('Device socket not available');
        }

        const socket = stmt.socket;
        
        // Get privacy settings from Baileys
        const settings = await socket.fetchPrivacySettings();

        return _reply.send(settings || {});
      } catch (error: any) {
        _request.log.error(error, 'Failed to get privacy settings');
        throw INTERNAL_SERVER_ERROR(error.message || 'Failed to get privacy settings');
      }
    }
  );

  /**
   * Update privacy settings
   * POST /v1/devices/:deviceId/privacy/settings
   */
  fastify.post<{
    Params: { deviceId: string };
    Body: {
      readreceipts?: string;
      online?: string;
      lastSeen?: string;
      groupAdd?: string;
      statusPrivacy?: string;
    };
  }>(
    '/settings',
    {
      schema: {
        description: 'Update device privacy settings',
        tags: ['Privacy'],
        params: {
          type: 'object',
          properties: { deviceId: { type: 'string' } },
          required: ['deviceId'],
        },
        body: {
          type: 'object',
          properties: {
            readreceipts: { type: 'string', enum: ['all', 'none'] },
            online: { type: 'string', enum: ['all', 'matches'] },
            lastSeen: { type: 'string', enum: ['all', 'contacts', 'none'] },
            groupAdd: { type: 'string', enum: ['all', 'contacts', 'none'] },
            statusPrivacy: { type: 'string', enum: ['all', 'contacts', 'none'] },
          },
        },
      },
    },
    async (_request, _reply) => {
      const { deviceId } = _request.params;
      const tenantId = _request.tenant!.id;
      const body = _request.body;

      try {
        const stmt = (deviceManager as any).devices.get(deviceId);
        if (!stmt?.socket) {
          throw NOT_FOUND('Device socket not available');
        }

        const socket = stmt.socket;

        // Update each setting if provided
        const updates = [] as any[];

        if (body.readreceipts) {
          await socket.updateReadReceipts(body.readreceipts === 'all');
          updates.push('readreceipts');
        }

        if (body.lastSeen) {
          await socket.updateLastSeen(body.lastSeen);
          updates.push('lastSeen');
        }

        if (body.groupAdd) {
          await socket.updateGroupsPrivacy(body.groupAdd);
          updates.push('groupAdd');
        }

        if (body.statusPrivacy) {
          await socket.updateStatusPrivacy(body.statusPrivacy);
          updates.push('statusPrivacy');
        }

        logAudit(tenantId, {
          actor: `device:${deviceId}`,
          action: 'privacy.settings.updated',
          resourceType: 'privacy',
          resourceId: deviceId,
          meta: { updated: updates, settings: body },
        }, _request.ip);

        return _reply.send({
          success: true,
          updated: updates,
        });
      } catch (error: any) {
        _request.log.error(error, 'Failed to update privacy settings');
        throw INTERNAL_SERVER_ERROR(error.message || 'Failed to update privacy settings');
      }
    }
  );
};
