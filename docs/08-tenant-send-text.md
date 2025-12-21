# Mengirim Pesan Text (Tenant)

Panduan lengkap untuk mengirim pesan text WhatsApp melalui API.

## 🔑 Prerequisites

- Device sudah connected (status: `connected`)
- Tenant API Key tersedia
- Device ID tersedia

## 📝 Endpoint

```
POST /v1/devices/:deviceId/messages/text
```

**Authentication**: Bearer Token (Tenant API Key)

## 🚀 Mengirim Pesan Sederhana

### cURL Request

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789/messages/text \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "628123456789",
    "text": "Halo! Ini pesan dari Rijan WA Gateway."
  }'
```

### PowerShell Request

```powershell
$deviceId = "device_xyz789"
$headers = @{
    "Authorization" = "Bearer YOUR_TENANT_API_KEY"
    "Content-Type" = "application/json"
}

$body = @{
    to = "628123456789"
    text = "Halo! Ini pesan dari Rijan WA Gateway."
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/v1/devices/$deviceId/messages/text" `
    -Method Post `
    -Headers $headers `
    -Body $body
```

### Response Success

```json
{
  "success": true,
  "data": {
    "message_id": "msg_abc123xyz789",
    "status": "pending",
    "to": "628123456789@s.whatsapp.net",
    "timestamp": 1703145600
  }
}
```

## 📋 Request Body

### Required Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `to` | string | ✅ Yes | Nomor WhatsApp tujuan |
| `text` | string | ✅ Yes | Isi pesan (max 10,000 karakter) |

### Optional Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `quoted_message_id` | string | ❌ No | ID pesan untuk reply |
| `mentions` | array | ❌ No | Array nomor untuk mention |

### Format Nomor WhatsApp

**Format yang BENAR**:
```
628123456789          # Tanpa + dan 0
62812345678           # Indonesia
6581234567            # Singapore
60123456789           # Malaysia
```

**Format yang SALAH**:
```
+62 812-3456-789      # Ada + dan -
0812-3456-789         # Ada 0 di awal
+62812345678          # Ada +
62 812 345 678        # Ada spasi
```

## 📨 Contoh Penggunaan

### 1. Pesan Sederhana

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789/messages/text \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "628123456789",
    "text": "Halo! Terima kasih sudah menghubungi kami."
  }'
```

### 2. Pesan dengan Line Breaks

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789/messages/text \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "628123456789",
    "text": "Halo!\n\nIni adalah pesan multi-line.\n\nTerima kasih."
  }'
```

### 3. Pesan dengan Bold, Italic

WhatsApp formatting:
- **Bold**: `*teks*`
- _Italic_: `_teks_`
- ~Strikethrough~: `~teks~`
- `Monospace`: ` ```teks``` `

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789/messages/text \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "628123456789",
    "text": "*Promo Spesial!*\n\n_Diskon 50%_ untuk semua produk.\n\n~Harga normal: Rp 100.000~\nHarga promo: *Rp 50.000*"
  }'
```

### 4. Reply ke Pesan

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789/messages/text \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "628123456789",
    "text": "Ini adalah reply untuk pesan Anda sebelumnya.",
    "quoted_message_id": "msg_previous_abc123"
  }'
```

### 5. Mention User

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789/messages/text \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "120363XXXXXXXXXX@g.us",
    "text": "Halo @628123456789! Terima kasih sudah join grup.",
    "mentions": ["628123456789"]
  }'
```

## 🔄 Message Status Tracking

### Get Message Status

```bash
curl -X GET http://localhost:3000/v1/devices/device_xyz789/messages/msg_abc123/status \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Response:
```json
{
  "success": true,
  "data": {
    "message_id": "msg_abc123xyz789",
    "status": "sent",
    "to": "628123456789@s.whatsapp.net",
    "sent_at": 1703145601,
    "delivered_at": 1703145602,
    "read_at": null,
    "wa_message_id": "3EB0XXXXXX"
  }
}
```

### Status Lifecycle

```
pending → queued → sending → sent → delivered → read
                      ↓
                   failed
```

**Status Meanings**:
- `pending`: Menunggu dikirim
- `queued`: Dalam antrian
- `sending`: Sedang mengirim
- `sent`: Terkirim ke server WhatsApp
- `delivered`: Terkirim ke penerima (1 checkmark)
- `read`: Dibaca penerima (2 checkmark biru)
- `failed`: Gagal kirim

## 🔁 Idempotency

Gunakan `Idempotency-Key` header untuk prevent duplicate sends:

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789/messages/text \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-key-12345" \
  -d '{
    "to": "628123456789",
    "text": "Pesan penting yang tidak boleh duplikat."
  }'
```

