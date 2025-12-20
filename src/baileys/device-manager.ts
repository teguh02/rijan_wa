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
// import crypto from 'crypto';

/**
 * DeviceManager - Mengelola lifecycle Baileys socket per device
 */
export class DeviceManager {
  private devices = new Map<string, DeviceInstance>();
  private authStore = new BaileysAuthStore();
  private deviceRepo = new DeviceRepository();
  private static instance: DeviceManager;

  private constructor() {}

  static getInstance(): DeviceManager {
    if (!DeviceManager.instance) {
      DeviceManager.instance = new DeviceManager();
    }
    return DeviceManager.instance;
  }

  /**
   * Start device dan create socket
   */
  async startDevice(deviceId: string, tenantId: string): Promise<DeviceState> {
    // Check if already running
    const existing = this.devices.get(deviceId);
    if (existing?.socket && !existing.socket.ws.isClosed) {
      logger.warn({ deviceId }, 'Device already running');
      return existing.state;
    }

    // Verify device exists dan belongs to tenant
    const device = this.deviceRepo.findById(deviceId, tenantId);
    if (!device) {
      throw new Error('Device not found or access denied');
    }

    // Lock starting
    if (existing?.state.isStarting) {
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
    };

    this.devices.set(deviceId, instance);

    try {
      // Load auth state
      const { state: authState, saveCreds } = await useDatabaseAuthState(deviceId, this.authStore);

      // Get Baileys version
      const { version, isLatest } = await fetchLatestBaileysVersion();
      logger.info({ version, isLatest, deviceId }, 'Using Baileys version');

      // Create socket
      const socket = makeWASocket({
        version,
        auth: {
          creds: authState.creds,
          keys: makeCacheableSignalKeyStore(authState.keys, logger as any),
        },
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Rijan WA Gateway'),
        getMessage: async (_key) => {
          return { conversation: '' };
        },
        logger: logger as any,
        markOnlineOnConnect: false,
      });

      instance.socket = socket;
      state.isStarting = false;

      // Setup event handlers
      this.setupEventHandlers(deviceId, socket, saveCreds);

      // Update device status
      this.deviceRepo.updateStatus(deviceId, 'connecting');

      logger.info({ deviceId, tenantId }, 'Device started');

      return state;
    } catch (error) {
      state.isStarting = false;
      state.status = DeviceStatus.FAILED;
      state.lastError = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error, deviceId }, 'Failed to start device');
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

      this.devices.delete(deviceId);
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

    // Delete auth state
    await this.authStore.deleteAuthState(deviceId);

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
  async requestQrCode(deviceId: string, tenantId: string): Promise<string | null> {
    let instance = this.devices.get(deviceId);

    // Start device jika belum running
    if (!instance) {
      await this.startDevice(deviceId, tenantId);
      instance = this.devices.get(deviceId);
    }

    if (!instance) {
      throw new Error('Failed to start device');
    }

    // Wait for QR code (max 30 seconds)
    const maxWait = 30000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      if (instance.state.lastQrCode) {
        instance.state.pairingMethod = PairingMethod.QR;
        return instance.state.lastQrCode;
      }

      if (instance.state.status === DeviceStatus.CONNECTED) {
        throw new Error('Device already connected');
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error('QR code timeout');
  }

  /**
   * Request pairing code untuk pairing berbasis nomor
   */
  async requestPairingCode(
    deviceId: string,
    tenantId: string,
    phoneNumber: string
  ): Promise<string> {
    let instance = this.devices.get(deviceId);

    // Start device jika belum running
    if (!instance) {
      await this.startDevice(deviceId, tenantId);
      instance = this.devices.get(deviceId);
    }

    if (!instance?.socket) {
      throw new Error('Failed to start device');
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
   * Setup event handlers untuk Baileys socket
   */
  private setupEventHandlers(
    deviceId: string,
    socket: WASocket,
    saveCreds: () => Promise<void>
  ): void {
    const instance = this.devices.get(deviceId);
    if (!instance) return;

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
          setTimeout(() => {
            this.startDevice(deviceId, instance.state.tenantId).catch((error) => {
              logger.error({ error, deviceId }, 'Reconnection failed');
            });
          }, 3000);
        } else {
          instance.state.status = DeviceStatus.DISCONNECTED;
          this.deviceRepo.updateStatus(deviceId, 'disconnected');
          this.devices.delete(deviceId);
        }
      }
    });

    // Credentials update
    socket.ev.on('creds.update', async () => {
      try {
        await saveCreds();
        logger.debug({ deviceId }, 'Credentials updated');
      } catch (error) {
        logger.error({ error, deviceId }, 'Failed to save credentials');
      }
    });

    // Messages (untuk future use)
    socket.ev.on('messages.upsert', async (_m) => {
      // Will be handled in message module
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

    const stmt = this.authStore['db'].prepare(`
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
}

interface DeviceInstance {
  state: DeviceState;
  socket: WASocket;
  startedAt: number;
}

// Export singleton instance
export const deviceManager = DeviceManager.getInstance();
