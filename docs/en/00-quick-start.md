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

This gateway uses the following model:

- `.env` stores `MASTER_KEY` as a **SHA256 hex hash** (64 chars)
- Admin requests must send the **plain master password** in the `X-Master-Key` header

#### Option A (Linux/macOS): generate master password + hash

```bash
MASTER_PASSWORD="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 16)"
echo "MASTER PASSWORD: $MASTER_PASSWORD"
echo -n "$MASTER_PASSWORD" | sha256sum
```

#### Option B (Windows PowerShell): generate master password + hash

```powershell
$len = 16
$chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
$bytes = New-Object byte[] $len
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$masterPassword = -join ($bytes | ForEach-Object { $chars[ $_ % $chars.Length ] })
$masterKeyHash = (New-Object -TypeName System.Security.Cryptography.SHA256Managed).ComputeHash([System.Text.Encoding]::UTF8.GetBytes($masterPassword))
$masterKeyHex = ([System.BitConverter]::ToString($masterKeyHash) -replace '-', '').ToLower()
Write-Output ("MASTER PASSWORD: {0}" -f $masterPassword)
Write-Output ("MASTER_KEY (SHA256): {0}" -f $masterKeyHex)
```

Keep this key safe.

### Step 3: Configure `.env`

Create a `.env` file at the repository root:

```env
NODE_ENV=development
PORT=3000
MASTER_KEY=YOUR_GENERATED_MASTER_KEY_SHA256_HEX
DATABASE_PATH=data/rijan_wa.db
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

### 🧭 Ilustrasi Alur End-to-End (Admin → Tenant → Kirim Pesan)

Below is an overview of the **complete flow** from the initial system setup until a tenant can send messages.

**In short:**

1. **Admin creates a tenant** using `X-Master-Key` (the master password).
2. The system returns **`tenant_id` + `tenant_api_key`** (share these with the tenant).
3. **Admin creates a device** for that tenant → gets a **`device_id`**.
4. **Tenant starts the device** using `Authorization: Bearer tenant_api_key`.
5. The tenant requests a **QR code**, then scans it in WhatsApp (Linked devices) until the status becomes **`connected`**.
6. Once connected, the tenant can **send messages** via the messages endpoint.

Flowchart (image):

![End-to-end flowchart (Admin → Tenant → Send Message)](../assets/flowchart-end-to-end-en.png)

### Step 1: Create a tenant (Admin)

```bash
curl -X POST http://localhost:3000/admin/tenants \
  -H "X-Master-Key: YOUR_MASTER_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Company"
  }'
```

### Step 2: Create a device for the tenant (Admin)

Replace `TENANT_ID` with the tenant id from step 1:

```bash
curl -X POST http://localhost:3000/admin/tenants/TENANT_ID/devices \
  -H "X-Master-Key: YOUR_MASTER_PASSWORD" \
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

### Step 7: Connect WebSocket (Real-time updates)

Receive real-time events (new messages, chat updates) via WebSocket:

```bash
# Example using wscat
npx wscat -c "ws://localhost:3000/v1/devices/DEVICE_ID/chat-ws" -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

**Events to watch:**
- `chats.set`: Initial chat list
- `messages.upsert`: Incoming messages (includes simplified `content` field)
- `contacts.upsert`: Contact updates

## Next steps

- Read the full docs index: [README.md](README.md)
- Webhooks: [19-webhooks-configuration.md](19-webhooks-configuration.md)
- Troubleshooting: [30-troubleshooting.md](30-troubleshooting.md)

---

Indonesian reference: [../id/00-quick-start.md](../id/00-quick-start.md)
