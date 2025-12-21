# Membuat Device untuk Tenant (Admin)

Panduan admin untuk membuat WhatsApp device baru untuk tenant. Setiap device represent 1 akun WhatsApp.

## 🔑 Prerequisites

- Tenant sudah dibuat
- Tenant ID tersedia
- Master Key tersedia

## 📝 Endpoint

```
POST /admin/tenants/:tenantId/devices
```

**Authentication**: Master Key (X-Master-Key header)

## 🚀 Membuat Device

### cURL Request

```bash
curl -X POST http://localhost:3000/admin/tenants/tenant_abc123xyz789/devices \
  -H "Content-Type: application/json" \
  -H "X-Master-Key: YOUR_MASTER_KEY_HERE" \
  -d '{
    "label": "Customer Service Device"
  }'
```

### PowerShell Request

```powershell
$tenantId = "tenant_abc123xyz789"
$headers = @{
    "Content-Type" = "application/json"
    "X-Master-Key" = "YOUR_MASTER_KEY_HERE"
}

$body = @{
    label = "Customer Service Device"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/admin/tenants/$tenantId/devices" `
    -Method Post `
    -Headers $headers `
    -Body $body
```

### Response Success

```json
{
  "success": true,
  "data": {
    "device": {
      "id": "device_xyz789abc123",
      "tenant_id": "tenant_abc123xyz789",
      "label": "Customer Service Device",
      "status": "disconnected",
      "phone_number": null,
      "wa_jid": null,
      "last_connect_at": null,
      "last_disconnect_at": null,
      "created_at": 1703145600,
      "updated_at": 1703145600
    }
  }
}
```

## 📋 Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `label` | string | ✅ Yes | Label/deskripsi device |

### Validasi

- **label**:
  - Minimum 3 karakter
  - Maximum 100 karakter
  - Deskriptif dan jelas

### Contoh Valid

```json
{
  "label": "CS WhatsApp - Team A"
}
```

```json
{
  "label": "Marketing Broadcast Device"
}
```

```json
{
  "label": "Sales Support - Jakarta"
}
```

## 📊 Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique device ID (diperlukan untuk semua operasi) |
| `tenant_id` | string | ID tenant pemilik |
| `label` | string | Label device |
| `status` | string | Status: disconnected, connecting, connected, failed |
| `phone_number` | string\|null | Nomor WA (setelah pairing) |
| `wa_jid` | string\|null | WhatsApp JID (setelah pairing) |
| `last_connect_at` | number\|null | Unix timestamp koneksi terakhir |
| `last_disconnect_at` | number\|null | Unix timestamp disconnect terakhir |
| `created_at` | number | Unix timestamp pembuatan |
| `updated_at` | number | Unix timestamp update terakhir |

## 🎯 Use Cases

### 1. Single Device per Tenant

Untuk small business dengan 1 nomor WA:

```bash
curl -X POST http://localhost:3000/admin/tenants/tenant_abc123/devices \
  -H "Content-Type: application/json" \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  -d '{"label": "Main WhatsApp Number"}'
```

### 2. Multiple Devices per Tenant

Untuk business dengan multiple departments:

```bash
# Device 1 - CS
curl -X POST http://localhost:3000/admin/tenants/tenant_abc123/devices \
  -H "Content-Type: application/json" \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  -d '{"label": "Customer Service"}'

# Device 2 - Sales
curl -X POST http://localhost:3000/admin/tenants/tenant_abc123/devices \
  -H "Content-Type: application/json" \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  -d '{"label": "Sales Team"}'

# Device 3 - Marketing
curl -X POST http://localhost:3000/admin/tenants/tenant_abc123/devices \
  -H "Content-Type: application/json" \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  -d '{"label": "Marketing Broadcast"}'
```

### 3. Regional Devices

Untuk multi-location business:

```bash
# Jakarta
curl -X POST http://localhost:3000/admin/tenants/tenant_abc123/devices \
  -H "Content-Type: application/json" \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  -d '{"label": "Jakarta Branch"}'

# Surabaya
curl -X POST http://localhost:3000/admin/tenants/tenant_abc123/devices \
  -H "Content-Type: application/json" \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  -d '{"label": "Surabaya Branch"}'

