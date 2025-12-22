# Start Device & WhatsApp Pairing (Tenant)

This guide covers starting a device and pairing it with WhatsApp using QR code or pairing code.

## Prerequisites

- The admin has created the device
- You have:
  - `DEVICE_ID`
  - `TENANT_API_KEY`
- A phone with WhatsApp installed

## Method 1: QR Code (recommended)

### 1) Start the device

```bash
curl -X POST http://localhost:3000/v1/devices/DEVICE_ID/start \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

Example response:

```json
{
  "success": true,
  "data": {
    "message": "Device started",
    "status": "connecting"
  },
  "requestId": "req_abc123"
}
```

### 2) Request a QR code

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

### 3) Scan the QR code

In WhatsApp:

1. Open **Linked devices**
2. Choose **Link a device**
3. Scan the QR code

### 4) Verify connection

```bash
curl -X GET http://localhost:3000/v1/devices/DEVICE_ID/health \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

## Method 2: Pairing code (alternative)

### 1) Start the device

```bash
curl -X POST http://localhost:3000/v1/devices/DEVICE_ID/start \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

### 2) Request pairing code

Phone number format: international digits without `+`.

```bash
curl -X POST http://localhost:3000/v1/devices/DEVICE_ID/pairing/code \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "628123456789"
  }'
```

---

Indonesian reference: [../id/07-tenant-start-device.md](../id/07-tenant-start-device.md)
