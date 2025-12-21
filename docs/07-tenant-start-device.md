# Start Device & Pairing WhatsApp (Tenant)

Panduan tenant untuk start device dan connect ke WhatsApp menggunakan QR code atau pairing code.

## 🔑 Prerequisites

- Device sudah dibuat oleh admin
- Tenant API Key tersedia
- Device ID tersedia
- Smartphone dengan WhatsApp ter-install

## 🎯 Flow Overview

```
1. Start Device → 2. Request QR/Pairing Code → 3. Scan/Enter → 4. Connected
```

## 📱 Metode 1: QR Code Pairing (Recommended)

### Step 1: Start Device

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789abc123/start \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

Response:
```json
{
  "success": true,
  "data": {
    "device_id": "device_xyz789abc123",
    "status": "connecting",
    "message": "Device started. Request QR code or pairing code to connect."
  }
}
```

### Step 2: Request QR Code

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789abc123/pairing/qr \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

Response:
```json
{
  "success": true,
  "data": {
    "qr_code": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...",
    "qr_string": "2@abc123xyz...",
    "expires_at": 1703145660,
    "message": "Scan the QR code with WhatsApp on your smartphone"
  }
}
```

### Step 3: Display QR Code

**Option A: Di Browser**

Embed base64 image:
```html
<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUg..." alt="WhatsApp QR Code">
```

**Option B: Save ke File**

```bash
# Save QR code
curl -X POST http://localhost:3000/v1/devices/device_xyz789abc123/pairing/qr \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY" \
  | jq -r '.data.qr_code' > qr.txt

# Decode base64 to PNG
cat qr.txt | sed 's/data:image\/png;base64,//' | base64 -d > qr.png

# Open image
xdg-open qr.png  # Linux
open qr.png      # macOS
start qr.png     # Windows
```

### Step 4: Scan dengan WhatsApp

1. Buka WhatsApp di smartphone
2. Tap **Menu** (⋮) atau **Settings**
3. Pilih **Linked Devices**
4. Tap **Link a Device**
5. **Scan QR code** yang sudah ditampilkan
6. Tunggu proses pairing (5-10 detik)

### Step 5: Verify Connection

```bash
curl -X GET http://localhost:3000/v1/devices/device_xyz789abc123/health \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

Response jika **CONNECTED**:
```json
{
  "success": true,
  "data": {
    "is_connected": true,
    "status": "connected",
    "wa_jid": "628123456789@s.whatsapp.net",
    "phone_number": "628123456789",
    "last_connect_at": 1703145670,
    "uptime": 15000
  }
}
```

## 📟 Metode 2: Pairing Code (Alternative)

### Step 1: Start Device

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789abc123/start \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

### Step 2: Request Pairing Code

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789abc123/pairing/code \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "628123456789"
  }'
```

⚠️ **IMPORTANT**: Phone number format:
- Tanpa `+`: `628123456789` ✅
- Tanpa `0` di awal: `628123456789` ✅
- Dengan country code: `62` untuk Indonesia

Response:
```json
{
  "success": true,
  "data": {
    "pairing_code": "ABCD-EFGH",
    "phone_number": "628123456789",
    "expires_at": 1703145660,
    "message": "Masukkan pairing code ini di WhatsApp > Linked Devices"
  }
}
```

### Step 3: Enter Pairing Code di WhatsApp

1. Buka WhatsApp di smartphone
2. Tap **Menu** (⋮) atau **Settings**
3. Pilih **Linked Devices**
4. Tap **Link a Device**
5. Pilih **Link with phone number instead**
6. Masukkan pairing code: `ABCD-EFGH`
7. Tunggu verification

### Step 4: Verify Connection

Same as QR method - check health endpoint.

## 🔍 Monitoring Status

### Check Device Status

