import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { PassThrough, Transform, Writable } from 'stream';
import config from '../config';

/**
 * Laravel-like log format:
 * [YYYY-MM-DD HH:MM:SS] env.LEVEL: message {context}
 *
 * Requirements:
 * - one file per day under ./logs
 * - capture all activity (Fastify + internal modules)
 * - avoid sensitive values in output
 */

function ensureDir(dirPath: string) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch {
    // ignore
  }
}

function envLabel(nodeEnv: string): string {
  // Laravel defaults to "local" for dev
  if (nodeEnv === 'development') return 'local';
  return nodeEnv || 'production';
}

function levelLabel(level: number): string {
  if (level >= 60) return 'EMERGENCY';
  if (level >= 50) return 'ERROR';
  if (level >= 40) return 'WARNING';
  if (level >= 30) return 'INFO';
  if (level >= 20) return 'DEBUG';
  return 'DEBUG';
}

function makeDateKey(date: Date, timeZone: string): string {
  // en-CA -> YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function makeTimestamp(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

const SENSITIVE_KEY_RE = /(authorization|cookie|x-api-key|x-master-key|master_key|masterkey|secret|token|password|creds|privKey|privateKey|rootKey|noise|signal|session)/i;

function redactDeep(value: any): any {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    // avoid huge blob dumps (base64/ciphertext)
    if (value.length > 2000) return value.slice(0, 2000) + '…';
    return value;
  }
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) return value.map(redactDeep);
  if (Buffer.isBuffer(value)) return `[Buffer ${value.byteLength}]`;
  if (value instanceof Uint8Array) return `[Uint8Array ${value.byteLength}]`;

  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) {
    if (SENSITIVE_KEY_RE.test(k)) {
      out[k] = '[REDACTED]';
      continue;
    }
    out[k] = redactDeep(v);
  }
  return out;
}

class DailyLogFileWriter extends Writable {
  private currentDateKey: string | null = null;
  private currentStream: fs.WriteStream | null = null;

  constructor(
    private readonly dir: string,
    private readonly timeZone: string
  ) {
    super();
    ensureDir(dir);
  }

  _write(chunk: any, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    try {
      const now = new Date();
      const dateKey = makeDateKey(now, this.timeZone);

      if (this.currentDateKey !== dateKey || !this.currentStream) {
        this.rotate(dateKey);
      }

      this.currentStream!.write(chunk, callback);
    } catch (err: any) {
      callback(err);
    }
  }

  private rotate(dateKey: string) {
    this.currentDateKey = dateKey;
    try {
      this.currentStream?.end();
    } catch {
      // ignore
    }

    const filePath = path.join(this.dir, `${dateKey}.log`);
    this.currentStream = fs.createWriteStream(filePath, { flags: 'a' });
  }
}

class LaravelFormatTransform extends Transform {
  private buffer = '';

  constructor(
    private readonly opts: { timeZone: string; env: string }
  ) {
    super();
  }

  _transform(chunk: any, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    try {
      this.buffer += chunk.toString('utf8');
      let idx: number;
      while ((idx = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + 1);
        const formatted = this.formatLine(line);
        if (formatted) this.push(formatted);
      }
      callback();
    } catch (err: any) {
      callback(err);
    }
  }

  private formatLine(line: string): string | null {
    const trimmed = line.trim();
    if (!trimmed) return null;

    let obj: any;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      // if non-JSON, pass through
      return trimmed + '\n';
    }

    const timeMs = typeof obj.time === 'number' ? obj.time : Date.now();
    const ts = makeTimestamp(new Date(timeMs), this.opts.timeZone);
    const lvl = levelLabel(Number(obj.level) || 30);
    const msg = String(obj.msg || obj.message || '');

    const {
      level,
      time,
      pid,
      hostname,
      msg: _msg,
      message: _message,
      v,
      ...rest
    } = obj;

    const context = redactDeep(rest);
    const hasContext = context && typeof context === 'object' && Object.keys(context).length > 0;
    const ctxText = hasContext ? ' ' + JSON.stringify(context) : '';

    return `[${ts}] ${this.opts.env}.${lvl}: ${msg}${ctxText}\n`;
  }
}

const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs');
ensureDir(LOG_DIR);

// Raw streams receiving pino JSON lines
const consoleRaw = new PassThrough();
const fileRaw = new PassThrough();

// Formatters
const formatter = new LaravelFormatTransform({
  timeZone: config.server.timezone,
  env: envLabel(config.server.nodeEnv),
});

// Pipe console + file
consoleRaw.pipe(new LaravelFormatTransform({ timeZone: config.server.timezone, env: envLabel(config.server.nodeEnv) })).pipe(process.stdout);
fileRaw.pipe(new LaravelFormatTransform({ timeZone: config.server.timezone, env: envLabel(config.server.nodeEnv) })).pipe(
  new DailyLogFileWriter(LOG_DIR, config.server.timezone)
);

const logger = pino(
  {
    level: config.server.logLevel,
    serializers: {
      req(req) {
        return {
          method: req.method,
          url: req.url,
          headers: sanitizeHeaders(req.headers),
          remoteAddress: req.socket?.remoteAddress,
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  },
  // Send to both console and daily file
  pino.multistream([{ stream: consoleRaw }, { stream: fileRaw }])
);

/**
 * Remove sensitive data dari headers
 */
function sanitizeHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...headers };
  const sensitiveKeys = ['authorization', 'x-api-key', 'x-master-key', 'cookie'];
  
  for (const key of sensitiveKeys) {
    if (sanitized[key]) {
      sanitized[key] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

export default logger;
