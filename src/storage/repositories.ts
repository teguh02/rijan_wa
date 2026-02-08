import { getDatabase } from './database.js';
import { generateId } from '../utils/crypto.js';
import logger from '../utils/logger.js';

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
  status: 'disconnected' | 'connecting' | 'connected' | 'failed' | 'pairing' | 'needs_pairing';
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

export interface ChatRow {
  device_id: string;
  tenant_id: string;
  jid: string;
  name?: string | null;
  is_group: 0 | 1;
  unread_count: number;
  last_message_time?: number | null;
  archived: 0 | 1;
  muted: 0 | 1;
  created_at: number;
  updated_at: number;
  phoneNumber?: string | null;
}

export interface DeviceChatSyncRow {
  device_id: string;
  tenant_id: string;
  last_history_sync_at?: number | null;
  last_history_sync_chats_count?: number | null;
  last_chats_upsert_at?: number | null;
  last_chats_update_at?: number | null;
  last_chats_delete_at?: number | null;
  updated_at: number;
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

export class ChatRepository {
  private db = getDatabase();

  upsertMany(
    tenantId: string,
    deviceId: string,
    chats: Array<{
      jid: string;
      name?: string | null;
      isGroup: boolean;
      unreadCount?: number | null;
      lastMessageTime?: number | null;
      archived?: boolean | null;
      muted?: boolean | null;
    }>
  ): void {
    if (!chats?.length) return;
    const now = Math.floor(Date.now() / 1000);

    const stmt = this.db.prepare(`
      INSERT INTO chats
        (device_id, tenant_id, jid, name, is_group, unread_count, last_message_time, archived, muted, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, COALESCE(?, 0), ?, COALESCE(?, 0), COALESCE(?, 0), COALESCE((SELECT created_at FROM chats WHERE device_id = ? AND jid = ?), ?), ?)
      ON CONFLICT(device_id, jid) DO UPDATE SET
        name = COALESCE(excluded.name, chats.name),
        is_group = excluded.is_group,
        unread_count = CASE WHEN ? IS NULL THEN chats.unread_count ELSE ? END,
        last_message_time = COALESCE(excluded.last_message_time, chats.last_message_time),
        archived = CASE WHEN ? IS NULL THEN chats.archived ELSE ? END,
        muted = CASE WHEN ? IS NULL THEN chats.muted ELSE ? END,
        updated_at = excluded.updated_at
    `);

    const tx = this.db.transaction(() => {
      for (const chat of chats) {
        const unreadCount =
          typeof chat.unreadCount === 'number' && Number.isFinite(chat.unreadCount) ? chat.unreadCount : null;
        const lastMessageTime =
          typeof chat.lastMessageTime === 'number' && Number.isFinite(chat.lastMessageTime)
            ? chat.lastMessageTime
            : null;
        const archived = chat.archived == null ? null : chat.archived ? 1 : 0;
        const muted = chat.muted == null ? null : chat.muted ? 1 : 0;

        stmt.run(
          deviceId,
          tenantId,
          chat.jid,
          chat.name ?? null,
          chat.isGroup ? 1 : 0,
          unreadCount,
          lastMessageTime,
          archived,
          muted,
          deviceId,
          chat.jid,
          now,
          now,
          unreadCount,
          unreadCount,
          archived,
          archived,
          muted,
          muted
        );
      }
    });

    tx();
  }

