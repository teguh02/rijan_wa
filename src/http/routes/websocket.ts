/**
 * WebSocket Route Handler
 * Provides real-time chat and message updates via WebSocket
 * 
 * Endpoint: /v1/devices/:deviceId/chat-ws
 * Auth: Authorization header (Bearer xxx) or query param (?token=xxx)
 */

import { FastifyInstance } from 'fastify';
import { wsManager } from '../../utils/ws-manager.js';
import logger from '../../utils/logger.js';

interface WSQuery {
    token?: string;
}

interface WSParams {
    deviceId: string;
}

export async function websocketRoutes(server: FastifyInstance): Promise<void> {
    // WebSocket endpoint for real-time chat updates
    server.get<{
        Params: WSParams;
        Querystring: WSQuery;
    }>('/:deviceId/chat-ws', { websocket: true }, async (connection, req) => {
        const { deviceId } = req.params;

        // Support both Authorization header and query param (header takes priority)
        const authHeader = req.headers['authorization'] as string | undefined;
        const { token: queryToken } = req.query;
        const rawToken = authHeader || queryToken;

        logger.debug({ deviceId, hasToken: !!rawToken, source: authHeader ? 'header' : 'query' }, 'WebSocket connection attempt');

        // Validate token
        if (!rawToken) {
            logger.warn({ deviceId }, 'WebSocket connection rejected: missing token');
            connection.send(JSON.stringify({
                type: 'error',
                code: 'UNAUTHORIZED',
                message: 'Missing authentication token. Use Authorization header or ?token query param',
            }));
            connection.close(4001, 'Unauthorized');
            return;
        }

        // Parse bearer token (support: "Bearer xxx", "Bearer_xxx", or just "xxx")
        const tokenValue = rawToken.startsWith('Bearer ')
            ? rawToken.substring(7)
            : rawToken.startsWith('Bearer_')
                ? rawToken.substring(7)
                : rawToken;


        try {
            // Validate the token against tenant repository
            const { TenantRepository, DeviceRepository } = await import('../../storage/repositories.js');
            const { hashApiKey } = await import('../../utils/crypto.js');

            // Token format: tenant_xxx.timestamp.expiry.hash.signature
            const [tenantId] = tokenValue.split('.');

            if (!tenantId) {
                throw new Error('Invalid token format');
            }

            const tenantRepo = new TenantRepository();
            const deviceRepo = new DeviceRepository();

            // Check if tenant exists by hashing the API key
            const apiKeyHash = hashApiKey(tokenValue);
            const tenant = tenantRepo.findByApiKeyHash(apiKeyHash);

            if (!tenant) {
                // Try to find tenant by ID prefix for simple validation
                const tenantById = tenantRepo.findById(tenantId);
                if (!tenantById) {
                    throw new Error('Invalid tenant');
                }
            }

            // Check if device exists and belongs to tenant
            const device = deviceRepo.findById(deviceId, tenant?.id || tenantId);
            if (!device) {
                throw new Error('Device not found');
            }

            // Authentication successful, register connection
            wsManager.addConnection(deviceId, tenant?.id || tenantId, connection);

            logger.info({
                deviceId,
                tenantId: tenant?.id || tenantId
            }, 'WebSocket connection authenticated');

            // Send initial chat list (limit 50 by default)
            try {
                const { ChatService } = await import('../../modules/messages/chat-service.js');
                const chatService = new ChatService();
                const result = await chatService.getChats(deviceId, 50, 0);

                connection.send(JSON.stringify({
                    type: 'chats.set',
                    deviceId,
                    timestamp: Math.floor(Date.now() / 1000),
                    data: result
                }));
            } catch (error) {
                logger.error({ error, deviceId }, 'Failed to send initial chat list');
                // Don't close connection, just log error
            }

        } catch (error) {
            logger.warn({ error, deviceId }, 'WebSocket authentication failed');
            connection.send(JSON.stringify({
                type: 'error',
                code: 'UNAUTHORIZED',
                message: 'Authentication failed',
            }));
            connection.close(4001, 'Unauthorized');
        }
    });
}

/**
 * Broadcast helper functions to be used by DeviceManager
 */
export function broadcastChatEvent(deviceId: string, eventType: string, data: unknown): void {
    wsManager.broadcast(deviceId, `chats.${eventType}`, data);
}

export function broadcastMessageEvent(deviceId: string, message: unknown): void {
    wsManager.broadcast(deviceId, 'messages.upsert', message);
}

export function broadcastConnectionEvent(deviceId: string, status: string, data?: unknown): void {
    wsManager.broadcast(deviceId, 'connection.update', { status, ...data as object });
}
