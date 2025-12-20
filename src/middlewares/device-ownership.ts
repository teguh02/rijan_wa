import { FastifyRequest, FastifyReply } from 'fastify';
import { DeviceRepository } from '../storage/repositories';
import { AppError, ErrorCode } from '../types';
import logger from '../utils/logger';

const deviceRepo = new DeviceRepository();

/**
 * Middleware untuk memvalidasi ownership device
 * Memastikan tenant hanya bisa akses device miliknya sendiri
 */
export async function verifyDeviceOwnership(
  request: FastifyRequest<{ Params: { deviceId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { deviceId } = request.params;
  const tenantId = request.tenant?.id;

  if (!tenantId) {
    throw new AppError(
      ErrorCode.UNAUTHORIZED,
      'Tenant authentication required',
      401
    );
  }

  if (!deviceId) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Device ID is required',
      400
    );
  }

  // Check device exists dan belongs to tenant
  const device = deviceRepo.findById(deviceId, tenantId);

  if (!device) {
    throw new AppError(
      ErrorCode.NOT_FOUND,
      'Device not found or access denied',
      404
    );
  }

  logger.debug({ tenantId, deviceId }, 'Device ownership verified');
}
