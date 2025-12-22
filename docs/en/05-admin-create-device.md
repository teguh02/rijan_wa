# Create Device for Tenant (Admin)

A device represents one WhatsApp account.

## Endpoint

`POST /admin/tenants/:tenantId/devices`

Auth:

- `X-Master-Key: <plain_text_password>`

## Create a device

```bash
curl -X POST http://localhost:3000/admin/tenants/TENANT_ID/devices \
  -H "Content-Type: application/json" \
  -H "X-Master-Key: YOUR_PLAIN_TEXT_PASSWORD" \
  -d '{
    "label": "Customer Service Device"
  }'
```

Example response:

```json
{
  "success": true,
  "data": {
    "device": {
      "id": "device_xyz789abc123",
      "tenant_id": "tenant_abc123xyz789",
      "label": "Customer Service Device",
      "status": "disconnected",
      "created_at": 1703145600
    }
  }
}
```

---

Indonesian reference: [../id/05-admin-create-device.md](../id/05-admin-create-device.md)
