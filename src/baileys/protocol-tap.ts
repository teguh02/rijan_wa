import type { BinaryNode } from '@whiskeysockets/baileys';
// remove static decodeBinaryNode import

export type ProtocolTapDirection = 'in' | 'out';

export interface ProtocolTapItem {
  receivedAt: number; // epoch ms
  deviceId: string;
  direction: ProtocolTapDirection;
  nodeTag?: string;
  nodePreview: string;
  rawSize: number;
}

const MAX_ITEMS_DEFAULT = 200;
const MAX_PREVIEW_BYTES_DEFAULT = 2048;

const REDACT_KEY_RE = /(creds|keys|priv|private|secret|token|password|session|signal|noise|auth|cookie|master|encryption|rootKey|registrationId)/i;

function truncateUtf8(input: string, maxBytes: number): string {
  const buf = Buffer.from(input, 'utf8');
  if (buf.byteLength <= maxBytes) return input;
  return buf.subarray(0, maxBytes).toString('utf8') + '…';
}

function safeStringify(value: unknown, maxBytes: number): { text: string; size: number } {
  const seen = new WeakSet<object>();

  const replacer = (key: string, v: any) => {
    if (key && REDACT_KEY_RE.test(key)) return '[REDACTED]';

    if (typeof v === 'string') {
      // aggressively trim long strings (often base64, ciphertext, etc)
      if (v.length > 300) return v.slice(0, 300) + '…';
      return v;
    }

    if (Buffer.isBuffer(v)) return `[Buffer ${v.byteLength}]`;
    if (v instanceof Uint8Array) return `[Uint8Array ${v.byteLength}]`;

    if (v && typeof v === 'object') {
      const obj = v as object;
      if (seen.has(obj)) return '[Circular]';
      seen.add(obj);
    }

    return v;
  };

  let text = '';
  try {
    text = JSON.stringify(value, replacer);
  } catch {
    try {
      text = String(value);
    } catch {
      text = '[Unserializable]';
    }
  }

  const size = Buffer.byteLength(text, 'utf8');
  return { text: truncateUtf8(text, maxBytes), size };
}

function previewBinaryNode(node: BinaryNode, maxBytes: number): string {
  const simplified = {
    tag: node.tag,
    attrs: Object.fromEntries(
      Object.entries(node.attrs || {}).map(([k, v]) => [k, REDACT_KEY_RE.test(k) ? '[REDACTED]' : String(v).slice(0, 120)])
    ),
    content:
      typeof node.content === 'string'
        ? node.content.slice(0, 200)
        : Buffer.isBuffer(node.content)
          ? `[Buffer ${node.content.byteLength}]`
          : Array.isArray(node.content)
            ? node.content
              .slice(0, 10)
              .map((c) => (typeof c === 'string' ? c : (c as any)?.tag || typeof c))
            : node.content === undefined
              ? undefined
              : typeof node.content,
  };

  const { text } = safeStringify(simplified, maxBytes);
  return text;
}

export class ProtocolTapBuffer {
  private items: ProtocolTapItem[] = [];

  constructor(
    private readonly deviceId: string,
    private readonly maxItems: number = MAX_ITEMS_DEFAULT,
    private readonly maxPreviewBytes: number = MAX_PREVIEW_BYTES_DEFAULT
  ) { }

  async record(direction: ProtocolTapDirection, input: { nodeTag?: string; payload?: unknown; raw?: Buffer | Uint8Array }): Promise<void> {
    const receivedAt = Date.now();

    // Prefer node parsing if we have a plaintext frame buffer
    if (input.raw && (Buffer.isBuffer(input.raw) || input.raw instanceof Uint8Array)) {
      try {
        const { decodeBinaryNode } = await import('@whiskeysockets/baileys');
        const buf = Buffer.isBuffer(input.raw) ? input.raw : Buffer.from(input.raw);
        const node = decodeBinaryNode(buf);
        const nodePreview = previewBinaryNode(node as unknown as BinaryNode, this.maxPreviewBytes);
        this.push({
          receivedAt,
          deviceId: this.deviceId,
          direction,
          nodeTag: (node as any)?.tag || input.nodeTag,
          nodePreview,
          rawSize: buf.byteLength,
        });
        return;
      } catch {
        // fall through to payload preview
      }
    }

    const { text, size } = safeStringify(input.payload ?? null, this.maxPreviewBytes);
    this.push({
      receivedAt,
      deviceId: this.deviceId,
      direction,
      nodeTag: input.nodeTag,
      nodePreview: text,
      rawSize: size,
    });
  }

  list(limit: number): ProtocolTapItem[] {
    const safeLimit = Math.max(0, Math.min(limit, this.maxItems));
    const start = Math.max(0, this.items.length - safeLimit);
    return this.items.slice(start).reverse();
  }

  private push(item: ProtocolTapItem) {
    this.items.push(item);
    if (this.items.length > this.maxItems) {
      this.items.splice(0, this.items.length - this.maxItems);
    }
  }
}

export function isProtocolTapEnabled(): boolean {
  return String(process.env.DEBUG_PROTOCOL_TAP || '').toLowerCase() === 'true';
}
