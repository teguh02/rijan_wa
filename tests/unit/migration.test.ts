import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';

/**
 * Test schema dan migrations
 */
describe('Database Migration & Schema', () => {
  let db: Database.Database;

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  });

  describe('Schema Creation', () => {
    beforeEach(() => {
      // Create minimal schema for testing
      const schema = `
        CREATE TABLE IF NOT EXISTS migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        );

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

        CREATE TABLE IF NOT EXISTS messages_outbox (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          device_id TEXT NOT NULL,
          jid TEXT NOT NULL,
          message_type TEXT NOT NULL,
          payload TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
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

        CREATE TABLE IF NOT EXISTS dlq (
          id TEXT PRIMARY KEY,
          webhook_id TEXT NOT NULL,
          event_payload TEXT NOT NULL,
          reason TEXT,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
        );

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

        CREATE TABLE IF NOT EXISTS device_locks (
          device_id TEXT PRIMARY KEY,
          instance_id TEXT NOT NULL,
          acquired_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          expires_at INTEGER NOT NULL,
          FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
        );
      `;

      db.exec(schema);
    });

    it('should create all required tables', () => {
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
        .all() as Array<{ name: string }>;

      const tableNames = tables.map((t) => t.name);

      expect(tableNames).toContain('tenants');
      expect(tableNames).toContain('devices');
      expect(tableNames).toContain('device_sessions');
      expect(tableNames).toContain('messages_outbox');
      expect(tableNames).toContain('messages_inbox');
      expect(tableNames).toContain('webhooks');
      expect(tableNames).toContain('webhook_logs');
      expect(tableNames).toContain('dlq');
      expect(tableNames).toContain('audit_logs');
      expect(tableNames).toContain('event_logs');
      expect(tableNames).toContain('device_locks');
      expect(tableNames).toContain('migrations');
    });

    it('should create required indexes', () => {
      const indexes = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
        .all() as Array<{ name: string }>;

      const indexNames = indexes.map((i) => i.name);

      expect(indexNames).toContain('idx_tenants_status');
      expect(indexNames).toContain('idx_tenants_api_key_hash');
      expect(indexNames).toContain('idx_devices_tenant_id');
      expect(indexNames).toContain('idx_devices_status');
    });

    it('should enforce CHECK constraints', () => {
      // Try to insert invalid tenant status
      const insertValidTenant = () => {
        db.prepare('INSERT INTO tenants (id, name, api_key_hash, status) VALUES (?, ?, ?, ?)')
          .run('t1', 'Test Tenant', 'hash123', 'active');
      };

      expect(insertValidTenant).not.toThrow();

      // Try to insert invalid status - should fail
      const insertInvalidTenant = () => {
        db.prepare('INSERT INTO tenants (id, name, api_key_hash, status) VALUES (?, ?, ?, ?)')
          .run('t2', 'Invalid Tenant', 'hash456', 'invalid_status');
      };

      expect(insertInvalidTenant).toThrow();
    });

    it('should enforce UNIQUE constraints', () => {
      const hash = 'unique_hash_123';
      const insertFirst = () => {
        db.prepare('INSERT INTO tenants (id, name, api_key_hash, status) VALUES (?, ?, ?, ?)')
          .run('t1', 'Tenant 1', hash, 'active');
      };

      const insertDuplicate = () => {
        db.prepare('INSERT INTO tenants (id, name, api_key_hash, status) VALUES (?, ?, ?, ?)')
          .run('t2', 'Tenant 2', hash, 'active');
      };

      expect(insertFirst).not.toThrow();
      expect(insertDuplicate).toThrow();
    });

    it('should enforce FOREIGN KEY constraints', () => {
      // Try to insert device without tenant - should fail
      const insertOrphanDevice = () => {
        db.prepare(
          'INSERT INTO devices (id, tenant_id, label) VALUES (?, ?, ?)'
        ).run('d1', 'nonexistent_tenant', 'Device 1');
      };

      expect(insertOrphanDevice).toThrow();

      // First create tenant
      db.prepare('INSERT INTO tenants (id, name, api_key_hash) VALUES (?, ?, ?)')
        .run('t1', 'Tenant 1', 'hash123');

      // Now inserting device should work
      const insertValidDevice = () => {
        db.prepare(
          'INSERT INTO devices (id, tenant_id, label) VALUES (?, ?, ?)'
        ).run('d1', 't1', 'Device 1');
      };

      expect(insertValidDevice).not.toThrow();
    });
  });

  describe('Foreign Key Cascading', () => {
    beforeEach(() => {
      const schema = `
        CREATE TABLE tenants (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          api_key_hash TEXT NOT NULL UNIQUE,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        );

        CREATE TABLE devices (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          label TEXT NOT NULL,
          FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
        );
      `;

      db.exec(schema);
    });

    it('should cascade delete devices when tenant is deleted', () => {
      // Insert tenant and device
      db.prepare('INSERT INTO tenants (id, name, api_key_hash) VALUES (?, ?, ?)')
        .run('t1', 'Tenant 1', 'hash123');

      db.prepare('INSERT INTO devices (id, tenant_id, label) VALUES (?, ?, ?)')
        .run('d1', 't1', 'Device 1');

      // Verify device exists
      let devices = db.prepare('SELECT * FROM devices').all();
      expect(devices).toHaveLength(1);

      // Delete tenant
      db.prepare('DELETE FROM tenants WHERE id = ?').run('t1');

      // Verify device was cascade deleted
      devices = db.prepare('SELECT * FROM devices').all();
      expect(devices).toHaveLength(0);
    });
  });

  describe('Data Types & Defaults', () => {
    beforeEach(() => {
      const schema = `
        CREATE TABLE tenants (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          api_key_hash TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'active',
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        );
      `;

      db.exec(schema);
    });

    it('should set default status to active', () => {
      db.prepare('INSERT INTO tenants (id, name, api_key_hash) VALUES (?, ?, ?)')
        .run('t1', 'Tenant 1', 'hash123');

      const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get('t1') as any;
      expect(tenant.status).toBe('active');
    });

    it('should set timestamps automatically', () => {
      const before = Math.floor(Date.now() / 1000);
      db.prepare('INSERT INTO tenants (id, name, api_key_hash) VALUES (?, ?, ?)')
        .run('t1', 'Tenant 1', 'hash123');
      const after = Math.floor(Date.now() / 1000);

      const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get('t1') as any;
      expect(tenant.created_at).toBeGreaterThanOrEqual(before);
      expect(tenant.created_at).toBeLessThanOrEqual(after + 1);
    });
  });
});
