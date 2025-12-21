# Security Best Practices

Panduan lengkap untuk mengamankan Rijan WA Gateway Anda.

## 🔐 Master Key Security

### 1. Generate Strong Master Key

**DO**:
```bash
# Generate 256-bit random key
openssl rand -hex 32
```

**DON'T**:
```bash
# Weak keys
MASTER_KEY=12345678
MASTER_KEY=password123
MASTER_KEY=admin
```

### 2. Store Securely

**Production** - Use environment variables:
```bash
# .env (add to .gitignore!)
MASTER_KEY=abc123xyz789...

# Or system environment
export MASTER_KEY="abc123xyz789..."
```

**DON'T**:
- ❌ Commit master key to Git
- ❌ Share in Slack/email
- ❌ Store in plain text files
- ❌ Use same key for dev/prod

### 3. Rotate Regularly

```bash
# Generate new key
NEW_KEY=$(openssl rand -hex 32)

# Update .env
MASTER_KEY=$NEW_KEY

# Restart server
pm2 restart rijan-wa

# Invalidate old key immediately
```

**Recommended rotation**: Every 90 days

## 🔑 API Key Security

### 1. API Key Expiration

API keys automatically expire after **365 days**.

Check expiration:
```bash
curl -X GET http://localhost:3000/admin/tenants/TENANT_ID \
  -H "X-Master-Key: YOUR_MASTER_KEY"
```

Response:
```json
{
  "api_key_expires_at": 1735689600
}
```

### 2. Regenerate Expired Keys

```bash
curl -X POST http://localhost:3000/admin/tenants/TENANT_ID/regenerate-key \
  -H "X-Master-Key: YOUR_MASTER_KEY"
```

⚠️ **IMPORTANT**: Notify tenant sebelum regenerate!

### 3. Monitor API Key Usage

```bash
# Check last activity
curl -X GET http://localhost:3000/admin/tenants/TENANT_ID \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  | jq '.last_activity_at'
```

If tidak ada activity >30 hari → consider suspend:
```bash
curl -X POST http://localhost:3000/admin/tenants/TENANT_ID/suspend \
  -H "X-Master-Key: YOUR_MASTER_KEY"
```

## 🌐 Network Security

### 1. HTTPS Only (Production)

**Nginx Configuration**:
```nginx
server {
    listen 443 ssl http2;
    server_name api.yourcompany.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # Strong SSL config
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
    ssl_prefer_server_ciphers on;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name api.yourcompany.com;
    return 301 https://$server_name$request_uri;
}
```

### 2. Firewall Rules

**Windows Firewall**:
```powershell
# Allow port 3000 only from specific IPs
New-NetFirewallRule -DisplayName "Rijan WA API" `
    -Direction Inbound `
    -LocalPort 3000 `
    -Protocol TCP `
    -Action Allow `
    -RemoteAddress 10.0.0.0/8,172.16.0.0/12,192.168.0.0/16
```

**Linux iptables**:
```bash
# Allow from specific subnet only
iptables -A INPUT -p tcp --dport 3000 -s 192.168.1.0/24 -j ACCEPT
iptables -A INPUT -p tcp --dport 3000 -j DROP
```

### 3. Rate Limiting

Already implemented: **100 requests/minute per tenant**.

Adjust in `.env`:
```env
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000
```

For specific tenants:
```bash
curl -X PUT http://localhost:3000/admin/tenants/TENANT_ID \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "rate_limit_max": 200
  }'
```

## 🛡️ SSRF Protection

### Already Implemented

API validates media URLs to prevent SSRF attacks:

**BLOCKED**:
- `localhost`, `127.0.0.1`
- Private IPs: `192.168.*`, `10.*`, `172.16-31.*`
- Non-HTTP(S) protocols: `file://`, `ftp://`

**Code** (`src/modules/messages/service.ts`):
```typescript
private validateMediaUrl(url: string): boolean {
  // Blocks localhost, private IPs, non-HTTP(S)
  const blocked = [
    /^https?:\/\/localhost/i,
    /^https?:\/\/127\./,
    /^https?:\/\/192\.168\./,
    /^https?:\/\/10\./,
    /^https?:\/\/172\.(1[6-9]|2[0-9]|3[01])\./
  ];
  
  return !blocked.some(pattern => pattern.test(url));
}
```

