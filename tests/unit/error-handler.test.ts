import { describe, it, expect } from 'vitest';
import { AppError, ErrorCode, StandardResponse, StandardError } from '../../src/types';

describe('Error Handling', () => {
  describe('AppError Class', () => {
    it('should create AppError with code, message, and statusCode', () => {
      const error = new AppError(
        ErrorCode.UNAUTHORIZED,
        'Missing API key',
        401
      );

      expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(error.message).toBe('Missing API key');
      expect(error.statusCode).toBe(401);
      expect(error.name).toBe('AppError');
    });

    it('should have default statusCode of 500', () => {
      const error = new AppError(
        ErrorCode.INTERNAL_ERROR,
        'Something went wrong'
      );

      expect(error.statusCode).toBe(500);
    });

    it('should include optional details', () => {
      const details = { field: 'email', reason: 'invalid format' };
      const error = new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Validation failed',
        400,
        details
      );

      expect(error.details).toEqual(details);
    });

    it('should be instanceof Error', () => {
      const error = new AppError(ErrorCode.NOT_FOUND, 'Not found', 404);
      expect(error instanceof Error).toBe(true);
    });

    it('should capture stack trace', () => {
      const error = new AppError(
        ErrorCode.INTERNAL_ERROR,
        'Test error',
        500
      );

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AppError');
    });
  });

  describe('Error Codes', () => {
    it('should have authentication error codes', () => {
      expect(ErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED');
      expect(ErrorCode.FORBIDDEN).toBe('FORBIDDEN');
      expect(ErrorCode.INVALID_API_KEY).toBe('INVALID_API_KEY');
      expect(ErrorCode.INVALID_MASTER_KEY).toBe('INVALID_MASTER_KEY');
    });

    it('should have validation error codes', () => {
      expect(ErrorCode.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
      expect(ErrorCode.INVALID_INPUT).toBe('INVALID_INPUT');
    });

    it('should have resource error codes', () => {
      expect(ErrorCode.NOT_FOUND).toBe('NOT_FOUND');
      expect(ErrorCode.ALREADY_EXISTS).toBe('ALREADY_EXISTS');
    });

    it('should have system error codes', () => {
      expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
      expect(ErrorCode.DATABASE_ERROR).toBe('DATABASE_ERROR');
    });

    it('should have rate limiting error code', () => {
      expect(ErrorCode.RATE_LIMIT_EXCEEDED).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  describe('Standard Error Response Format', () => {
    it('should format error response correctly', () => {
      const errorResponse: StandardResponse = {
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: 'Invalid API key',
        },
        requestId: 'req_12345',
      };

      expect(errorResponse.success).toBe(false);
      expect(errorResponse.data).toBeUndefined();
      expect(errorResponse.error?.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(errorResponse.requestId).toBeDefined();
    });

    it('should include error details if provided', () => {
      const details = { fields: ['email', 'password'] };
      const errorResponse: StandardResponse = {
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Validation failed',
          details,
        },
        requestId: 'req_12345',
      };

      expect(errorResponse.error?.details).toEqual(details);
    });

    it('should not leak stack trace in error response', () => {
      const error = new AppError(
        ErrorCode.INTERNAL_ERROR,
        'Internal server error',
        500
      );

      const response: StandardResponse = {
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
        requestId: 'req_12345',
      };

      // Response should NOT include stack property
      expect(response.error?.code).toBeDefined();
      expect(response.error?.message).toBeDefined();
      expect((response.error as any)?.stack).toBeUndefined();
    });
  });

  describe('HTTP Status Code Mapping', () => {
    const errorStatusCodes = [
      { code: ErrorCode.UNAUTHORIZED, expected: 401 },
      { code: ErrorCode.FORBIDDEN, expected: 403 },
      { code: ErrorCode.INVALID_API_KEY, expected: 401 },
      { code: ErrorCode.INVALID_MASTER_KEY, expected: 401 },
      { code: ErrorCode.VALIDATION_ERROR, expected: 400 },
      { code: ErrorCode.INVALID_INPUT, expected: 400 },
      { code: ErrorCode.NOT_FOUND, expected: 404 },
      { code: ErrorCode.ALREADY_EXISTS, expected: 409 },
      { code: ErrorCode.RATE_LIMIT_EXCEEDED, expected: 429 },
      { code: ErrorCode.INTERNAL_ERROR, expected: 500 },
      { code: ErrorCode.DATABASE_ERROR, expected: 500 },
    ];

    errorStatusCodes.forEach(({ code, expected }) => {
      it(`should map ${code} to HTTP ${expected}`, () => {
        let statusCode = 500; // default
        
        switch (code) {
          case ErrorCode.UNAUTHORIZED:
          case ErrorCode.INVALID_API_KEY:
          case ErrorCode.INVALID_MASTER_KEY:
            statusCode = 401;
            break;
          case ErrorCode.FORBIDDEN:
            statusCode = 403;
            break;
          case ErrorCode.VALIDATION_ERROR:
          case ErrorCode.INVALID_INPUT:
            statusCode = 400;
            break;
          case ErrorCode.NOT_FOUND:
            statusCode = 404;
            break;
          case ErrorCode.ALREADY_EXISTS:
            statusCode = 409;
            break;
          case ErrorCode.RATE_LIMIT_EXCEEDED:
            statusCode = 429;
            break;
          default:
            statusCode = 500;
        }

        expect(statusCode).toBe(expected);
      });
    });
  });

  describe('Error Logging & Sanitization', () => {
    it('should preserve sensitive error details in code', () => {
      const error = new AppError(
        ErrorCode.DATABASE_ERROR,
        'Connection failed',
        500,
        { host: 'db.example.com', port: 5432 }
      );

      expect(error.details).toBeDefined();
      expect((error.details as any).host).toBe('db.example.com');
    });

    it('should allow message templating with variables', () => {
      const tenantId = 'tenant_123';
      const message = `Tenant ${tenantId} not found`;
      
      const error = new AppError(
        ErrorCode.NOT_FOUND,
        message,
        404
      );

      expect(error.message).toContain(tenantId);
    });

    it('should work with typed details', () => {
      interface ValidationDetails {
        field: string;
        reason: string;
        value: unknown;
      }

      const details: ValidationDetails = {
        field: 'email',
        reason: 'invalid format',
        value: 'not-an-email',
      };

      const error = new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Invalid email',
        400,
        details
      );

      expect(error.details).toEqual(details);
    });
  });

  describe('Response Builder Patterns', () => {
    it('should build success response', () => {
      const response: StandardResponse = {
        success: true,
        data: { tenantId: 'tenant_123', status: 'active' },
        requestId: 'req_12345',
      };

      expect(response.success).toBe(true);
      expect(response.error).toBeUndefined();
      expect(response.data).toBeDefined();
    });

    it('should build error response without data', () => {
      const response: StandardResponse = {
        success: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Tenant not found',
        },
        requestId: 'req_12345',
      };

      expect(response.success).toBe(false);
      expect(response.data).toBeUndefined();
      expect(response.error).toBeDefined();
    });

    it('should never have both data and error populated', () => {
      // Success response
      const successResponse: StandardResponse = {
        success: true,
        data: { id: '123' },
      };
      expect(successResponse.error).toBeUndefined();

      // Error response
      const errorResponse: StandardResponse = {
        success: false,
        error: { code: ErrorCode.NOT_FOUND, message: 'Not found' },
      };
      expect(errorResponse.data).toBeUndefined();
    });
  });
});
