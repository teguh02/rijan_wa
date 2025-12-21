# Membuat Tenant (Admin)

Panduan untuk admin membuat tenant baru. Tenant adalah unit isolasi yang dapat memiliki multiple devices WhatsApp.

## 🔑 Prerequisites

- Server sudah running
- Master Key sudah disiapkan
- Terminal atau REST client (cURL, Postman, Insomnia)

## 📝 Endpoint

```
POST /admin/tenants
```

**Authentication**: Master Key (X-Master-Key header)

## 🚀 Membuat Tenant Pertama

### cURL Request

```bash
curl -X POST http://localhost:3000/admin/tenants \
  -H "Content-Type: application/json" \
  -H "X-Master-Key: YOUR_MASTER_KEY_HERE" \
  -d '{
    "name": "PT Contoh Perusahaan"
  }'
```

### PowerShell Request

```powershell
$headers = @{
    "Content-Type" = "application/json"
    "X-Master-Key" = "YOUR_MASTER_KEY_HERE"
}

$body = @{
    name = "PT Contoh Perusahaan"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/admin/tenants" `
    -Method Post `
    -Headers $headers `
    -Body $body
```

### Response Success

```json
{
  "success": true,
  "data": {
    "tenant": {
      "id": "tenant_abc123xyz789",
      "name": "PT Contoh Perusahaan",
      "status": "active",
      "created_at": 1703145600,
      "updated_at": 1703145600
    },
    "api_key": "tenant_abc123xyz789.1703145600.365days.a1b2c3d4e5f6.9f8e7d6c5b4a3210fedcba0987654321"
  },
  "message": "Tenant created successfully. Store the API key securely - it will not be shown again."
}
```

## ⚠️ PENTING: Simpan API Key!

**API Key hanya ditampilkan SEKALI saat tenant dibuat!**

### Cara Menyimpan API Key

1. **Copy API key segera**
2. **Simpan di tempat aman**:
   - Password manager (1Password, Bitwarden)
   - Environment variables
   - Secrets management system

### Format API Key

```
tenantId.timestamp.expiresAt.salt.signature
```

**Contoh**:
```
tenant_abc123xyz789.1703145600.1734681600.a1b2c3d4e5f6.9f8e7d6c5b4a3210fedcba0987654321
```

**Karakteristik**:
- Signed dengan HMAC-SHA256
- Expires dalam 365 hari (default)
- Tidak bisa di-recover jika hilang
- Unique per tenant

## 📋 Request Body Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ Yes | Nama tenant/perusahaan |

### Validasi

- **name**: 
  - Minimum 3 karakter
  - Maximum 100 karakter
  - Tidak boleh empty/whitespace only

### Contoh Valid

```json
{
  "name": "PT Teknologi Maju"
}
```

```json
{
  "name": "Toko Online Sejahtera"
}
```

```json
{
  "name": "CV Berkah Jaya"
}
```

### Contoh Invalid

```json
{
  "name": ""
}
// Error: Name is required
```

```json
{
  "name": "AB"
}
// Error: Name too short (min 3 characters)
```

## 📊 Response Fields

### Tenant Object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique tenant ID |
| `name` | string | Nama tenant |
| `status` | string | Status: active, suspended, deleted |
| `created_at` | number | Unix timestamp (seconds) |
| `updated_at` | number | Unix timestamp (seconds) |

### API Key

- String panjang dengan format khusus
- Expires dalam 365 hari
- Digunakan untuk semua tenant operations

## 🔐 Security Notes

### API Key Security

- ✅ Store securely (password manager, env vars)
- ✅ Use HTTPS in production
- ✅ Rotate periodically (365 days expiry)
- ❌ NEVER commit to Git
- ❌ NEVER log in plaintext
- ❌ NEVER share via email/chat

### Master Key Usage

- Only use untuk admin operations
- Never expose to tenants
- Rotate if compromised

## 🔍 Verifikasi Tenant

### List All Tenants

```bash
curl -X GET http://localhost:3000/admin/tenants \
  -H "X-Master-Key: YOUR_MASTER_KEY_HERE"