### Additional Protection

**Whitelist domains**:
```typescript
// src/config/index.ts
export const ALLOWED_MEDIA_DOMAINS = [
  'cdn.yourcompany.com',
  'storage.googleapis.com',
  's3.amazonaws.com'
];

// src/modules/messages/service.ts
private validateMediaUrl(url: string): boolean {
  const urlObj = new URL(url);
  return ALLOWED_MEDIA_DOMAINS.some(domain => 
    urlObj.hostname.endsWith(domain)
  );
}
```

## 🔒 Database Security

### 1. File Permissions

```bash
# Restrict database access
chmod 600 data/app.db
chown youruser:yourgroup data/app.db

# Restrict sessions directory
chmod 700 data/sessions
chown -R youruser:yourgroup data/sessions
```

### 2. Encryption at Rest

Use OS-level encryption:

**Windows**: BitLocker
**Linux**: LUKS/dm-crypt
**macOS**: FileVault

### 3. Backup Security

```bash
# Encrypt backups
tar czf - data/ | openssl enc -aes-256-cbc -salt -out backup.tar.gz.enc

# Decrypt
openssl enc -aes-256-cbc -d -in backup.tar.gz.enc | tar xzf -
```

### 4. Regular Cleanup

```bash
# Delete old messages (>90 days)
sqlite3 data/app.db "DELETE FROM messages WHERE created_at < datetime('now', '-90 days');"

# Delete old events
sqlite3 data/app.db "DELETE FROM events WHERE created_at < datetime('now', '-30 days');"

# Vacuum
sqlite3 data/app.db "VACUUM;"
```

## 📝 Logging Security

### 1. Redact Sensitive Data

Already implemented - API keys **NOT logged**.

**Code** (`src/http/middleware/logger.ts`):
```typescript
const redactPaths = [
  'headers.authorization',
  'headers.x-master-key',
  'body.api_key'
];
```

### 2. Log Rotation

**PM2**:
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'rijan-wa',
    script: './dist/index.js',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: 'logs/error.log',
    out_file: 'logs/out.log',
    max_restarts: 10,
    log_max_size: '10M',
    log_retain: 30
  }]
};
```

**Logrotate** (Linux):
```
# /etc/logrotate.d/rijan-wa
/var/log/rijan-wa/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
}
```

### 3. Centralized Logging

**Syslog**:
```typescript
// src/config/logger.ts
import pino from 'pino';
import pinoSyslog from 'pino-syslog';

const stream = pinoSyslog.createWriteStream({
  host: 'syslog.yourcompany.com',
  port: 514,
  facility: 'local0'
});

export const logger = pino(stream);
```

## 👥 Access Control

### 1. Separate Admin & Tenant Keys

**Admin** - full access:
```bash
curl -X GET http://localhost:3000/admin/tenants \
  -H "X-Master-Key: ADMIN_MASTER_KEY"
```

**Tenant** - limited access:
```bash
curl -X POST http://localhost:3000/v1/devices/DEVICE_ID/messages/text \
  -H "Authorization: Bearer TENANT_API_KEY"
```

### 2. Multi-Admin Support

Create different master keys for different admins:

```env
# Admin 1 - Full access
MASTER_KEY_ADMIN1=abc123...

# Admin 2 - Read-only (implement in code)
MASTER_KEY_ADMIN2=xyz789...
ADMIN2_READ_ONLY=true
```

### 3. Audit Logging

Track all admin actions:

```typescript
// src/modules/audit/service.ts
export async function logAdminAction(action: {
  admin_key: string;
  action: string;
  resource: string;
  ip: string;
  timestamp: number;
}) {
  await db.audit_logs.insert(action);
}
```

Query audit logs:
```bash
curl -X GET http://localhost:3000/admin/audit-logs \
  -H "X-Master-Key: YOUR_MASTER_KEY"
