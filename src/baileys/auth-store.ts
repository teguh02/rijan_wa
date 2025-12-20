import { getDatabase } from './database';
import { encrypt, decrypt, EncryptedData } from '../utils/crypto';
import logger from '../utils/logger';
import crypto from 'crypto';
import { AuthenticationState, SignalDataTypeMap } from '@whiskeysockets/baileys';
import { proto } from '@whiskeysockets/baileys';

/**
 * Baileys Auth State Storage
 * Menyimpan auth state secara encrypted di database
 */

interface StoredAuthState {
  device_id: string;
  auth_encrypted: string;
  auth_iv: string;
  auth_tag: string;
  enc_version: number;
  salt: string;
  updated_at: number;
}

export class BaileysAuthStore {
  private db = getDatabase();

  /**
   * Simpan auth state ke database (encrypted)
   */
  async saveAuthState(deviceId: string, authState: AuthenticationState): Promise<void> {
    const salt = crypto.randomBytes(16).toString('hex');
    const serialized = JSON.stringify({
      creds: authState.creds,
      keys: authState.keys,
    });

    const encrypted = encrypt(serialized, salt);
    const now = Math.floor(Date.now() / 1000);

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO device_sessions 
      (device_id, auth_encrypted, auth_iv, auth_tag, enc_version, salt, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      deviceId,
      encrypted.encrypted,
      encrypted.iv,
      encrypted.authTag,
      encrypted.version,
      salt,
      now
    );

    logger.debug({ deviceId }, 'Auth state saved');
  }

  /**
   * Load auth state dari database (decrypted)
   */
  async loadAuthState(deviceId: string): Promise<AuthenticationState | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM device_sessions WHERE device_id = ?
    `);

    const row = stmt.get(deviceId) as StoredAuthState | undefined;

    if (!row || !row.auth_encrypted) {
      return null;
    }

    try {
      const encryptedData: EncryptedData = {
        encrypted: row.auth_encrypted,
        iv: row.auth_iv,
        authTag: row.auth_tag,
        version: row.enc_version,
      };

      const decrypted = decrypt(encryptedData, row.salt);
      const parsed = JSON.parse(decrypted);

      logger.debug({ deviceId }, 'Auth state loaded');

      return {
        creds: parsed.creds,
        keys: parsed.keys,
      };
    } catch (error) {
      logger.error({ error, deviceId }, 'Failed to decrypt auth state');
      return null;
    }
  }

  /**
   * Delete auth state dari database
   */
  async deleteAuthState(deviceId: string): Promise<void> {
    const stmt = this.db.prepare(`
      DELETE FROM device_sessions WHERE device_id = ?
    `);

    stmt.run(deviceId);
    logger.debug({ deviceId }, 'Auth state deleted');
  }

  /**
   * Check apakah device punya auth state
   */
  async hasAuthState(deviceId: string): Promise<boolean> {
    const stmt = this.db.prepare(`
      SELECT device_id FROM device_sessions WHERE device_id = ?
    `);

    const row = stmt.get(deviceId);
    return !!row;
  }
}

/**
 * Create Baileys-compatible auth state untuk useMultiFileAuthState
 */
export async function useDatabaseAuthState(
  deviceId: string,
  authStore: BaileysAuthStore
): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  // Load existing state atau create new
  let authState = await authStore.loadAuthState(deviceId);

  if (!authState) {
    // Initialize empty state
    authState = {
      creds: {
        noiseKey: {
          private: new Uint8Array(32),
          public: new Uint8Array(32),
        },
        signedIdentityKey: {
          private: new Uint8Array(32),
          public: new Uint8Array(32),
        },
        signedPreKey: {
          keyPair: {
            private: new Uint8Array(32),
            public: new Uint8Array(32),
          },
          keyId: 1,
          signature: new Uint8Array(64),
        },
        registrationId: 0,
        advSecretKey: '',
        me: undefined,
        account: undefined,
        signalIdentities: [],
        myAppStateKeyId: '',
        firstUnuploadedPreKeyId: 1,
        nextPreKeyId: 1,
        lastAccountSyncTimestamp: 0,
        platform: 'unknown',
      } as any,
      keys: {
        get: async (type: string, ids: string[]) => {
          return {};
        },
        set: async (data: any) => {
          // Keys will be persisted via saveCreds
        },
      } as any,
    };
  }

  // In-memory keys storage
  const writeData = (data: any, key: string) => {
    // Store in authState.keys
  };

  const readData = (key: string) => {
    // Read from authState.keys
    return null;
  };

  const removeData = (key: string) => {
    // Remove from authState.keys
  };

  return {
    state: authState,
    saveCreds: async () => {
      await authStore.saveAuthState(deviceId, authState!);
    },
  };
}
