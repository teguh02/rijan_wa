# Konfigurasi Webhook & Event Handling

Panduan untuk mendaftarkan webhook dan menerima event secara real-time dari WhatsApp.

## 🎯 Overview

- Tenant dapat mendaftarkan 1+ webhook URL.
- Gateway akan melakukan HTTP `POST` ke URL tersebut saat event terjadi.
- Setiap request webhook ditandatangani dengan HMAC-SHA256 melalui header `X-Rijan-Signature`.
- Delivery memiliki retry (best-effort) + DLQ (Dead Letter Queue) jika gagal berulang.

## ✅ Prerequisites

- Anda sudah punya **Tenant API Key** (didapat dari admin saat membuat tenant).

## 🔧 Manage Webhooks (Tenant API Key)

Semua endpoint berikut butuh header:

```
Authorization: Bearer YOUR_TENANT_API_KEY
```

### Register Webhook

`POST /v1/webhooks`

Body:
- `url` (wajib)
- `events` (wajib, minimal 1)
- `secret` (opsional, disarankan Anda set sendiri)
- `retryCount` (opsional, default 3)
- `timeout` (opsional, default 5000ms)

```bash
curl -X POST http://localhost:3000/v1/webhooks \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhook/whatsapp",
    "events": ["message.received", "message.status"],
    "secret": "your-webhook-secret-key",
    "retryCount": 3,
    "timeout": 5000
  }'
```

Response (201) (ringkas):
```json
{
  "id": "wh_abc123xyz789",
  "url": "https://your-app.com/webhook/whatsapp",
  "events": ["message.received", "message.status"],
  "enabled": true
}
```

### List Webhooks

`GET /v1/webhooks`

```bash
curl -X GET http://localhost:3000/v1/webhooks \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

### Get Webhook

`GET /v1/webhooks/:id`

```bash
curl -X GET http://localhost:3000/v1/webhooks/wh_abc123xyz789 \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

### Update Webhook

`PUT /v1/webhooks/:id`

```bash
curl -X PUT http://localhost:3000/v1/webhooks/wh_abc123xyz789 \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": ["message.received", "message.status"],
    "enabled": true
  }'
```

### Delete Webhook

`DELETE /v1/webhooks/:id`

```bash
curl -X DELETE http://localhost:3000/v1/webhooks/wh_abc123xyz789 \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

## 📨 Event Types

Semua webhook payload mengikuti format berikut:

```json
{
  "id": "evt_abc123",
  "eventType": "message.received",
  "tenantId": "tenant_abc123",
  "deviceId": "device_xyz789",
  "timestamp": 1703145600,
  "data": {}
}
```

Header yang dikirim ke endpoint Anda:
- `X-Rijan-Signature`: HMAC-SHA256 dari body JSON (hex)
- `X-Rijan-Attempt`: nomor attempt (mulai dari 1)

### Nilai `eventType` yang digunakan

Event yang saat ini dipublish oleh gateway:
- `message.received`
- `message.updated`
- `receipt.delivery`
- `receipt.read`
- `device.connected`
- `device.disconnected`
- `group.updated`
- `participant.added`
- `participant.removed`

Event tambahan yang ada di tipe internal (namun belum selalu dipublish):
- `message.deleted`
- `group.created`
- `group.deleted`
- `contact.updated`

### Alias: `message.status`

Untuk kompatibilitas, Anda dapat subscribe `message.status`.
Jika webhook Anda berlangganan `message.status`, gateway akan mengirim:
- `message.updated`
- `receipt.delivery`
- `receipt.read`

### Contoh: `message.received`

Catatan: `data` berisi payload Baileys (raw) untuk message inbound.

```json
{
  "id": "3EB0XXXXXX",
  "eventType": "message.received",
  "tenantId": "tenant_abc123",
  "deviceId": "device_xyz789",
  "timestamp": 1703145600,
  "data": {
    "key": {
      "remoteJid": "628123456789@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0XXXXXX"
    },
    "message": {
      "conversation": "Halo"
    }
  }
}
```

### Contoh: `device.connected`

```json
{
  "id": "device-connected-device_xyz789-1703145600000",
  "eventType": "device.connected",
  "tenantId": "tenant_abc123",
  "deviceId": "device_xyz789",
  "timestamp": 1703145600,
  "data": {
    "deviceId": "device_xyz789",
    "waJid": "628123456789:1@s.whatsapp.net",
    "phoneNumber": "628123456789",
    "status": "connected"
  }
}
```

### Contoh: `device.disconnected`

```json
{
  "id": "device-disconnected-device_xyz789-1703145600000",
  "eventType": "device.disconnected",
  "tenantId": "tenant_abc123",
  "deviceId": "device_xyz789",
  "timestamp": 1703145600,
  "data": {
    "deviceId": "device_xyz789",
    "status": "disconnected",
    "reason": "logout"
  }
}
```

## 🔒 Webhook Security

### Optional: Shared Token (Query/Path)

Selain verifikasi signature, beberapa aplikasi penerima webhook biasanya menambahkan **parameter pengaman tambahan** (shared token) agar endpoint webhook **langsung menolak** request yang tidak membawa token tersebut.

Karena gateway ini akan mengirim request ke `url` yang Anda simpan apa adanya, cara paling sederhana (tanpa perubahan kode di gateway) adalah menyisipkan token di **query string** atau **path**.

Contoh URL (query param):

```text
https://your-app.com/webhook/whatsapp?token=YOUR_SHARED_TOKEN
```

Contoh URL (token di path):

```text
https://your-app.com/webhook/whatsapp/YOUR_SHARED_TOKEN
```

Di aplikasi penerima, validasi token dulu. Jika token tidak ada/salah, balas `401/403`.

> Rekomendasi: token ini hanya “gate” tambahan. Proteksi utama tetap **HMAC signature** (`X-Rijan-Signature`).

### Verify Signature

Setiap webhook request memiliki **signature header**:

```
X-Rijan-Signature: abc123...
```

**Verify di aplikasi Anda**:

```javascript
const crypto = require('crypto');

