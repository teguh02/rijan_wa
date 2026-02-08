import type {
  WASocket,
} from '@whiskeysockets/baileys';

// Dynamic import holder
let BaileysLib: typeof import('@whiskeysockets/baileys');

async function getBaileysLib() {
  if (!BaileysLib) {
    BaileysLib = await import('@whiskeysockets/baileys');
  }
  return BaileysLib;
}

import QRCode from 'qrcode';
import { BaileysAuthStore, useDatabaseAuthState } from './auth-store';
import { DeviceStatus, DeviceState, PairingMethod, DeviceConnectionInfo } from './types';
import { ChatRepository, DeviceRepository } from '../storage/repositories';
import logger from '../utils/logger';
import { DistributedLock } from '../utils/distributed-lock';
import config from '../config';
import { isProtocolTapEnabled, ProtocolTapBuffer, type ProtocolTapItem } from './protocol-tap';
// import crypto from 'crypto';

const PROTOCOL_TAP_ENABLED = isProtocolTapEnabled();

/**
 * DeviceManager - Mengelola lifecycle Baileys socket per device
 */
export class DeviceManager {
  private devices = new Map<string, DeviceInstance>();
  private authStore = new BaileysAuthStore();
  private deviceRepo = new DeviceRepository();
  private chatRepo = new ChatRepository();
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
   * Handle decryption errors (Bad MAC, No matching session)
   * This mimics the fix in PR #2307 by deleting the corrupt session for the specific contact.
   */
  private async handleDecryptionError(deviceId: string, tenantId: string, errorObj: any): Promise<void> {
    try {
      // Attempt to extract JID from error object
      // Pattern: {"key":{"remoteJid":"...","id":"..."},"err":{...}}
      const remoteJid = errorObj?.key?.remoteJid;

      if (remoteJid && typeof remoteJid === 'string') {
        const sanitizedJid = remoteJid.replace(/:/g, '_');
        logger.warn({ deviceId, remoteJid, sanitizedJid }, 'Detected decryption error. Attempting auto-recovery (deleting session)...');

        // Delete session key (e.g., session-user@s.whatsapp.net)
        // Baileys stores sessions with 'session-' prefix for JIDs
        await this.authStore.deleteSessionKey(tenantId, deviceId, `session-${sanitizedJid}`);
      }
    } catch (err) {
      logger.error({ err, deviceId }, 'Failed to handle decryption error recovery');
    }
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
        protocolTap: PROTOCOL_TAP_ENABLED ? new ProtocolTapBuffer(deviceId) : undefined,
      };

      this.devices.set(deviceId, instance);

      const instanceLogger = logger.child({ deviceId, tenantId });

      // Logger wrapper to intercept decryption errors
      const wrappedLogger = new Proxy(instanceLogger, {
        get: (target, prop, receiver) => {
          const original = Reflect.get(target, prop, receiver);
          if (typeof original === 'function' && (prop === 'error' || prop === 'warn')) {
            return (obj: any, msg?: string, ...args: any[]) => {
              // Call original first
              original.apply(target, [obj, msg, ...args]);

              // Check for decryption errors in object or message
              const isDecryptionError =
                (typeof msg === 'string' && (msg.includes('Bad MAC') || msg.includes('No matching session'))) ||
                (obj?.err?.message && (obj.err.message.includes('Bad MAC') || obj.err.message.includes('No matching session'))) ||
                (obj?.message && (obj.message.includes('Bad MAC') || obj.message.includes('No matching session')));

              if (isDecryptionError) {
                // Run recovery in background
                this.handleDecryptionError(deviceId, tenantId, obj).catch(err => {
                  instanceLogger.error({ err }, 'Failed manually triggered decryption recovery');
                });
              }
            };
          }
          return original;
        }
      });

