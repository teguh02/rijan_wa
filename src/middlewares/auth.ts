import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyMasterKey as verifyKey } from '../utils/crypto';
import { AppError, ErrorCode } from '../types';
import logger from '../utils/logger';
import { AuditLogRepository } from '../storage/repositories';

const auditRepo = new AuditLogRepository();

/**
 * Middleware untuk verifikasi MASTER_KEY pada admin endpoints
 * Header: X-Master-Key: <sha256_hash>
 */
export async function verifyMasterKey(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const masterKey = request.headers['x-master-key'] as string;

  if (!masterKey) {
    throw new AppError(
      ErrorCode.UNAUTHORIZED,
      'Master key is required',
      401
    );
  }

  if (!verifyKey(masterKey)) {
    // Log failed attempt
    auditRepo.create({
      actor: 'unknown',
      action: 'admin.auth.failed',
      ip_address: request.ip,
      user_agent: request.headers['user-agent'],
      meta: JSON.stringify({ endpoint: request.url }),
    });

    throw new AppError(
      ErrorCode.INVALID_MASTER_KEY,
      'Invalid master key',
      401
    );
  }

  // Successful auth
  logger.debug({ ip: request.ip }, 'Admin authenticated');
}