# Bandung
curl -X POST http://localhost:3000/admin/tenants/tenant_abc123/devices \
  -H "Content-Type: application/json" \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  -d '{"label": "Bandung Branch"}'
```

## 🔍 List Devices

### Get All Devices for Tenant

```bash
curl -X GET http://localhost:3000/admin/tenants/tenant_abc123xyz789/devices \
  -H "X-Master-Key: YOUR_MASTER_KEY_HERE"
```

Response:
```json
{
  "success": true,
  "data": {
    "devices": [
      {
        "id": "device_xyz789abc123",
        "label": "Customer Service Device",
        "status": "disconnected",
        "phone_number": null,
        "created_at": 1703145600
      },
      {
        "id": "device_aaa111bbb222",
        "label": "Sales Team",
        "status": "connected",
        "phone_number": "628123456789",
        "created_at": 1703145700
      }
    ],
    "total": 2
  }
}
```

## 🗑️ Delete Device

**⚠️ WARNING**: Deleting device akan:
- Menghapus semua data device
- Menghapus credential WhatsApp
- Logout dari WhatsApp
- TIDAK BISA di-undo

```bash
curl -X DELETE http://localhost:3000/admin/tenants/tenant_abc123/devices/device_xyz789 \
  -H "X-Master-Key: YOUR_MASTER_KEY_HERE"
```

Response:
```json
{
  "success": true,
  "message": "Device deleted successfully"
}
```

## 🚨 Error Handling

### Error: Tenant Not Found

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Tenant not found"
  }
}
```

**Solusi**: Verifikasi tenant ID benar

### Error: Unauthorized

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid master key"
  }
}
```

**Solusi**: Periksa master key

### Error: Validation Failed

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Label is required"
  }
}
```

**Solusi**: Tambahkan label yang valid

## 📝 Device Status Lifecycle

```
disconnected → connecting → connected
     ↓              ↓            ↓
   failed       failed       disconnected
```

**Status**:
- `disconnected`: Device belum connect/ter-disconnect
- `connecting`: Sedang proses koneksi
- `connected`: Tersambung ke WhatsApp
- `failed`: Koneksi gagal
- `pairing`: Menunggu scan QR/pairing code

## 💡 Best Practices

### 1. Descriptive Labels

Gunakan label yang jelas:
- ✅ "CS Team A - Shift Morning"
- ✅ "Marketing Broadcast - Campaign 2025"
- ✅ "Sales - Jakarta Region"
- ❌ "Device 1"
- ❌ "Test"
- ❌ "abc"

### 2. Document Devices

Maintain dokumentasi device:

```
Device ID: device_xyz789abc123
Label: Customer Service Device
Tenant: PT Teknologi Digital (tenant_abc123xyz789)
Phone: 6281234567890 (after pairing)
Purpose: Handle customer inquiries
Created: 2025-12-21
Status: Active
```

### 3. Naming Convention

Standard naming untuk multi-device:

```
[Department] - [Function] - [Location]

Examples:
- CS - Support - Jakarta
- Sales - Outbound - Surabaya
- Marketing - Broadcast - HQ
```

### 4. Security

- Only create devices yang diperlukan
- Delete unused devices
- Monitor device status regularly
- Audit device creation via audit logs

## 🔄 Next Steps After Creating Device

Setelah device dibuat:

1. **Inform Tenant**:
   - Berikan device ID ke tenant
   - Tenant akan menggunakan API key mereka
   - Tenant akan start device dan pairing

2. **Tenant Actions** (bukan admin):
   - Start device
   - Request QR code atau pairing code
   - Scan QR atau enter pairing code
   - Wait untuk status connected

## ⏭️ Langkah Selanjutnya

Sekarang tenant bisa:

1. **[Start Device & Pairing](07-tenant-start-device.md)** - Tenant connect device ke WhatsApp
2. **[Management Tenant](06-admin-manage-tenant.md)** - Admin manage tenant (suspend, dll)

---

**Prev**: [← Membuat Tenant](04-admin-create-tenant.md)  
**Next**: [Start Device & Pairing →](07-tenant-start-device.md)
