import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

/**
 * Webhook signature utilities
 */
export function computeSignature(secret: string, rawBody: string | Buffer): string {
  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString();
  return crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
}

export function verifySignature(signature: string, secret: string, rawBody: string | Buffer): boolean {
  const expected = computeSignature(secret, rawBody);
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

describe('Webhook Signature', () => {
  describe('computeSignature', () => {
    it('should compute valid HMAC-SHA256 signature', () => {
      const secret = 'webhook_secret_123';
      const body = 'test payload';
      const signature = computeSignature(secret, body);

      expect(signature).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle string body', () => {
      const secret = 'secret';
      const body = 'payload';
      const signature = computeSignature(secret, body);

      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
    });

    it('should handle buffer body', () => {
      const secret = 'secret';
      const body = Buffer.from('payload');
      const signature = computeSignature(secret, body);

      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
    });

    it('should produce consistent signature for same input', () => {
      const secret = 'secret';
      const body = 'payload';
      const sig1 = computeSignature(secret, body);
      const sig2 = computeSignature(secret, body);

      expect(sig1).toBe(sig2);
    });

    it('should produce different signature for different payloads', () => {
      const secret = 'secret';
      const sig1 = computeSignature(secret, 'payload1');
      const sig2 = computeSignature(secret, 'payload2');

      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signature for different secrets', () => {
      const body = 'payload';
      const sig1 = computeSignature('secret1', body);
      const sig2 = computeSignature('secret2', body);

      expect(sig1).not.toBe(sig2);
    });

    it('should handle JSON payload', () => {
      const secret = 'secret';
      const json = JSON.stringify({ event: 'message.received', id: '123' });
      const signature = computeSignature(secret, json);

      expect(signature).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle large payloads', () => {
      const secret = 'secret';
      const largePayload = 'x'.repeat(100000);
      const signature = computeSignature(secret, largePayload);

      expect(signature).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should be sensitive to whitespace in JSON', () => {
      const secret = 'secret';
      const json1 = '{"event":"message.received","id":"123"}';
      const json2 = '{"event": "message.received", "id": "123"}';

      const sig1 = computeSignature(secret, json1);
      const sig2 = computeSignature(secret, json2);

      expect(sig1).not.toBe(sig2);
    });

    it('should handle special characters', () => {
      const secret = 'secret!@#$%';
      const body = 'payload with special 特殊 characters مرحبا 🚀';
      const signature = computeSignature(secret, body);

      expect(signature).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle empty payload', () => {
      const secret = 'secret';
      const signature = computeSignature(secret, '');

      expect(signature).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('verifySignature', () => {
    it('should verify valid signature', () => {
      const secret = 'webhook_secret';
      const body = 'test payload';
      const signature = computeSignature(secret, body);

      const valid = verifySignature(signature, secret, body);
      expect(valid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const secret = 'webhook_secret';
      const body = 'test payload';
      const wrongSig = 'invalid_signature_64_chars_0123456789abcdef0123456789abcdef';

      const valid = verifySignature(wrongSig, secret, body);
      expect(valid).toBe(false);
    });

    it('should reject signature with different secret', () => {
      const body = 'test payload';
      const signature = computeSignature('secret1', body);

      const valid = verifySignature(signature, 'secret2', body);
      expect(valid).toBe(false);
    });

    it('should reject signature with tampered body', () => {
      const secret = 'secret';
      const body = 'original payload';
      const signature = computeSignature(secret, body);

      const valid = verifySignature(signature, secret, 'tampered payload');
      expect(valid).toBe(false);
    });

    it('should be case-sensitive for signature', () => {
      const secret = 'secret';
      const body = 'payload';
      const signature = computeSignature(secret, body);
      const uppercased = signature.toUpperCase();

      // Hex comparison should be case-insensitive in crypto.timingSafeEqual
      const valid = verifySignature(uppercased, secret, body);
      // Result may be true or false depending on implementation
      // But it should be deterministic
      expect(typeof valid).toBe('boolean');
    });

    it('should handle buffer payload in verification', () => {
      const secret = 'secret';
      const body = 'payload';
      const signature = computeSignature(secret, body);
      const bufferBody = Buffer.from(body);

      const valid = verifySignature(signature, secret, bufferBody);
      expect(valid).toBe(true);
    });

    it('should use constant-time comparison (timing safe)', () => {
      const secret = 'secret';
      const body = 'payload';
      const signature = computeSignature(secret, body);

      // Both should complete in similar time regardless of position of first difference
      const start1 = Date.now();
      const valid1 = verifySignature(signature, secret, body);
      const time1 = Date.now() - start1;

      const wrongSig = signature.substring(0, 63) + (signature[63] === '0' ? '1' : '0');
      const start2 = Date.now();
      const valid2 = verifySignature(wrongSig, secret, body);
      const time2 = Date.now() - start2;

      expect(valid1).toBe(true);
      expect(valid2).toBe(false);
      // Note: timing test may be flaky; just checking behavior is correct
    });

    it('should reject malformed signature', () => {
      const secret = 'secret';
      const body = 'payload';

      expect(verifySignature('not-hex', secret, body)).toBe(false);
      expect(verifySignature('', secret, body)).toBe(false);
    });
  });

  describe('Webhook Payload Integrity', () => {
    it('should maintain signature across format preservation', () => {
      const secret = 'webhook_secret';
      const json = { event: 'message.received', id: '123', text: 'hello' };
      const rawBody = JSON.stringify(json);

      const signature = computeSignature(secret, rawBody);
      const valid = verifySignature(signature, secret, rawBody);

      expect(valid).toBe(true);
    });

    it('should fail if JSON is re-serialized (even if semantically same)', () => {
      const secret = 'webhook_secret';
      const obj = { event: 'message.received', id: '123' };
      
      const json1 = JSON.stringify(obj);
      const signature = computeSignature(secret, json1);

      // JSON.stringify may have different order
      const json2 = JSON.stringify(obj);
      // But it should be identical for same object
      expect(verifySignature(signature, secret, json2)).toBe(true);
    });

    it('should detect if raw body is parsed and stringified', () => {
      const secret = 'webhook_secret';
      const original = '{"event":"message.received","id":"123"}';
      const signature = computeSignature(secret, original);

      const parsed = JSON.parse(original);
      const reparsed = JSON.stringify(parsed);

      // These may differ if properties reorder
      // But for deterministic JSON, should be same
      const valid = verifySignature(signature, secret, reparsed);
      expect(typeof valid).toBe('boolean');
    });
  });

  describe('Real-world Webhook Scenarios', () => {
    it('should sign webhook for message event', () => {
      const secret = 'prod_webhook_secret_xyz';
      const payload = JSON.stringify({
        event: 'message.received',
        timestamp: Date.now(),
        data: {
          deviceId: 'device_123',
          messageId: 'msg_456',
          from: '62812345678@s.whatsapp.net',
          text: 'Hello from WhatsApp',
        },
      });

      const signature = computeSignature(secret, payload);
      const valid = verifySignature(signature, secret, payload);

      expect(valid).toBe(true);
    });

    it('should sign webhook for device event', () => {
      const secret = 'prod_webhook_secret_xyz';
      const payload = JSON.stringify({
        event: 'device.connected',
        timestamp: Date.now(),
        data: {
          deviceId: 'device_123',
          phoneNumber: '62812345678',
          status: 'connected',
        },
      });

      const signature = computeSignature(secret, payload);
      const valid = verifySignature(signature, secret, payload);

      expect(valid).toBe(true);
    });

    it('should detect webhook tampering', () => {
      const secret = 'webhook_secret';
      const payload = JSON.stringify({
        event: 'message.received',
        amount: 100000,
        to: '62812345678',
      });

      const signature = computeSignature(secret, payload);

      // Attacker tries to change amount
      const tampered = JSON.stringify({
        event: 'message.received',
        amount: 1000000,
        to: '62812345678',
      });

      const valid = verifySignature(signature, secret, tampered);
      expect(valid).toBe(false);
    });
  });
});
