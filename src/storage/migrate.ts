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
      
      -- Event logs (inbound events from Baileys)
      CREATE TABLE IF NOT EXISTS event_logs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        received_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
      );
      
      CREATE INDEX idx_event_logs_tenant_device ON event_logs(tenant_id, device_id);
      CREATE INDEX idx_event_logs_type ON event_logs(event_type);
      CREATE INDEX idx_event_logs_received_at ON event_logs(received_at);
      
      -- Webhook delivery logs
      CREATE TABLE IF NOT EXISTS webhook_logs (
        id TEXT PRIMARY KEY,
        webhook_id TEXT NOT NULL,
        event_id TEXT,
        status_code INTEGER,
        attempts INTEGER NOT NULL DEFAULT 1,
        last_error TEXT,
        sent_at INTEGER,
        FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
      );
      
      CREATE INDEX idx_webhook_logs_webhook_id ON webhook_logs(webhook_id);
      CREATE INDEX idx_webhook_logs_sent_at ON webhook_logs(sent_at);
      
      -- Dead letter queue for failed webhooks
      CREATE TABLE IF NOT EXISTS dlq (
        id TEXT PRIMARY KEY,
        webhook_id TEXT NOT NULL,
        event_payload TEXT NOT NULL,
        reason TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
      );
      
      CREATE INDEX idx_dlq_webhook_id ON dlq(webhook_id);
      CREATE INDEX idx_dlq_created_at ON dlq(created_at);
      
      -- Device locks for multi-instance support
      CREATE TABLE IF NOT EXISTS device_locks (
        device_id TEXT PRIMARY KEY,
        instance_id TEXT NOT NULL,
        acquired_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        expires_at INTEGER NOT NULL,
        FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
      );
      
      CREATE INDEX idx_device_locks_expires_at ON device_locks(expires_at);
      
      -- Migration tracking
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );
    `,
  },
  {
    version: 2,
    name: 'device_sessions_file_based_metadata',
    up: `
      -- Add metadata columns for standard Baileys multi-file sessions
      ALTER TABLE device_sessions ADD COLUMN tenant_id TEXT;
      ALTER TABLE device_sessions ADD COLUMN session_kind TEXT NOT NULL DEFAULT 'baileys_multifile';
      ALTER TABLE device_sessions ADD COLUMN session_dir TEXT;
      ALTER TABLE device_sessions ADD COLUMN wa_jid TEXT;
      ALTER TABLE device_sessions ADD COLUMN wa_name TEXT;

      CREATE INDEX IF NOT EXISTS idx_device_sessions_tenant_id ON device_sessions(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_device_sessions_session_kind ON device_sessions(session_kind);
      CREATE INDEX IF NOT EXISTS idx_device_sessions_updated_at ON device_sessions(updated_at);
    `,
  },
  {
    version: 3,
    name: 'chats_db_backed_history_sync',
    up: `
      -- Chats (DB-backed) - source of truth for List Chats
      CREATE TABLE IF NOT EXISTS chats (
        device_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        jid TEXT NOT NULL,
        name TEXT,
        is_group INTEGER NOT NULL DEFAULT 0,
        unread_count INTEGER NOT NULL DEFAULT 0,
        last_message_time INTEGER,
        archived INTEGER NOT NULL DEFAULT 0,
        muted INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        PRIMARY KEY (device_id, jid),
        FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_chats_device_id ON chats(device_id);
      CREATE INDEX IF NOT EXISTS idx_chats_tenant_id ON chats(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_chats_device_last_message_time ON chats(device_id, last_message_time);
      CREATE INDEX IF NOT EXISTS idx_chats_device_updated_at ON chats(device_id, updated_at);

      -- Per-device sync/debug state for chat history sync
      CREATE TABLE IF NOT EXISTS device_chat_sync (
        device_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        last_history_sync_at INTEGER,
        last_history_sync_chats_count INTEGER,
        last_chats_upsert_at INTEGER,
        last_chats_update_at INTEGER,
        last_chats_delete_at INTEGER,
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_device_chat_sync_tenant_id ON device_chat_sync(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_device_chat_sync_updated_at ON device_chat_sync(updated_at);
    `,
  },
  {
    version: 4,
    name: 'lid_phone_mapping_and_needs_pairing_status',
    up: `
      -- LID to Phone Number mapping table
      -- Stores @lid -> @s.whatsapp.net mapping for message resolution
      CREATE TABLE IF NOT EXISTS lid_phone_map (
        lid TEXT NOT NULL,
        phone_jid TEXT NOT NULL,
        device_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        name TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        PRIMARY KEY (lid, device_id),
        FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_lid_phone_map_device_id ON lid_phone_map(device_id);
      CREATE INDEX IF NOT EXISTS idx_lid_phone_map_phone_jid ON lid_phone_map(phone_jid);
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
