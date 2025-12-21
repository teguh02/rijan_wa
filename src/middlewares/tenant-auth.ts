import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyTenantApiKey as verifyApiKey, hashApiKey } from '../utils/crypto';
import { AppError, ErrorCode } from '../types';
import { TenantRepository } from '../storage/repositories';
import logger from '../utils/logger';

const tenantRepo = new TenantRepository();

/**
 * Tenant context yang akan di-attach ke request
 */
declare module 'fastify' {
  interface FastifyRequest {
    tenant?: {
      id: string;
      name: string;
      status: string;
    };
  }
}

/**
 * Middleware untuk verifikasi tenant API key
 * Header: Authorization: Bearer <api_key> atau X-API-Key: <api_key>
 */
export async function verifyTenantApiKey(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  // Skip public endpoints dan admin endpoints (mereka punya own middleware untuk master key)
  const publicPaths = ['/health', '/ready', '/metrics', '/docs', '/admin'];
  if (publicPaths.some(path => request.url.startsWith(path))) {
    return;
  }

  // Extract API key dari header
  let apiKey: string | undefined;
  
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    apiKey = authHeader.substring(7);
  } else if (request.headers['x-api-key']) {
    apiKey = request.headers['x-api-key'] as string;
  }

  if (!apiKey) {
    throw new AppError(
      ErrorCode.UNAUTHORIZED,
      'API key is required',
      401
    );
  }

  // Verify API key signature
  const verification = verifyApiKey(apiKey);
  if (!verification.valid || !verification.tenantId) {
    const errorMessage = verification.expired 
      ? 'API key has expired. Please generate a new API key.'
      : 'Invalid API key';
    
    throw new AppError(
      ErrorCode.INVALID_API_KEY,
      errorMessage,
      401
    );
  }

  // Check tenant exists and is active
  const apiKeyHash = hashApiKey(apiKey);
  const tenant = await tenantRepo.findByApiKeyHash(apiKeyHash);

  if (!tenant) {
    throw new AppError(
      ErrorCode.INVALID_API_KEY,
      'Invalid API key or tenant not found',
      401
    );
  }

  if (tenant.status !== 'active') {
    throw new AppError(
      ErrorCode.FORBIDDEN,
      `Tenant is ${tenant.status}`,
      403
    );
  }

  // Attach tenant context ke request
  request.tenant = {
    id: tenant.id,
    name: tenant.name,
    status: tenant.status,
  };

  logger.debug({ tenantId: tenant.id }, 'Tenant authenticated');
}
