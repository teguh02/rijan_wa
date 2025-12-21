import makeWASocket, {
  DisconnectReason,
  WASocket,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import { BaileysAuthStore, useDatabaseAuthState } from './auth-store';
import { DeviceStatus, DeviceState, PairingMethod, DeviceConnectionInfo } from './types';
import { DeviceRepository } from '../storage/repositories';
import logger from '../utils/logger';
import { DistributedLock } from '../utils/distributed-lock';
import config from '../config';
// import crypto from 'crypto';

/**
 * DeviceManager - Mengelola lifecycle Baileys socket per device
 */
export class DeviceManager {
  private devices = new Map<string, DeviceInstance>();
  private authStore = new BaileysAuthStore();
  private deviceRepo = new DeviceRepository();
  private distributedLock: DistributedLock;
  private static instance: DeviceManager;

  private constructor() {
    this.distributedLock = new DistributedLock(config.instanceId);
  }

  static getInstance(): DeviceManager {
    if (!DeviceManager.instance) {
      DeviceManager.instance = new DeviceManager();
      // Auto-sync existing sessions on creation (non-blocking)
      DeviceManager.instance.autoSyncSessions().catch(error => {
        logger.error({ error }, 'Failed to auto-sync sessions on startup');
      });
    }
    return DeviceManager.instance;
  }

  /**
   * Ambil socket aktif untuk device.
   * Dipakai oleh service internal (messages, chats) agar tidak akses private map via `as any`.
   */
  getSocketOrThrow(deviceId: string): WASocket {
    const instance = this.devices.get(deviceId);
    if (!instance?.socket || instance.socket.ws.isClosed) {
      throw new Error('Device socket not available');
    }
    return instance.socket;
  }

  private async cleanupDeviceInstance(deviceId: string, options?: { releaseLock?: boolean }): Promise<void> {
    const instance = this.devices.get(deviceId);
    if (!instance) return;

    const releaseLock = options?.releaseLock !== false;

    try {
      if (instance.lockRefreshInterval) {
        clearInterval(instance.lockRefreshInterval);
      }
    } catch {
      // ignore
    }

    if (releaseLock) {
      try {
        await this.distributedLock.releaseLock(deviceId);
      } catch (error) {
        logger.error({ error, deviceId }, 'Failed to release device lock during cleanup');
      }
    }

    this.devices.delete(deviceId);
  }

  /**
   * Start device dan create socket
   */
  async startDevice(deviceId: string, tenantId: string): Promise<DeviceState> {
    // Acquire distributed lock first (5 second timeout)
    const lockAcquired = await this.distributedLock.acquireLock(deviceId, 5000);
    if (!lockAcquired) {
      throw new Error('Device is already starting on another instance. Please wait and try again.');
    }

    try {
      // Check if already running
      const existing = this.devices.get(deviceId);
      if (existing?.socket && !existing.socket.ws.isClosed) {
        logger.warn({ deviceId }, 'Device already running');
        // Release lock before returning
        await this.distributedLock.releaseLock(deviceId);
        return existing.state;
      }

      // If there's a stale instance (socket closed), clear its intervals before starting a fresh socket
      if (existing) {
        await this.cleanupDeviceInstance(deviceId, { releaseLock: false });
      }

      // Verify device exists dan belongs to tenant
      const device = this.deviceRepo.findById(deviceId, tenantId);
      if (!device) {
        await this.distributedLock.releaseLock(deviceId);
        throw new Error('Device not found or access denied');
      }

      // Lock starting
      if (existing?.state.isStarting) {
        await this.distributedLock.releaseLock(deviceId);
        throw new Error('Device is already starting');
      }

    // Initialize state
    const state: DeviceState = {
      deviceId,
      tenantId,
      status: DeviceStatus.CONNECTING,
      isStarting: true,
      reconnectAttempts: 0,
      maxReconnectAttempts: 5,
    };

    const instance: DeviceInstance = {
      state,
      socket: null as any,
      startedAt: Date.now(),
      chatIndex: new Map(),
    };

    this.devices.set(deviceId, instance);

    try {
      // Load auth state (standard Baileys multi-file) - namespaced by tenant/device
      const { state: authState, saveCreds } = await useDatabaseAuthState(tenantId, deviceId, this.authStore);

      // Get Baileys version
      const { version, isLatest } = await fetchLatestBaileysVersion();
      logger.info({ version, isLatest, deviceId }, 'Using Baileys version');

      // Create socket
      const socket = makeWASocket({
        version,
        auth: {
          creds: authState.creds,
          keys: makeCacheableSignalKeyStore(authState.keys, logger),
        },
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Rijan WA Gateway'),
        getMessage: async (_key) => {
          return { conversation: '' };
        },
        logger,
        markOnlineOnConnect: false,
        // Helps populate chat list/history on first connection.
        // Note: can be RAM heavy for large accounts.
        syncFullHistory: true,
      });

      instance.socket = socket;
      state.isStarting = false;

      // Setup lock refresh interval (every 60 seconds)
      const lockRefreshInterval = setInterval(async () => {
        try {
          await this.distributedLock.refreshLock(deviceId);
        } catch (error) {
          logger.error({ error, deviceId }, 'Failed to refresh lock');
        }
      }, 60000); // 1 minute

      instance.lockRefreshInterval = lockRefreshInterval;

      // Setup event handlers
      this.setupEventHandlers(deviceId, tenantId, socket, saveCreds);

      // Update device status
      this.deviceRepo.updateStatus(deviceId, 'connecting');

      logger.info({ deviceId, tenantId }, 'Device started');

      return state;
    } catch (error) {
      state.isStarting = false;
      state.status = DeviceStatus.FAILED;
      state.lastError = error instanceof Error ? error.message : 'Unknown error';
      
      // Release lock on error
      await this.distributedLock.releaseLock(deviceId);
      
      logger.error({ error, deviceId }, 'Failed to start device');
      throw error;
    }
    } catch (error) {
      // Release lock if outer try-catch catches
      await this.distributedLock.releaseLock(deviceId);
      throw error;
    }
  }

  /**
   * Stop device dan close socket
   */
  async stopDevice(deviceId: string): Promise<void> {
    const instance = this.devices.get(deviceId);
    if (!instance) {
      throw new Error('Device not running');
    }

    try {
      if (instance.socket && !instance.socket.ws.isClosed) {
        instance.socket.ws.close();
      }

      instance.state.status = DeviceStatus.DISCONNECTED;
      this.deviceRepo.updateStatus(deviceId, 'disconnected');

      await this.cleanupDeviceInstance(deviceId, { releaseLock: true });
      logger.info({ deviceId }, 'Device stopped');
    } catch (error) {
      logger.error({ error, deviceId }, 'Error stopping device');
      throw error;
    }
  }

  /**
   * Logout device (clear session)
   */
  async logoutDevice(deviceId: string): Promise<void> {
    const instance = this.devices.get(deviceId);

    // Stop socket if running
    if (instance?.socket && !instance.socket.ws.isClosed) {
      try {
        await instance.socket.logout();
      } catch (error) {
        logger.error({ error, deviceId }, 'Error during logout');
      }
      await this.stopDevice(deviceId);
    }

    // Delete auth state (tenant-scoped if possible)
    const device = this.deviceRepo.findById(deviceId);
    if (device?.tenant_id) {
      await this.authStore.deleteAuthState(device.tenant_id, deviceId);
    } else {
      await this.authStore.deleteAnyAuthState(deviceId);
    }

    // Update device
    this.deviceRepo.updateStatus(deviceId, 'disconnected');
    this.deviceRepo.updatePhoneNumber(deviceId, '');

    logger.info({ deviceId }, 'Device logged out');
  }

  /**
   * Get device state
   */
  getDeviceState(deviceId: string): DeviceState | null {
    const instance = this.devices.get(deviceId);
    return instance ? { ...instance.state } : null;
  }

  /**
   * Request QR code untuk pairing
   */
  async requestQrCode(deviceId: string, _tenantId: string): Promise<string | null> {
    let instance = this.devices.get(deviceId);

    // Device harus sudah di-start sebelumnya
    if (!instance) {
      throw new Error('Device is not started. Call /start endpoint first');
    }

    // Device harus dalam status connecting, jangan kalau sudah connected
    if (instance.state.status === DeviceStatus.CONNECTED) {
      throw new Error('Device already connected. Logout first to re-pair');
    }

    // Jika QR sudah pernah dibuat, status biasanya sudah berubah ke PAIRING.
    // Izinkan CONNECTING maupun PAIRING.
    if (instance.state.status !== DeviceStatus.CONNECTING && instance.state.status !== DeviceStatus.PAIRING) {
      throw new Error(`Device must be in connecting/pairing status, currently: ${instance.state.status}`);
    }

    // Fast path: kalau QR sudah ada, langsung return
    if (instance.state.lastQrCode) {
      instance.state.pairingMethod = PairingMethod.QR;
      return instance.state.lastQrCode;
    }

    // Wait for QR code (max 30 seconds)
    const maxWait = 30000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      if (instance.state.lastQrCode) {
        instance.state.pairingMethod = PairingMethod.QR;
        return instance.state.lastQrCode;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error('QR code timeout - Device did not generate QR code within 30 seconds');
  }

  /**
   * Request pairing code untuk pairing berbasis nomor
   */
  async requestPairingCode(
    deviceId: string,
    _tenantId: string,
    phoneNumber: string
  ): Promise<string> {
    let instance = this.devices.get(deviceId);

    // Device harus sudah di-start sebelumnya
    if (!instance) {
      throw new Error('Device is not started. Call /start endpoint first');
    }

    // Device harus dalam status connecting, jangan kalau sudah connected
    if (instance.state.status === DeviceStatus.CONNECTED) {
      throw new Error('Device already connected. Logout first to re-pair');
    }

    if (instance.state.status !== DeviceStatus.CONNECTING) {
      throw new Error(`Device must be in connecting status, currently: ${instance.state.status}`);
    }

    if (!instance?.socket) {
      throw new Error('Device socket is not initialized');
    }

    // Clean phone number
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');

    // Request pairing code dari Baileys
    const code = await instance.socket.requestPairingCode(cleanNumber);

    instance.state.pairingMethod = PairingMethod.CODE;
    instance.state.pairingCode = code;
    instance.state.phoneNumber = cleanNumber;

    logger.info({ deviceId, phoneNumber: cleanNumber }, 'Pairing code generated');

    return code;
  }

  /**
   * Get device connection info
   */
  getConnectionInfo(deviceId: string): DeviceConnectionInfo {
    const instance = this.devices.get(deviceId);

    if (!instance) {
      return {
        isConnected: false,
        status: DeviceStatus.DISCONNECTED,
      };
    }

    return {
      isConnected: instance.state.status === DeviceStatus.CONNECTED,
      status: instance.state.status,
      phoneNumber: instance.state.phoneNumber,
      waJid: instance.state.waJid,
      lastConnectAt: instance.state.lastConnectAt,
      lastDisconnectAt: instance.state.lastDisconnectAt,
      lastError: instance.state.lastError,
      uptime: instance.startedAt ? Date.now() - instance.startedAt : undefined,
    };
  }

  /**
   * Snapshot of known chats for a device, populated from Baileys events.
   */
  getChatsSnapshot(deviceId: string): any[] {
    const instance = this.devices.get(deviceId);
    if (!instance) return [];
    return Array.from(instance.chatIndex.values());
  }

  /**
   * Setup event handlers untuk Baileys socket
   */
  private setupEventHandlers(
    deviceId: string,
    tenantId: string,
    socket: WASocket,
    saveCreds: () => Promise<void>
  ): void {
    const instance = this.devices.get(deviceId);
    if (!instance) return;

    // Chat history + chat list hydration
    socket.ev.on('messaging-history.set', async ({ chats }) => {
      try {
        for (const chat of chats || []) {
          if (chat?.id) instance.chatIndex.set(chat.id, chat);
        }
        logger.info({ deviceId, count: chats?.length || 0 }, 'Chat history set received');
      } catch (error) {
        logger.error({ error, deviceId }, 'Failed to process messaging-history.set');
      }
    });

    socket.ev.on('chats.upsert', async (chats) => {
      try {
        for (const chat of chats || []) {
          if (chat?.id) instance.chatIndex.set(chat.id, chat);
        }
      } catch (error) {
        logger.error({ error, deviceId }, 'Failed to process chats.upsert');
      }
    });

    // Connection updates
    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      logger.debug({ deviceId, connection, hasQr: !!qr }, 'Connection update');

      if (qr) {
        // Generate QR code
        try {
          const qrDataUrl = await QRCode.toDataURL(qr);
          instance.state.lastQrCode = qrDataUrl;
          instance.state.lastQrAt = Date.now();
          instance.state.status = DeviceStatus.PAIRING;
          logger.info({ deviceId }, 'QR code generated');
        } catch (error) {
          logger.error({ error, deviceId }, 'Failed to generate QR code');
        }
      }

      if (connection === 'open') {
        instance.state.status = DeviceStatus.CONNECTED;
        instance.state.lastConnectAt = Date.now();
        instance.state.reconnectAttempts = 0;
        instance.state.lastQrCode = undefined;

        // Get phone number
        if (socket.user) {
          instance.state.waJid = socket.user.id;
          const phoneNumber = socket.user.id.split(':')[0];
          instance.state.phoneNumber = phoneNumber;

          this.deviceRepo.updatePhoneNumber(deviceId, phoneNumber);
        }

        this.deviceRepo.updateStatus(deviceId, 'connected', instance.state.lastConnectAt);
        logger.info({ deviceId, waJid: instance.state.waJid }, 'Device connected');
      }

      if (connection === 'close') {
        instance.state.lastDisconnectAt = Date.now();
        const shouldReconnect = this.handleDisconnect(deviceId, lastDisconnect);

        if (shouldReconnect) {
          logger.info({ deviceId }, 'Reconnecting device...');
          // Tear down the old instance (intervals, map entry) but keep the distributed lock
          await this.cleanupDeviceInstance(deviceId, { releaseLock: false });
          setTimeout(() => {
            this.startDevice(deviceId, instance.state.tenantId).catch((error) => {
              logger.error({ error, deviceId }, 'Reconnection failed');
            });
          }, 3000);
        } else {
          instance.state.status = DeviceStatus.DISCONNECTED;
          this.deviceRepo.updateStatus(deviceId, 'disconnected');
          await this.cleanupDeviceInstance(deviceId, { releaseLock: true });
        }
      }
    });

    // Credentials update
    socket.ev.on('creds.update', async () => {
      try {
        await saveCreds();
        logger.debug({ deviceId }, 'Credentials updated and saved');
        
        // Sync session to database
        await this.syncSessionToDatabase(tenantId, deviceId);
      } catch (error) {
        logger.error({ error, deviceId }, 'Failed to save credentials');
      }
    });

    // Messages (incoming)
    socket.ev.on('messages.upsert', async (m) => {
      try {
        const { eventRepository } = await import('../modules/events/repository');
        const { webhookService } = await import('../modules/webhooks/service');

        for (const msg of m.messages) {
          if (msg.message && msg.key.fromMe === false) {
            // Save to event log and inbox
            const jid = msg.key.remoteJid || 'unknown';
            const messageId = msg.key.id || 'unknown';

            eventRepository.saveEvent(instance.state.tenantId, deviceId, 'messages.upsert', {
              key: msg.key,
              message: msg.message,
              pushName: msg.pushName,
            });

            eventRepository.saveInboxMessage(
              instance.state.tenantId,
              deviceId,
              jid,
              messageId,
              msg.message.conversation ? 'text' : 'media',
              msg
            );

            // Trigger webhooks
            await webhookService.queueDelivery({
              id: messageId,
              eventType: 'message.received',
              tenantId: instance.state.tenantId,
              deviceId,
              timestamp: typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : Math.floor(Date.now() / 1000),
              data: msg,
            });
          }
        }
      } catch (error) {
        logger.error({ error, deviceId }, 'Failed to process message.upsert');
      }
    });

    // Message updates (edits, acks)
    socket.ev.on('messages.update', async (updates) => {
      try {
        const { eventRepository } = await import('../modules/events/repository');
        const { webhookService } = await import('../modules/webhooks/service');

        for (const update of updates) {
          eventRepository.saveEvent(instance.state.tenantId, deviceId, 'messages.update', update);

          // Trigger webhooks for read/delivery receipts
          if (update.update?.status) {
            const statusMap: Record<number, 'message.updated' | 'receipt.delivery' | 'receipt.read'> = {
              1: 'message.updated',
              2: 'receipt.delivery',
              3: 'receipt.read',
            };
            const eventType = statusMap[update.update.status] || 'message.updated';

            await webhookService.queueDelivery({
              id: update.key.id || '',
              eventType,
              tenantId: instance.state.tenantId,
              deviceId,
              timestamp: Math.floor(Date.now() / 1000),
              data: update,
            });
          }
        }
      } catch (error) {
        logger.error({ error, deviceId }, 'Failed to process messages.update');
      }
    });

    // Message receipts (delivery/read)
    socket.ev.on('message-receipt.update', async (updates) => {
      try {
        const { eventRepository } = await import('../modules/events/repository');
        const { webhookService } = await import('../modules/webhooks/service');

        eventRepository.saveEvent(instance.state.tenantId, deviceId, 'message-receipt.update', updates);

        // Queue webhook for receipt event
        await webhookService.queueDelivery({
          id: `receipt-${Date.now()}`,
          eventType: 'receipt.delivery',
          tenantId: instance.state.tenantId,
          deviceId,
          timestamp: Math.floor(Date.now() / 1000),
          data: updates,
        });
      } catch (error) {
        logger.error({ error, deviceId }, 'Failed to process message-receipt.update');
      }
    });

    // Group updates
    socket.ev.on('groups.update', async (updates) => {
      try {
        const { eventRepository } = await import('../modules/events/repository');
        const { webhookService } = await import('../modules/webhooks/service');

        for (const update of updates) {
          eventRepository.saveEvent(instance.state.tenantId, deviceId, 'groups.update', update);

          await webhookService.queueDelivery({
            id: update.id || `group-${Date.now()}`,
            eventType: 'group.updated',
            tenantId: instance.state.tenantId,
            deviceId,
            timestamp: Math.floor(Date.now() / 1000),
            data: update,
          });
        }
      } catch (error) {
        logger.error({ error, deviceId }, 'Failed to process groups.update');
      }
    });

    // Group participant updates
    socket.ev.on('group-participants.update', async (update) => {
      try {
        const { eventRepository } = await import('../modules/events/repository');
        const { webhookService } = await import('../modules/webhooks/service');

        eventRepository.saveEvent(instance.state.tenantId, deviceId, 'group-participants.update', update);

        // Determine if add or remove
        const action = update.action === 'add' ? 'participant.added' : 'participant.removed';

        await webhookService.queueDelivery({
          id: update.id,
          eventType: action as any,
          tenantId: instance.state.tenantId,
          deviceId,
          timestamp: Math.floor(Date.now() / 1000),
          data: update,
        });
      } catch (error) {
        logger.error({ error, deviceId }, 'Failed to process group-participants.update');
      }
    });

    // Contact updates
    socket.ev.on('contacts.update', async (updates) => {
      try {
        const { eventRepository } = await import('../modules/events/repository');

        for (const update of updates) {
          eventRepository.saveEvent(instance.state.tenantId, deviceId, 'contacts.update', update);
        }
      } catch (error) {
        logger.error({ error, deviceId }, 'Failed to process contacts.update');
      }
    });

    // Chat updates
    socket.ev.on('chats.update', async (updates) => {
      try {
        const { eventRepository } = await import('../modules/events/repository');

        for (const update of updates) {
          eventRepository.saveEvent(instance.state.tenantId, deviceId, 'chats.update', update);

          const jid = (update as any)?.id;
          if (jid) {
            const existing = instance.chatIndex.get(jid) || { id: jid };
            instance.chatIndex.set(jid, { ...existing, ...update });
          }
        }
      } catch (error) {
        logger.error({ error, deviceId }, 'Failed to process chats.update');
      }
    });
  }

  /**
   * Handle disconnection dan decide apakah perlu reconnect
   */
  private handleDisconnect(deviceId: string, lastDisconnect: any): boolean {
    const instance = this.devices.get(deviceId);
    if (!instance) return false;

    const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

    logger.info(
      { deviceId, statusCode, shouldReconnect },
      'Device disconnected'
    );

    if (!shouldReconnect) {
      instance.state.status = DeviceStatus.DISCONNECTED;
      instance.state.lastError = 'Logged out';
      return false;
    }

    // Check reconnect attempts
    instance.state.reconnectAttempts = (instance.state.reconnectAttempts || 0) + 1;

    if (instance.state.reconnectAttempts > (instance.state.maxReconnectAttempts || 5)) {
      instance.state.status = DeviceStatus.FAILED;
      instance.state.lastError = 'Max reconnect attempts reached';
      this.deviceRepo.updateStatus(deviceId, 'failed');
      return false;
    }

    return true;
  }

  /**
   * Recover devices on server restart
   */
  async recoverDevices(): Promise<void> {
    logger.info('Recovering devices from previous session...');

    const db = (await import('../storage/database')).getDatabase();
    const stmt = db.prepare(`
      SELECT d.id, d.tenant_id, d.status
      FROM devices d
      INNER JOIN device_sessions ds ON d.id = ds.device_id
      WHERE d.status IN ('connected', 'connecting')
    `);

    const devices = stmt.all() as Array<{ id: string; tenant_id: string; status: string }>;

    logger.info({ count: devices.length }, 'Found devices to recover');

    for (const device of devices) {
      try {
        logger.info({ deviceId: device.id }, 'Recovering device...');
        await this.startDevice(device.id, device.tenant_id);
      } catch (error) {
        logger.error({ error, deviceId: device.id }, 'Failed to recover device');
      }
    }
  }

  /**
   * Sync session metadata ke database
   * Dipanggil setiap kali credentials updated
   */
  private async syncSessionToDatabase(tenantId: string, deviceId: string): Promise<void> {
    try {
      const metadata = await this.authStore.getSessionMetadata(tenantId, deviceId);
      if (!metadata || !metadata.hasSession) {
        logger.warn({ deviceId, tenantId }, 'Session not found in filesystem');
        return;
      }

      const identity = await this.authStore.getCredsIdentity(tenantId, deviceId);
      const sessionDir = this.authStore.resolveSessionDir(tenantId, deviceId);

      const db = (await import('../storage/database')).getDatabase();
      const now = Math.floor(Date.now() / 1000);

      const stmt = db.prepare(`
        INSERT OR REPLACE INTO device_sessions
        (device_id, auth_encrypted, auth_iv, auth_tag, enc_version, salt, updated_at, tenant_id, session_kind, session_dir, wa_jid, wa_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        deviceId,
        'SESSION_FILE_BASED',
        'N/A',
        'N/A',
        1,
        'N/A',
        now,
        tenantId,
        'baileys_multifile',
        sessionDir,
        identity?.waJid || null,
        identity?.waName || null
      );

      logger.debug(
        { deviceId, tenantId, sessionDir, updatedAt: metadata.updatedAt, waJid: identity?.waJid },
        'Session synced to database'
      );
    } catch (error) {
      logger.error({ error, deviceId, tenantId }, 'Failed to sync session to database');
    }
  }

  /**
   * Auto-sync existing sessions dari filesystem ke database
   * Dipanggil saat server startup
   */
  private async autoSyncSessions(): Promise<void> {
    try {
      logger.info('Auto-syncing existing sessions to database...');

      // Scan filesystem untuk existing sessions
      const sessions = await this.authStore.scanSessions();

      if (sessions.length === 0) {
        logger.info('No existing sessions found');
        return;
      }

      logger.info({ count: sessions.length }, 'Found existing sessions, syncing...');

      let syncedCount = 0;

      // Sync each session metadata ke database
      for (const session of sessions) {
        try {
          // Resolve tenantId untuk legacy layout
          let tenantId = session.tenantId;
          if (tenantId === '__LEGACY__') {
            const device = this.deviceRepo.findById(session.deviceId);
            if (!device) {
              logger.warn({ deviceId: session.deviceId }, 'Skipping legacy session: device not found in DB');
              continue;
            }
            tenantId = device.tenant_id;
            // migrate folder into new layout for consistency
            this.authStore.migrateLegacySessionDirIfNeeded(tenantId, session.deviceId);
          }

          // Pastikan device memang milik tenant itu
          const device = this.deviceRepo.findById(session.deviceId, tenantId);
          if (!device) {
            logger.warn({ deviceId: session.deviceId, tenantId }, 'Skipping session: device not owned by tenant');
            continue;
          }

          await this.syncSessionToDatabase(tenantId, session.deviceId);
          syncedCount++;
        } catch (error) {
          logger.error({ error, session }, 'Failed to sync session');
        }
      }

      logger.info({ scanned: sessions.length, synced: syncedCount }, 'Sessions auto-sync completed');
    } catch (error) {
      logger.error({ error }, 'Failed to auto-sync sessions');
    }
  }
}

interface DeviceInstance {
  state: DeviceState;
  socket: WASocket;
  startedAt: number;
  lockRefreshInterval?: NodeJS.Timeout;
  chatIndex: Map<string, any>;
}

// Export singleton instance
export const deviceManager = DeviceManager.getInstance();
