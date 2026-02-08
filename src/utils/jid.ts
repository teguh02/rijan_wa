import { AppError, ErrorCode } from '../types/index.js';

/**
 * Normalize WhatsApp JID to standard format
 * Phone number (62812...) => 62812...@s.whatsapp.net
 * Group JID (...@g.us) => tetap
 * Broadcast (...@broadcast) => tetap
 */
export function normalizeJid(jid: string): string {
  if (!jid || typeof jid !== 'string') {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Invalid JID: must be non-empty string',
      400
    );
  }

  jid = jid.trim();

  // Already in valid format
  if (jid.includes('@')) {
    validateJidFormat(jid);
    return jid;
  }

  // Assume it's a phone number - normalize to @s.whatsapp.net
  if (/^\d+$/.test(jid)) {
    const normalized = `${jid}@s.whatsapp.net`;
    validateJidFormat(normalized);
    return normalized;
  }

  throw new AppError(
    ErrorCode.VALIDATION_ERROR,
    'Invalid JID: must be phone number or valid JID format',
    400
  );
}

/**
 * Validate JID format
 */
export function validateJidFormat(jid: string): boolean {
  if (!jid.includes('@')) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Invalid JID: missing @',
      400
    );
  }

  const [local, domain] = jid.split('@');

  if (!local || !domain) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Invalid JID: malformed',
      400
    );
  }

  const validDomains = ['s.whatsapp.net', 'g.us', 'broadcast'];
  if (!validDomains.includes(domain)) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid JID domain: ${domain}`,
      400
    );
  }

  return true;
}

/**
 * Extract phone number from JID
 */
export function extractPhoneFromJid(jid: string): string {
  const normalized = normalizeJid(jid);
  const [phone] = normalized.split('@');
  return phone;
}

/**
 * Check if JID is a group
 */
export function isGroupJid(jid: string): boolean {
  try {
    const normalized = normalizeJid(jid);
    return normalized.includes('@g.us');
  } catch {
    return false;
  }
}

/**
 * Check if JID is a broadcast
 */
export function isBroadcastJid(jid: string): boolean {
  try {
    const normalized = normalizeJid(jid);
    return normalized.includes('@broadcast');
  } catch {
    return false;
  }
}

/**
 * Check if JID is a user (individual)
 */
export function isUserJid(jid: string): boolean {
  try {
    const normalized = normalizeJid(jid);
    return normalized.includes('@s.whatsapp.net');
  } catch {
    return false;
  }
}