Jika request kedua dengan `Idempotency-Key` yang sama:
```json
{
  "success": true,
  "data": {
    "message_id": "msg_abc123xyz789",
    "status": "sent",
    "duplicate": true
  }
}
```

## 🎯 Use Cases

### 1. Welcome Message

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789/messages/text \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "628123456789",
    "text": "*Selamat Datang!* 👋\n\nTerima kasih telah menghubungi *PT Teknologi Digital*.\n\nAda yang bisa kami bantu?"
  }'
```

### 2. Order Confirmation

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789/messages/text \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "628123456789",
    "text": "*Konfirmasi Pesanan* ✅\n\n*Order ID*: #12345\n*Total*: Rp 250.000\n*Status*: Dikemas\n\nPesanan Anda akan dikirim dalam 1-2 hari kerja."
  }'
```

### 3. OTP Message

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789/messages/text \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: otp-628123-$(date +%s)" \
  -d '{
    "to": "628123456789",
    "text": "Kode OTP Anda: *123456*\n\nJangan bagikan kode ini ke siapapun.\nBerlaku selama 5 menit."
  }'
```

### 4. Payment Reminder

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789/messages/text \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "628123456789",
    "text": "🔔 *Pengingat Pembayaran*\n\nPembayaran invoice #INV-12345 akan jatuh tempo besok (22 Des 2025).\n\nTotal: *Rp 1.500.000*\n\nMohon segera lakukan pembayaran."
  }'
```

### 5. Customer Support

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789/messages/text \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "628123456789",
    "text": "Terima kasih telah menghubungi Customer Service.\n\nTiket Anda: *#CS-789*\n\nTim kami akan merespon dalam 1x24 jam."
  }'
```

## 🚨 Error Handling

### Error: Device Not Connected

```json
{
  "success": false,
  "error": {
    "code": "DEVICE_NOT_CONNECTED",
    "message": "Device is not connected to WhatsApp"
  }
}
```

**Solusi**: Check device health dan reconnect jika perlu

### Error: Invalid Phone Number

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid phone number format"
  }
}
```

**Solusi**: Format nomor yang benar (tanpa +, tanpa 0 di awal)

### Error: Message Too Long

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Message text exceeds maximum length of 10000 characters"
  }
}
```

**Solusi**: Split pesan menjadi beberapa bagian

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

**Solusi**: Tunggu beberapa saat, default: 100 req/min per tenant

## 💡 Best Practices

### 1. Message Formatting

```javascript
// Good
const message = {
  to: "628123456789",
  text: `*Informasi Pesanan*

Order ID: #12345
Status: Dikemas
Estimasi: 2 hari

Terima kasih! 🙏`
};

// Bad - terlalu panjang tanpa format
const message = {
  to: "628123456789",
  text: "Terima kasih sudah order. Order ID 12345. Status dikemas. Estimasi 2 hari. Terima kasih."
};
```

### 2. Error Handling

```javascript
async function sendMessage(deviceId, to, text) {
  try {
    const response = await fetch(`/v1/devices/${deviceId}/messages/text`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `msg-${to}-${Date.now()}`
      },
      body: JSON.stringify({ to, text })
    });
    
    if (!response.ok) {
      const error = await response.json();
      console.error('Failed to send:', error);
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('Network error:', error);
    return null;
  }
}
```

### 3. Retry Logic

```javascript
async function sendWithRetry(deviceId, to, text, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const result = await sendMessage(deviceId, to, text);
    if (result && result.success) {
      return result;
    }
    
    // Wait before retry
    await new Promise(r => setTimeout(r, 1000 * (i + 1)));
  }
  
  throw new Error('Failed after max retries');
}
```

## ⏭️ Langkah Selanjutnya

Setelah bisa mengirim pesan text:

1. **[Mengirim Media](09-tenant-send-media.md)** - Kirim gambar, video, audio
2. **[Mengirim Location](10-tenant-send-location.md)** - Kirim lokasi GPS
3. **[Chat Management](14-tenant-list-chats.md)** - Manage chats dan messages

---

**Prev**: [← Start Device & Pairing](07-tenant-start-device.md)  
**Next**: [Mengirim Media →](09-tenant-send-media.md)
