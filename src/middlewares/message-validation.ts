import { FastifyRequest, FastifyReply } from 'fastify';
import { deviceManager } from '../baileys/device-manager.js';
import { AppError, ErrorCode } from '../types/index.js';

function isValidJid(jid: string): boolean {
  return /@s\.whatsapp\.net$/.test(jid) || /@g\.us$/.test(jid);
}

export async function requireDeviceConnected(
  request: FastifyRequest<{ Params: { deviceId: string } }>,
  _reply: FastifyReply
): Promise<void> {
  const { deviceId } = request.params;
  const info = deviceManager.getConnectionInfo(deviceId);
  if (!info.isConnected) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Device is not connected', 400);
  }
}

export async function validateJidInBody(
  request: FastifyRequest<{ Body: { to?: string } }>,
  _reply: FastifyReply
): Promise<void> {
  const to = (request.body as any)?.to;
  if (!to || !isValidJid(to)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid JID format', 400);
  }
}
