import { describe, it, expect } from 'vitest';
import {
  normalizeJid,
  validateJidFormat,
  extractPhoneFromJid,
  isGroupJid,
  isBroadcastJid,
  isUserJid,
} from '../../src/utils/jid';
import { AppError, ErrorCode } from '../../src/types';

describe('JID Normalization & Validation', () => {
  describe('normalizeJid', () => {
    it('should normalize phone number to user JID', () => {
      const result = normalizeJid('62812345678');
      expect(result).toBe('62812345678@s.whatsapp.net');
    });

    it('should keep existing JID format', () => {
      const jid = '62812345678@s.whatsapp.net';
      const result = normalizeJid(jid);
      expect(result).toBe(jid);
    });

    it('should keep group JID format', () => {
      const jid = '120363021234567890@g.us';
      const result = normalizeJid(jid);
      expect(result).toBe(jid);
    });

    it('should keep broadcast JID format', () => {
      const jid = '62812345678@broadcast';
      const result = normalizeJid(jid);
      expect(result).toBe(jid);
    });

    it('should trim whitespace', () => {
      const result = normalizeJid('  62812345678  ');
      expect(result).toBe('62812345678@s.whatsapp.net');
    });

    it('should reject empty string', () => {
      expect(() => normalizeJid('')).toThrow(AppError);
      expect(() => normalizeJid('   ')).toThrow(AppError);
    });

    it('should reject null/undefined', () => {
      expect(() => normalizeJid(null as any)).toThrow(AppError);
      expect(() => normalizeJid(undefined as any)).toThrow(AppError);
    });

    it('should reject invalid characters in phone number', () => {
      expect(() => normalizeJid('628-1234-5678')).toThrow(AppError);
      expect(() => normalizeJid('62 81234 5678')).toThrow(AppError);
    });

    it('should reject invalid JID format', () => {
      expect(() => normalizeJid('invalid@domain')).toThrow(AppError);
    });
  });

  describe('validateJidFormat', () => {
    it('should validate user JID', () => {
      const result = validateJidFormat('62812345678@s.whatsapp.net');
      expect(result).toBe(true);
    });

    it('should validate group JID', () => {
      const result = validateJidFormat('120363021234567890@g.us');
      expect(result).toBe(true);
    });

    it('should validate broadcast JID', () => {
      const result = validateJidFormat('62812345678@broadcast');
      expect(result).toBe(true);
    });

    it('should reject JID without @', () => {
      expect(() => validateJidFormat('62812345678')).toThrow(AppError);
    });

    it('should reject invalid domain', () => {
      expect(() => validateJidFormat('62812345678@invalid.net')).toThrow(AppError);
    });

    it('should reject JID with missing local part', () => {
      expect(() => validateJidFormat('@s.whatsapp.net')).toThrow(AppError);
    });

    it('should reject JID with missing domain', () => {
      expect(() => validateJidFormat('62812345678@')).toThrow(AppError);
    });
  });

  describe('extractPhoneFromJid', () => {
    it('should extract phone from user JID', () => {
      const phone = extractPhoneFromJid('62812345678@s.whatsapp.net');
      expect(phone).toBe('62812345678');
    });

    it('should extract phone from group JID', () => {
      const phone = extractPhoneFromJid('120363021234567890@g.us');
      expect(phone).toBe('120363021234567890');
    });

    it('should extract phone from broadcast JID', () => {
      const phone = extractPhoneFromJid('62812345678@broadcast');
      expect(phone).toBe('62812345678');
    });

    it('should extract phone from phone number', () => {
      const phone = extractPhoneFromJid('62812345678');
      expect(phone).toBe('62812345678');
    });
  });

  describe('isGroupJid', () => {
    it('should identify group JID', () => {
      expect(isGroupJid('120363021234567890@g.us')).toBe(true);
    });

    it('should not identify user JID as group', () => {
      expect(isGroupJid('62812345678@s.whatsapp.net')).toBe(false);
    });

    it('should not identify broadcast JID as group', () => {
      expect(isGroupJid('62812345678@broadcast')).toBe(false);
    });

    it('should not identify phone number as group', () => {
      expect(isGroupJid('62812345678')).toBe(false);
    });

    it('should safely handle invalid JID', () => {
      expect(isGroupJid('invalid')).toBe(false);
      expect(isGroupJid('')).toBe(false);
    });
  });

  describe('isBroadcastJid', () => {
    it('should identify broadcast JID', () => {
      expect(isBroadcastJid('62812345678@broadcast')).toBe(true);
    });

    it('should not identify user JID as broadcast', () => {
      expect(isBroadcastJid('62812345678@s.whatsapp.net')).toBe(false);
    });

    it('should not identify group JID as broadcast', () => {
      expect(isBroadcastJid('120363021234567890@g.us')).toBe(false);
    });

    it('should safely handle invalid JID', () => {
      expect(isBroadcastJid('invalid')).toBe(false);
    });
  });

  describe('isUserJid', () => {
    it('should identify user JID', () => {
      expect(isUserJid('62812345678@s.whatsapp.net')).toBe(true);
    });

    it('should identify phone number as user JID', () => {
      expect(isUserJid('62812345678')).toBe(true);
    });

    it('should not identify group JID as user', () => {
      expect(isUserJid('120363021234567890@g.us')).toBe(false);
    });

    it('should not identify broadcast JID as user', () => {
      expect(isUserJid('62812345678@broadcast')).toBe(false);
    });

    it('should safely handle invalid JID', () => {
      expect(isUserJid('invalid')).toBe(false);
    });
  });

  describe('JID Normalization Edge Cases', () => {
    it('should handle Indonesian phone numbers', () => {
      const result = normalizeJid('628123456789');
      expect(result).toBe('628123456789@s.whatsapp.net');
    });

    it('should handle different country codes', () => {
      const usPhone = normalizeJid('14155552671');
      expect(usPhone).toBe('14155552671@s.whatsapp.net');
    });

    it('should handle leading zeros appropriately', () => {
      const result = normalizeJid('08123456789');
      expect(result).toBe('08123456789@s.whatsapp.net');
    });

    it('should handle very long group IDs', () => {
      const groupId = '120363021234567890123456789@g.us';
      const result = normalizeJid(groupId);
      expect(result).toBe(groupId);
    });

    it('should be case-sensitive for domain check', () => {
      // uppercase domain should fail
      expect(() => normalizeJid('62812345678@S.WHATSAPP.NET')).toThrow();
    });
  });

  describe('Type Safety', () => {
    it('should handle all valid JID types consistently', () => {
      const jids = [
        '62812345678',
        '62812345678@s.whatsapp.net',
        '120363021234567890@g.us',
        '62812345678@broadcast',
      ];

      jids.forEach((jid) => {
        expect(() => normalizeJid(jid)).not.toThrow();
      });
    });

    it('should throw AppError with specific code', () => {
      try {
        normalizeJid('invalid');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe(ErrorCode.VALIDATION_ERROR);
        expect((error as AppError).statusCode).toBe(400);
      }
    });
  });
});
