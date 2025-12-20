import { getDatabase } from './database';
import logger from '../utils/logger';

const migrations = [
  {
    version: 1,
    name: 'initial_schema',
    up: `
      -- Tenants table
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        api_key_hash TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'deleted')),
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );
      
      CREATE INDEX idx_tenants_status ON tenants(status);
      CREATE INDEX idx_tenants_api_key_hash ON tenants(api_key_hash);
      
      -- Devices table
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        label TEXT NOT NULL,
        phone_number TEXT,
        status TEXT NOT NULL DEFAULT 'disconnected' CHECK(status IN ('disconnected', 'connecting', 'connected', 'failed')),
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        last_seen INTEGER,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
      
      CREATE INDEX idx_devices_tenant_id ON devices(tenant_id);
      CREATE INDEX idx_devices_status ON devices(status);
      
      -- Device sessions (encrypted auth state)
      CREATE TABLE IF NOT EXISTS device_sessions (
        device_id TEXT PRIMARY KEY,
        auth_encrypted TEXT,
        auth_iv TEXT,
        auth_tag TEXT,
        enc_version INTEGER NOT NULL DEFAULT 1,
        salt TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
      );
      
      -- Messages outbox
      CREATE TABLE IF NOT EXISTS messages_outbox (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        jid TEXT NOT NULL,
        message_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'expired')),
        retries INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        idempotency_key TEXT,
        wa_message_id TEXT,
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        sent_at INTEGER,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_messages_outbox_tenant_device ON messages_outbox(tenant_id, device_id);
      CREATE INDEX idx_messages_outbox_idempotency ON messages_outbox(device_id, idempotency_key);
      CREATE INDEX idx_messages_outbox_status ON messages_outbox(status);
      CREATE INDEX idx_messages_outbox_created_at ON messages_outbox(created_at);
      
      -- Messages inbox (optional - untuk store incoming messages)
      CREATE TABLE IF NOT EXISTS messages_inbox (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        jid TEXT NOT NULL,
        message_id TEXT NOT NULL,
        message_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        received_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
      );
      
      CREATE INDEX idx_messages_inbox_tenant_device ON messages_inbox(tenant_id, device_id);
      CREATE INDEX idx_messages_inbox_received_at ON messages_inbox(received_at);
      CREATE INDEX idx_messages_inbox_message_id ON messages_inbox(message_id);
      
      -- Webhooks
      CREATE TABLE IF NOT EXISTS webhooks (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        url TEXT NOT NULL,
        secret TEXT,
        events TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        retry_count INTEGER NOT NULL DEFAULT 3,
        timeout INTEGER NOT NULL DEFAULT 5000,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
      
      CREATE INDEX idx_webhooks_tenant_id ON webhooks(tenant_id);
      CREATE INDEX idx_webhooks_enabled ON webhooks(enabled);
      
      -- Audit logs
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        resource_type TEXT,
        resource_id TEXT,
        meta TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );
      
      CREATE INDEX idx_audit_logs_tenant_id ON audit_logs(tenant_id);
      CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
      CREATE INDEX idx_audit_logs_action ON audit_logs(action);
      
      -- Migration tracking
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );
    `,
  },
];

export function runMigrations(): void {
  const db = getDatabase();
  
  // Get current version
  let currentVersion = 0;
  try {
    const row = db.prepare('SELECT MAX(version) as version FROM migrations').get() as { version: number | null };
    currentVersion = row.version || 0;
  } catch (error) {
    // migrations table doesn't exist yet
    logger.info('Migrations table not found, starting from version 0');
  }
  
  // Run pending migrations
  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      logger.info({ version: migration.version, name: migration.name }, 'Running migration');
      
      try {
        db.exec(migration.up);
        db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(
          migration.version,
          migration.name
        );
        
        logger.info({ version: migration.version, name: migration.name }, 'Migration completed');
      } catch (error) {
        logger.error({ error, migration }, 'Migration failed');
        throw error;
      }
    }
  }
  
  logger.info({ currentVersion: migrations[migrations.length - 1]?.version || 0 }, 'All migrations completed');
}

// CLI untuk run migrations
if (require.main === module) {
  try {
    runMigrations();
    logger.info('Database migration completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Database migration failed');
    process.exit(1);
  }
}
