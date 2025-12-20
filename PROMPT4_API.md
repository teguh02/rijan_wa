# Rijan WA Gateway API - PROMPT 4 Documentation

## Webhook System

### Register Webhook
```bash
curl -X POST http://localhost:3000/v1/webhooks \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-server.com/webhooks/rijan",
    "events": ["message.received", "group.updated", "receipt.read"],
    "secret": "your-webhook-secret",
    "retryCount": 3,
    "timeout": 5000
  }'
```

### List Webhooks
```bash
curl http://localhost:3000/v1/webhooks \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Get Webhook Details
```bash
curl http://localhost:3000/v1/webhooks/:webhookId \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Update Webhook
```bash
curl -X PUT http://localhost:3000/v1/webhooks/:webhookId \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "events": ["message.received", "message.updated"],
    "retryCount": 5
  }'
```

### Delete Webhook
```bash
curl -X DELETE http://localhost:3000/v1/webhooks/:webhookId \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Webhook Payload Format
```json
{
  "id": "message-id-123",
  "eventType": "message.received",
  "tenantId": "tenant-123",
  "deviceId": "device-456",
  "timestamp": 1703081234,
  "data": { ... }
}
```

### Webhook Signature Verification
Headers received:
- `X-Rijan-Signature`: HMAC-SHA256(body, webhookSecret) in hex
- `X-Rijan-Attempt`: Integer attempt number (1-3)

Verify signature in Node.js:
```javascript
import crypto from 'crypto';

function verifySignature(body, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return expected === signature;
}
```

## Inbound Events

### Pull Events by Device
```bash
curl "http://localhost:3000/v1/devices/device-123/events?since=1703081234&type=messages.upsert&limit=50" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Query Parameters:
- `since` (optional): Unix timestamp in seconds. Return events after this time.
- `type` (optional): Event type filter (messages.upsert, groups.update, etc.)
- `limit` (optional): Max results per query (default 100, max 500)

Response:
```json
[
  {
    "id": "event-id-1",
    "type": "messages.upsert",
    "payload": { ... },
    "receivedAt": 1703081234
  }
]
```

## Group Management

### Create Group
```bash
curl -X POST http://localhost:3000/v1/devices/device-123/groups/create \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "My Awesome Group",
    "participants": ["1234567890", "9876543210", "contacts@s.whatsapp.net"]
  }'
```

Response:
```json
{
  "groupJid": "120363024634816502@g.us",
  "subject": "My Awesome Group"
}
```

### Get Group Info
```bash
curl "http://localhost:3000/v1/devices/device-123/groups/120363024634816502@g.us" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Response:
```json
{
  "id": "120363024634816502@g.us",
  "subject": "My Awesome Group",
  "owner": "1234567890@s.whatsapp.net",
  "participants": [
    {
      "id": "1234567890@s.whatsapp.net",
      "admin": "admin",
      "isSelf": true
    }
  ],
  "creation": 1703081234
}
```

### Add Participants to Group
```bash
curl -X POST "http://localhost:3000/v1/devices/device-123/groups/120363024634816502@g.us/participants/add" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "participants": ["1111111111", "2222222222"]
  }'
```

### Remove Participants from Group
```bash
curl -X POST "http://localhost:3000/v1/devices/device-123/groups/120363024634816502@g.us/participants/remove" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "participants": ["1111111111"]
  }'
```

## Privacy Settings

### Get Privacy Settings
```bash
curl "http://localhost:3000/v1/devices/device-123/privacy/settings" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Response:
```json
{
  "readreceipts": "all",
  "online": "all",
  "lastSeen": "contacts",
  "groupAdd": "contacts",
  "statusPrivacy": "all"
}
```

### Update Privacy Settings
```bash
curl -X POST "http://localhost:3000/v1/devices/device-123/privacy/settings" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "readreceipts": "all",
    "lastSeen": "none",
    "groupAdd": "none"
  }'
```

Response:
```json
{
  "success": true,
  "updated": ["lastSeen", "groupAdd"]
}
```

## Health & Metrics

### Liveness Check
```bash
curl http://localhost:3000/health
```

Response (always 200):
```json
{
  "status": "alive",
  "timestamp": 1703081234,
  "uptime": 3600.5
}
```

### Readiness Check
```bash
curl http://localhost:3000/ready
```

