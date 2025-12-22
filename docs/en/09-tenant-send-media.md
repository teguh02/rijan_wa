# Send Media Message (Tenant)

This endpoint sends images, videos, audio, or documents.

## Endpoint

`POST /v1/devices/:deviceId/messages/media`

## Headers

- `Authorization: Bearer <TENANT_API_KEY>`
- `Content-Type: application/json`

## Body

- `to` (required): recipient JID (e.g. `628123456789@s.whatsapp.net`)
- `mediaType` (optional, recommended): `image` | `video` | `audio` | `document`
- `mediaUrl` (required if `mediaBuffer` is not provided)
- `mediaBuffer` (required if `mediaUrl` is not provided): base64
- `mimeType` (optional)
- `caption` (optional)
- `fileName` (optional, for documents)
- `quotedMessageId` (optional)
- `idempotencyKey` (optional)

Note: you must provide exactly one of `mediaUrl` or `mediaBuffer`.

## Example (image by URL)

```bash
curl -X POST http://localhost:3000/v1/devices/DEVICE_ID/messages/media \
	-H "Authorization: Bearer YOUR_TENANT_API_KEY" \
	-H "Content-Type: application/json" \
	-d '{
		"to": "628123456789@s.whatsapp.net",
		"mediaType": "image",
		"mediaUrl": "https://example.com/image.jpg",
		"mimeType": "image/jpeg",
		"caption": "Hello!"
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

Indonesian reference: [../id/09-tenant-send-media.md](../id/09-tenant-send-media.md)
