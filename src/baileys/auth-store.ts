import path from 'path';
import fs from 'fs';
import logger from '../utils/logger';
import { AuthenticationState, useMultiFileAuthState } from '@whiskeysockets/baileys';

/**
 * Baileys Auth State Storage - File-based dengan DB sync
 * 
 * Struktur:
 * ./sessions/
 *   └── device_id/
 *       ├── creds.json          (Baileys credentials)
 *       ├── pre-key-1.json      (Signal pre-keys)
 *       ├── sender-key-*.json   (Signal sender keys)
 *       └── app-state-sync-*.json (App state)
 *
 * Database: Sync metadata untuk quick queries
 */

export class BaileysAuthStore {
  private sessionsDir: string;

  constructor(sessionsDir: string = path.join(process.cwd(), 'sessions')) {
    this.sessionsDir = sessionsDir;

    // Ensure sessions directory exists
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
      logger.info({ path: this.sessionsDir }, 'Sessions directory created');
    }
  }

  /**
   * Root directory tempat semua session disimpan.
   */
  getSessionsRootDir(): string {
    return this.sessionsDir;
  }

  /**
   * Get device session directory
   */
  private getDeviceDir(tenantId: string, deviceId: string): string {
    return path.join(this.sessionsDir, tenantId, deviceId);
  }

  private getLegacyDeviceDir(deviceId: string): string {
    return path.join(this.sessionsDir, deviceId);
  }

  /**
   * Get file path untuk specific auth object
   */
  private getFilePath(tenantId: string, deviceId: string, fileName: string): string {
    return path.join(this.getDeviceDir(tenantId, deviceId), fileName);
  }

  private getLegacyFilePath(deviceId: string, fileName: string): string {
    return path.join(this.getLegacyDeviceDir(deviceId), fileName);
  }

  private ensureDirExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Migrasi kompatibilitas: dukung folder lama `sessions/{deviceId}`.
   * Jika ditemukan dan folder baru belum ada, pindahkan ke `sessions/{tenantId}/{deviceId}`.
   */
  migrateLegacySessionDirIfNeeded(tenantId: string, deviceId: string): void {
    const legacyDir = this.getLegacyDeviceDir(deviceId);
    const newDir = this.getDeviceDir(tenantId, deviceId);

    if (!fs.existsSync(legacyDir)) return;
    if (fs.existsSync(newDir)) return;

    try {
      this.ensureDirExists(path.dirname(newDir));
      fs.renameSync(legacyDir, newDir);
      logger.info({ deviceId, tenantId, from: legacyDir, to: newDir }, 'Migrated legacy session directory');
    } catch (error) {
      logger.error({ error, deviceId, tenantId, legacyDir, newDir }, 'Failed to migrate legacy session directory');
    }
  }

  /**
   * Resolve lokasi folder session untuk tenant/device.
   */
  resolveSessionDir(tenantId: string, deviceId: string): string {
    this.ensureDirExists(this.sessionsDir);
    this.migrateLegacySessionDirIfNeeded(tenantId, deviceId);
    const sessionDir = this.getDeviceDir(tenantId, deviceId);
    this.ensureDirExists(sessionDir);
    return sessionDir;
  }

  /**
   * Load session metadata dari filesystem
   * Digunakan untuk sync ke database
   */
  async getSessionMetadata(tenantId: string, deviceId: string): Promise<{
    hasSession: boolean;
    hasCreds: boolean;
    createdAt?: number;
    updatedAt?: number
  } | null> {
    const deviceDir = this.getDeviceDir(tenantId, deviceId);
    const credsFile = this.getFilePath(tenantId, deviceId, 'creds.json');

    if (!fs.existsSync(deviceDir)) {
      return null;
    }

    const hasCreds = fs.existsSync(credsFile);

    try {
      const stats = fs.statSync(deviceDir);
      const credsStats = hasCreds ? fs.statSync(credsFile) : null;

      return {
        hasSession: true,
        hasCreds,
        createdAt: Math.floor(stats.birthtime.getTime() / 1000),
        updatedAt: credsStats ? Math.floor(credsStats.mtime.getTime() / 1000) : Math.floor(stats.mtime.getTime() / 1000),
      };
    } catch (error) {
      logger.error({ error, deviceId }, 'Failed to read session metadata');
      return {
        hasSession: true,
        hasCreds,
      };
    }
  }

  /**
   * Baca identitas (jid/nama) dari creds.json untuk disimpan sebagai metadata DB.
   */
  async getCredsIdentity(
    tenantId: string,
    deviceId: string
  ): Promise<{ waJid?: string; waName?: string } | null> {
    const credsFile = this.getFilePath(tenantId, deviceId, 'creds.json');
    if (!fs.existsSync(credsFile)) return null;

    try {
      const raw = fs.readFileSync(credsFile, 'utf8');
      const json = JSON.parse(raw) as any;
      const me = json?.me;
      const waJid = typeof me?.id === 'string' ? me.id : undefined;
      const waName = typeof me?.name === 'string' ? me.name : undefined;
      return { waJid, waName };
    } catch (error) {
      logger.error({ error, deviceId, tenantId }, 'Failed to read creds identity');
      return null;
    }
  }

  /**
   * Scan sessions directory dan return list of device IDs
   */
  async scanSessions(): Promise<Array<{ tenantId: string; deviceId: string; sessionDir: string }>> {
    try {
      const results: Array<{ tenantId: string; deviceId: string; sessionDir: string }> = [];
      const entries = fs.readdirSync(this.sessionsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const full = path.join(this.sessionsDir, entry.name);

        // Legacy layout: sessions/{deviceId}/creds.json
        const legacyCreds = path.join(full, 'creds.json');
        if (fs.existsSync(legacyCreds)) {
          // tenantId tidak diketahui dari filesystem; caller harus resolve dari database
          results.push({ tenantId: '__LEGACY__', deviceId: entry.name, sessionDir: full });
          continue;
        }

        // New layout: sessions/{tenantId}/{deviceId}/creds.json
        const tenantId = entry.name;
        const tenantEntries = fs.readdirSync(full, { withFileTypes: true });
        for (const devEntry of tenantEntries) {
          if (!devEntry.isDirectory()) continue;
          const deviceId = devEntry.name;
          const sessionDir = path.join(full, deviceId);
          const credsFile = path.join(sessionDir, 'creds.json');
          if (fs.existsSync(credsFile)) {
            results.push({ tenantId, deviceId, sessionDir });
          }
        }
      }

      return results;
    } catch (error) {
      logger.error({ error }, 'Failed to scan sessions directory');
      return [];
    }
  }

  /**
   * Delete auth state (remove device directory)
   */
  async deleteAuthState(tenantId: string, deviceId: string): Promise<void> {
    const deviceDir = this.getDeviceDir(tenantId, deviceId);
    if (fs.existsSync(deviceDir)) {
      fs.rmSync(deviceDir, { recursive: true, force: true });
      logger.debug({ deviceId, tenantId }, 'Auth state deleted');
    }
  }

  /**
   * Delete specific session key (e.g. 'session-user@s.whatsapp.net')
   * Used for recovery from Bad MAC errors
   */
  async deleteSessionKey(tenantId: string, deviceId: string, keyName: string): Promise<boolean> {
    // Baileys keys are sanitized: : becomes _ etc.
    // The key passed here should be the raw key name used by useMultiFileAuthState (e.g., "session-jid")
    // Note: useMultiFileAuthState sanitizes keys internally before writing to file.
    // However, since we are targeting files directly, we need to replicate the logic or just try to find the match.

    // Baileys uses `key.replace(/\//g, '__')` roughly.
    // But for session keys, it's usually `session-${jid}`.
    // Let's try to pass the exact filename or key.

    // If keyName doesn't end with .json, append it
    const fileName = keyName.endsWith('.json') ? keyName : `${keyName}.json`;
    const targetFile = this.getFilePath(tenantId, deviceId, fileName);

    if (fs.existsSync(targetFile)) {
      try {
        fs.unlinkSync(targetFile);
        logger.warn({ deviceId, tenantId, file: fileName }, 'Deleted specific session key file (recovery)');
        return true;
      } catch (error) {
        logger.error({ error, deviceId, file: fileName }, 'Failed to delete session key file');
      }
    }
    return false;
  }

  /**
   * Delete session dari semua kemungkinan lokasi (tenant/device + legacy + scan).
   * Dipakai untuk admin cleanup / kompatibilitas.
   */
  async deleteAnyAuthState(deviceId: string, tenantId?: string): Promise<void> {
    const candidates = new Set<string>();

    if (tenantId) {
      candidates.add(this.getDeviceDir(tenantId, deviceId));
    }

    candidates.add(this.getLegacyDeviceDir(deviceId));

    try {
      // cari juga di layout baru, kalau tenantId tidak diberikan
      const scan = await this.scanSessions();
      for (const s of scan) {
        if (s.deviceId === deviceId) {
          candidates.add(s.sessionDir);
        }
      }
    } catch {
      // ignore
    }

    for (const dir of candidates) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }

    logger.debug({ deviceId, tenantId, count: candidates.size }, 'Auth state cleanup completed');
  }

  /**
   * Check apakah device punya auth state
   */
  async hasAuthState(tenantId: string, deviceId: string): Promise<boolean> {
    const credsFile = this.getFilePath(tenantId, deviceId, 'creds.json');
    return fs.existsSync(credsFile);
  }

  async hasAnyAuthState(deviceId: string, tenantId?: string): Promise<boolean> {
    if (tenantId && (await this.hasAuthState(tenantId, deviceId))) return true;
    return fs.existsSync(this.getLegacyFilePath(deviceId, 'creds.json'));
  }
}

/**
 * Create Baileys-compatible auth state dengan file storage
 * Menggunakan Baileys built-in useMultiFileAuthState
 */
export async function useDatabaseAuthState(
  tenantId: string,
  deviceId: string,
  authStore: BaileysAuthStore
): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  // Use Baileys standard file-based auth state
  const sessionDir = authStore.resolveSessionDir(tenantId, deviceId);
  const { state, saveCreds: baileysJump } = await useMultiFileAuthState(sessionDir);

  // Wrap saveCreds untuk tambahan logging
  const saveCreds = async () => {
    try {
      await baileysJump();
      logger.debug({ deviceId }, 'Credentials saved to file');
    } catch (error) {
      logger.error({ error, deviceId }, 'Failed to save credentials');
      throw error;
    }
  };

  return {
    state,
    saveCreds,
  };
}
