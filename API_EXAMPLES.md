# API Testing Examples - Rijan WA Gateway

## Prerequisites

1. Start server: `npm run dev`
2. Get MASTER_KEY from .env file
3. Create tenant first to get API key

## Admin Endpoints

### 1. Create Tenant

```bash
curl -X POST http://localhost:3000/admin/tenants \
  -H "X-Master-Key: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Company"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tenant": {
      "id": "tenant_abc123...",
      "name": "Test Company",
      "status": "active",
      "created_at": 1703001234
    },
    "api_key": "tenant_abc123.1703001234.salt123.signature456",
    "warning": "Save this API key securely. It will not be shown again."
  }
}
```

**⚠️ IMPORTANT:** Save the `api_key` - you'll need it for all tenant endpoints!

---

### 2. Create Device for Tenant

```bash
curl -X POST http://localhost:3000/v1/admin/tenants/TENANT_ID/devices \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Customer Support Device"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "device": {
      "id": "device_xyz789...",
      "tenant_id": "tenant_abc123...",
      "label": "Customer Support Device",
      "status": "disconnected",
      "created_at": 1703001235
    }
  }
}
```

---

## Tenant Device Endpoints

### 3. List Devices

```bash
curl http://localhost:3000/v1/devices \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

---

### 4. Start Device

```bash
curl -X POST http://localhost:3000/v1/devices/DEVICE_ID/start \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Device started",
    "status": "connecting"
  }
}
```

---

### 5. Request QR Code for Pairing

```bash
curl -X POST http://localhost:3000/v1/devices/DEVICE_ID/pairing/qr \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "qr_code": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "expires_at": 1703001294,
    "message": "Scan QR code dengan WhatsApp di smartphone Anda"
  }
}
```

**Usage:** 
- Copy the `qr_code` base64 string
- Display in `<img>` tag: `<img src="data:image/png;base64,..." />`
- Or save to file and open

---

### 6. Request Pairing Code (Alternative Method)

```bash
curl -X POST http://localhost:3000/v1/devices/DEVICE_ID/pairing/code \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "628123456789"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "pairing_code": "ABCD-EFGH",
    "phone_number": "628123456789",
    "expires_at": 1703001294,
    "message": "Masukkan pairing code ini di WhatsApp > Linked Devices"
  }
}
```

**Usage:**
1. Open WhatsApp on smartphone
2. Go to Settings > Linked Devices
3. Tap "Link a Device"
4. Tap "Link with phone number instead"
5. Enter the pairing code

---

### 7. Check Device Health

```bash
curl http://localhost:3000/v1/devices/DEVICE_ID/health \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

**Response (Disconnected):**
```json
{
  "success": true,
  "data": {
    "is_connected": false,
    "status": "disconnected"
  }
}
```

**Response (Connected):**
```json
{
  "success": true,
  "data": {
    "is_connected": true,
    "status": "connected",
    "wa_jid": "628123456789@s.whatsapp.net",
    "phone_number": "628123456789",
    "last_connect_at": 1703001250,
    "uptime": 15000
  }
}
```

---

### 8. Get Device Detail

```bash
curl http://localhost:3000/v1/devices/DEVICE_ID \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

---

### 9. Stop Device

```bash
curl -X POST http://localhost:3000/v1/devices/DEVICE_ID/stop \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

---

### 10. Logout Device (Clear Session)

```bash
curl -X POST http://localhost:3000/v1/devices/DEVICE_ID/logout \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

**⚠️ WARNING:** This will disconnect the device and delete the session. You'll need to pair again.

---

## Complete Workflow Example

### Scenario: Setup New Device and Connect to WhatsApp

```bash
# Step 1: Create tenant (one time)
TENANT_RESPONSE=$(curl -s -X POST http://localhost:3000/admin/tenants \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Company"}')

TENANT_ID=$(echo $TENANT_RESPONSE | jq -r '.data.tenant.id')
API_KEY=$(echo $TENANT_RESPONSE | jq -r '.data.api_key')

echo "Tenant ID: $TENANT_ID"
echo "API Key: $API_KEY"

# Step 2: Create device
DEVICE_RESPONSE=$(curl -s -X POST "http://localhost:3000/v1/admin/tenants/$TENANT_ID/devices" \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"label": "Primary Device"}')

DEVICE_ID=$(echo $DEVICE_RESPONSE | jq -r '.data.device.id')
echo "Device ID: $DEVICE_ID"

# Step 3: Start device
curl -X POST "http://localhost:3000/v1/devices/$DEVICE_ID/start" \
  -H "Authorization: Bearer $API_KEY"

# Step 4: Get QR code
curl -X POST "http://localhost:3000/v1/devices/$DEVICE_ID/pairing/qr" \
  -H "Authorization: Bearer $API_KEY" | jq -r '.data.qr_code' > qr.txt

echo "QR Code saved to qr.txt - scan with WhatsApp!"

# Step 5: Monitor status
while true; do
  STATUS=$(curl -s "http://localhost:3000/v1/devices/$DEVICE_ID/health" \
    -H "Authorization: Bearer $API_KEY" | jq -r '.data.status')
  echo "Status: $STATUS"
  
  if [ "$STATUS" = "connected" ]; then
    echo "✅ Device connected!"
    break
  fi
  
  sleep 2
done
```

---

## Health Check

```bash
curl http://localhost:3000/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": 1703001234,
  "uptime": 123.45
}
```

---

## Error Responses

### Invalid API Key
```json
{
  "success": false,
  "error": {
    "code": "INVALID_API_KEY",
    "message": "Invalid API key"
  },
  "requestId": "abc123..."
}
```

### Device Not Found
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Device not found or access denied"
  },
  "requestId": "abc123..."
}
```

### Rate Limit
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded, retry after 60000"
  },
  "requestId": "abc123..."
}
```

---

## Tips

1. **Save API Keys Securely:** API keys are shown only once during tenant creation
2. **Device IDs in Path:** All device operations require deviceId in the URL path
3. **QR Code Expiry:** QR codes expire in ~60 seconds, request new one if needed
4. **Session Persistence:** Sessions survive server restarts (stored encrypted in DB)
5. **One Device = One WhatsApp Account:** Each deviceId connects to exactly one WA account
6. **Ownership Validation:** Tenants can only access their own devices (enforced automatically)

---

## OpenAPI Documentation

Full API documentation with interactive testing available at:
```
http://localhost:3000/docs
```
