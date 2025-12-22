# Webhook Configuration & Event Handling

Panduan lengkap untuk configure webhooks dan receive real-time events dari WhatsApp.

## 🎯 Overview

- 📱 Device status changes (connected, disconnected)

## \U0001f4e8 Event Types

- Tenant API Key tersedia
### 2. message.status (alias)
- Device sudah connected

Triggered when **sent message status** changes.

### Register Webhook
- `message.status` adalah alias untuk event status/receipt yang lebih spesifik: `message.updated`, `receipt.delivery`, `receipt.read`.
- Jika Anda subscribe `message.status`, Anda akan tetap menerima event-event tersebut.

```bash
### Verify Signature
  -H "Authorization: Bearer YOUR_TENANT_API_KEY" \
  -H "Content-Type: application/json" \
Setiap webhook request memiliki **signature header**:
    "url": "https://your-app.com/webhook/whatsapp",
X-Rijan-Signature: abc123...
      "message.received",
      "message.status",
      "device.connected",
      "device.disconnected"
function verifyWebhookSignature(payload, signature, secret) {
    "secret": "your-webhook-secret-key"
  }'
```

  return signature === expectedSignature;
{
  "success": true,
  "data": {
    "webhook_id": "wh_abc123xyz789",
  const signature = req.headers['x-rijan-signature'];
    "events": [
      "message.received",
      "message.status",
      "device.connected",
      "device.disconnected"
    ],
    "status": "active",
    "created_at": 1703145600
  }
}
```

### List Webhooks

```bash
curl -X GET http://localhost:3000/v1/webhooks \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

    $expectedSignature = hash_hmac('sha256', $payload, $secret);

```bash
curl -X PUT http://localhost:3000/v1/webhooks/wh_abc123xyz789 \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY" \
$signature = $_SERVER['HTTP_X_RIJAN_SIGNATURE'];
  -d '{
    "events": [
      "message.received",
      "message.status"
    ]
  }'
```

### Delete Webhook

```bash
curl -X DELETE http://localhost:3000/v1/webhooks/wh_abc123xyz789 \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

## 📨 Event Types

### 1. message.received

Triggered when tenant **receives** a message.

**Payload**:
```json
{
  "event": "message.received",
  "tenant_id": "tenant_abc123",
  "device_id": "device_xyz789",
  "timestamp": 1703145600,
  "data": {
    "message_id": "msg_received_123",
    "from": "628123456789@s.whatsapp.net",
    "from_me": false,
    "type": "text",
    "text": "Halo, saya tertarik dengan produk Anda.",
    "timestamp": 1703145600,
    "chat_id": "628123456789@s.whatsapp.net"
  }
}
```

### 2. message.status

Triggered when **sent message status** changes.

**Payload**:
```json
{
  "event": "message.status",
  "tenant_id": "tenant_abc123",
  "device_id": "device_xyz789",
  "timestamp": 1703145602,
  "data": {
    "message_id": "msg_sent_456",
    "to": "628123456789@s.whatsapp.net",
    "status": "delivered",
    "wa_message_id": "3EB0XXXXXX",
    "delivered_at": 1703145602
  }
}
```

**Status Values**:
- `sent`: Terkirim ke server WhatsApp
- `delivered`: Terkirim ke penerima
- `read`: Dibaca penerima
- `failed`: Gagal kirim

### 3. device.connected

Triggered when device **successfully connects** to WhatsApp.

**Payload**:
```json
{
  "event": "device.connected",
  "tenant_id": "tenant_abc123",
  "device_id": "device_xyz789",
  "timestamp": 1703145500,
  "data": {
    "phone_number": "628123456789",
    "wa_jid": "628123456789@s.whatsapp.net",
    "status": "connected"
  }
}
```

### 4. device.disconnected

Triggered when device **disconnects** from WhatsApp.

**Payload**:
```json
{
  "event": "device.disconnected",
  "tenant_id": "tenant_abc123",
  "device_id": "device_xyz789",
  "timestamp": 1703145700,
  "data": {
    "reason": "logout",
    "status": "disconnected"
  }
}
```

### 5. call.received

Triggered when device receives a call.

**Payload**:
```json
{
  "event": "call.received",
  "tenant_id": "tenant_abc123",
  "device_id": "device_xyz789",
  "timestamp": 1703145800,
  "data": {
    "call_id": "call_abc123",
    "from": "628123456789@s.whatsapp.net",
    "type": "voice",
    "status": "ringing"
  }
}
```

### 6. group.join

Triggered when someone **joins a group**.

**Payload**:
```json
{
  "event": "group.join",
  "tenant_id": "tenant_abc123",
  "device_id": "device_xyz789",
  "timestamp": 1703145900,
  "data": {
    "group_id": "120363XXXXXXXXXX@g.us",
    "participants": ["628123456789@s.whatsapp.net"],
    "added_by": "628987654321@s.whatsapp.net"
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
  console.log('Received event:', event.event);
  
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

## 🎯 Use Cases

### 1. Auto-Reply Bot

```javascript
app.post('/webhook/whatsapp', async (req, res) => {
  const event = req.body;
  
  if (event.event === 'message.received' && !event.data.from_me) {
    const { device_id } = event;
    const { from, text } = event.data;
    
    // Remove @s.whatsapp.net
    const phoneNumber = from.replace('@s.whatsapp.net', '');
    
    // Simple keyword detection
    if (text.toLowerCase().includes('harga')) {
      await sendReply(device_id, phoneNumber, 
        'Terima kasih atas pertanyaan Anda. Berikut daftar harga kami: ...');
    } else if (text.toLowerCase().includes('promo')) {
      await sendReply(device_id, phoneNumber, 
        'Promo bulan ini: Diskon 50% untuk semua produk!');
    } else {
      await sendReply(device_id, phoneNumber, 
        'Terima kasih telah menghubungi kami. CS kami akan segera merespon.');
    }
  }
  
  res.status(200).json({ received: true });
});

async function sendReply(deviceId, to, text) {
  await fetch(`http://localhost:3000/v1/devices/${deviceId}/messages/text`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TENANT_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ to, text })
  });
}
```

### 2. Message Status Tracking

```javascript
app.post('/webhook/whatsapp', async (req, res) => {
  const event = req.body;
  
  if (event.event === 'message.status') {
    const { message_id, status } = event.data;
    
    // Update database
    await db.messages.update(
      { message_id },
      { 
        status,
        delivered_at: event.data.delivered_at,
        read_at: event.data.read_at
      }
    );
    
    console.log(`Message ${message_id} status: ${status}`);
  }
  
  res.status(200).json({ received: true });
});
```

### 3. Device Monitoring

```javascript
app.post('/webhook/whatsapp', async (req, res) => {
  const event = req.body;
  
  if (event.event === 'device.disconnected') {
    const { device_id, tenant_id } = event;
    
    // Send alert to admin
    await sendAdminAlert({
      subject: `Device Disconnected: ${device_id}`,
      message: `Tenant ${tenant_id}'s device has been disconnected.`,
      priority: 'high'
    });
    
    // Attempt auto-reconnect
    await restartDevice(device_id);
  }
  
  res.status(200).json({ received: true });
});
```

### 4. Chat History Sync

```javascript
app.post('/webhook/whatsapp', async (req, res) => {
  const event = req.body;
  
  if (event.event === 'message.received') {
    const { device_id, data } = event;
    
    // Store in database
    await db.messages.create({
      device_id,
      message_id: data.message_id,
      from: data.from,
      type: data.type,
      content: data.text || data.caption || null,
      timestamp: data.timestamp,
      chat_id: data.chat_id
    });
  }
  
  res.status(200).json({ received: true });
});
```

## 🚨 Error Handling

### Webhook Delivery Failure

Jika webhook endpoint **gagal merespon** (non-200 status atau timeout):
- API akan **retry** hingga 3x dengan exponential backoff
- Jika semua retry gagal, event disimpan di **failed events queue**

### Get Failed Events

```bash
curl -X GET http://localhost:3000/v1/webhooks/failed \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

