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
export function generateTenantApiKey(tenantId: string, expiresInDays: number = 365): string {
  const timestamp = Date.now();
  const expiresAt = timestamp + (expiresInDays * 24 * 60 * 60 * 1000);
  const salt = crypto.randomBytes(16).toString('hex');
  
  const payload = `${tenantId}.${timestamp}.${expiresAt}.${salt}`;
  const signature = crypto
    .createHmac('sha256', Buffer.from(config.security.masterKey, 'hex'))
    .update(payload)
    .digest('hex');
  
  return `${payload}.${signature}`;
}

/**
 * Verify dan parse tenant API key
 */
export function verifyTenantApiKey(apiKey: string): { valid: boolean; tenantId?: string; expired?: boolean } {
  try {
    const parts = apiKey.split('.');
    if (parts.length !== 5) {
      return { valid: false };
    }
    
    const [tenantId, timestamp, expiresAt, salt, signature] = parts;
    
    // Check expiration
    const expiresAtMs = parseInt(expiresAt, 10);
    if (isNaN(expiresAtMs) || expiresAtMs < Date.now()) {
      return { valid: false, expired: true };
    }
    
    const payload = `${tenantId}.${timestamp}.${expiresAt}.${salt}`;
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
 * Verify MASTER_KEY dari header (plain text)
 * 1. Ambil plain text dari header
 * 2. Hash dengan SHA256
 * 3. Compare dengan hash di ENV
 */
export function verifyMasterKey(providedPlainKey: string): boolean {
  try {
    // Hash plain text dari header
    const providedHash = crypto
      .createHash('sha256')
      .update(providedPlainKey)
      .digest('hex');

    // Compare dengan hash di env (using constant-time comparison)
    return crypto.timingSafeEqual(
      Buffer.from(providedHash, 'hex'),
      Buffer.from(config.security.masterKey, 'hex')
    );
  } catch {
    return false;
  }
}
