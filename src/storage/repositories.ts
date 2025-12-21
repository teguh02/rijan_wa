import { getDatabase } from './database';
import { generateId } from '../utils/crypto';
import logger from '../utils/logger';

export interface Tenant {
  id: string;
  name: string;
  api_key_hash: string;
  status: 'active' | 'suspended' | 'deleted';
  created_at: number;
  updated_at: number;
}

export interface Device {
  id: string;
  tenant_id: string;
  label: string;
  phone_number?: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'failed';
  created_at: number;
  last_seen?: number;
}

export interface AuditLog {
  id: string;
  tenant_id?: string;
  actor: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  meta?: string;
  ip_address?: string;
  user_agent?: string;
  created_at: number;
}

export interface DeviceSessionMeta {
  device_id: string;
  updated_at: number;
  tenant_id?: string | null;
  session_kind?: string | null;
  session_dir?: string | null;
  wa_jid?: string | null;
  wa_name?: string | null;
}

export class TenantRepository {
  private db = getDatabase();

  create(tenant: Omit<Tenant, 'created_at' | 'updated_at'>): Tenant {
    const now = Math.floor(Date.now() / 1000);
    const stmt = this.db.prepare(`
      INSERT INTO tenants (id, name, api_key_hash, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(tenant.id, tenant.name, tenant.api_key_hash, tenant.status, now, now);

    return {
      ...tenant,
      created_at: now,
      updated_at: now,
    };
  }

  findById(id: string): Tenant | null {
    const stmt = this.db.prepare('SELECT * FROM tenants WHERE id = ? AND status != ?');
    return stmt.get(id, 'deleted') as Tenant | null;
  }

  findByApiKeyHash(apiKeyHash: string): Tenant | null {
    const stmt = this.db.prepare('SELECT * FROM tenants WHERE api_key_hash = ? AND status = ?');
    return stmt.get(apiKeyHash, 'active') as Tenant | null;
  }

  findAll(limit = 100, offset = 0): Tenant[] {
    const stmt = this.db.prepare('SELECT * FROM tenants WHERE status != ? ORDER BY created_at DESC LIMIT ? OFFSET ?');
    return stmt.all('deleted', limit, offset) as Tenant[];
  }

  updateStatus(id: string, status: Tenant['status']): boolean {
    const now = Math.floor(Date.now() / 1000);
    const stmt = this.db.prepare('UPDATE tenants SET status = ?, updated_at = ? WHERE id = ?');
    const result = stmt.run(status, now, id);
    return result.changes > 0;
  }

  delete(id: string): boolean {
    return this.updateStatus(id, 'deleted');
  }
}

export class DeviceRepository {
  private db = getDatabase();

  create(device: Omit<Device, 'created_at'>): Device {
    const now = Math.floor(Date.now() / 1000);
    const stmt = this.db.prepare(`
      INSERT INTO devices (id, tenant_id, label, phone_number, status, created_at, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      device.id,
      device.tenant_id,
      device.label,
      device.phone_number || null,
      device.status,
      now,
      device.last_seen || null
    );

    return {
      ...device,
      created_at: now,
    };
  }

  findById(id: string, tenantId?: string): Device | null {
    let stmt;
    let result;

    if (tenantId) {
      stmt = this.db.prepare('SELECT * FROM devices WHERE id = ? AND tenant_id = ?');
      result = stmt.get(id, tenantId);
    } else {
      stmt = this.db.prepare('SELECT * FROM devices WHERE id = ?');
      result = stmt.get(id);
    }

    return result as Device | null;
  }

  findByTenant(tenantId: string, limit = 100, offset = 0): Device[] {
    const stmt = this.db.prepare(
      'SELECT * FROM devices WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    );
    return stmt.all(tenantId, limit, offset) as Device[];
  }

  updateStatus(id: string, status: Device['status'], lastSeen?: number): boolean {
    const stmt = this.db.prepare('UPDATE devices SET status = ?, last_seen = ? WHERE id = ?');
    const result = stmt.run(status, lastSeen || Math.floor(Date.now() / 1000), id);
    return result.changes > 0;
  }

  updatePhoneNumber(id: string, phoneNumber: string): boolean {
    const stmt = this.db.prepare('UPDATE devices SET phone_number = ? WHERE id = ?');
    const result = stmt.run(phoneNumber, id);
    return result.changes > 0;
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM devices WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}

export class AuditLogRepository {
  private db = getDatabase();

  create(log: Omit<AuditLog, 'id' | 'created_at'>): void {
    const id = generateId('audit');
    const now = Math.floor(Date.now() / 1000);
    
    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (id, tenant_id, actor, action, resource_type, resource_id, meta, ip_address, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      stmt.run(
        id,
        log.tenant_id || null,
        log.actor,
        log.action,
        log.resource_type || null,
        log.resource_id || null,
        log.meta || null,
        log.ip_address || null,
        log.user_agent || null,
        now
      );
    } catch (error) {
      logger.error({ error, log }, 'Failed to create audit log');
    }
  }

  findByTenant(tenantId: string, limit = 100, offset = 0): AuditLog[] {
    const stmt = this.db.prepare(
      'SELECT * FROM audit_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    );
    return stmt.all(tenantId, limit, offset) as AuditLog[];
  }
}

export class DeviceSessionRepository {
  private db = getDatabase();

  /**
   * Ambil metadata session (kalau ada) untuk device.
   * Ownership dicek di middleware/route.
   */
  findByDeviceId(deviceId: string): DeviceSessionMeta | null {
    const stmt = this.db.prepare(`
      SELECT device_id, updated_at, tenant_id, session_kind, session_dir, wa_jid, wa_name
      FROM device_sessions
      WHERE device_id = ?
    `);

    return stmt.get(deviceId) as DeviceSessionMeta | null;
  }

  /**
   * List semua session metadata untuk tenant.
   * Join ke tabel devices untuk memastikan device benar-benar milik tenant.
   */
  findByTenant(tenantId: string, limit = 100, offset = 0): DeviceSessionMeta[] {
    const stmt = this.db.prepare(`
      SELECT ds.device_id, ds.updated_at, ds.tenant_id, ds.session_kind, ds.session_dir, ds.wa_jid, ds.wa_name
      FROM device_sessions ds
      INNER JOIN devices d ON d.id = ds.device_id
      WHERE d.tenant_id = ?
      ORDER BY ds.updated_at DESC
      LIMIT ? OFFSET ?
    `);

    return stmt.all(tenantId, limit, offset) as DeviceSessionMeta[];
  }
}
