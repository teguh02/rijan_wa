# Create Tenant (Admin)

A tenant is an isolated unit that can own multiple WhatsApp devices.

## Endpoint

`POST /admin/tenants`

Auth:

- `X-Master-Key: <plain_text_password>`

Important: the header uses the **plain text** master password. The server hashes it and compares it against `MASTER_KEY` in `.env`.

## Create a tenant

```bash
curl -X POST http://localhost:3000/admin/tenants \
  -H "Content-Type: application/json" \
  -H "X-Master-Key: YOUR_PLAIN_TEXT_PASSWORD" \
  -d '{
    "name": "Example Company"
  }'
```

Example success response:

```json
{
  "success": true,
  "data": {
    "tenant": {
      "id": "tenant_abc123xyz789",
      "name": "Example Company",
      "status": "active",
      "created_at": 1703145600,
      "updated_at": 1703145600
    },
    "api_key": "tenant_abc123xyz789.1703145600.365days...."
  },
  "message": "Tenant created successfully. Store the API key securely - it will not be shown again."
}
```

## Important: Store the API key

The API key is only shown once when the tenant is created.

---

Indonesian reference: [../id/04-admin-create-tenant.md](../id/04-admin-create-tenant.md)