```

Response:
```json
{
  "success": true,
  "data": {
    "tenants": [
      {
        "id": "tenant_abc123xyz789",
        "name": "PT Contoh Perusahaan",
        "status": "active",
        "device_count": 0,
        "created_at": 1703145600
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 50
  }
}
```

### Get Tenant Detail

```bash
curl -X GET http://localhost:3000/admin/tenants/tenant_abc123xyz789 \
  -H "X-Master-Key: YOUR_MASTER_KEY_HERE"
```

## 🎯 Use Cases

### 1. Single Company

Buat 1 tenant untuk perusahaan Anda:

```bash
curl -X POST http://localhost:3000/admin/tenants \
  -H "Content-Type: application/json" \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  -d '{"name": "Perusahaan Saya"}'
```

### 2. Multi-Client SaaS

Buat tenant terpisah untuk setiap client:

```bash
# Client A
curl -X POST http://localhost:3000/admin/tenants \
  -H "Content-Type: application/json" \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  -d '{"name": "Client A - Toko Online"}'

# Client B
curl -X POST http://localhost:3000/admin/tenants \
  -H "Content-Type: application/json" \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  -d '{"name": "Client B - Restaurant"}'

# Client C
curl -X POST http://localhost:3000/admin/tenants \
  -H "Content-Type: application/json" \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  -d '{"name": "Client C - Konsultan"}'
```

### 3. Department-based

Buat tenant per department:

```bash
# Marketing
curl -X POST http://localhost:3000/admin/tenants \
  -H "Content-Type: application/json" \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  -d '{"name": "Marketing Department"}'

# Sales
curl -X POST http://localhost:3000/admin/tenants \
  -H "Content-Type: application/json" \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  -d '{"name": "Sales Department"}'

# Customer Service
curl -X POST http://localhost:3000/admin/tenants \
  -H "Content-Type: application/json" \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  -d '{"name": "Customer Service"}'
```

## 🚨 Error Handling

### Error: Unauthorized

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Master key is required"
  }
}
```

**Solusi**: Tambahkan header `X-Master-Key`

### Error: Invalid Master Key

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid master key"
  }
}
```

**Solusi**: Periksa MASTER_KEY di `.env` dan di request header

### Error: Validation Failed

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "name",
        "message": "Name is required"
      }
    ]
  }
}
```

**Solusi**: Periksa request body format

### Error: Rate Limit

```json
{
  "success": false,
  "error": {
    "code": "TOO_MANY_REQUESTS",
    "message": "Rate limit exceeded"
  }
}
```

**Solusi**: Tunggu beberapa saat, default limit: 100 req/min

## 📝 Best Practices

### 1. Naming Convention

Gunakan nama yang jelas dan deskriptif:
- ✅ "PT Teknologi Digital"
- ✅ "Client A - E-commerce"
- ✅ "Marketing Department"
- ❌ "Test"
- ❌ "abc123"
- ❌ "tenant1"

### 2. Documentation

Document tenant yang dibuat:
```
Tenant ID: tenant_abc123xyz789
Name: PT Teknologi Digital
API Key: [stored in 1Password]
Created: 2025-12-21
Purpose: Main company WhatsApp gateway
Contact: admin@teknologidigital.com
```

### 3. API Key Management

```bash
# Store in environment variable
export TENANT_API_KEY="tenant_abc123...."

# Or in .env file (for tenant app)
TENANT_API_KEY=tenant_abc123....
```

### 4. Testing

Test API key immediately:
```bash
curl -X GET http://localhost:3000/v1/devices \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

Expected response:
```json
{
  "success": true,
  "data": {
    "devices": [],
    "total": 0
  }
}
```

## ⏭️ Langkah Selanjutnya

Setelah tenant dibuat:

1. **[Buat Device](05-admin-create-device.md)** - Tambah WhatsApp device untuk tenant
2. **[Management Tenant](06-admin-manage-tenant.md)** - Suspend, activate, atau delete tenant

---

**Prev**: [← Jalankan Server](03-running-server.md)  
**Next**: [Membuat Device →](05-admin-create-device.md)
