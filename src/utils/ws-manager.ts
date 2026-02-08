/**
 * WebSocket Connection Manager
 * Manages WebSocket connections per device and broadcasts events to subscribed clients
 */

import logger from './logger';
import type { WebSocket } from 'ws';

export interface WSMessage {
    type: string;
    deviceId: string;
    timestamp: number;
    data: unknown;
}

interface WSConnection {
    socket: WebSocket;
    tenantId: string;
    deviceId: string;
    connectedAt: number;
}

class WebSocketManager {
    private connections = new Map<string, Set<WSConnection>>();
    private pingInterval: NodeJS.Timeout | null = null;

    constructor() {
        // Start ping interval to keep connections alive
        this.pingInterval = setInterval(() => {
            this.pingAll();
        }, 30000); // 30 seconds
    }

    /**
   * Register a new WebSocket connection for a device
   */
    addConnection(deviceId: string, tenantId: string, socket: WebSocket): void {
        if (!this.connections.has(deviceId)) {
            this.connections.set(deviceId, new Set());
        }

        const conn: WSConnection = {
            socket,
            tenantId,
            deviceId,
            connectedAt: Date.now(),
        };

        this.connections.get(deviceId)!.add(conn);

        logger.info({
            deviceId,
            tenantId,
            totalConnections: this.connections.get(deviceId)!.size
        }, 'WebSocket client connected');

        // Handle close event
        socket.on('close', () => {
            this.removeConnection(deviceId, conn);
        });

        socket.on('error', (error: Error) => {
            logger.error({ error, deviceId }, 'WebSocket error');
            this.removeConnection(deviceId, conn);
        });

        // Handle incoming messages (ping/pong)
        socket.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.type === 'ping') {
                    socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                }
            } catch {
                // Ignore invalid messages
            }
        });

        // Send welcome message
        this.sendToSocket(socket, {
            type: 'connected',
            deviceId,
            timestamp: Date.now(),
            data: { message: 'WebSocket connection established' }
        });
    }

    /**
     * Remove a WebSocket connection
     */
    removeConnection(deviceId: string, conn: WSConnection): void {
        const deviceConns = this.connections.get(deviceId);
        if (deviceConns) {
            deviceConns.delete(conn);
            if (deviceConns.size === 0) {
                this.connections.delete(deviceId);
            }
            logger.info({
                deviceId,
                remainingConnections: deviceConns.size
            }, 'WebSocket client disconnected');
        }
    }

    /**
     * Broadcast an event to all clients subscribed to a device
     */
    broadcast(deviceId: string, type: string, data: unknown): void {
        const deviceConns = this.connections.get(deviceId);
        if (!deviceConns || deviceConns.size === 0) {
            return; // No subscribers
        }

        const message: WSMessage = {
            type,
            deviceId,
            timestamp: Date.now(),
            data,
        };

        const messageStr = JSON.stringify(message);

        for (const conn of deviceConns) {
            try {
                if (conn.socket.readyState === 1) { // WebSocket.OPEN
                    conn.socket.send(messageStr);
                }
            } catch (error) {
                logger.error({ error, deviceId }, 'Failed to send WebSocket message');
            }
        }

        logger.debug({
            deviceId,
            type,
            clientCount: deviceConns.size
        }, 'Broadcasted WebSocket event');
    }

    /**
   * Send a message to a specific socket
   */
    private sendToSocket(socket: WebSocket, message: WSMessage): void {
        try {
            if (socket.readyState === 1) {
                socket.send(JSON.stringify(message));
            }
        } catch (error) {
            logger.error({ error }, 'Failed to send WebSocket message');
        }
    }

    /**
     * Ping all connections to keep them alive
     */
    private pingAll(): void {
        for (const [deviceId, conns] of this.connections) {
            for (const conn of conns) {
                try {
                    if (conn.socket.readyState === 1) {
                        conn.socket.ping();
                    }
                } catch {
                    this.removeConnection(deviceId, conn);
                }
            }
        }
    }

    /**
     * Get connection count for a device
     */
    getConnectionCount(deviceId: string): number {
        return this.connections.get(deviceId)?.size || 0;
    }

    /**
     * Get all active device IDs with connections
     */
    getActiveDevices(): string[] {
        return Array.from(this.connections.keys());
    }

    /**
     * Cleanup on shutdown
     */
    shutdown(): void {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }

        for (const [deviceId, conns] of this.connections) {
            for (const conn of conns) {
                try {
                    conn.socket.close(1001, 'Server shutting down');
                } catch {
                    // Ignore
                }
                this.removeConnection(deviceId, conn);
            }
        }

        logger.info('WebSocket manager shut down');
    }
}

// Singleton instance
export const wsManager = new WebSocketManager();
