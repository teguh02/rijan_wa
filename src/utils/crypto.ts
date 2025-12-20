import crypto from 'crypto';
import config from '../config';

/**
 * Skema keamanan:
 * - MASTER_KEY = SHA256 hash dari master password (disimpan di env)
 * - API Key = HMAC-SHA256(MASTER_KEY, salt + tenantId + timestamp)
 * - Encryption Key = PBKDF2(MASTER_KEY, salt, iterations)
 * - IV = random 12 bytes untuk setiap enkripsi (AES-GCM)
 */

export interface EncryptedData {
  encrypted: string; // base64
  iv: string; // base64
  authTag: string; // base64
  version: number;
}

/**
 * Derive encryption key dari MASTER_KEY menggunakan PBKDF2
 */
export function deriveEncryptionKey(salt: string): Buffer {
  return crypto.pbkdf2Sync(
    Buffer.from(config.security.masterKey, 'hex'),
    salt,
    100000, // iterations
    32, // key length for aes-256
    'sha256'
  );
}

/**
 * Encrypt data menggunakan AES-256-GCM
 */
export function encrypt(plaintext: string, salt: string): EncryptedData {
  const key = deriveEncryptionKey(salt);
  const iv = crypto.randomBytes(12); // 12 bytes untuk GCM
  
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    version: 1,
  };
}

/**
 * Decrypt data menggunakan AES-256-GCM
 */
export function decrypt(data: EncryptedData, salt: string): string {
  const key = deriveEncryptionKey(salt);
  const iv = Buffer.from(data.iv, 'base64');
  const authTag = Buffer.from(data.authTag, 'base64');
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(data.encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Generate tenant API key menggunakan HMAC-SHA256
 * Format: tenantId.timestamp.signature
 */
export function generateTenantApiKey(tenantId: string): string {
  const timestamp = Date.now();
  const salt = crypto.randomBytes(16).toString('hex');
  
  const payload = `${tenantId}.${timestamp}.${salt}`;
  const signature = crypto
    .createHmac('sha256', Buffer.from(config.security.masterKey, 'hex'))
    .update(payload)
    .digest('hex');
  
  return `${payload}.${signature}`;
}

/**
 * Verify dan parse tenant API key
 */
export function verifyTenantApiKey(apiKey: string): { valid: boolean; tenantId?: string } {
  try {
    const parts = apiKey.split('.');
    if (parts.length !== 4) {
      return { valid: false };
    }
    
    const [tenantId, timestamp, salt, signature] = parts;
    
    const payload = `${tenantId}.${timestamp}.${salt}`;
    const expectedSignature = crypto
      .createHmac('sha256', Buffer.from(config.security.masterKey, 'hex'))
      .update(payload)
      .digest('hex');
    
    // Constant-time comparison
    const valid = crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
    
    return valid ? { valid: true, tenantId } : { valid: false };
  } catch (error) {
    return { valid: false };
  }
}

/**
 * Hash API key untuk penyimpanan di database
 */
export function hashApiKey(apiKey: string): string {
  return crypto
    .createHash('sha256')
    .update(apiKey)
    .digest('hex');
}

/**
 * Generate random ID
 */
export function generateId(prefix: string = ''): string {
  const random = crypto.randomBytes(16).toString('hex');
  return prefix ? `${prefix}_${random}` : random;
}

/**
 * Verify MASTER_KEY dari header
 */
export function verifyMasterKey(providedKey: string): boolean {
  try {
    return crypto.timingSafeEqual(
      Buffer.from(providedKey, 'hex'),
      Buffer.from(config.security.masterKey, 'hex')
    );
  } catch {
    return false;
  }
}