Response:
```json
{
  "success": true,
  "data": {
    "failed_events": [
      {
        "event_id": "evt_failed_123",
        "event": "message.received",
        "attempts": 3,
        "last_attempt": 1703145700,
        "error": "Connection timeout",
        "payload": {...}
      }
    ],
    "total": 1
  }
}
```

### Retry Failed Event

```bash
curl -X POST http://localhost:3000/v1/webhooks/failed/evt_failed_123/retry \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

## 💡 Best Practices

### 1. Return 200 Quickly

```javascript
// Good - respond immediately
app.post('/webhook', async (req, res) => {
  res.status(200).json({ received: true });
  
  // Process event asynchronously
  processEventAsync(req.body);
});

// Bad - slow response
app.post('/webhook', async (req, res) => {
  await slowDatabaseOperation();
  await callExternalAPI();
  res.status(200).json({ received: true });
});
```

### 2. Use Queue for Processing

```javascript
const queue = require('bull');
const webhookQueue = new queue('webhooks');

app.post('/webhook', async (req, res) => {
  // Add to queue
  await webhookQueue.add(req.body);
  res.status(200).json({ received: true });
});

// Process queue
webhookQueue.process(async (job) => {
  const event = job.data;
  // Process event...
});
```

### 3. Implement Idempotency

```javascript
const processedEvents = new Set();

app.post('/webhook', async (req, res) => {
  const eventId = req.body.event_id || generateEventId(req.body);
  
  if (processedEvents.has(eventId)) {
    // Already processed
    return res.status(200).json({ received: true, duplicate: true });
  }
  
  processedEvents.add(eventId);
  await processEvent(req.body);
  
  res.status(200).json({ received: true });
});
```

## 🧪 Testing Webhooks

### Ngrok untuk Local Development

```bash
# Install ngrok
# https://ngrok.com

# Start ngrok
ngrok http 3001

# Output:
# Forwarding https://abc123.ngrok.io -> http://localhost:3001

# Register webhook dengan ngrok URL
curl -X POST http://localhost:3000/v1/webhooks \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://abc123.ngrok.io/webhook/whatsapp",
    "events": ["message.received"]
  }'
```

### Test Webhook Manually

```bash
# Send test event
curl -X POST http://localhost:3000/v1/webhooks/wh_abc123/test \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

## ⏭️ Langkah Selanjutnya

1. **[Pull Events](20-tenant-pull-events.md)** - Alternative untuk webhooks (polling)
2. **[Group Management](23-tenant-group-operations.md)** - Manage WhatsApp groups
3. **[Health & Metrics](29-admin-health-metrics.md)** - Monitor system health

---

**Prev**: [← Chat Management](18-tenant-chat-management.md)  
**Next**: [Pull Events →](20-tenant-pull-events.md)
