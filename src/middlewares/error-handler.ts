import { FastifyRequest, FastifyReply } from 'fastify';
import { AppError, ErrorCode, StandardResponse } from '../types';
import logger from '../utils/logger';
import crypto from 'crypto';

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
  reply: FastifyReply
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

  // Handle unknown errors
  logger.error({
    requestId: request.requestId,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
  }, 'Unhandled error');

  const response: StandardResponse = {
    success: false,
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Internal server error',
    },
    requestId: request.requestId,
  };

  reply.status(500).send(response);
}