// Optional shared token gate
const EXPECTED_TOKEN = process.env.WEBHOOK_TOKEN;

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
    
  return signature === expectedSignature;
}

// Express.js example
app.post('/webhook/whatsapp', (req, res) => {
  // 1) Optional: shared token gate (query)
  if (EXPECTED_TOKEN) {
    const token = req.query.token;
    if (token !== EXPECTED_TOKEN) {
      return res.status(401).json({ error: 'Invalid webhook token' });
    }
  }

  // 2) Verify signature
  const signature = req.headers['x-rijan-signature'];
  const secret = 'your-webhook-secret-key';
  
  if (!verifyWebhookSignature(req.body, signature, secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // Process webhook...
  const event = req.body;
  console.log('Received event:', event.eventType);
  
  res.status(200).json({ received: true });
});
```

### PHP Example

```php
<?php
function verifyWebhookSignature($payload, $signature, $secret) {
  $expectedSignature = hash_hmac('sha256', $payload, $secret);
    return hash_equals($signature, $expectedSignature);
}

$payload = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_RIJAN_SIGNATURE'];
$secret = 'your-webhook-secret-key';

// Optional shared token gate (query)
$expectedToken = getenv('WEBHOOK_TOKEN');
if ($expectedToken) {
  $token = $_GET['token'] ?? null;
  if ($token !== $expectedToken) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid webhook token']);
    exit;
  }
}

if (!verifyWebhookSignature($payload, $signature, $secret)) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid signature']);
    exit;
}

$event = json_decode($payload, true);
// Process event...

http_response_code(200);
echo json_encode(['received' => true]);
?>
```

## 🎯 Contoh Use Case

### 1) Auto-reply sederhana

```javascript
app.post('/webhook/whatsapp', async (req, res) => {
  // Pastikan Anda sudah melakukan verifikasi signature terlebih dahulu
  const evt = req.body;

  if (evt.eventType === 'message.received') {
    const deviceId = evt.deviceId;
    const remoteJid = evt.data?.key?.remoteJid;
    const text = evt.data?.message?.conversation || evt.data?.message?.extendedTextMessage?.text;

    if (deviceId && remoteJid && text) {
      if (text.toLowerCase().includes('harga')) {
        await sendText(deviceId, remoteJid, 'Terima kasih, berikut info harga kami: ...');
      }
    }
  }

  // Response cepat; proses berat sebaiknya async
  return res.status(200).json({ received: true });
});

async function sendText(deviceId, toJid, text) {
  await fetch(`http://localhost:3000/v1/devices/${deviceId}/messages/text`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.TENANT_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to: toJid, text }),
  });
}
```

### 2) Tracking status kirim (subscribe `message.status`)

Jika Anda subscribe `message.status`, Anda akan menerima `receipt.delivery`, `receipt.read`, dan `message.updated`.
Payload `data` berisi struktur update/receipt dari Baileys; simpan `evt.id` sebagai kunci idempotency.

## 🚨 Delivery, Retry, dan DLQ

- Gateway akan retry saat mendapat status `>= 500`, `429`, atau timeout.
- Default retry count: `3` (bisa diubah per webhook via `retryCount`).
- Backoff (ms): `1000`, `5000`, `15000`.
- Jika tetap gagal setelah max retries, payload akan disimpan ke **DLQ** (SQLite table `dlq`).

Catatan:
- Saat ini tidak ada endpoint tenant khusus untuk membaca/mereplay DLQ.
- Jumlah item DLQ bisa dimonitor dari admin metrics (lihat [docs/id/29-admin-health-metrics.md](29-admin-health-metrics.md)).

## 💡 Best Practices

- Balas `2xx` secepat mungkin; proses event di background/queue.
- Implement idempotency menggunakan field `id` pada payload.
- Verifikasi `X-Rijan-Signature` (jangan hanya rely pada shared token).

## 🧪 Testing

- Untuk development lokal, gunakan `ngrok` lalu daftarkan URL ngrok sebagai webhook.
- Untuk test handler Anda, Anda bisa mengirim payload contoh (dari bagian Event Types) langsung ke endpoint webhook aplikasi Anda.
