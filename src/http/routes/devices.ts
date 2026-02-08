import { FastifyInstance } from 'fastify';
import { verifyTenantApiKey } from '../../middlewares/tenant-auth.js';
import { verifyDeviceOwnership } from '../../middlewares/device-ownership.js';
import { deviceManager } from '../../baileys/device-manager.js';
import { ChatRepository, DeviceRepository, AuditLogRepository, DeviceSessionRepository } from '../../storage/repositories.js';
import { AppError, ErrorCode, StandardResponse } from '../../types/index.js';

const deviceRepo = new DeviceRepository();
const auditRepo = new AuditLogRepository();
const deviceSessionRepo = new DeviceSessionRepository();
const chatRepo = new ChatRepository();

export async function registerDeviceRoutes(server: FastifyInstance): Promise<void> {
  // All device routes require tenant authentication
  server.addHook('preHandler', verifyTenantApiKey);

  // Debug: chat sync state
  server.get<{ Params: { deviceId: string } }>(
    '/v1/devices/:deviceId/debug/chats-sync',
    {
      preHandler: verifyDeviceOwnership,
      schema: {
        tags: ['devices'],
        description: 'Debug endpoint for chat history sync (DB-backed chats)',
        security: [{ apiKey: [] }],
        params: {
          type: 'object',
          required: ['deviceId'],
          properties: {
            deviceId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { deviceId } = request.params;
      const tenantId = request.tenant!.id;

      const device = deviceRepo.findById(deviceId, tenantId);
      if (!device) {
        throw new AppError(ErrorCode.NOT_FOUND, 'Device not found', 404);
      }

      const connectionInfo = deviceManager.getConnectionInfo(deviceId);
      const sync = chatRepo.getSyncState(deviceId);
      const chatCount = chatRepo.countByDevice(deviceId);

      const response: StandardResponse = {
        success: true,
        data: {
          deviceId,
          connection: connectionInfo,
          db: {
            chatCount,
          },
          sync: {
            lastHistorySyncAt: sync?.last_history_sync_at ?? null,
            lastHistorySyncChatsCount: sync?.last_history_sync_chats_count ?? null,
            lastChatsUpsertAt: sync?.last_chats_upsert_at ?? null,
            lastChatsUpdateAt: sync?.last_chats_update_at ?? null,
            lastChatsDeleteAt: sync?.last_chats_delete_at ?? null,
            updatedAt: sync?.updated_at ?? null,
          },
        },
        requestId: request.requestId,
      };

      reply.send(response);
    }
  );

  // Debug: protocol tap ring buffer (Baileys decrypted-level events)
  server.get<{ Params: { deviceId: string }; Querystring: { limit?: number } }>(
    '/v1/devices/:deviceId/debug/protocol',
    {
      preHandler: verifyDeviceOwnership,
      schema: {
        tags: ['devices'],
        description: 'Debug endpoint to inspect recent Baileys events per device (ring buffer). Enable with DEBUG_PROTOCOL_TAP=true.',
        security: [{ apiKey: [] }],
        params: {
          type: 'object',
          required: ['deviceId'],
          properties: {
            deviceId: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 200, default: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      const { deviceId } = request.params;
      const { limit = 50 } = request.query;
      const tenantId = request.tenant!.id;

      const device = deviceRepo.findById(deviceId, tenantId);
      if (!device) {
        throw new AppError(ErrorCode.NOT_FOUND, 'Device not found', 404);
      }

      const tap = deviceManager.getProtocolTap(deviceId, limit);

      const response: StandardResponse = {
        success: true,
        data: {
          deviceId,
          enabled: tap.enabled,
          items: tap.items,
        },
        requestId: request.requestId,
      };

      reply.send(response);
    }
  );

  // List devices milik tenant
  server.get('/v1/devices', {
    schema: {
      tags: ['devices'],
      description: 'List all devices milik tenant',
      security: [{ apiKey: [] }],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
          offset: { type: 'number', minimum: 0, default: 0 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                devices: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      label: { type: 'string' },
                      status: { type: 'string' },
                      phone_number: { type: 'string' },
                      created_at: { type: 'number' },
                      last_seen: { type: 'number' },
                    },
                  },
                },
                count: { type: 'number' },
              },
            },
            requestId: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { limit = 50, offset = 0 } = request.query as { limit?: number; offset?: number };
    const tenantId = request.tenant!.id;

    const devices = deviceRepo.findByTenant(tenantId, limit, offset);

    const response: StandardResponse = {
      success: true,
      data: {
        devices: devices.map(d => ({
          id: d.id,
          label: d.label,
          status: d.status,
          phone_number: d.phone_number,
          created_at: d.created_at,
          last_seen: d.last_seen,
        })),
        count: devices.length,
      },
      requestId: request.requestId,
    };

    reply.send(response);
  });

  // List session metadata untuk semua device tenant
  server.get('/v1/devices/sessions', {
    schema: {
      tags: ['devices'],
      description: 'List session metadata untuk semua device milik tenant (mapping device -> folder session Baileys)',
      security: [{ apiKey: [] }],
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
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                sessions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      device_id: { type: 'string' },
                      tenant_id: { type: 'string' },
                      session_kind: { type: 'string' },
                      session_dir: { type: 'string' },
                      wa_jid: { type: 'string' },
                      wa_name: { type: 'string' },
                      updated_at: { type: 'number' },
                    },
                  },
                },
                count: { type: 'number' },
              },
            },
            requestId: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { limit = 50, offset = 0 } = request.query as { limit?: number; offset?: number };
    const tenantId = request.tenant!.id;

    const sessions = deviceSessionRepo.findByTenant(tenantId, limit, offset);

    const response: StandardResponse = {
      success: true,
      data: {
        sessions: sessions.map(s => ({
          device_id: s.device_id,
          tenant_id: (s.tenant_id || tenantId) as string,
          session_kind: s.session_kind || 'baileys_multifile',
          session_dir: s.session_dir || '',
          wa_jid: s.wa_jid || '',
          wa_name: s.wa_name || '',
          updated_at: s.updated_at,
        })),
        count: sessions.length,
      },
      requestId: request.requestId,
    };

    reply.send(response);
  });

  // Get device detail dengan status real-time
  server.get<{ Params: { deviceId: string } }>('/v1/devices/:deviceId', {
    preHandler: verifyDeviceOwnership,
    schema: {
      tags: ['devices'],
      description: 'Get device detail dan connection state',
      security: [{ apiKey: [] }],
      params: {
        type: 'object',
        required: ['deviceId'],
        properties: {
          deviceId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { deviceId } = request.params;
    const tenantId = request.tenant!.id;

    const device = deviceRepo.findById(deviceId, tenantId);
    if (!device) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Device not found', 404);
    }

    // Get real-time connection info
    const connectionInfo = deviceManager.getConnectionInfo(deviceId);

    const response: StandardResponse = {
      success: true,
      data: {
        device: {
          id: device.id,
          label: device.label,
          status: connectionInfo.status,
          phone_number: device.phone_number || connectionInfo.phoneNumber,
          wa_jid: connectionInfo.waJid,
          created_at: device.created_at,
          last_seen: device.last_seen,
          connection: {
            is_connected: connectionInfo.isConnected,
            last_connect_at: connectionInfo.lastConnectAt,
            last_disconnect_at: connectionInfo.lastDisconnectAt,
            uptime: connectionInfo.uptime,
          },
        },
      },
      requestId: request.requestId,
    };

    reply.send(response);
  });

  // Start device
  server.post<{ Params: { deviceId: string } }>('/v1/devices/:deviceId/start', {
    preHandler: verifyDeviceOwnership,
    schema: {
      tags: ['devices'],
      description: 'Start device dan connect ke WhatsApp',
      security: [{ apiKey: [] }],
      params: {
        type: 'object',
        required: ['deviceId'],
        properties: {
          deviceId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { deviceId } = request.params;
    const tenantId = request.tenant!.id;

    try {
      const state = await deviceManager.startDevice(deviceId, tenantId);

      auditRepo.create({
        tenant_id: tenantId,
        actor: tenantId,
        action: 'device.started',
        resource_type: 'device',
        resource_id: deviceId,
        ip_address: request.ip,
        user_agent: request.headers['user-agent'],
      });

      const response: StandardResponse = {
        success: true,
        data: {
          message: 'Device started',
          status: state.status,
        },
        requestId: request.requestId,
      };

      reply.send(response);
    } catch (error) {
      throw new AppError(
        ErrorCode.INTERNAL_ERROR,
        error instanceof Error ? error.message : 'Failed to start device',
        500
      );
    }
  });

  // Stop device
  server.post<{ Params: { deviceId: string } }>('/v1/devices/:deviceId/stop', {
    preHandler: verifyDeviceOwnership,
    schema: {
      tags: ['devices'],
      description: 'Stop device dan disconnect dari WhatsApp',
      security: [{ apiKey: [] }],
      params: {
        type: 'object',
        required: ['deviceId'],
        properties: {
          deviceId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { deviceId } = request.params;
    const tenantId = request.tenant!.id;

    try {
      await deviceManager.stopDevice(deviceId);

      auditRepo.create({
        tenant_id: tenantId,
        actor: tenantId,
        action: 'device.stopped',
        resource_type: 'device',
        resource_id: deviceId,
        ip_address: request.ip,
        user_agent: request.headers['user-agent'],
      });

      const response: StandardResponse = {
        success: true,
        data: { message: 'Device stopped' },
        requestId: request.requestId,
      };

      reply.send(response);
    } catch (error) {
      throw new AppError(
        ErrorCode.INTERNAL_ERROR,
        error instanceof Error ? error.message : 'Failed to stop device',
        500
      );
    }
  });

  // Logout device
  server.post<{ Params: { deviceId: string } }>('/v1/devices/:deviceId/logout', {
    preHandler: verifyDeviceOwnership,
    schema: {
      tags: ['devices'],
      description: 'Logout device dan hapus session WhatsApp',
      security: [{ apiKey: [] }],
      params: {
        type: 'object',
        required: ['deviceId'],
        properties: {
          deviceId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { deviceId } = request.params;
    const tenantId = request.tenant!.id;

    try {
      await deviceManager.logoutDevice(deviceId);

      auditRepo.create({
        tenant_id: tenantId,
        actor: tenantId,
        action: 'device.logout',
        resource_type: 'device',
        resource_id: deviceId,
        ip_address: request.ip,
        user_agent: request.headers['user-agent'],
      });

      const response: StandardResponse = {
        success: true,
        data: { message: 'Device logged out successfully' },
        requestId: request.requestId,
      };

      reply.send(response);
    } catch (error) {
      throw new AppError(
        ErrorCode.INTERNAL_ERROR,
        error instanceof Error ? error.message : 'Failed to logout device',
        500
      );
    }
  });

  // Request QR code untuk pairing
  server.post<{ Params: { deviceId: string } }>('/v1/devices/:deviceId/pairing/qr', {
    preHandler: verifyDeviceOwnership,
    schema: {
      tags: ['devices'],
      description: 'Request QR code untuk pairing device',
      security: [{ apiKey: [] }],
      params: {
        type: 'object',
        required: ['deviceId'],
        properties: {
          deviceId: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                qr_code: { type: 'string', description: 'Base64 data URL' },
                expires_at: { type: 'number' },
                message: { type: 'string' },
              },
            },
            requestId: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { deviceId } = request.params;
    const tenantId = request.tenant!.id;

    try {
      const qrString = await deviceManager.requestQrCode(deviceId, tenantId);

      if (!qrString) {
        throw new AppError(ErrorCode.INTERNAL_ERROR, 'Failed to generate QR code', 500);
      }

      auditRepo.create({
        tenant_id: tenantId,
        actor: tenantId,
        action: 'device.qr_requested',
        resource_type: 'device',
        resource_id: deviceId,
        ip_address: request.ip,
        user_agent: request.headers['user-agent'],
      });

      const response: StandardResponse = {
        success: true,
        data: {
          qr_code: qrString,
          expires_at: Date.now() + 60000, // 60 seconds
          message: 'Scan the QR code with WhatsApp on your smartphone',
        },
        requestId: request.requestId,
      };

      reply.send(response);
    } catch (error) {
      throw new AppError(
        ErrorCode.INTERNAL_ERROR,
        error instanceof Error ? error.message : 'Failed to generate QR code',
        500
      );
    }
  });

  // Request pairing code
  server.post<{ Params: { deviceId: string }; Body: { phone_number: string } }>(
    '/v1/devices/:deviceId/pairing/code',
    {
      preHandler: verifyDeviceOwnership,
      schema: {
        tags: ['devices'],
        description: 'Request pairing code untuk device',
        security: [{ apiKey: [] }],
        params: {
          type: 'object',
          required: ['deviceId'],
          properties: {
            deviceId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['phone_number'],
          properties: {
            phone_number: {
              type: 'string',
              description: 'Nomor WhatsApp (format internasional tanpa +)',
              pattern: '^[0-9]{10,15}$',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  pairing_code: { type: 'string' },
                  phone_number: { type: 'string' },
                  expires_at: { type: 'number' },
                  message: { type: 'string' },
                },
              },
              requestId: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { deviceId } = request.params;
      const { phone_number } = request.body;
      const tenantId = request.tenant!.id;

      try {
        const pairingCode = await deviceManager.requestPairingCode(
          deviceId,
          tenantId,
          phone_number
        );

        auditRepo.create({
          tenant_id: tenantId,
          actor: tenantId,
          action: 'device.pairing_code_requested',
          resource_type: 'device',
          resource_id: deviceId,
          ip_address: request.ip,
          user_agent: request.headers['user-agent'],
          meta: JSON.stringify({ phone_number }),
        });

        const response: StandardResponse = {
          success: true,
          data: {
            pairing_code: pairingCode,
            phone_number: phone_number,
            expires_at: Date.now() + 60000, // 60 seconds
            message: 'Masukkan pairing code ini di WhatsApp > Linked Devices',
          },
          requestId: request.requestId,
        };

        reply.send(response);
      } catch (error) {
        throw new AppError(
          ErrorCode.INTERNAL_ERROR,
          error instanceof Error ? error.message : 'Failed to generate pairing code',
          500
        );
      }
    }
  );

  // Device health check
  server.get<{ Params: { deviceId: string } }>('/v1/devices/:deviceId/health', {
    preHandler: verifyDeviceOwnership,
    schema: {
      tags: ['devices'],
      description: 'Get device health dan connection status',
      security: [{ apiKey: [] }],
      params: {
        type: 'object',
        required: ['deviceId'],
        properties: {
          deviceId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { deviceId } = request.params;

    const connectionInfo = deviceManager.getConnectionInfo(deviceId);

    const response: StandardResponse = {
      success: true,
      data: {
        is_connected: connectionInfo.isConnected,
        status: connectionInfo.status,
        wa_jid: connectionInfo.waJid,
        phone_number: connectionInfo.phoneNumber,
        last_connect_at: connectionInfo.lastConnectAt,
        last_disconnect_at: connectionInfo.lastDisconnectAt,
        last_error: connectionInfo.lastError,
        uptime: connectionInfo.uptime,
      },
      requestId: request.requestId,
    };

    reply.send(response);
  });

  // Get session metadata (device -> session folder mapping)
  server.get<{ Params: { deviceId: string } }>('/v1/devices/:deviceId/session', {
    preHandler: verifyDeviceOwnership,
    schema: {
      tags: ['devices'],
      description: 'Get session metadata untuk device (mapping ke folder sessions Baileys)',
      security: [{ apiKey: [] }],
      params: {
        type: 'object',
        required: ['deviceId'],
        properties: {
          deviceId: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                has_session: { type: 'boolean' },
                session: {
                  anyOf: [
                    { type: 'null' },
                    {
                      type: 'object',
                      properties: {
                        device_id: { type: 'string' },
                        tenant_id: { type: 'string' },
                        session_kind: { type: 'string' },
                        session_dir: { type: 'string' },
                        wa_jid: { type: 'string' },
                        wa_name: { type: 'string' },
                        updated_at: { type: 'number' },
                      },
                    },
                  ],
                },
              },
            },
            requestId: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { deviceId } = request.params;
    const tenantId = request.tenant!.id;

    // Ensure device exists for tenant (middleware already checks ownership, but keep consistent API errors)
    const device = deviceRepo.findById(deviceId, tenantId);
    if (!device) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Device not found', 404);
    }

    const session = deviceSessionRepo.findByDeviceId(deviceId);

    const response: StandardResponse = {
      success: true,
      data: {
        has_session: !!session,
        session: session
          ? {
            device_id: session.device_id,
            tenant_id: session.tenant_id || tenantId,
            session_kind: session.session_kind || 'baileys_multifile',
            session_dir: session.session_dir || '',
            wa_jid: session.wa_jid || '',
            wa_name: session.wa_name || '',
            updated_at: session.updated_at,
          }
          : null,
      },
      requestId: request.requestId,
    };

    reply.send(response);
  });
}
