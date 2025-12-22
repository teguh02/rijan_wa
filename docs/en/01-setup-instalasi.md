# Setup & Installation

This document covers installation and first-time setup for Rijan WA Gateway.

## Fast Install (Linux) — Recommended

If you want the quickest setup (without installing Node.js), use the Linux installer script. It will:

- Detect and install Docker Engine + Docker Compose v2 (official repo) if needed
- Pull the Docker image `teguh02/rijan_wa` from Docker Hub
- Generate a fresh `.env` automatically
  - Create a random **master password** (12–20 characters)
  - Set `MASTER_KEY` to the **SHA256 hex hash (64 chars)** of that password
- Create a minimal `docker-compose.yml` (if missing)
- Start the service via `docker compose`

Download & run:

```bash
curl -fsSL https://raw.githubusercontent.com/teguh02/rijan_wa/refs/heads/main/scripts/installation/linux.sh -o rijan_wa-install.sh
chmod +x rijan_wa-install.sh
./rijan_wa-install.sh
```

## Fast Install (Windows)

For Windows, use the PowerShell installer. This script does **not** install Docker for you.
If Docker / Docker Compose is missing, the script stops with an error message and a Docker Desktop URL.

Download & run (PowerShell):

```powershell
Invoke-WebRequest -UseBasicParsing https://raw.githubusercontent.com/teguh02/rijan_wa/refs/heads/main/scripts/installation/windows.ps1 -OutFile rijan_wa-install.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\rijan_wa-install.ps1
```

Optional overrides:

```bash
RIJAN_WA_INSTALL_DIR=/opt/rijan_wa \
RIJAN_WA_IMAGE_TAG=1.3.6 \
RIJAN_WA_HOST_PORT=3000 \
RIJAN_WA_MASTER_PASSWORD_LEN=16 \
./rijan_wa-install.sh
```

Important notes:

- The script prints the **MASTER PASSWORD (plain text)**. Save it.
- For admin requests, you must send the plain password in the `X-Master-Key` header (not the hash).
- By default it publishes port `3000` on all interfaces (ready for a reverse proxy).

## Prerequisites

- Node.js: >= 18
- npm: >= 9
- OS: Linux/macOS/Windows
- RAM: 512MB minimum (1GB+ recommended)
- Tools: Git, terminal, and a REST client (cURL/Postman)

## Installation Steps

### 1) Clone the repository

```bash
git clone https://github.com/teguh02/rijan_wa.git
cd rijan_wa
```

### 2) Install dependencies

```bash
npm install
```

### 3) Configure environment variables

Copy `.env.example` to `.env`:

```bash
# Linux/macOS
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```

Edit `.env` (example):

```env
# Security
# MASTER_KEY is the SHA256 hash (64 hex chars) of your master password.
# You must send the *plain* master password in the X-Master-Key header.
MASTER_KEY=<sha256_hash>

# Server
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
TIMEZONE=Asia/Jakarta

# Database
DATABASE_PATH=./data/rijan_wa.db
```

### 4) Create the database directory

```powershell
New-Item -ItemType Directory -Force -Path data
```

### 5) Build

```bash
npm run build
```

### 6) Run and verify

```bash
npm run dev
```

Health check:

```bash
curl http://localhost:3000/health
```

Expected response (example):

```json
{
  "status": "alive",
  "timestamp": 1703145600000,
  "uptime": 5.123
}
```

---

Indonesian reference: [../id/01-setup-instalasi.md](../id/01-setup-instalasi.md)
