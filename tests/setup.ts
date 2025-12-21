import { beforeAll, afterEach, vi } from 'vitest';
import path from 'path';

// Setup environment variables untuk test
process.env.NODE_ENV = 'test';
// MASTER_KEY = SHA256("admin") untuk testing
process.env.MASTER_KEY = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';
process.env.DB_PATH = ':memory:'; // In-memory SQLite for tests
process.env.SERVER_PORT = '3000';
process.env.SERVER_TIMEZONE = 'Asia/Jakarta';
process.env.RATE_LIMIT_MAX = '100';
process.env.RATE_LIMIT_WINDOW = '900000';
process.env.INSTANCE_ID = 'test-instance-1';

// Setup global test utils
beforeAll(() => {
  // Silence console in tests unless explicitly needed
  if (process.env.DEBUG_TESTS !== 'true') {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  }
});

afterEach(() => {
  vi.clearAllMocks();
});

// Mock Baileys module globally to prevent real network calls
vi.mock('@whiskeysockets/baileys', () => {
  const EventEmitter = require('events').EventEmitter;
  
  return {
    default: {
      makeWASocket: vi.fn(() => {
        return new EventEmitter();
      }),
      DisconnectReason: {
        CONNECTION_CLOSED: 1,
        INTENTIONAL: 2,
        SERVER_ERROR: 3,
        LOST_CONNECTION: 4,
      },
      isJidBroadcast: (jid: string) => jid.includes('@broadcast'),
      isJidGroup: (jid: string) => jid.includes('@g.us'),
      isJidUser: (jid: string) => jid.includes('@s.whatsapp.net'),
      jidNormalizedUser: vi.fn((jid: string) => {
        if (jid.includes('@')) return jid;
        return `${jid}@s.whatsapp.net`;
      }),
    },
    Browsers: {
      ubuntu: 'Ubuntu',
    },
    fetchLatestBaileysVersion: vi.fn(async () => ({
      version: [2, 2024, 12],
      isLatest: true,
    })),
  };
});

// Mock axios globally
vi.mock('axios', () => {
  return {
    default: {
      get: vi.fn(async () => ({
        status: 200,
        data: Buffer.from('fake image data'),
        headers: { 'content-type': 'image/jpeg' },
      })),
      post: vi.fn(async () => ({
        status: 200,
        data: { success: true },
      })),
    },
  };
});

// Test database helper
export function createTestDatabase() {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

// Test utilities
export const testUtils = {
  generateDummyTenantId: () => `tenant_${Math.random().toString(36).substr(2, 9)}`,
  generateDummyDeviceId: () => `device_${Math.random().toString(36).substr(2, 9)}`,
  generateDummyPhoneNumber: () => `62${Math.random().toString().slice(2, 12)}`,
  dummyMasterKeyPlain: 'admin', // Plain text master key for testing
  dummyMasterKeyHash: process.env.MASTER_KEY!, // SHA256 hash in ENV
  dummyApiKey: (tenantId: string) => `rijan_${tenantId}_${Math.random().toString(36).substr(2, 20)}`,
};