  listByDevice(deviceId: string, limit = 50, offset = 0): ChatRow[] {
    const stmt = this.db.prepare(`
      SELECT c.*, lpm.phone_jid as phoneNumber
      FROM chats c
      LEFT JOIN lid_phone_map lpm ON lpm.lid = c.jid AND lpm.device_id = c.device_id
      WHERE c.device_id = ?
      ORDER BY COALESCE(c.last_message_time, 0) DESC, c.updated_at DESC
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(deviceId, limit, offset) as (ChatRow & { phoneNumber: string | null })[];

    // Map database result if needed
    return rows;
  }

  countByDevice(deviceId: string): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as c FROM chats WHERE device_id = ?');
    const row = stmt.get(deviceId) as { c: number };
    return row?.c || 0;
  }

  deleteMany(deviceId: string, jids: string[]): number {
    if (!jids?.length) return 0;
    const stmt = this.db.prepare(`DELETE FROM chats WHERE device_id = ? AND jid = ?`);
    const tx = this.db.transaction(() => {
      let deleted = 0;
      for (const jid of jids) {
        const res = stmt.run(deviceId, jid);
        deleted += res.changes || 0;
      }
      return deleted;
    });
    return tx();
  }

  getSyncState(deviceId: string): DeviceChatSyncRow | null {
    const stmt = this.db.prepare(`
      SELECT * FROM device_chat_sync WHERE device_id = ?
    `);
    return stmt.get(deviceId) as DeviceChatSyncRow | null;
  }

  markHistorySync(tenantId: string, deviceId: string, chatsCount: number): void {
    const now = Math.floor(Date.now() / 1000);
    const stmt = this.db.prepare(`
      INSERT INTO device_chat_sync
        (device_id, tenant_id, last_history_sync_at, last_history_sync_chats_count, updated_at)
      VALUES
        (?, ?, ?, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET
        tenant_id = excluded.tenant_id,
        last_history_sync_at = excluded.last_history_sync_at,
        last_history_sync_chats_count = excluded.last_history_sync_chats_count,
        updated_at = excluded.updated_at
    `);
    stmt.run(deviceId, tenantId, now, chatsCount, now);
  }

  markChatsEvent(tenantId: string, deviceId: string, event: 'upsert' | 'update' | 'delete'): void {
    const now = Math.floor(Date.now() / 1000);
    const column =
      event === 'upsert'
        ? 'last_chats_upsert_at'
        : event === 'update'
          ? 'last_chats_update_at'
          : 'last_chats_delete_at';

    const stmt = this.db.prepare(`
      INSERT INTO device_chat_sync
        (device_id, tenant_id, ${column}, updated_at)
      VALUES
        (?, ?, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET
        tenant_id = excluded.tenant_id,
        ${column} = excluded.${column},
        updated_at = excluded.updated_at
    `);
    stmt.run(deviceId, tenantId, now, now);
  }
}

export interface LidPhoneMapping {
  lid: string;
  phone_jid: string;
  device_id: string;
  tenant_id: string;
  name?: string | null;
  created_at: number;
  updated_at: number;
}

export class LidPhoneRepository {
  private db = getDatabase();

  /**
   * Store or update a LID -> Phone mapping
   */
  upsert(deviceId: string, tenantId: string, lid: string, phoneJid: string, name?: string | null): void {
    const now = Math.floor(Date.now() / 1000);
    const stmt = this.db.prepare(`
      INSERT INTO lid_phone_map (lid, phone_jid, device_id, tenant_id, name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(lid, device_id) DO UPDATE SET
        phone_jid = excluded.phone_jid,
        name = COALESCE(excluded.name, lid_phone_map.name),
        updated_at = excluded.updated_at
    `);
    stmt.run(lid, phoneJid, deviceId, tenantId, name || null, now, now);
  }

  /**
   * Bulk upsert multiple mappings
   */
  upsertMany(deviceId: string, tenantId: string, mappings: Array<{ lid: string; phoneJid: string; name?: string | null }>): void {
    if (!mappings?.length) return;

    const now = Math.floor(Date.now() / 1000);
    const stmt = this.db.prepare(`
      INSERT INTO lid_phone_map (lid, phone_jid, device_id, tenant_id, name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(lid, device_id) DO UPDATE SET
        phone_jid = excluded.phone_jid,
        name = COALESCE(excluded.name, lid_phone_map.name),
        updated_at = excluded.updated_at
    `);

    const tx = this.db.transaction(() => {
      for (const mapping of mappings) {
        stmt.run(mapping.lid, mapping.phoneJid, deviceId, tenantId, mapping.name || null, now, now);
      }
    });
    tx();
  }

  /**
   * Get phone JID for a LID
   */
  getPhoneForLid(deviceId: string, lid: string): string | null {
    const stmt = this.db.prepare('SELECT phone_jid FROM lid_phone_map WHERE device_id = ? AND lid = ?');
    const row = stmt.get(deviceId, lid) as { phone_jid: string } | undefined;
    return row?.phone_jid || null;
  }

  /**
   * Get multiple phone JIDs for LIDs
   */
  getPhonesForLids(deviceId: string, lids: string[]): Map<string, string> {
    if (!lids?.length) return new Map();

    const result = new Map<string, string>();
    const stmt = this.db.prepare('SELECT lid, phone_jid FROM lid_phone_map WHERE device_id = ? AND lid = ?');

    for (const lid of lids) {
      const row = stmt.get(deviceId, lid) as { lid: string; phone_jid: string } | undefined;
      if (row) {
        result.set(row.lid, row.phone_jid);
      }
    }

    return result;
  }

  /**
   * Get all mappings for a device
   */
  getAllForDevice(deviceId: string): LidPhoneMapping[] {
    const stmt = this.db.prepare('SELECT * FROM lid_phone_map WHERE device_id = ?');
    return stmt.all(deviceId) as LidPhoneMapping[];
  }
}
