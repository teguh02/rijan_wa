import { getDatabase } from '../storage/database.js';
import { generateId } from './crypto.js';
import logger from './logger.js';

export interface AuditLogEntry {
  actor: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  meta?: any;
}

export function logAudit(tenantId: string, entry: AuditLogEntry, ipAddress?: string, userAgent?: string): void {
  try {
    const db = getDatabase();
    const id = generateId();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO audit_logs (id, tenant_id, actor, action, resource_type, resource_id, meta, ip_address, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      tenantId,
      entry.actor,
      entry.action,
      entry.resourceType || null,
      entry.resourceId || null,
      entry.meta ? JSON.stringify(entry.meta) : null,
      ipAddress || null,
      userAgent || null,
      now
    );
  } catch (error) {
    logger.error({ error }, 'Failed to log audit entry');
  }
}

export function getAuditLogs(tenantId: string, limit: number = 100, offset: number = 0): any[] {
  try {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM audit_logs 
      WHERE tenant_id = ? 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `).all(tenantId, limit, offset) as any[];

    return rows.map(row => ({
      id: row.id,
      actor: row.actor,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      meta: row.meta ? JSON.parse(row.meta) : null,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at,
    }));
  } catch (error) {
    logger.error({ error }, 'Failed to fetch audit logs');
    return [];
  }
}
