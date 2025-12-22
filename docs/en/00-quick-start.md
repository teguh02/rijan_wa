# Quick Start

A fast guide to start using Rijan WA Gateway in ~5 minutes.

## Initial Setup

### Step 1: Install dependencies

From the project folder:

```bash
cd rijan_wa
npm install
```

### Step 2: Generate a Master Key (Admin key)

Generate a 32-byte random value in Windows PowerShell:

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RNGCryptoServiceProvider]::Create().GetBytes($bytes)
$masterKey = [System.BitConverter]::ToString($bytes) -replace '-'
Write-Output $masterKey
```

Keep this key safe.

### Step 3: Configure `.env`

Create a `.env` file at the repository root:

```env
NODE_ENV=development
PORT=3000
MASTER_KEY=YOUR_GENERATED_MASTER_KEY_HERE
DATABASE_URL=data/app.db
LOG_LEVEL=info
TIMEZONE=Asia/Jakarta
```

### Step 4: Run the server

```bash
npm run dev
```

If successful:

```
INFO: Server listening at http://localhost:3000
```

## Quick Test Flow

### Step 1: Create a tenant (Admin)

```bash
curl -X POST http://localhost:3000/admin/tenants \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Company"
  }'
```

### Step 2: Create a device for the tenant (Admin)

Replace `TENANT_ID` with the tenant id from step 1:

```bash
curl -X POST http://localhost:3000/admin/tenants/TENANT_ID/devices \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Customer Service"
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
      "label": "Customer Service",
      "status": "disconnected",
      "created_at": 1703145600
    }
  }
}
```

### Step 3: Start the device (Tenant)

```bash
curl -X POST http://localhost:3000/v1/devices/DEVICE_ID/start \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

### Step 4: Request QR code (Tenant)

```bash
curl -X POST http://localhost:3000/v1/devices/DEVICE_ID/pairing/qr \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

Example response:

```json
{
  "success": true,
  "data": {
    "qr_code": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...",
    "expires_at": 1703145660000,
    "message": "Scan the QR code with WhatsApp on your smartphone"
  },
  "requestId": "req_def456"
}
```

### Step 5: Scan the QR code

1. Open WhatsApp on your phone
2. Go to **Linked devices**
3. Scan the QR code

Once pairing succeeds, the device becomes **connected**.

### Step 6 (Bonus): Send your first text message (Tenant)

Important: the `to` field must be a WhatsApp JID (e.g. `628123456789@s.whatsapp.net`).

```bash
curl -X POST http://localhost:3000/v1/devices/DEVICE_ID/messages/text \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "628123456789@s.whatsapp.net",
    "text": "Hello from Rijan WA Gateway!"
  }'
```

Example response:

```json
{
  "id": "msg_abc123xyz789",
  "messageId": "msg_abc123xyz789",
  "status": "pending",
  "timestamp": 1703145600
}
```

## Next steps

- Read the full docs index: [README.md](README.md)
- Webhooks: [19-webhooks-configuration.md](19-webhooks-configuration.md)
- Troubleshooting: [30-troubleshooting.md](30-troubleshooting.md)

---

Indonesian reference: [../id/00-quick-start.md](../id/00-quick-start.md)
