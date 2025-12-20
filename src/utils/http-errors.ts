import Boom from '@hapi/boom';

export const BAD_REQUEST = (message: string) =>
  Boom.badRequest(message);

export const UNAUTHORIZED = (message: string = 'Unauthorized') =>
  Boom.unauthorized(message);

export const FORBIDDEN = (message: string = 'Forbidden') =>
  Boom.forbidden(message);

export const NOT_FOUND = (message: string = 'Not found') =>
  Boom.notFound(message);

export const CONFLICT = (message: string) =>
  Boom.conflict(message);

export const INTERNAL_SERVER_ERROR = (message: string = 'Internal server error') =>
  Boom.internal(message);

export const SERVICE_UNAVAILABLE = (message: string = 'Service unavailable') =>
  Boom.serverUnavailable(message);
