# Setup & Installation

This document covers installation and first-time setup for Rijan WA Gateway.

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
# Security - MASTER_KEY is a SHA256 hash of your master password
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
