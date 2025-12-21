import pino from 'pino';
import config from '../config';

const logger = pino({
  level: config.server.logLevel,
  transport: config.server.nodeEnv === 'development' 
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
          translateTime: `SYS:HH:MM:ss ${config.server.timezone}`,
        },
      }
    : undefined,
  serializers: {
    req(req) {
      return {
        method: req.method,
        url: req.url,
        headers: sanitizeHeaders(req.headers),
        remoteAddress: req.socket?.remoteAddress,
      };
    },
    res(res) {
      return {
        statusCode: res.statusCode,
      };
    },
  },
});

/**
 * Remove sensitive data dari headers
 */
function sanitizeHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...headers };
  const sensitiveKeys = ['authorization', 'x-api-key', 'x-master-key', 'cookie'];
  
  for (const key of sensitiveKeys) {
    if (sanitized[key]) {
      sanitized[key] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

export default logger;
