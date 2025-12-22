# List Chats

Endpoint ini mengembalikan daftar chat untuk device berdasarkan data yang tersimpan di SQLite.

Data chat akan dipopulasi dari Baileys melalui:
- `messaging-history.set` (History Sync) untuk initial hydration
- `chats.upsert`, `chats.update`, `chats.delete` untuk update incremental

## Endpoint

`GET /v1/devices/:deviceId/chats?limit=50&offset=0`

## Headers

- `Authorization: Bearer <TENANT_API_KEY>`

## Query Params

- `limit` (opsional) default 50, max 200
- `offset` (opsional) default 0

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
      "name": "Nama Kontak",
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

Jika `synced=false` atau `chats` kosong, cek endpoint debug:

`GET /v1/devices/:deviceId/debug/chats-sync`
