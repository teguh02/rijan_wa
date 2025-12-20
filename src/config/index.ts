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
  instanceId: string;
}

const config: Config = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
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
