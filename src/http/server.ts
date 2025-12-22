import Fastify, { FastifyInstance } from 'fastify';
import fastifyHelmet from '@fastify/helmet';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyMultipart from '@fastify/multipart';
import config from '../config';
import logger from '../utils/logger';
import { errorHandler, requestLogger } from '../middlewares/error-handler';
import { runMigrations } from '../storage/migrate';
import { closeDatabase } from '../storage/database';
// media routes imported dynamically to avoid TS resolution issues

export async function createServer(): Promise<FastifyInstance<any, any, any, any>> {
  const server = Fastify({
    loggerInstance: logger,
    requestIdLogLabel: 'requestId',
    disableRequestLogging: true,
    trustProxy: true,
  });

  // Security headers
  await server.register(fastifyHelmet, {
    contentSecurityPolicy: false,
  });

  // CORS
  await server.register(fastifyCors, {
    origin: true,
    credentials: true,
  });

  // Multipart for file uploads
  await server.register(fastifyMultipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
      files: 1,
    },
  });

  // Rate limiting
  await server.register(fastifyRateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.window,
    cache: 10000,
    allowList: (_req) => {
      // Skip rate limiting untuk admin endpoints dengan valid master key
      return false;
    },
    keyGenerator: (req) => {
      // Rate limit per tenant
      return req.tenant?.id || req.ip;
    },
    errorResponseBuilder: (req, context) => {
      return {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded, retry after ${context.after}`,
        },
        requestId: (req as any).requestId,
      };
    },
  });

  // OpenAPI/Swagger
  await server.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Rijan WA Gateway API',
        description: 'WhatsApp Gateway berbasis Baileys - Multi-tenant & Multi-device',
        version: '1.0.0',
      },
      servers: [
        {
          url: `http://localhost:${config.server.port}`,
          description: 'Development server',
        },
      ],
      components: {
        securitySchemes: {
          masterKey: {
            type: 'apiKey',
            name: 'X-Master-Key',
            in: 'header',
            description: 'Master key for admin endpoints',
          },
          apiKey: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'API Key',
            description: 'Tenant API key',
          },
        },
      },
      tags: [
        { name: 'admin', description: 'Admin endpoints (requires master key)' },
        { name: 'health', description: 'Health check endpoints' },
        { name: 'devices', description: 'Device management endpoints' },
        { name: 'messages', description: 'Message endpoints' },
      ],
    },
  });

  await server.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
    staticCSP: true,
  });

  // Request logger middleware
  server.addHook('onRequest', requestLogger);

  // Error handler
  server.setErrorHandler(errorHandler);

  return server;
}

export async function startServer(): Promise<void> {
  try {
    // Run database migrations
    logger.info('Running database migrations...');
    runMigrations();

    // Create and start server
    const server = await createServer();

    // Register routes
    const { registerAdminRoutes } = await import('./routes/admin');
    const { registerDeviceRoutes } = await import('./routes/devices');
    const { messagesRoutes } = await import('./routes/messages');
    const { healthRoutes } = await import('./routes/health');
    const { webhooksRoutes } = await import('./routes/webhooks');
    const { eventsRoutes } = await import('./routes/events');
    const { groupsRoutes } = await import('./routes/groups');
    const { privacyRoutes } = await import('./routes/privacy');

    // @ts-ignore: Module resolves at runtime; TS type declarations not required
    const { mediaRoutes } = await import('./routes/media');

    // Register health routes FIRST (public, no auth required)
    await server.register(healthRoutes);
    
    // Then register admin routes
    await registerAdminRoutes(server);
    
    // Then register device routes (requires tenant auth - global hook)
    await registerDeviceRoutes(server);
    await server.register(messagesRoutes, { prefix: '/v1/devices' });
    await server.register(mediaRoutes, { prefix: '/v1/devices' });
    await server.register(webhooksRoutes, { prefix: '/v1/webhooks' });
    await server.register(eventsRoutes, { prefix: '/v1/devices/:deviceId/events' });
    await server.register(groupsRoutes, { prefix: '/v1/devices/:deviceId/groups' });
    await server.register(privacyRoutes, { prefix: '/v1/devices/:deviceId/privacy' });

    await server.listen({
      port: config.server.port,
      host: '0.0.0.0',
    });

    logger.info(`Server listening on http://0.0.0.0:${config.server.port}`);
    logger.info(`OpenAPI docs available at http://localhost:${config.server.port}/docs`);

    // Start background jobs
    const { messageProcessor } = await import('../jobs/message-processor');
    messageProcessor.start();

    const { inboundMessageMonitor } = await import('../jobs/inbound-message-monitor');
    inboundMessageMonitor.start(1000);

    const { connectionMonitor } = await import('../jobs/connection-monitor');
    connectionMonitor.start(3000);

    // Recover devices from previous session
    const { deviceManager } = await import('../baileys/device-manager');
    logger.info('Starting device recovery...');
    await deviceManager.recoverDevices();
    logger.info('Device recovery completed');

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');
      
      try {
        // Close HTTP server
        await server.close();

        // Stop background jobs
        try {
          const { messageProcessor } = await import('../jobs/message-processor');
          messageProcessor.stop();
        } catch (error) {
          logger.warn({ error }, 'Failed to stop message processor');
        }

        try {
          const { inboundMessageMonitor } = await import('../jobs/inbound-message-monitor');
          inboundMessageMonitor.stop();
        } catch (error) {
          logger.warn({ error }, 'Failed to stop inbound message monitor');
        }

        try {
          const { connectionMonitor } = await import('../jobs/connection-monitor');
          connectionMonitor.stop();
        } catch (error) {
          logger.warn({ error }, 'Failed to stop connection monitor');
        }

        // Release device locks
        try {
          const { DistributedLock } = await import('../utils/distributed-lock');
          const lock = new DistributedLock(config.instanceId);
          lock.cleanupExpiredLocks();
          logger.info('Device locks cleaned up');
        } catch (error) {
          logger.warn({ error }, 'Failed to cleanup locks');
        }

        // Close database
        closeDatabase();
        logger.info('Shutdown complete');
      } catch (error) {
        logger.error({ error }, 'Error during shutdown');
      }

      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}
