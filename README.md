# Rijan WA Gateway

WhatsApp Gateway berbasis Baileys dengan arsitektur multi-tenant dan multi-device. Sistem ini dirancang untuk menyediakan layanan WhatsApp API yang aman, scalable, dan mudah dikelola.

## 🏗️ Arsitektur

### Stack Teknologi

- **Runtime**: Node.js 18+ dengan TypeScript
- **Web Framework**: Fastify (high-performance, low-overhead)
- **WhatsApp Engine**: @whiskeysockets/baileys (socket-based, no browser automation)
- **Database**: SQLite dengan better-sqlite3
- **Security**: HMAC-SHA256 (tenant API keys), constant-time comparisons, optional AES-256-GCM utilities
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

#### ⚠️ PENTING: Plain Text vs Hash

**Salah paham umum:** Developer mengirim SHA256 hash di header X-Master-Key.

```
┌─────────────────────────────────────┐
│ CORRECT FLOW (Yang HARUS dilakukan) │
└─────────────────────────────────────┘

File .env (Server):
  MASTER_KEY=8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918

Header X-Master-Key (Client):
  X-Master-Key: admin  ← PLAIN TEXT PASSWORD!

Server Process:
  1. Terima plain text dari header: "admin"
  2. Hash dengan SHA256: "8c6976e5b5410415...9673fc4bb8a81f6f2ab448a918"
  3. Compare dengan MASTER_KEY di .env menggunakan constant-time comparison
  4. Match? → Allow | Tidak match? → Error 401
```

**❌ JANGAN lakukan ini** (Salah):
```
Header X-Master-Key: 8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918
```
Alasan: Server akan hash ini lagi → hasil berbeda → authentication gagal

**Dokumentasi lengkap**: Lihat [Membuat Master Key](docs/02-master-key.md) dan [Plain Text vs Hash](docs/02-master-key.md#-penting-plain-text-vs-hash)

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

### 3. WhatsApp Sessions (Baileys Standard)

Auth state Baileys menggunakan metode standar `useMultiFileAuthState` (file JSON di filesystem), bukan disimpan sebagai blob terenkripsi di database.

**Struktur session:**
```
./sessions/{tenantId}/{deviceId}/
  creds.json
  pre-key-*.json
  sender-key-*.json
  app-state-sync-*.json
```

**Database** hanya menyimpan metadata untuk memudahkan identifikasi relasi tenant → device → session:
- `device_sessions.session_dir` (path folder session)
- `device_sessions.wa_jid`, `device_sessions.wa_name` (jika tersedia)
- `device_sessions.session_kind` (format session)

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
- File-based Baileys auth state (standard multi-file)
- Metadata session disimpan di `device_sessions` (mapping tenant/device ke folder session)

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

## � Device Management (PROMPT 2)

### Device Lifecycle

1. **Create Device (Admin)**
   ```bash
   POST /v1/admin/tenants/{tenantId}/devices
   ```

2. **Start Device & Connect WhatsApp**
   ```bash
   POST /v1/devices/{deviceId}/start
   ```

3. **Pairing Methods:**
   - **QR Code:** `POST /v1/devices/{deviceId}/pairing/qr`
   - **Pairing Code:** `POST /v1/devices/{deviceId}/pairing/code`

4. **Monitor Status**
   ```bash
   GET /v1/devices/{deviceId}/health
   ```

5. **Stop or Logout**
   ```bash
   POST /v1/devices/{deviceId}/stop
   POST /v1/devices/{deviceId}/logout
   ```

### Device Endpoints

**List Devices:**
```bash
GET /v1/devices?limit=50&offset=0
Authorization: Bearer <tenant_api_key>
```

**Get Device Detail:**
```bash
GET /v1/devices/{deviceId}
Authorization: Bearer <tenant_api_key>
```

**Start Device:**
```bash
POST /v1/devices/{deviceId}/start
Authorization: Bearer <tenant_api_key>
```

**Stop Device:**
```bash
POST /v1/devices/{deviceId}/stop
Authorization: Bearer <tenant_api_key>
```

**Logout Device:**
```bash
POST /v1/devices/{deviceId}/logout
Authorization: Bearer <tenant_api_key>
```

**Request QR Code:**
```bash
POST /v1/devices/{deviceId}/pairing/qr
Authorization: Bearer <tenant_api_key>

Response:
{
  "success": true,
  "data": {
    "qr_code": "data:image/png;base64,...",
    "expires_at": 1703001294,
    "message": "Scan QR code dengan WhatsApp di smartphone Anda"
  }
}
```

**Request Pairing Code:**
```bash
POST /v1/devices/{deviceId}/pairing/code
Authorization: Bearer <tenant_api_key>
Content-Type: application/json

{
  "phone_number": "628123456789"
}

Response:
{
  "success": true,
  "data": {
    "pairing_code": "ABCD-EFGH",
    "phone_number": "628123456789",
    "expires_at": 1703001294,
    "message": "Masukkan pairing code ini di WhatsApp > Linked Devices"
  }
}
```

**Device Health Check:**
```bash
GET /v1/devices/{deviceId}/health
Authorization: Bearer <tenant_api_key>

Response:
{
  "success": true,
  "data": {
    "is_connected": true,
    "status": "connected",
    "wa_jid": "628123456789@s.whatsapp.net",
    "phone_number": "628123456789",
    "last_connect_at": 1703001234,
    "last_disconnect_at": null,
    "uptime": 3600000
  }
}
```

### Device Status

| Status | Description |
|--------|-------------|
| `disconnected` | Device belum connect atau sudah disconnect |
| `connecting` | Sedang mencoba connect ke WhatsApp |
| `pairing` | Menunggu QR scan atau pairing code input |
| `connected` | Berhasil connect dan ready |
| `failed` | Connection failed setelah max retries |

## �🔧 Configuration

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

### Ownership Validation Test

```bash
npm run test:ownership
```

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

### Complete Device Pairing Flow

**Step 1: Create Device**
```bash
curl -X POST http://localhost:3000/v1/admin/tenants/tenant_abc123/devices \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"label": "Customer Support"}'
```

**Step 2: Start Device**
```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789/start \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

**Step 3: Get QR Code**
```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789/pairing/qr \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

**Step 4: Check Status**
```bash
curl http://localhost:3000/v1/devices/device_xyz789/health \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
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

**Completed:**
- [x] Multi-tenant architecture dengan secure API keys
- [x] Device management system
- [x] Baileys integration dengan encrypted session storage
- [x] QR code dan pairing code flow
- [x] Auto-reconnect dan session recovery
- [x] Device lifecycle management (start/stop/logout)
- [x] Real-time device status tracking
- [x] Ownership validation

**In Progress:**
- [ ] Message sending endpoints (text, media, template)
- [ ] Incoming message handling
- [ ] Webhook delivery system

**Planned:**
- [ ] Message queue worker
- [ ] Message status tracking
- [ ] Group management
- [ ] Contact management
- [ ] Multi-instance support (Redis)
- [ ] Metrics & monitoring (Prometheus)
- [ ] Admin dashboard (optional)

## 📄 License

MIT

## 🤝 Contributing

Contributions welcome! Please follow security best practices.
