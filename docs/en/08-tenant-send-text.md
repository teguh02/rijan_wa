# Send Text Message (Tenant)

## Endpoint

`POST /v1/devices/:deviceId/messages/text`

## Headers

- `Authorization: Bearer <TENANT_API_KEY>`
- `Content-Type: application/json`

## Body

- `to` (required): WhatsApp JID, e.g. `628123456789@s.whatsapp.net` or group `1203...@g.us`
- `text` (required)
- `mentions` (optional): array of JIDs
- `quotedMessageId` (optional): internal message id to quote
- `idempotencyKey` (optional)

## Example

```bash
curl -X POST http://localhost:3000/v1/devices/DEVICE_ID/messages/text \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "628123456789@s.whatsapp.net",
    "text": "Hello!"
  }'
```

Example response:

```json
{
  "id": "msg_abc123",
  "messageId": "msg_abc123",
  "status": "pending",
  "timestamp": 1703145600
}
```

---

Indonesian reference: [../id/08-tenant-send-text.md](../id/08-tenant-send-text.md)
