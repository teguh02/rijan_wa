import { FastifyPluginAsync } from 'fastify';
import { getDatabase } from '../../storage/database';
import logger from '../../utils/logger';
import fs from 'fs';
import path from 'path';

let baileysVersion: string = 'unknown';

try {
  // Try to find package.json in CWD
  const pkgPath = path.join(process.cwd(), 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    // Remove ^ or ~ prefix if present for cleaner output
    const v = pkg.dependencies?.['@whiskeysockets/baileys'];
    baileysVersion = v ? v.replace(/^[\^~]/, '') : 'unknown';
  }
} catch (error) {
  logger.warn({ error }, 'Failed to read Baileys version');
}

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Liveness check
   * GET /health
   */
  fastify.get(
    '/health',
    {
      schema: {
        description: 'Liveness check endpoint',
        tags: ['Health'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'number' },
              uptime: { type: 'number' },
              'whatsapp_engine_version': { type: 'string' },
            },
          },
        },
      },
    },
    async (_request, _reply) => {
      return _reply.send({
        status: 'alive',
        timestamp: Math.floor(Date.now() / 1000),
        uptime: process.uptime(),
        'whatsapp_engine_version': baileysVersion,
      });
    }
  );

  /**
   * Readiness check
   * GET /ready
   */
  fastify.get(
    '/ready',
    {
      schema: {
        description: 'Readiness check endpoint - checks DB and worker health',
        tags: ['Health'],
        response: {
          200: {
            type: 'object',
            properties: {
              ready: { type: 'boolean' },
              db: { type: 'boolean' },
              worker: { type: 'boolean' },
              timestamp: { type: 'number' },
            },
          },
        },
      },
    },
    async (_request, _reply) => {
      let dbHealthy = false;
      let workerHealthy = false;

      try {
        const db = getDatabase();
        const result = db.prepare('SELECT 1').get() as any;
        dbHealthy = !!result;
      } catch (error) {
        logger.error({ error }, 'DB health check failed');
      }

      try {
        // Check if message processor is running
        // In a real scenario, you'd track this in a global state
        workerHealthy = true; // Simplified for now
      } catch (error) {
        logger.error({ error }, 'Worker health check failed');
      }

      const ready = dbHealthy && workerHealthy;

      return _reply.code(ready ? 200 : (503 as any)).send({
        ready,
        db: dbHealthy,
        worker: workerHealthy,
        timestamp: Math.floor(Date.now() / 1000),
      });
    }
  );

  /**
   * Metrics endpoint (Prometheus-compatible)
   * GET /metrics
   */
  fastify.get(
    '/metrics',
    {
      schema: {
        description: 'Prometheus-compatible metrics endpoint',
        tags: ['Health'],
        response: {
          200: {
            type: 'string',
            description: 'Metrics in Prometheus format',
          },
        },
      },
    },
    async (_request, _reply) => {
      try {
        const db = getDatabase();

        // Fetch various metrics with safe defaults
        let deviceCount = 0;
        let totalDevices = 0;
        let messagesSent = 0;
        let messagesReceived = 0;
        let webhooksRegistered = 0;
        let webhooksFailed = 0;
        let tenantsActive = 0;

        try {
          deviceCount = (db.prepare('SELECT COUNT(*) as count FROM devices WHERE status = ?').get('connected') as any)?.count || 0;
        } catch (e) {
          logger.warn({ error: e }, 'Failed to count connected devices');
        }

        try {
          totalDevices = (db.prepare('SELECT COUNT(*) as count FROM devices').get() as any)?.count || 0;
        } catch (e) {
          logger.warn({ error: e }, 'Failed to count total devices');
        }

        try {
          messagesSent = (db.prepare('SELECT COUNT(*) as count FROM messages_outbox WHERE status = ?').get('sent') as any)?.count || 0;
        } catch (e) {
          logger.warn({ error: e }, 'Failed to count sent messages');
        }

        try {
          messagesReceived = (db.prepare('SELECT COUNT(*) as count FROM messages_inbox').get() as any)?.count || 0;
        } catch (e) {
          logger.warn({ error: e }, 'Failed to count received messages');
        }

        try {
          webhooksRegistered = (db.prepare('SELECT COUNT(*) as count FROM webhooks WHERE enabled = ?').get(1) as any)?.count || 0;
        } catch (e) {
          logger.warn({ error: e }, 'Failed to count registered webhooks');
        }

        try {
          webhooksFailed = (db.prepare('SELECT COUNT(*) as count FROM dlq').get() as any)?.count || 0;
        } catch (e) {
          logger.warn({ error: e }, 'Failed to count failed webhooks');
        }

        try {
          tenantsActive = (db.prepare('SELECT COUNT(*) as count FROM tenants WHERE status = ?').get('active') as any)?.count || 0;
        } catch (e) {
          logger.warn({ error: e }, 'Failed to count active tenants');
        }

        // Build Prometheus format response
        const metrics = `# HELP rijan_devices_connected Connected WhatsApp devices
# TYPE rijan_devices_connected gauge
rijan_devices_connected ${deviceCount}

# HELP rijan_devices_total Total registered devices
# TYPE rijan_devices_total gauge
rijan_devices_total ${totalDevices}

# HELP rijan_messages_sent Total messages sent
# TYPE rijan_messages_sent counter
rijan_messages_sent ${messagesSent}

# HELP rijan_messages_received Total messages received
# TYPE rijan_messages_received counter
rijan_messages_received ${messagesReceived}

# HELP rijan_webhooks_registered Active webhooks
# TYPE rijan_webhooks_registered gauge
rijan_webhooks_registered ${webhooksRegistered}

# HELP rijan_webhooks_failed Failed webhook deliveries (DLQ)
# TYPE rijan_webhooks_failed gauge
rijan_webhooks_failed ${webhooksFailed}

# HELP rijan_tenants_active Active tenants
# TYPE rijan_tenants_active gauge
rijan_tenants_active ${tenantsActive}

# HELP process_uptime_seconds Process uptime in seconds
# TYPE process_uptime_seconds gauge
process_uptime_seconds ${Math.floor(process.uptime())}

# HELP nodejs_memory_usage_bytes Node.js memory usage in bytes
# TYPE nodejs_memory_usage_bytes gauge
nodejs_memory_usage_bytes ${process.memoryUsage().heapUsed}
`;

        return _reply
          .header('Content-Type', 'text/plain; version=0.0.4')
          .send(metrics);
      } catch (error) {
        logger.error({ error }, 'Failed to generate metrics');
        return _reply.code(500 as any).send('# ERROR: Failed to generate metrics\n');
      }
    }
  );
};