```bash
curl -X GET http://localhost:3000/v1/devices/device_xyz789abc123/health \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

### Possible Statuses

| Status | Description | Action |
|--------|-------------|--------|
| `disconnected` | Belum connect | Start device |
| `connecting` | Sedang connecting | Request QR/pairing code |
| `pairing` | Menunggu scan | Scan QR atau enter code |
| `connected` | Tersambung ✅ | Ready to send messages |
| `failed` | Koneksi gagal | Restart device |

## 🔄 Auto-Reconnect

Device akan **auto-reconnect** jika:
- Server restart
- Koneksi terputus sementara
- Network issue

**TIDAK perlu scan QR ulang** jika sudah pernah pairing!

### Session Recovery

```bash
# Setelah server restart
# Device auto-reconnect menggunakan saved session

# Check status
curl -X GET http://localhost:3000/v1/devices/device_xyz789abc123/health \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

## 🛑 Stop Device

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789abc123/stop \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

Response:
```json
{
  "success": true,
  "message": "Device stopped successfully"
}
```

## 🚪 Logout Device

⚠️ **WARNING**: Logout akan **menghapus session** dan perlu **scan QR ulang**!

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789abc123/logout \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

Response:
```json
{
  "success": true,
  "message": "Device logged out successfully"
}
```

## 🚨 Troubleshooting

### QR Code Expired

**Error**: QR code expired setelah 30 detik

**Solusi**: Request QR code baru
```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789abc123/pairing/qr \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

### Pairing Failed

**Error**: "Pairing failed" atau status stuck di "pairing"

**Solusi**:
1. Stop device
2. Start ulang
3. Request QR/pairing code baru
4. Scan lagi

```bash
# Stop
curl -X POST http://localhost:3000/v1/devices/device_xyz789abc123/stop \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"

# Start
curl -X POST http://localhost:3000/v1/devices/device_xyz789abc123/start \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"

# Request QR baru
curl -X POST http://localhost:3000/v1/devices/device_xyz789abc123/pairing/qr \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

### Device Not Found

**Error**: "Device not found or access denied"

**Solusi**:
- Verifikasi device ID benar
- Verifikasi API key milik tenant yang benar
- Pastikan device sudah dibuat oleh admin

### Invalid Phone Number

**Error**: "Invalid phone number format"

**Solusi**: Format nomor yang benar:
```json
{
  "phone_number": "628123456789"
}
```

Bukan:
```json
{
  "phone_number": "+62 812-3456-789"
}
```

### Connection Timeout

**Error**: Status stuck di "connecting"

**Solusi**:
1. Check internet connection
2. Check firewall settings
3. Restart device

## 📋 Checklist

Before declaring success:

- [ ] Device started successfully
- [ ] QR code/pairing code generated
- [ ] QR scanned atau code entered
- [ ] Status changed to "connected"
- [ ] Phone number populated
- [ ] Health check returns `is_connected: true`

## 💡 Tips

### 1. Save Device State

Store device information:
```json
{
  "device_id": "device_xyz789abc123",
  "label": "Customer Service",
  "phone_number": "628123456789",
  "wa_jid": "628123456789@s.whatsapp.net",
  "status": "connected",
  "last_connected": "2025-12-21T10:30:00Z"
}
```

### 2. Monitor Health

Poll health endpoint setiap 30-60 detik:
```bash
#!/bin/bash
while true; do
  curl -s http://localhost:3000/v1/devices/device_xyz789/health \
    -H "Authorization: Bearer $API_KEY" | jq .
  sleep 30
done
```

### 3. Handle Disconnects

Implement reconnect logic:
```javascript
async function ensureConnected(deviceId) {
  const health = await checkHealth(deviceId);
  
  if (!health.is_connected) {
    await startDevice(deviceId);
    await wait(5000);
    // Check again
  }
}
```

## ⏭️ Langkah Selanjutnya

Setelah device connected:

1. **[Mengirim Pesan Text](08-tenant-send-text.md)** - Kirim pesan text WhatsApp
2. **[Mengirim Media](09-tenant-send-media.md)** - Kirim gambar, video, audio

---

**Prev**: [← Membuat Device](05-admin-create-device.md)  
**Next**: [Mengirim Pesan Text →](08-tenant-send-text.md)
