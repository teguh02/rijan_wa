import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

// Load environment variables
dotenv.config();

interface Config {
  server: {
    port: number;
    nodeEnv: string;
    logLevel: string;
    timezone: string;
  };
  security: {
    masterKey: string;
    encryptionAlgorithm: string;
  };
  database: {
    path: string;
  };
  rateLimit: {
    max: number;
    window: number;
  };
  sentry: {
    dsn: string | undefined;
    environment: string;
    tracesSampleRate: number;
    enabled: boolean;
  };
  instanceId: string;
}

const config: Config = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
    timezone: process.env.TIMEZONE || 'UTC',
  },
  security: {
    masterKey: process.env.MASTER_KEY || '',
    encryptionAlgorithm: process.env.ENCRYPTION_ALGORITHM || 'aes-256-gcm',
  },
  database: {
    path: process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'rijan_wa.db'),
  },
  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    window: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10),
  },
  sentry: {
    dsn: process.env.SENTRY_DSN || undefined,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    enabled: !!process.env.SENTRY_DSN,
  },
  // Generate unique instance ID for distributed locking
  instanceId: process.env.INSTANCE_ID || crypto.randomUUID(),
};

// Validate critical config
if (!config.security.masterKey) {
  throw new Error('MASTER_KEY is required in environment variables');
}

if (config.security.masterKey.length !== 64) {
  throw new Error('MASTER_KEY must be a valid SHA256 hash (64 hex characters)');
}

export default config;