```

## 🔐 Webhook Security

### 1. Verify Signatures

**Always verify** webhook signatures:

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
    
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  
  if (!verifyWebhookSignature(req.body, signature, WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // Process webhook...
});
```

### 2. Use Strong Webhook Secrets

```bash
# Generate strong secret
openssl rand -hex 32
```

### 3. HTTPS Only

**DON'T** accept webhooks over HTTP in production:

```typescript
// src/modules/webhooks/service.ts
if (webhookUrl.startsWith('http://') && NODE_ENV === 'production') {
  throw new Error('Webhook URL must use HTTPS in production');
}
```

## 🚨 Monitoring & Alerts

### 1. Monitor Failed Login Attempts

```typescript
// Track failed auth attempts
const failedAttempts = new Map();

function trackFailedAuth(ip: string) {
  const count = failedAttempts.get(ip) || 0;
  failedAttempts.set(ip, count + 1);
  
  if (count > 10) {
    // Block IP
    blockedIPs.add(ip);
    sendAlert(`IP ${ip} blocked after 10 failed auth attempts`);
  }
}
```

### 2. Monitor Unusual Activity

```typescript
// Alert on unusual patterns
async function detectAnomalies() {
  const stats = await getMessageStats('last_hour');
  
  // Spike in failed messages
  if (stats.failed_rate > 20) {
    sendAlert(`High failure rate: ${stats.failed_rate}%`);
  }
  
  // Spike in requests
  if (stats.requests > 10000) {
    sendAlert(`High request volume: ${stats.requests} req/hour`);
  }
}
```

### 3. Set Up Alerts

```bash
# Email alerts
curl -X POST http://localhost:3000/admin/alerts/email \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@yourcompany.com",
    "events": [
      "device_disconnected",
      "high_failure_rate",
      "security_incident"
    ]
  }'
```

## 🧪 Security Testing

### 1. SQL Injection

Already protected - using parameterized queries:

```typescript
// ✅ Safe
db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);

// ❌ Vulnerable (NOT used)
db.exec(`SELECT * FROM tenants WHERE id = '${tenantId}'`);
```

### 2. XSS Protection

API returns JSON only - XSS not applicable.

If building web UI, sanitize:
```javascript
import DOMPurify from 'dompurify';

const clean = DOMPurify.sanitize(userInput);
```

### 3. CSRF Protection

For webhook endpoints, verify signature.

For web UI (if applicable):
```typescript
// Use CSRF tokens
import csrf from 'csurf';

app.use(csrf({ cookie: true }));
```

## ✅ Security Checklist

### Deployment Checklist

- [ ] Strong master key generated (32+ bytes)
- [ ] Master key NOT in Git
- [ ] HTTPS enabled (production)
- [ ] Firewall configured
- [ ] Rate limiting enabled
- [ ] Database file permissions set (600)
- [ ] Sessions directory permissions set (700)
- [ ] Sensitive data redacted from logs
- [ ] Log rotation configured
- [ ] Backup encryption enabled
- [ ] Webhook signatures verified
- [ ] Admin audit logging enabled
- [ ] Monitoring alerts configured
- [ ] Regular security updates scheduled

### Regular Maintenance

- [ ] Rotate master key (every 90 days)
- [ ] Review API key expirations (monthly)
- [ ] Check audit logs (weekly)
- [ ] Update dependencies (monthly)
- [ ] Review failed login attempts (daily)
- [ ] Clean up old data (monthly)
- [ ] Test backups (monthly)
- [ ] Review firewall rules (quarterly)

## 📚 Additional Resources

- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Fastify Security](https://www.fastify.io/docs/latest/Reference/Security/)

## ⏭️ Langkah Selanjutnya

1. **[Performance Tuning](31-performance-tuning.md)** - Optimize performance
2. **[Backup & Recovery](32-backup-recovery.md)** - Backup strategies
3. **[API Reference](README.md)** - Complete API documentation

---

**Prev**: [← Troubleshooting](30-troubleshooting.md)  
**Next**: [Performance Tuning →](31-performance-tuning.md)
