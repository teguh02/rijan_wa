import { FastifyInstance } from 'fastify';
import { verifyMasterKey } from '../../middlewares/auth';
import { generateTenantApiKey, hashApiKey, generateId } from '../../utils/crypto';
import { TenantRepository, AuditLogRepository, DeviceRepository } from '../../storage/repositories';
import { AppError, ErrorCode, StandardResponse } from '../../types';
import { deviceManager } from '../../baileys/device-manager';

const tenantRepo = new TenantRepository();
const auditRepo = new AuditLogRepository();
const deviceRepo = new DeviceRepository();

interface CreateTenantBody {
  name: string;
}

interface CreateTenantResponse {
  tenant: {
    id: string;
    name: string;
    status: string;
    created_at: number;
  };
  api_key: string;
  warning: string;
}

export async function registerAdminRoutes(server: FastifyInstance): Promise<void> {
  // Create tenant
  server.post<{ Body: CreateTenantBody }>('/admin/tenants', {
    preHandler: verifyMasterKey,
    schema: {
      tags: ['admin'],
      description: 'Create new tenant and generate API key',
      security: [{ masterKey: [] }],
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                tenant: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    status: { type: 'string' },
                    created_at: { type: 'number' },
                  },
                },
                api_key: { type: 'string' },
                warning: { type: 'string' },
              },
            },
            requestId: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { name } = request.body;
    
    // Generate tenant ID dan API key
    const tenantId = generateId('tenant');
    const apiKey = generateTenantApiKey(tenantId);
    const apiKeyHash = hashApiKey(apiKey);

    // Create tenant
    const tenant = tenantRepo.create({
      id: tenantId,
      name,
      api_key_hash: apiKeyHash,
      status: 'active',
    });

    // Audit log
    auditRepo.create({
      actor: 'admin',
      action: 'tenant.created',
      resource_type: 'tenant',
      resource_id: tenantId,
      ip_address: request.ip,
      user_agent: request.headers['user-agent'],
    });

    const response: StandardResponse<CreateTenantResponse> = {
      success: true,
      data: {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          status: tenant.status,
          created_at: tenant.created_at,
        },
        api_key: apiKey,
        warning: 'Save this API key securely. It will not be shown again.',
      },
      requestId: request.requestId,
    };

    reply.status(201).send(response);
  });

  // List tenants
  server.get('/admin/tenants', {
    preHandler: verifyMasterKey,
    schema: {
      tags: ['admin'],
      description: 'List all tenants',
      security: [{ masterKey: [] }],
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
                tenants: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      status: { type: 'string' },
                      created_at: { type: 'number' },
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
    
    const tenants = tenantRepo.findAll(limit, offset);

    const response: StandardResponse = {
      success: true,
      data: {
        tenants: tenants.map(t => ({
          id: t.id,
          name: t.name,
          status: t.status,
          created_at: t.created_at,
        })),
        count: tenants.length,
      },
      requestId: request.requestId,
    };

    reply.send(response);
  });

  // Get tenant by ID
  server.get<{ Params: { id: string } }>('/admin/tenants/:id', {
    preHandler: verifyMasterKey,
    schema: {
      tags: ['admin'],
      description: 'Get tenant by ID',
      security: [{ masterKey: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    
    const tenant = tenantRepo.findById(id);
    if (!tenant) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Tenant not found', 404);
    }

    const response: StandardResponse = {
      success: true,
      data: {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          status: tenant.status,
          created_at: tenant.created_at,
        },
      },
      requestId: request.requestId,
    };

    reply.send(response);
  });

  // Suspend tenant
  server.patch<{ Params: { id: string } }>('/admin/tenants/:id/suspend', {
    preHandler: verifyMasterKey,
    schema: {
      tags: ['admin'],
      description: 'Suspend tenant',
      security: [{ masterKey: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    
    const updated = tenantRepo.updateStatus(id, 'suspended');
    if (!updated) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Tenant not found', 404);
    }

    auditRepo.create({
      actor: 'admin',
      action: 'tenant.suspended',
      resource_type: 'tenant',
      resource_id: id,
      ip_address: request.ip,
      user_agent: request.headers['user-agent'],
    });

    const response: StandardResponse = {
      success: true,
      data: { message: 'Tenant suspended' },
      requestId: request.requestId,
    };

    reply.send(response);
  });

  // Activate tenant
  server.patch<{ Params: { id: string } }>('/admin/tenants/:id/activate', {
    preHandler: verifyMasterKey,
    schema: {
      tags: ['admin'],
      description: 'Activate tenant',
      security: [{ masterKey: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    
    const updated = tenantRepo.updateStatus(id, 'active');
    if (!updated) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Tenant not found', 404);
    }

    auditRepo.create({
      actor: 'admin',
      action: 'tenant.activated',
      resource_type: 'tenant',
      resource_id: id,
      ip_address: request.ip,
      user_agent: request.headers['user-agent'],
    });

    const response: StandardResponse = {
      success: true,
      data: { message: 'Tenant activated' },
      requestId: request.requestId,
    };

    reply.send(response);
  });

  // Delete tenant (soft delete)
  server.delete<{ Params: { id: string } }>('/admin/tenants/:id', {
    preHandler: verifyMasterKey,
    schema: {
      tags: ['admin'],
      description: 'Delete tenant (soft delete)',
      security: [{ masterKey: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    
    const deleted = tenantRepo.delete(id);
    if (!deleted) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Tenant not found', 404);
    }

    auditRepo.create({
      actor: 'admin',
      action: 'tenant.deleted',
      resource_type: 'tenant',
      resource_id: id,
      ip_address: request.ip,
      user_agent: request.headers['user-agent'],
    });

    const response: StandardResponse = {
      success: true,
      data: { message: 'Tenant deleted' },
      requestId: request.requestId,
    };

    reply.send(response);
  });

  // Create device untuk tenant
  server.post<{ Params: { tenantId: string }; Body: { label: string } }>(
    '/admin/tenants/:tenantId/devices',
    {
      preHandler: verifyMasterKey,
      schema: {
        tags: ['admin'],
        description: 'Create device untuk tenant',
        security: [{ masterKey: [] }],
        params: {
          type: 'object',
          required: ['tenantId'],
          properties: {
            tenantId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['label'],
          properties: {
            label: { type: 'string', minLength: 1, maxLength: 100 },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  device: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      tenant_id: { type: 'string' },
                      label: { type: 'string' },
                      status: { type: 'string' },
                      created_at: { type: 'number' },
                    },
                  },
                },
              },
              requestId: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { tenantId } = request.params;
      const { label } = request.body;

      // Check tenant exists
      const tenant = tenantRepo.findById(tenantId);
      if (!tenant) {
        throw new AppError(ErrorCode.NOT_FOUND, 'Tenant not found', 404);
      }

      // Generate device ID
      const deviceId = generateId('device');

      // Create device
      const device = deviceRepo.create({
        id: deviceId,
        tenant_id: tenantId,
        label,
        status: 'disconnected',
      });

      // Audit log
      auditRepo.create({
        tenant_id: tenantId,
        actor: 'admin',
        action: 'device.created',
        resource_type: 'device',
        resource_id: deviceId,
        ip_address: request.ip,
        user_agent: request.headers['user-agent'],
        meta: JSON.stringify({ label }),
      });

      const response: StandardResponse = {
        success: true,
        data: {
          device: {
            id: device.id,
            tenant_id: device.tenant_id,
            label: device.label,
            status: device.status,
            created_at: device.created_at,
          },
        },
        requestId: request.requestId,
      };

      reply.status(201).send(response);
    }
  );

  // Delete device
  server.delete<{ Params: { tenantId: string; deviceId: string } }>(
    '/admin/tenants/:tenantId/devices/:deviceId',
    {
      preHandler: verifyMasterKey,
      schema: {
        tags: ['admin'],
        description: 'Delete device dan credentials',
        security: [{ masterKey: [] }],
        params: {
          type: 'object',
          required: ['tenantId', 'deviceId'],
          properties: {
            tenantId: { type: 'string' },
            deviceId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { tenantId, deviceId } = request.params;

      // Verify device exists dan belongs to tenant
      const device = deviceRepo.findById(deviceId, tenantId);
      if (!device) {
        throw new AppError(ErrorCode.NOT_FOUND, 'Device not found', 404);
      }

      // Stop device if running
      try {
        await deviceManager.stopDevice(deviceId);
      } catch (error) {
        // Ignore if not running
      }

      // Logout to clear session
      try {
        await deviceManager.logoutDevice(deviceId);
      } catch (error) {
        // Ignore errors
      }

      // Delete device
      deviceRepo.delete(deviceId);

      // Audit log
      auditRepo.create({
        tenant_id: tenantId,
        actor: 'admin',
        action: 'device.deleted',
        resource_type: 'device',
        resource_id: deviceId,
        ip_address: request.ip,
        user_agent: request.headers['user-agent'],
      });

      const response: StandardResponse = {
        success: true,
        data: { message: 'Device deleted' },
        requestId: request.requestId,
      };

      reply.send(response);
    }
  );
}
