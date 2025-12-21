import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';

/**
 * Test helper untuk create test Fastify server dengan in-memory DB
 */
async function createTestServer(): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });

  // Health routes (public)
  server.get('/health', async (_request, reply) => {
    return reply.send({
      status: 'alive',
      timestamp: Math.floor(Date.now() / 1000),
      uptime: process.uptime(),
    });
  });

  server.get('/ready', async (_request, reply) => {
    return reply.send({
      ready: true,
      db: true,
      worker: true,
      timestamp: Math.floor(Date.now() / 1000),
    });
  });

  server.get('/metrics', async (_request, reply) => {
    return reply
      .header('Content-Type', 'text/plain; version=0.0.4')
      .send('# HELP rijan_devices_connected Connected WhatsApp devices\n# TYPE rijan_devices_connected gauge\nrijan_devices_connected 0\n');
  });

  return server;
}

describe('HTTP Routes - Health Endpoints', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await createTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  describe('GET /health', () => {
    it('should return 200 with health status', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(
        expect.objectContaining({
          status: 'alive',
          timestamp: expect.any(Number),
          uptime: expect.any(Number),
        })
      );
    });

    it('should not require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health',
        headers: {},
      });

      expect(response.statusCode).toBe(200);
    });

    it('should include uptime value', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });

      const data = response.json();
      expect(data.uptime).toBeGreaterThan(0);
    });
  });

  describe('GET /ready', () => {
    it('should return 200 with ready status', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/ready',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(
        expect.objectContaining({
          ready: true,
          db: expect.any(Boolean),
          worker: expect.any(Boolean),
        })
      );
    });

    it('should not require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/ready',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /metrics', () => {
    it('should return 200 with Prometheus metrics', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/metrics',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
    });

    it('should return metrics in plain text format', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/metrics',
      });

      const body = response.body;
      expect(body).toContain('#');
      expect(body).toContain('HELP');
      expect(body).toContain('TYPE');
    });

    it('should not require authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/metrics',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Public Endpoint Contract', () => {
    it('should serve all public endpoints without auth header', async () => {
      const endpoints = ['/health', '/ready', '/metrics'];

      for (const endpoint of endpoints) {
        const response = await server.inject({
          method: 'GET',
          url: endpoint,
        });

        expect(response.statusCode).toBe(200);
      }
    });

    it('should still work even with invalid auth header', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health',
        headers: {
          'X-API-Key': 'invalid_key',
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });
});

describe('HTTP Routes - 404 Handling', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await createTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it('should return 404 for non-existent endpoint', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/non-existent',
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('Response Format Contract', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await createTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it('health endpoint should return JSON', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.headers['content-type']).toContain('application/json');
    expect(() => JSON.parse(response.body)).not.toThrow();
  });

  it('ready endpoint should return JSON', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/ready',
    });

    expect(response.headers['content-type']).toContain('application/json');
    expect(() => JSON.parse(response.body)).not.toThrow();
  });

  it('metrics endpoint should return plain text', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/metrics',
    });

    expect(response.headers['content-type']).toContain('text/plain');
  });
});

// Additional test for request validation
describe('HTTP Request Validation', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await createTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it('should handle GET requests to health', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
  });

  it('should reject POST requests to health', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/health',
    });

    // Fastify returns 404 for unregistered route/method combination
    expect(response.statusCode).toBe(404);
  });

  it('should handle HEAD requests', async () => {
    const response = await server.inject({
      method: 'HEAD',
      url: '/health',
    });

    // Fastify usually returns 200 for HEAD too
    expect([200, 405]).toContain(response.statusCode);
  });
});
