# Rijan WA Gateway

WhatsApp Gateway built on Baileys with multi-tenant + multi-device support.

## Quick Install (Linux)

Download and run the installer script:

```bash
curl -fsSL https://raw.githubusercontent.com/teguh02/rijan_wa/refs/heads/main/scripts/installation/linux.sh -o rijan_wa-install.sh
chmod +x rijan_wa-install.sh
./rijan_wa-install.sh
```

It will install Docker/Compose if needed, pull the image, generate `.env` (including a random master password + `MASTER_KEY` hash), and start the service.

## Quick Start (local)

### 1) Install

```bash
npm install
```

### 2) Configure `.env`

Create `.env` in the repo root (example):

```env
NODE_ENV=development
PORT=3000
MASTER_KEY=YOUR_GENERATED_MASTER_KEY_HERE
DATABASE_PATH=data/rijan_wa.db
LOG_LEVEL=info
TIMEZONE=Asia/Jakarta
```

### 3) Run

```bash
npm run dev
```

OpenAPI docs:

- http://localhost:3000/docs

### 4) Create tenant (Admin)

```bash
curl -X POST http://localhost:3000/admin/tenants \
  -H "X-Master-Key: YOUR_PLAIN_TEXT_MASTER_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Company"}'
```

### 5) Create device (Admin)

```bash
curl -X POST http://localhost:3000/admin/tenants/TENANT_ID/devices \
  -H "X-Master-Key: YOUR_PLAIN_TEXT_MASTER_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"label":"Customer Service"}'
```

### 6) Start device + request QR (Tenant)

```bash
curl -X POST http://localhost:3000/v1/devices/DEVICE_ID/start \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"

curl -X POST http://localhost:3000/v1/devices/DEVICE_ID/pairing/qr \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

### 7) Send first text (Tenant)

Note: `to` must be a WhatsApp JID (e.g. `628123456789@s.whatsapp.net`).

```bash
curl -X POST http://localhost:3000/v1/devices/DEVICE_ID/messages/text \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to":"628123456789@s.whatsapp.net","text":"Hello!"}'
```

## Documentation

- Language selector: [docs/README.md](docs/README.md)
- Indonesian docs: [docs/id/README.md](docs/id/README.md)
- English docs: [docs/en/README.md](docs/en/README.md)
