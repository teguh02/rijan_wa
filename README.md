# Rijan WA Gateway

WhatsApp Gateway berbasis Baileys dengan arsitektur multi-tenant dan multi-device. Sistem ini dirancang untuk menyediakan layanan WhatsApp API yang aman, scalable, dan mudah dikelola.

## 🏗️ Arsitektur

### Stack Teknologi

- **Runtime**: Node.js 18+ dengan TypeScript
- **Web Framework**: Fastify (high-performance, low-overhead)
- **WhatsApp Engine**: @whiskeysockets/baileys (socket-based, no browser automation)
- **Database**: SQLite dengan better-sqlite3
- **Security**: HMAC-SHA256, AES-256-GCM encryption, PBKDF2 key derivation
- **API Documentation**: OpenAPI 3.0 (Swagger)
- **Deployment**: Docker + Docker Compose

### Struktur Direktori

```
rijan_wa/
├── src/
│   ├── config/          # Konfigurasi aplikasi
│   ├── http/            # HTTP server & routes
│   │   └── routes/      # API endpoints
│   ├── middlewares/     # Auth, error handling, logging
│   ├── modules/         # Business logic modules
│   │   ├── devices/     # Device management
│   │   ├── messages/    # Message handling
│   │   └── webhooks/    # Webhook delivery
│   ├── storage/         # Database & repositories
│   ├── baileys/         # Baileys integration
│   ├── jobs/            # Background jobs
│   └── utils/           # Utilities (crypto, logger)
├── data/                # SQLite database
├── sessions/            # Baileys auth sessions
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## 🔐 Model Keamanan

### 1. Master Key

`MASTER_KEY` adalah root secret untuk seluruh sistem:
- Format: SHA256 hash (64 karakter hex)
- Digunakan untuk:
  - Autentikasi admin endpoints
  - Derivasi encryption keys
  - Signing dan verifikasi tenant API keys

**Generate Master Key:**
```bash
echo -n "your-super-secret-password" | sha256sum
```

### 2. Tenant API Keys

API Key per tenant dihasilkan menggunakan HMAC-SHA256:

**Format:** `tenantId.timestamp.salt.signature`

**Skema:**
```
payload = tenantId + timestamp + salt
signature = HMAC-SHA256(MASTER_KEY, payload)
```

**Keuntungan:**
- Dapat diverifikasi tanpa database lookup
- Tidak perlu menyimpan plaintext secret
- Constant-time comparison untuk mencegah timing attacks

### 3. Credential Encryption

Auth state Baileys dienkripsi menggunakan AES-256-GCM:

**Skema:**
```
encryption_key = PBKDF2(MASTER_KEY, salt, 100000 iterations, SHA256)
encrypted_data = AES-256-GCM(plaintext, encryption_key, random_iv)
```

**Storage:**
- Encrypted blob di database
- IV (12 bytes) dan auth tag disimpan terpisah
- Salt unik per device

## 🔄 Alur Request

### Admin Flow

```
Client Request
    ↓
[X-Master-Key Header]
    ↓
verifyMasterKey Middleware
    ↓
- Constant-time comparison
- Audit log on failure
    ↓
Admin Endpoint Handler
    ↓
Response
```

### Tenant Flow

```
Client Request
    ↓
[Authorization: Bearer <api_key>]
    ↓
Rate Limiter (per tenant)
    ↓
verifyTenantApiKey Middleware
    ↓
- Verify HMAC signature
- Extract tenantId
- Check tenant status
- Attach tenant context
    ↓
Request Logger
    ↓
Business Logic Handler
    ↓
- deviceId validation
- Authorization check
    ↓
Response
```

### Device-Operational Flow

```
Tenant Request
    ↓
/v1/devices/{deviceId}/...
    ↓
Verify tenant owns device
    ↓
Check device status
    ↓
Execute operation
    ↓
Update device last_seen
    ↓
