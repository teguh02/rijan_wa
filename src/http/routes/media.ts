import { FastifyPluginAsync } from 'fastify';
import { verifyTenantApiKey } from '../../middlewares/tenant-auth';
import { verifyDeviceOwnership } from '../../middlewares/device-ownership';
import { BAD_REQUEST, NOT_FOUND } from '../../utils/http-errors';
import { saveStreamToFile, getMediaPath } from '../../storage/media';
import fs from 'fs';

export const mediaRoutes: FastifyPluginAsync = async (fastify) => {
  // Auth
  fastify.addHook('preHandler', verifyTenantApiKey);
  fastify.addHook('preHandler', verifyDeviceOwnership);

  // Upload media (multipart)
  fastify.post<{ Params: { deviceId: string } }>(
    '/:deviceId/media/upload',
    {
      schema: {
        description: 'Upload media via multipart/form-data (field: file)',
        tags: ['Media'],
        consumes: ['multipart/form-data'],
        params: {
          type: 'object',
          properties: { deviceId: { type: 'string' } },
          required: ['deviceId'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              mediaId: { type: 'string' },
              fileName: { type: 'string' },
              size: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          const { mediaId, size } = await saveStreamToFile(part.file, part.filename);
          return reply.send({ mediaId: part.filename || mediaId, fileName: part.filename || mediaId, size });
        }
      }
      throw BAD_REQUEST('No file found in multipart payload');
    }
  );

  // Download media by mediaId (filename)
  fastify.get<{ Params: { deviceId: string; mediaId: string } }>(
    '/:deviceId/media/:mediaId',
    {
      schema: {
        description: 'Download previously uploaded media by mediaId (filename)',
        tags: ['Media'],
        params: {
          type: 'object',
          properties: {
            deviceId: { type: 'string' },
            mediaId: { type: 'string' },
          },
          required: ['deviceId', 'mediaId'],
        },
      },
    },
    async (request, reply) => {
      const { mediaId } = request.params;
      const filePath = getMediaPath(mediaId);
      if (!fs.existsSync(filePath)) {
        throw NOT_FOUND('Media not found');
      }
      return reply.type('application/octet-stream').send(fs.createReadStream(filePath));
    }
  );
};
