/**
 * Device state types untuk tracking status dan events
 */

export enum DeviceStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  FAILED = 'failed',
  PAIRING = 'pairing',
}

export enum PairingMethod {
  QR = 'qr',
  CODE = 'code',
}

export interface DeviceState {
  deviceId: string;
  tenantId: string;
  status: DeviceStatus;
  phoneNumber?: string;
  waJid?: string;
  lastConnectAt?: number;
  lastDisconnectAt?: number;
  lastError?: string;
  lastQrCode?: string;
  lastQrAt?: number;
  pairingMethod?: PairingMethod;
  pairingCode?: string;
  isStarting?: boolean;
  reconnectAttempts?: number;
  maxReconnectAttempts?: number;
}

export interface DeviceConnectionInfo {
  isConnected: boolean;
  status: DeviceStatus;
  phoneNumber?: string;
  waJid?: string;
  lastConnectAt?: number;
  lastDisconnectAt?: number;
  lastError?: string;
  uptime?: number;
}

export interface PairingQrResponse {
  qrCode: string; // base64 data URL
  qrString: string; // raw QR string
  expiresAt: number;
}

export interface PairingCodeResponse {
  pairingCode: string;
  phoneNumber: string;
  expiresAt: number;
}
