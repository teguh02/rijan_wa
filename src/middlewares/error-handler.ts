import { FastifyRequest, FastifyReply } from 'fastify';
import { AppError, ErrorCode, StandardResponse } from '../types/index.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';
import { captureException, isSentryEnabled } from '../utils/sentry.js';

/**
 * Request ID generator dan logger middleware
 */
declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
  }
}

export async function requestLogger(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  // Generate unique request ID
  request.requestId = crypto.randomBytes(16).toString('hex');

  // Log incoming request
  logger.info({
    requestId: request.requestId,
    method: request.method,
    url: request.url,
    ip: request.ip,
    tenantId: request.tenant?.id,
  }, 'Incoming request');
}

/**
 * Global error handler
 */
export function errorHandler(
  error: Error,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  // Handle AppError
  if (error instanceof AppError) {
    const response: StandardResponse = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
      requestId: request.requestId,
    };

    logger.warn({
      requestId: request.requestId,
      error: {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
      },
    }, 'Application error');

    reply.status(error.statusCode).send(response);
    return;
  }

  // Handle Fastify validation errors
  if (error.name === 'FastifyError' && 'validation' in error) {
    const response: StandardResponse = {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        details: (error as any).validation,
      },
      requestId: request.requestId,
    };

    logger.warn({
      requestId: request.requestId,
      validation: (error as any).validation,
    }, 'Validation error');

    reply.status(400).send(response);
    return;
  }

  // Handle unknown errors - capture to Sentry
  logger.error({
    requestId: request.requestId,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
  }, 'Unhandled error');

  // Send to Sentry if enabled
  if (isSentryEnabled()) {
    captureException(error, {
      requestId: request.requestId,
      method: request.method,
      url: request.url,
      tenantId: request.tenant?.id,
    });
  }

  // Extract file and line from stack trace for better debugging
  const stackFirstLine = error.stack?.split('\n')[1]?.trim() || '';
  const fileMatch = stackFirstLine.match(/\((.+):(\d+):(\d+)\)/) || stackFirstLine.match(/at (.+):(\d+):(\d+)/);
  const sourceInfo = fileMatch
    ? { file: fileMatch[1], line: fileMatch[2], column: fileMatch[3] }
    : null;

  const response: StandardResponse = {
    success: false,
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: process.env.NODE_ENV === 'production'
        ? error.message // Show actual error in prod for debugging
        : `${error.message}${sourceInfo ? ` (${sourceInfo.file}:${sourceInfo.line})` : ''}`,
      details: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
    },
    requestId: request.requestId,
  };

  reply.status(500).send(response);
}
