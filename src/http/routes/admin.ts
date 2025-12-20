import { FastifyInstance } from 'fastify';
import { verifyMasterKey } from '../../middlewares/auth';
import { generateTenantApiKey, hashApiKey, generateId } from '../../utils/crypto';
import { TenantRepository, AuditLogRepository } from '../../storage/repositories';
import { AppError, ErrorCode, StandardResponse } from '../../types';

const tenantRepo = new TenantRepository();
const auditRepo = new AuditLogRepository();

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
}
