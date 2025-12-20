import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const MEDIA_DIR = path.join(process.cwd(), 'data', 'media');
const MAX_SIZE = 50 * 1024 * 1024; // 50MB

export function ensureMediaDir() {
  if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
  }
}

export function generateMediaId(prefix: string = 'media'): string {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

export async function saveStreamToFile(stream: NodeJS.ReadableStream, filename?: string): Promise<{ mediaId: string; filePath: string; size: number }>{
  ensureMediaDir();
  const mediaId = generateMediaId();
  const targetName = filename || `${mediaId}`;
  const filePath = path.join(MEDIA_DIR, targetName);

  const writeStream = fs.createWriteStream(filePath);
  let size = 0;
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_SIZE) {
        writeStream.destroy();
        fs.unlink(filePath, () => {});
        return reject(new Error('File too large'));
      }
    });
    stream.on('error', (err) => {
      writeStream.destroy();
      reject(err);
    });
    writeStream.on('error', (err) => reject(err));
    writeStream.on('finish', () => resolve({ mediaId, filePath, size }));
    stream.pipe(writeStream);
  });
}

export function getMediaPath(name: string): string {
  ensureMediaDir();
  return path.join(MEDIA_DIR, name);
}

export function deleteMedia(name: string): void {
  const filePath = getMediaPath(name);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
