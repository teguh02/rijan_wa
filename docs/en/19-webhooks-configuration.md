# Webhook Configuration & Event Handling

This guide explains how to register webhooks and receive real-time WhatsApp events.

## Overview

- A tenant can register one or more webhook URLs.
- The gateway will send HTTP `POST` requests to your URL when an event occurs.
- Every webhook request is signed using HMAC-SHA256 via `X-Rijan-Signature`.
- Delivery is best-effort with retries and a DLQ (Dead Letter Queue) on repeated failures.

## Prerequisites

- You already have a **Tenant API Key** (generated when the admin creates a tenant).

## Manage Webhooks (Tenant API Key)

All endpoints below require:

```
Authorization: Bearer YOUR_TENANT_API_KEY
```

### Register Webhook

`POST /v1/webhooks`

Body:
- `url` (required)
- `events` (required, at least 1)
- `secret` (optional, recommended to set explicitly)
- `retryCount` (optional, default 3)
- `timeout` (optional, default 5000ms)

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

Response (201) (short form):
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

## Event Types

All webhook payloads share this shape:

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

Headers sent to your endpoint:
- `X-Rijan-Signature`: HMAC-SHA256 of the JSON body (hex)
- `X-Rijan-Attempt`: attempt number (starts at 1)

### `eventType` values

Events currently published by the gateway:
- `message.received`
- `message.updated`
- `receipt.delivery`
- `receipt.read`
- `device.connected`
- `device.disconnected`
- `group.updated`
- `participant.added`
- `participant.removed`

Additional internal event types (may not always be published yet):
- `message.deleted`
- `group.created`
- `group.deleted`
- `contact.updated`

### Alias: `message.status`

For backward compatibility you can subscribe to `message.status`.
If a webhook subscribes to `message.status`, the gateway will also deliver:
- `message.updated`
- `receipt.delivery`
- `receipt.read`

### Example: `message.received`

Note: `data` contains the raw Baileys inbound payload.

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
      "conversation": "Hello"
    }
  }
}
```

### Example: `device.connected`

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

### Example: `device.disconnected`

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

## Webhook Security

### Optional: Shared Token (Query/Path)

In addition to signature verification, you can add a shared token to quickly reject requests that do not carry the token.
Because the gateway will call the `url` you store “as-is”, the simplest option is embedding the token in the query string or path.

Query param example:

```text
https://your-app.com/webhook/whatsapp?token=YOUR_SHARED_TOKEN
```

Path example:

```text
https://your-app.com/webhook/whatsapp/YOUR_SHARED_TOKEN
```

Validate the token first and return `401/403` when invalid.

> Recommendation: treat the shared token as an extra gate. The main protection should still be HMAC signature (`X-Rijan-Signature`).

### Verify Signature (Node.js)

```javascript
const crypto = require('crypto');

function signPayload(payload, secret) {
  return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

function verifySignature(payload, signature, secret) {
  const expected = signPayload(payload, secret);
  return signature === expected;
}

app.post('/webhook/whatsapp', (req, res) => {
  const signature = req.headers['x-rijan-signature'];
  const secret = process.env.WEBHOOK_SECRET;

  if (!verifySignature(req.body, signature, secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.body;
  console.log('Received event:', event.eventType);
  return res.status(200).json({ received: true });
});
```

### Verify Signature (PHP)

```php
<?php
function verifyWebhookSignature($payload, $signature, $secret) {
  $expectedSignature = hash_hmac('sha256', $payload, $secret);
  return hash_equals($signature, $expectedSignature);
}

$payload = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_RIJAN_SIGNATURE'];
$secret = getenv('WEBHOOK_SECRET');

if (!verifyWebhookSignature($payload, $signature, $secret)) {
  http_response_code(401);
  echo json_encode(['error' => 'Invalid signature']);
  exit;
}

http_response_code(200);
echo json_encode(['received' => true]);
?>
```

## Example Use Cases

### 1) Simple auto-reply

```javascript
app.post('/webhook/whatsapp', async (req, res) => {
  const evt = req.body;

  if (evt.eventType === 'message.received') {
    const deviceId = evt.deviceId;
    const remoteJid = evt.data?.key?.remoteJid;
    const text = evt.data?.message?.conversation || evt.data?.message?.extendedTextMessage?.text;

    if (deviceId && remoteJid && text && text.toLowerCase().includes('price')) {
      await sendText(deviceId, remoteJid, 'Thanks — here is our price list: ...');
    }
  }

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

### 2) Status tracking (subscribe `message.status`)

If you subscribe to `message.status`, you will receive `receipt.delivery`, `receipt.read`, and `message.updated`.
The `data` field contains the raw Baileys structure. Store `evt.id` and implement idempotent processing.

## Delivery, Retry, and DLQ

- The gateway retries when your endpoint returns `>= 500`, `429`, or times out.
- Default retry count: `3` (configurable via `retryCount`).
- Backoff (ms): `1000`, `5000`, `15000`.
- After max retries, the payload is stored in the SQLite **DLQ** table (`dlq`).

Notes:
- There is currently no tenant API endpoint to fetch/replay DLQ entries.
- You can monitor DLQ counts via admin metrics: [29-admin-health-metrics.md](29-admin-health-metrics.md).

## Best Practices

- Return `2xx` quickly; process asynchronously via a queue.
- Implement idempotency using the payload `id`.
- Verify `X-Rijan-Signature` (do not rely on shared token only).

## Testing

- For local development, use `ngrok` and register the ngrok URL as your webhook.
- To test your receiver, post the sample payloads from this document to your own webhook endpoint.

---

Indonesian reference: [../id/19-webhooks-configuration.md](../id/19-webhooks-configuration.md)