      try {
        // Load auth state (standard Baileys multi-file) - namespaced by tenant/device
        const { state: authState, saveCreds } = await useDatabaseAuthState(tenantId, deviceId, this.authStore);

        // Load Baileys dynamically
        const Baileys = await getBaileysLib();
        const makeWASocket = Baileys.default;
        const { fetchLatestBaileysVersion, makeCacheableSignalKeyStore, Browsers } = Baileys;

        // Get Baileys version
        const { version, isLatest } = await fetchLatestBaileysVersion();
        logger.info({ version, isLatest, deviceId }, 'Using Baileys version');

        // Create socket
        const socket = makeWASocket({
          version,
          auth: {
            creds: authState.creds,
            keys: makeCacheableSignalKeyStore(authState.keys, wrappedLogger),
          },
          printQRInTerminal: false,
          // Baileys will present itself as a Desktop client. This impacts how WhatsApp treats the session.
          // See Baileys wiki/docs around history sync behavior & client identity.
          browser: Browsers.windows('Rijan WA Gateway'),
          getMessage: async (_key: any) => {
            return { conversation: '' };
          },
          logger: wrappedLogger,
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
   * DEBUG: last protocol tap entries for a device.
   * Only populated when DEBUG_PROTOCOL_TAP=true.
   */
  getProtocolTap(deviceId: string, limit = 50): { enabled: boolean; items: ProtocolTapItem[] } {
    if (!PROTOCOL_TAP_ENABLED) return { enabled: false, items: [] };

    const instance = this.devices.get(deviceId);
    if (!instance?.protocolTap) return { enabled: true, items: [] };

    const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.min(Number(limit), 200)) : 50;
    return { enabled: true, items: instance.protocolTap.list(safeLimit) };
  }

  /**
   * DEBUG: record a high-level outgoing operation.
   * This is not raw encrypted WS traffic; it's meant to correlate API actions with Baileys events.
   */
  async recordProtocolOut(deviceId: string, nodeTag: string, payload: unknown): Promise<void> {
    if (!PROTOCOL_TAP_ENABLED) return;
    const instance = this.devices.get(deviceId);
    if (!instance?.protocolTap) return;
    instance.protocolTap.record('out', { nodeTag, payload });
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

    // DEBUG protocol tap (fallback): capture decrypted-level Baileys events before app processing.
    // The Noise frame plaintext buffer isn't exposed publicly by Baileys, so this is the closest safe hook.
    if (PROTOCOL_TAP_ENABLED && instance.protocolTap) {
      const processFn = (socket.ev as any)?.process as ((cb: (events: any) => Promise<void> | void) => void) | undefined;
      if (typeof processFn === 'function') {
        processFn(async (events) => {
          try {
            for (const [eventType, eventData] of Object.entries(events)) {
              instance.protocolTap!.record('in', { nodeTag: eventType, payload: eventData });
            }
          } catch {
            // never break the socket event loop
          }
        });
      }
    }

    const toFiniteNumberOrNull = (value: unknown): number | null => {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string' && value.trim() !== '') {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };

    const mapChatForDb = (chatLike: any): {
      jid: string;
      name?: string | null;
      isGroup: boolean;
      unreadCount?: number | null;
      lastMessageTime?: number | null;
      archived?: boolean | null;
      muted?: boolean | null;
    } | null => {
      const jid = chatLike?.id || chatLike?.jid;
      if (!jid || typeof jid !== 'string') return null;

      const unreadCount = toFiniteNumberOrNull(chatLike?.unreadCount);
      const lastMessageTime = toFiniteNumberOrNull(chatLike?.conversationTimestamp);

      return {
        jid,
        name: typeof chatLike?.name === 'string' ? chatLike.name : null,
        isGroup: jid.endsWith('@g.us'),
        unreadCount,
        lastMessageTime,
        archived: typeof chatLike?.archived === 'boolean' ? chatLike.archived : null,
        muted: chatLike?.muteEndTime ? true : null,
      };
    };

    // Chat history + chat list hydration (History Sync)
    // This event is the main source of initial chat list population.
    socket.ev.on('messaging-history.set', async ({ chats, contacts }) => {
      try {
        const chatList = chats || [];

        for (const chat of chatList) {
          if (chat?.id) instance.chatIndex.set(chat.id, chat);
        }

        // ✅ FIX: Restore chat persistence to database (was missing after refactoring)
        const dbChats = chatList.map(mapChatForDb).filter(Boolean) as any;
        this.chatRepo.upsertMany(tenantId, deviceId, dbChats);
        this.chatRepo.markHistorySync(tenantId, deviceId, dbChats.length);

        logger.info(
          {
            deviceId,
            chatsCount: chatList.length,
            contactsCount: contacts?.length || 0,
          },
          'History sync received (messaging-history.set)'
        );

        // ✅ FIX: Process contacts for LID mapping with v7 Contact type structure
        // In v7, Contact has: id (preferred), phoneNumber (if id is LID), lid (if id is PN)
        if (contacts && contacts.length > 0) {
          const { LidPhoneRepository } = await import('../storage/repositories');
          const lidRepo = new LidPhoneRepository();
          const updates: any[] = [];

          for (const contact of contacts) {
            const contactAny = contact as any;
            const contactId = contactAny.id;
            const contactLid = contactAny.lid;
            const contactPhoneNumber = contactAny.phoneNumber;
            const contactName = contactAny.name || contactAny.notify || contactAny.verifiedName;

            // v7 Contact type logic:
            // Case 1: id is PN, lid is separate -> map lid -> id (PN)
            // Case 2: id is LID, phoneNumber is separate -> map id (LID) -> phoneNumber
            if (contactId && contactLid) {
              // id is PN, lid is the LID
              updates.push({
                lid: contactLid,
                phoneJid: contactId,
                name: contactName
              });
            } else if (contactId && contactPhoneNumber && contactId.endsWith('@lid')) {
              // id is LID, phoneNumber is the PN
              updates.push({
                lid: contactId,
                phoneJid: contactPhoneNumber.includes('@') ? contactPhoneNumber : `${contactPhoneNumber}@s.whatsapp.net`,
                name: contactName
              });
            }
          }

          if (updates.length > 0) {
            lidRepo.upsertMany(deviceId, tenantId, updates);
            logger.info({ deviceId, count: updates.length }, 'Processed initial contacts for LID mapping');
          }
        }
      } catch (error) {
        logger.error(
          {
            deviceId,
            error,
            errorCode: (error as any)?.code,
            errorMessage: (error as any)?.message,
          },
          'Failed to process messaging-history.set'
        );
      }
    });

    socket.ev.on('chats.upsert', async (chats) => {
      try {
        const chatList = chats || [];

        for (const chat of chatList) {
          if (chat?.id) instance.chatIndex.set(chat.id, chat);
        }

        const dbChats = chatList.map(mapChatForDb).filter(Boolean) as any;
        this.chatRepo.upsertMany(tenantId, deviceId, dbChats);
        this.chatRepo.markChatsEvent(tenantId, deviceId, 'upsert');
      } catch (error) {
        logger.error({ error, deviceId }, 'Failed to process chats.upsert');
      }
    });

    // LID Mapping Update
    socket.ev.on('lid-mapping.update', async (update) => {
      try {
        const { LidPhoneRepository } = await import('../storage/repositories');
        const lidRepo = new LidPhoneRepository();

        // Structure is typically { mapping: { [lid: string]: string } } or just the map
        const mapping = (update as any)?.mapping || update;

        if (mapping && typeof mapping === 'object') {
          const entries = Object.entries(mapping);
          const updates = entries.map(([lid, phoneJid]) => ({
            lid,
            phoneJid: phoneJid as string,
            name: null
          }));

          if (updates.length > 0) {
            lidRepo.upsertMany(deviceId, tenantId, updates);
            logger.debug({ deviceId, count: updates.length }, 'Processed lid-mapping.update');
          }
        }
      } catch (error) {
        logger.error({ error, deviceId }, 'Failed to process lid-mapping.update');
      }
    });

    // Contacts Upsert/Update - ✅ FIX: Updated for v7 Contact type structure
    const handleContactsUpdate = async (contacts: any[]) => {
      try {
        const { LidPhoneRepository } = await import('../storage/repositories');
        const lidRepo = new LidPhoneRepository();
        const updates: any[] = [];

        for (const contact of contacts) {
          // v7 Contact type structure:
          // - id: preferred identifier (could be PN or LID depending on WhatsApp's preference)
          // - lid: LID if id is PN
          // - phoneNumber: phone number if id is LID
          const contactId = contact.id as string | undefined;
          const contactLid = contact.lid as string | undefined;
          const contactPhoneNumber = contact.phoneNumber as string | undefined;
          const contactName = contact.name || contact.notify || contact.verifiedName;

          if (!contactId) continue;

          // Case 1: id is PN, lid is separate -> map lid -> id (PN)
          if (contactLid && !contactId.endsWith('@lid')) {
            updates.push({
              lid: contactLid,
              phoneJid: contactId,
              name: contactName
            });
          }
          // Case 2: id is LID, phoneNumber is separate -> map id (LID) -> phoneNumber
          else if (contactId.endsWith('@lid') && contactPhoneNumber) {
            const phoneJid = contactPhoneNumber.includes('@')
              ? contactPhoneNumber
              : `${contactPhoneNumber}@s.whatsapp.net`;
            updates.push({
              lid: contactId,
              phoneJid,
              name: contactName
            });
          }
        }

        if (updates.length > 0) {
          lidRepo.upsertMany(deviceId, tenantId, updates);
          logger.debug({ deviceId, count: updates.length }, 'Processed contacts update/upsert for LID mapping');
        }
      } catch (error) {
        logger.error({ error, deviceId }, 'Failed to process contacts update');
      }
    };

    socket.ev.on('contacts.upsert', (contacts) => handleContactsUpdate(contacts));
    socket.ev.on('contacts.update', (contacts) => handleContactsUpdate(contacts));

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

        // Trigger webhooks
        try {
          const { webhookService } = await import('../modules/webhooks/service');
          await webhookService.queueDelivery({
            id: `device-connected-${deviceId}-${Date.now()}`,
            eventType: 'device.connected',
            tenantId: instance.state.tenantId,
            deviceId,
            timestamp: Math.floor(Date.now() / 1000),
            data: {
              deviceId,
              waJid: instance.state.waJid,
              phoneNumber: instance.state.phoneNumber,
              status: 'connected',
            },
          });
        } catch (error) {
          logger.error({ error, deviceId }, 'Failed to send device.connected webhook');
        }
      }

      if (connection === 'close') {
        instance.state.lastDisconnectAt = Date.now();
        const shouldReconnect = await this.handleDisconnect(deviceId, lastDisconnect);

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

          // Trigger webhooks
          try {
            const { webhookService } = await import('../modules/webhooks/service');
            await webhookService.queueDelivery({
              id: `device-disconnected-${deviceId}-${Date.now()}`,
              eventType: 'device.disconnected',
              tenantId: instance.state.tenantId,
              deviceId,
              timestamp: Math.floor(Date.now() / 1000),
              data: {
                deviceId,
                status: 'disconnected',
                reason: (lastDisconnect as any)?.error?.message || (lastDisconnect as any)?.error?.output?.payload?.message,
              },
            });
          } catch (error) {
            logger.error({ error, deviceId }, 'Failed to send device.disconnected webhook');
          }

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

        const inferInboxType = (message: any): string => {
          if (!message) return 'text';
          if (message.conversation || message.extendedTextMessage?.text) return 'text';
          if (message.imageMessage) return 'image';
          if (message.videoMessage) return 'video';
          if (message.audioMessage) return 'audio';
          if (message.documentMessage) return 'document';
          if (message.stickerMessage) return 'sticker';
          if (message.locationMessage || message.liveLocationMessage) return 'location';
          if (message.contactMessage || message.contactsArrayMessage) return 'contact';
          if (message.reactionMessage) return 'reaction';
          if (message.pollCreationMessage || message.pollUpdateMessage) return 'poll';
          return 'text';
        };

        for (const msg of m.messages) {
          if (msg.message && msg.key.fromMe === false) {
            // Save to event log and inbox
            const remoteJidRaw = msg.key.remoteJid || 'unknown';
            const messageId = msg.key.id || 'unknown';

            // ✅ FIX: Use v7 remoteJidAlt/participantAlt instead of deprecated senderPn
            // In Baileys 7.0.0, MessageKey now has:
            // - remoteJidAlt: Alternate JID for DMs (if remoteJid is LID, this is PN)
            // - participantAlt: Alternate for groups/broadcast
            const keyAny = msg.key as any;
            const remoteJidAlt = keyAny.remoteJidAlt as string | undefined;
            const participantAlt = keyAny.participantAlt as string | undefined;

            // Determine the phone number JID (PN)
            // For DMs: use remoteJidAlt if remoteJid is LID
            // For Groups: use participantAlt if participant is LID
            let phoneNumberJid: string | undefined;
            if (remoteJidRaw.endsWith('@lid') && remoteJidAlt) {
              phoneNumberJid = remoteJidAlt;
            } else if (keyAny.participant?.endsWith('@lid') && participantAlt) {
              phoneNumberJid = participantAlt;
            }

            // Use phone number if available, otherwise use raw JID
            const jid = phoneNumberJid || remoteJidRaw;

            // Store @lid -> phone mapping for future lookups
            if (remoteJidRaw.endsWith('@lid') && phoneNumberJid) {
              try {
                const db = (await import('../storage/database')).getDatabase();
                const now = Math.floor(Date.now() / 1000);
                const stmt = db.prepare(`
                  INSERT INTO lid_phone_map (lid, phone_jid, device_id, tenant_id, name, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(lid, device_id) DO UPDATE SET
                    phone_jid = excluded.phone_jid,
                    name = COALESCE(excluded.name, lid_phone_map.name),
                    updated_at = excluded.updated_at
                `);
                stmt.run(remoteJidRaw, phoneNumberJid, deviceId, instance.state.tenantId, msg.pushName || null, now, now);
                logger.debug({ deviceId, lid: remoteJidRaw, phoneJid: phoneNumberJid }, 'Stored @lid -> phone mapping from message');
              } catch (mappingError) {
                logger.error({ mappingError, deviceId, lid: remoteJidRaw }, 'Failed to store @lid -> phone mapping');
              }
            }

            // Keep payload small & consistent with Baileys example patterns
            const inboxPayload = {
              key: msg.key,
              message: msg.message,
              pushName: msg.pushName,
              messageTimestamp: msg.messageTimestamp,
            };

            eventRepository.saveEvent(instance.state.tenantId, deviceId, 'messages.upsert', {
              ...inboxPayload,
              remoteJidRaw,
              normalizedJid: jid,
            });

            eventRepository.saveInboxMessage(
              instance.state.tenantId,
              deviceId,
              jid,
              messageId,
              inferInboxType(msg.message),
              inboxPayload
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
    // Contact updates
    socket.ev.on('contacts.update', async (updates) => {
      try {
        const { eventRepository } = await import('../modules/events/repository');
        // Import dynamically to avoid circular dependencies if any, though repositories.ts is usually safe
        const { LidPhoneRepository } = await import('../storage/repositories');
        const lidPhoneRepo = new LidPhoneRepository();

        const mappingsToStore: Array<{ lid: string; phoneJid: string; name?: string | null }> = [];

        for (const update of updates) {
          eventRepository.saveEvent(instance.state.tenantId, deviceId, 'contacts.update', update);

          // Baileys v7 Contact structure handling
          // contact.id could be LID or PN
          const id = update.id;

          // Case 1: ID is LID, and phoneNumber is provided
          if (id?.endsWith('@lid') && (update as any).phoneNumber) {
            mappingsToStore.push({
              lid: id,
              phoneJid: (update as any).phoneNumber + '@s.whatsapp.net', // Ensure JID format
              name: update.name || update.notify || null
            });
          }

          // Case 2: ID is PN, and LID is provided
          // Note: update.lid might be present if id is PN
          if (id?.endsWith('@s.whatsapp.net') && (update as any).lid) {
            mappingsToStore.push({
              lid: (update as any).lid,
              phoneJid: id,
              name: update.name || update.notify || null
            });
          }
        }

        if (mappingsToStore.length > 0) {
          lidPhoneRepo.upsertMany(deviceId, instance.state.tenantId, mappingsToStore);
          logger.debug({ deviceId, count: mappingsToStore.length }, 'Stored extracted LID mappings from contacts.update');
        }

      } catch (error) {
        logger.error({ error, deviceId }, 'Failed to process contacts.update');
      }
    });

    // LID to Phone Number mapping updates (Baileys v7+)
    socket.ev.on('lid-mapping.update' as any, async (mappings: Array<{ lid: string; pn: string }>) => {
      try {
        const { LidPhoneRepository } = await import('../storage/repositories');
        const lidPhoneRepo = new LidPhoneRepository();

        logger.info({ deviceId, count: mappings?.length || 0 }, 'Received lid-mapping.update');

        if (mappings && mappings.length > 0) {
          const formattedMappings = mappings.map(m => ({
            lid: m.lid,
            phoneJid: m.pn,
            name: null,
          }));
          lidPhoneRepo.upsertMany(deviceId, instance.state.tenantId, formattedMappings);
          logger.debug({ deviceId, mappings: formattedMappings }, 'Stored LID->PN mappings');
        }
      } catch (error) {
        logger.error({ error, deviceId }, 'Failed to process lid-mapping.update');
      }
    });

    // Also try to get mappings from signalRepository on connection
    socket.ev.on('connection.update' as any, async (update: any) => {
      if (update.connection === 'open') {
        try {
          const lidMapping = (socket as any).signalRepository?.lidMapping;
          if (lidMapping && typeof lidMapping.getLIDsForPNs === 'function') {
            logger.info({ deviceId }, 'LID mapping store available via signalRepository');
          }
        } catch (error) {
          logger.debug({ error, deviceId }, 'signalRepository.lidMapping not available');
        }
      }
    });

    // Chat updates
    socket.ev.on('chats.update', async (updates) => {
      try {
        const { eventRepository } = await import('../modules/events/repository');

        const updateList = updates || [];

        for (const update of updateList) {
          eventRepository.saveEvent(instance.state.tenantId, deviceId, 'chats.update', update);

          const jid = (update as any)?.id;
          if (jid) {
            const existing = instance.chatIndex.get(jid) || { id: jid };
            instance.chatIndex.set(jid, { ...existing, ...update });
          }
        }

        const dbChats = updateList.map(mapChatForDb).filter(Boolean) as any;
        this.chatRepo.upsertMany(tenantId, deviceId, dbChats);
        this.chatRepo.markChatsEvent(tenantId, deviceId, 'update');
      } catch (error) {
        logger.error({ error, deviceId }, 'Failed to process chats.update');
      }
    });

    // Chat deletions
    socket.ev.on('chats.delete', async (deletions: any) => {
      try {
        const list = Array.isArray(deletions) ? deletions : [];
        const jids = list
          .map((d: any) => (typeof d === 'string' ? d : d?.id || d?.jid))
          .filter(Boolean) as string[];
        if (!jids.length) return;

        for (const jid of jids) {
          instance.chatIndex.delete(jid);
        }

        this.chatRepo.deleteMany(deviceId, jids);
        this.chatRepo.markChatsEvent(tenantId, deviceId, 'delete');
      } catch (error) {
        logger.error({ error, deviceId }, 'Failed to process chats.delete');
      }
    });
  }

  /**
   * Handle disconnection dan decide apakah perlu reconnect
   */
  async handleDisconnect(deviceId: string, lastDisconnect: any): Promise<boolean> {
    const instance = this.devices.get(deviceId);
    if (!instance) return false;

    const { DisconnectReason } = await getBaileysLib();

    const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;

    // 401 means session is corrupt or logged out from phone - requires re-pairing
    if (statusCode === 401) {
      instance.state.status = DeviceStatus.NEEDS_PAIRING;
      instance.state.lastError = 'Session expired or corrupt - requires re-pairing';
      this.deviceRepo.updateStatus(deviceId, 'needs_pairing');
      logger.warn({ deviceId, statusCode }, 'Device session corrupt, marked as needs_pairing');
      return false;
    }

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
  protocolTap?: ProtocolTapBuffer;
}

// Export singleton instance
export const deviceManager = DeviceManager.getInstance();
