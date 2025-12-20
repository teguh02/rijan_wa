import { getDatabase } from '../storage/database';
import logger from '../utils/logger';

const LOCK_TTL_SECONDS = 300; // 5 minutes
const LOCK_CHECK_INTERVAL_MS = 1000; // 1 second

export class DistributedLock {
  private instanceId: string;

  constructor(instanceId: string) {
    this.instanceId = instanceId;
  }

  /**
   * Acquire lock for device
   * Returns true if lock was acquired, false if already held by another instance
   */
  async acquireLock(deviceId: string, timeoutMs: number = 5000): Promise<boolean> {
    const db = getDatabase();
    const expiresAt = Math.floor(Date.now() / 1000) + LOCK_TTL_SECONDS;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        // Try to insert lock (will fail if already exists)
        db.prepare(`
          INSERT INTO device_locks (device_id, instance_id, acquired_at, expires_at)
          VALUES (?, ?, ?, ?)
        `).run(deviceId, this.instanceId, Math.floor(Date.now() / 1000), expiresAt);

        logger.info({ deviceId, instanceId: this.instanceId }, 'Device lock acquired');
        return true;
      } catch (error: any) {
        // Lock exists, check if expired
        const existing = db.prepare(`
          SELECT * FROM device_locks WHERE device_id = ?
        `).get(deviceId) as any;

        if (existing && existing.expires_at < Math.floor(Date.now() / 1000)) {
          // Lock expired, delete and retry
          try {
            db.prepare('DELETE FROM device_locks WHERE device_id = ?').run(deviceId);
            logger.info({ deviceId }, 'Expired device lock removed');
            continue;
          } catch (delError) {
            logger.warn({ error: delError }, 'Failed to delete expired lock');
          }
        }

        if (existing?.instance_id === this.instanceId) {
          // Already locked by this instance, refresh
          db.prepare(`
            UPDATE device_locks 
            SET expires_at = ?, acquired_at = ? 
            WHERE device_id = ? AND instance_id = ?
          `).run(expiresAt, Math.floor(Date.now() / 1000), deviceId, this.instanceId);
          return true;
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, Math.min(LOCK_CHECK_INTERVAL_MS, timeoutMs - (Date.now() - startTime))));
      }
    }

    logger.warn({ deviceId, instanceId: this.instanceId }, 'Failed to acquire device lock (timeout)');
    return false;
  }

  /**
   * Refresh lock expiration
   */
  refreshLock(deviceId: string): void {
    try {
      const db = getDatabase();
      const expiresAt = Math.floor(Date.now() / 1000) + LOCK_TTL_SECONDS;

      db.prepare(`
        UPDATE device_locks 
        SET expires_at = ? 
        WHERE device_id = ? AND instance_id = ?
      `).run(expiresAt, deviceId, this.instanceId);
    } catch (error) {
      logger.warn({ error, deviceId }, 'Failed to refresh lock');
    }
  }

  /**
   * Release lock
   */
  releaseLock(deviceId: string): void {
    try {
      const db = getDatabase();
      db.prepare(`
        DELETE FROM device_locks 
        WHERE device_id = ? AND instance_id = ?
      `).run(deviceId, this.instanceId);

      logger.info({ deviceId, instanceId: this.instanceId }, 'Device lock released');
    } catch (error) {
      logger.warn({ error, deviceId }, 'Failed to release lock');
    }
  }

  /**
   * Check if this instance holds the lock
   */
  isLocked(deviceId: string): boolean {
    try {
      const db = getDatabase();
      const lock = db.prepare(`
        SELECT * FROM device_locks 
        WHERE device_id = ? AND instance_id = ? AND expires_at > ?
      `).get(deviceId, this.instanceId, Math.floor(Date.now() / 1000)) as any;

      return !!lock;
    } catch (error) {
      logger.warn({ error, deviceId }, 'Failed to check lock status');
      return false;
    }
  }

  /**
   * Cleanup expired locks
   */
  cleanupExpiredLocks(): void {
    try {
      const db = getDatabase();
      const now = Math.floor(Date.now() / 1000);
      db.prepare('DELETE FROM device_locks WHERE expires_at < ?').run(now);
    } catch (error) {
      logger.warn({ error }, 'Failed to cleanup expired locks');
    }
  }
}
