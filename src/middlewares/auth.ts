import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyMasterKey as verifyKey } from '../utils/crypto.js';
import { AppError, ErrorCode } from '../types/index.js';
import logger from '../utils/logger.js';
import { AuditLogRepository } from '../storage/repositories.js';

const auditRepo = new AuditLogRepository();

/**
 * Middleware untuk verifikasi MASTER_KEY pada admin endpoints
 * 
 * Flow:
 * 1. User mengirim plain text master key via header X-Master-Key
 * 2. Middleware hash dengan SHA256
 * 3. Compare hash dengan hash di ENV (MASTER_KEY)
 * 4. Jika cocok -> allow, jika tidak -> error
 * 
 * ENV: MASTER_KEY=<sha256_hash>
 * Header: X-Master-Key: <plain_text>
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
