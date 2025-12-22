import logger from '../utils/logger';
import { getDatabase } from '../storage/database';
import { deviceManager } from '../baileys/device-manager';

/**
 * ConnectionMonitor
 *
 * Tujuan:
 * - Memantau device yang punya session dan memastikan tetap terkoneksi.
 * - Jika device terputus, coba start ulang (auto reconnect) secara periodik.
 *
 * Catatan:
 * - Aman untuk multi-instance karena `startDevice` memakai distributed lock.
 */
export class ConnectionMonitor {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private nextAttemptAt = new Map<string, number>(); // deviceId -> epoch ms
  private backoffMs = new Map<string, number>(); // deviceId -> ms

  start(intervalMs = 3000) {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), intervalMs);
    logger.info({ intervalMs }, 'Connection monitor started');
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info('Connection monitor stopped');
  }

  private async tick() {
    if (this.running) return;
    this.running = true;

    try {
      const db = getDatabase();

      // Monitor hanya device yang:
      // - tenant aktif
      // - punya session (device_sessions row)
      // - status bukan failed
      const rows = db
        .prepare(
          `
          SELECT d.id as device_id, d.tenant_id as tenant_id, d.status as status
          FROM devices d
          INNER JOIN device_sessions ds ON ds.device_id = d.id
          INNER JOIN tenants t ON t.id = d.tenant_id
          WHERE t.status = 'active'
            AND d.status != 'failed'
        `
        )
        .all() as Array<{ device_id: string; tenant_id: string; status: string }>;

      for (const row of rows) {
        const deviceId = row.device_id;
        const tenantId = row.tenant_id;

        const state = deviceManager.getDeviceState(deviceId);
        const isStarting = Boolean(state?.isStarting);
        const connectionInfo = deviceManager.getConnectionInfo(deviceId);

        if (connectionInfo.isConnected || isStarting) {
          this.backoffMs.delete(deviceId);
          this.nextAttemptAt.delete(deviceId);
          continue;
        }

        const now = Date.now();
        const allowedAt = this.nextAttemptAt.get(deviceId) || 0;
        if (now < allowedAt) continue;

        try {
          logger.warn(
            {
              deviceId,
              tenantId,
              lastError: connectionInfo.lastError,
              status: connectionInfo.status,
            },
            'Device disconnected; attempting auto-reconnect'
          );

          await deviceManager.startDevice(deviceId, tenantId);

          // reset backoff on success
          this.backoffMs.delete(deviceId);
          this.nextAttemptAt.delete(deviceId);
        } catch (error) {
          const prev = this.backoffMs.get(deviceId) || 5000;
          const next = Math.min(prev * 2, 5 * 60 * 1000); // max 5 minutes
          this.backoffMs.set(deviceId, next);
          this.nextAttemptAt.set(deviceId, Date.now() + next);

          logger.error(
            {
              error,
              deviceId,
              tenantId,
              nextAttemptInMs: next,
            },
            'Auto-reconnect attempt failed'
          );
        }
      }
    } catch (error) {
      logger.error({ error }, 'Connection monitor tick error');
    } finally {
      this.running = false;
    }
  }
}

export const connectionMonitor = new ConnectionMonitor();
