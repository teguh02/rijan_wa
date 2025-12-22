# List Chats

This endpoint returns the chat list for a device based on data stored in SQLite.

Chat data is populated from Baileys events:
- `messaging-history.set` (initial hydration)
- `chats.upsert`, `chats.update`, `chats.delete` (incremental updates)

## Endpoint

`GET /v1/devices/:deviceId/chats?limit=50&offset=0`

## Headers

- `Authorization: Bearer <TENANT_API_KEY>`

## Query Params

- `limit` (optional): default 50, max 200
- `offset` (optional): default 0

## Response (200)

```json
{
  "synced": true,
  "lastHistorySyncAt": 1730000000,
  "count": 123,
  "limit": 50,
  "offset": 0,
  "chats": [
    {
      "jid": "62812xxxx@s.whatsapp.net",
      "name": "Contact Name",
      "isGroup": false,
      "unreadCount": 0,
      "lastMessageTime": 1730000000,
      "archived": false,
      "muted": false
    }
  ]
}
```

## Troubleshooting

If `synced=false` or `chats` is empty, check the debug endpoint:

`GET /v1/devices/:deviceId/debug/chats-sync`

---

Indonesian reference: [../id/14-tenant-list-chats.md](../id/14-tenant-list-chats.md)