Response (200 or 503):
```json
{
  "ready": true,
  "db": true,
  "worker": true,
  "timestamp": 1703081234
}
```

### Metrics (Prometheus Format)
```bash
curl http://localhost:3000/metrics
```

Sample output:
```
# HELP rijan_devices_connected Connected WhatsApp devices
# TYPE rijan_devices_connected gauge
rijan_devices_connected 5

# HELP rijan_messages_sent Total messages sent
# TYPE rijan_messages_sent counter
rijan_messages_sent 1250

# HELP rijan_webhooks_failed Failed webhook deliveries (DLQ)
# TYPE rijan_webhooks_failed gauge
rijan_webhooks_failed 2

process_uptime_seconds 86400
```

## Audit Logs

Access audit logs via direct database query (future API endpoint):

```sql
SELECT * FROM audit_logs 
WHERE tenant_id = 'your-tenant-id'
ORDER BY created_at DESC
LIMIT 100;
```

Audit log entry structure:
- `id`: Unique audit log ID
- `tenant_id`: Tenant who performed action
- `actor`: "device:device-id" or user identifier
- `action`: "group.created", "group.participant.added", "privacy.settings.updated", etc.
- `resource_type`: "group", "privacy", "device", etc.
- `resource_id`: ID of affected resource
- `meta`: JSON object with additional context
- `ip_address`: IP address of request
- `user_agent`: HTTP user agent
- `created_at`: Unix timestamp

## Webhook Event Types

| Event Type | Triggered When | Payload |
|---|---|---|
| `message.received` | Incoming message | Full message object |
| `message.updated` | Message edited | Message update object |
| `message.deleted` | Message deleted | Message key + delete info |
| `receipt.delivery` | Message delivered to server | Receipt update |
| `receipt.read` | Message read by recipient | Receipt update |
| `group.created` | Group created | Group info |
| `group.updated` | Group settings changed | Group update object |
| `group.deleted` | Group deleted | Group ID |
| `participant.added` | Users added to group | Participant update |
| `participant.removed` | Users removed from group | Participant update |
| `contact.updated` | Contact info changed | Contact object |
| `device.connected` | Device connected to WhatsApp | Device state |
| `device.disconnected` | Device disconnected | Device state |

## Error Handling

All endpoints return consistent error format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message"
  },
  "requestId": "req-123-456"
}
```

Common error codes:
- `VALIDATION_ERROR` - Invalid input parameters
- `DEVICE_NOT_CONNECTED` - Device not connected to WhatsApp
- `DEVICE_NOT_FOUND` - Device does not exist
- `WEBHOOK_NOT_FOUND` - Webhook does not exist
- `UNAUTHORIZED` - Invalid or missing API key
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `INTERNAL_SERVER_ERROR` - Server error

## Rate Limiting

- Default: 100 requests per 60 seconds per tenant
- Configurable via environment variables:
  - `RATE_LIMIT_MAX`: Maximum requests per window
  - `RATE_LIMIT_WINDOW`: Window duration in milliseconds

Rate limit headers:
- `X-RateLimit-Limit`: Maximum requests in window
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Unix timestamp when limit resets

## Multi-Instance Deployment

For multi-instance deployment:

1. Set unique `INSTANCE_ID` per instance (or auto-generated UUID)
2. All instances must share same database
3. Distributed locks ensure only one instance controls a device socket
4. Lock TTL: 5 minutes (automatically refreshed)
5. Lock acquisition timeout: 5 seconds

Environment variable:
```bash
INSTANCE_ID=instance-1-prod
```

## Configuration

Environment variables:

```bash
# Server
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# Security
MASTER_KEY=<64-char hex SHA256 hash>
ENCRYPTION_ALGORITHM=aes-256-gcm

# Database
DATABASE_PATH=/data/rijan_wa.db

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000

# Multi-Instance
INSTANCE_ID=<auto-generated UUID if not set>
```

## Database Schema

Key tables created by PROMPT 4:

- `event_logs` - All inbound Baileys events
- `webhooks` - Registered webhooks per tenant
- `webhook_logs` - Webhook delivery history
- `dlq` - Dead letter queue for failed webhooks
- `device_locks` - Distributed locks for multi-instance
- `audit_logs` - Audit trail for sensitive operations

All migrations run automatically on server start.