Response
```

## 📊 Data Model

### Tenants
- Multi-tenant isolation
- API key hash untuk autentikasi
- Status: active, suspended, deleted

### Devices
- One-to-many dengan tenant
- Status tracking: disconnected, connecting, connected, failed
- Phone number setelah QR scan

### Device Sessions
- Encrypted Baileys auth state
- Versioned encryption
- Salt untuk key derivation

### Messages Outbox
- Queue untuk outgoing messages
- Retry mechanism
- Status tracking

### Messages Inbox
- Optional storage untuk incoming messages
- Webhook event payload

### Webhooks
- Per-tenant webhook configuration
- Event filtering
- Retry policy

### Audit Logs
- Semua admin actions
- Failed auth attempts
- Resource changes

## 🚀 Quick Start

### Development

1. **Install dependencies:**
```bash
npm install
```

2. **Setup environment:**
```bash
cp .env.example .env
# Edit .env dan set MASTER_KEY
```

3. **Run migrations:**
```bash
npm run db:migrate
```

4. **Start development server:**
```bash
npm run dev
```

Server akan berjalan di `http://localhost:3000`
API docs di `http://localhost:3000/docs`

### Production (Docker)

1. **Set MASTER_KEY di docker-compose.yml**

2. **Build dan run:**
```bash
docker-compose up -d
```

3. **Check logs:**
```bash
docker-compose logs -f
```

## 📡 API Endpoints

### Health Check
- `GET /health` - No auth required

### Admin Endpoints (requires X-Master-Key)
- `POST /admin/tenants` - Create tenant & generate API key
- `GET /admin/tenants` - List tenants
- `GET /admin/tenants/:id` - Get tenant details
- `PATCH /admin/tenants/:id/suspend` - Suspend tenant
- `PATCH /admin/tenants/:id/activate` - Activate tenant
- `DELETE /admin/tenants/:id` - Delete tenant (soft)

### Tenant Endpoints (requires Authorization: Bearer <api_key>)
- Coming soon: Device management, messaging, webhooks

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MASTER_KEY` | SHA256 hash (required) | - |
| `PORT` | HTTP port | 3000 |
| `NODE_ENV` | Environment | development |
| `LOG_LEVEL` | Log level | info |
| `DATABASE_PATH` | SQLite database path | ./data/rijan_wa.db |
| `RATE_LIMIT_MAX` | Max requests per window | 100 |
| `RATE_LIMIT_WINDOW` | Window in ms | 60000 |
| `ENCRYPTION_ALGORITHM` | Encryption algorithm | aes-256-gcm |

## 🧪 Testing

### Create Tenant (Admin)

```bash
curl -X POST http://localhost:3000/admin/tenants \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Tenant"}'
```

Response:
```json
{
  "success": true,
  "data": {
    "tenant": {
      "id": "tenant_abc123",
      "name": "Test Tenant",
      "status": "active",
      "created_at": 1703001234
    },
    "api_key": "tenant_abc123.1703001234.salt123.signature456",
    "warning": "Save this API key securely. It will not be shown again."
  },
  "requestId": "req_xyz789"
}
```

### Health Check

```bash
curl http://localhost:3000/health
```

## 🛡️ Security Best Practices

1. **MASTER_KEY Protection**
   - Never commit to git
   - Use strong, random password
   - Rotate periodically in production
   - Store in secure secret management (Vault, AWS Secrets Manager, etc.)

2. **API Key Management**
   - Display API key only once on creation
   - Store hash, not plaintext
   - Implement key rotation mechanism
   - Monitor for suspicious usage

3. **Database Security**
   - All auth credentials encrypted at rest
   - WAL mode enabled for better concurrency
   - Foreign keys enforced
   - Regular backups

4. **Network Security**
   - Use HTTPS in production (reverse proxy)
   - Rate limiting per tenant
   - Request logging (sensitive data redacted)
   - CORS properly configured

5. **Docker Security**
   - Non-root user
   - Read-only root filesystem
   - Security options enabled
   - Resource limits

## 📝 Logging

Structured logging dengan Pino:
- Request ID untuk tracing
- Sensitive headers redacted
- JSON format in production
- Pretty print in development

## 🔄 Roadmap

- [ ] Device management endpoints
- [ ] QR code generation untuk pairing
- [ ] Message sending (text, media, template)
- [ ] Webhook delivery system
- [ ] Message queue worker
- [ ] Baileys integration
- [ ] Session persistence
- [ ] Multi-instance support (Redis)
- [ ] Metrics & monitoring (Prometheus)
- [ ] Admin dashboard (optional)

## 📄 License

MIT

## 🤝 Contributing

Contributions welcome! Please follow security best practices.
