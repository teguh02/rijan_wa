# Setup dan Instalasi

Panduan lengkap untuk menginstall dan setup Rijan WA Gateway.

## ⚡ Instalasi Cepat (Linux) — Recommended

Jika kamu ingin instalasi paling cepat (tanpa perlu install Node.js), gunakan skrip installer Linux. Skrip ini akan:

- Mengecek apakah Docker + Docker Compose v2 sudah ter-install (kalau belum: install otomatis via repo resmi)
- Pull image `teguh02/rijan_wa` dari Docker Hub
- Membuat file `.env` baru otomatis
  - Generate **MASTER PASSWORD** acak (12–20 karakter)
  - Set `MASTER_KEY` sebagai **SHA256 hash (64 hex)** dari master password
- Membuat `docker-compose.yml` minimal (jika belum ada)
- Menjalankan service sampai container up (best-effort menunggu healthcheck)

Download & jalankan:

```bash
curl -fsSL https://raw.githubusercontent.com/teguh02/rijan_wa/refs/heads/main/scripts/installation/linux.sh -o rijan_wa-install.sh
chmod +x rijan_wa-install.sh
./rijan_wa-install.sh
```

Opsi (opsional):

```bash
# contoh: install ke /opt/rijan_wa dan pakai tag image tertentu
RIJAN_WA_INSTALL_DIR=/opt/rijan_wa \
RIJAN_WA_IMAGE_TAG=1.3.6 \
RIJAN_WA_HOST_PORT=3000 \
RIJAN_WA_MASTER_PASSWORD_LEN=16 \
./rijan_wa-install.sh
```

Catatan penting:

- Skrip akan menampilkan **MASTER PASSWORD (plain text)** di output. Simpan baik-baik.
- Untuk request admin, header yang dipakai adalah **plain password**, bukan hash:

```text
X-Master-Key: <MASTER PASSWORD>
```

- Secara default port host `3000` dipublish ke `0.0.0.0` (tidak hanya localhost), sehingga siap dipakai reverse proxy.

## 📋 Prerequisites

### System Requirements
- **Node.js**: >= 18.0.0
- **npm**: >= 9.0.0
- **OS**: Linux, macOS, atau Windows
- **Memory**: Minimal 512MB RAM (recommended 1GB+)
- **Storage**: Minimal 100MB free space

### Tools yang Dibutuhkan
- Git
- Text editor (VS Code, Sublime, dll)
- Terminal/Command Prompt
- cURL atau Postman untuk testing API

## 🚀 Langkah Instalasi

### 1. Clone Repository

```bash
git clone https://github.com/teguh02/rijan_wa.git
cd rijan_wa
```

### 2. Install Dependencies

```bash
npm install
```

Output yang diharapkan:
```
added 234 packages, and audited 235 packages in 15s
found 0 vulnerabilities
```

### 3. Setup Environment Variables

Copy file `.env.example` ke `.env`:

```bash
# Linux/macOS
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env

# Windows CMD
copy .env.example .env
```

### 4. Edit File `.env`

Buka file `.env` dengan text editor dan sesuaikan konfigurasi:

```env
# Security
# MASTER_KEY adalah SHA256 hash (64 hex) dari master password.
# Kamu akan mengirim master password (plain text) di header: X-Master-Key
# Contoh generate:
#   MASTER_PASSWORD="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 16)"
#   echo "MASTER PASSWORD: $MASTER_PASSWORD"
#   echo -n "$MASTER_PASSWORD" | sha256sum
MASTER_KEY=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855

# Server
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# Database
DATABASE_PATH=./data/rijan_wa.db

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000

# Encryption
ENCRYPTION_ALGORITHM=aes-256-gcm

# Timezone
TIMEZONE=Asia/Jakarta

# Multi-instance (optional)
# INSTANCE_ID=instance-1
```

### 5. Buat Database Directory

```bash
# Linux/macOS
mkdir -p data

# Windows PowerShell
New-Item -ItemType Directory -Force -Path data

# Windows CMD
mkdir data
```

### 6. Build Project

Compile TypeScript ke JavaScript:

```bash
npm run build
```

Output yang diharapkan:
```
> rijan_wa@1.0.0 build
> tsc
```

Jika sukses, akan muncul folder `dist/` dengan hasil compilation.

### 7. Verifikasi Instalasi

Jalankan server untuk memastikan semua sudah benar:

```bash
npm run dev
```

Output yang diharapkan:
```
[09:00:00 Asia/Jakarta] INFO: Running database migrations...
[09:00:00 Asia/Jakarta] INFO: Database connected
[09:00:00 Asia/Jakarta] INFO: All migrations completed
[09:00:01 Asia/Jakarta] INFO: Server listening on http://0.0.0.0:3000
[09:00:01 Asia/Jakarta] INFO: OpenAPI docs available at http://localhost:3000/docs
[09:00:01 Asia/Jakarta] INFO: Message processor started
[09:00:01 Asia/Jakarta] INFO: Starting device recovery...
[09:00:01 Asia/Jakarta] INFO: Device recovery completed
```

### 8. Test Health Endpoint

Buka browser atau gunakan cURL:

```bash
curl http://localhost:3000/health
```

Response yang diharapkan:
```json
{
  "status": "alive",
  "timestamp": 1703145600000,
  "uptime": 5.123
}
```

## ✅ Checklist Post-Installation

- [ ] Dependencies ter-install tanpa error
- [ ] File `.env` sudah dikonfigurasi
- [ ] Database directory sudah dibuat
- [ ] TypeScript compilation berhasil (0 errors)
- [ ] Server bisa running dengan `npm run dev`
- [ ] Health endpoint return status 200 OK
- [ ] Swagger docs accessible di `/docs`

## 📁 Struktur Folder

Setelah instalasi, struktur folder project:

```
rijan_wa/
├── data/                    # Database storage (auto-created)
│   └── rijan_wa.db
├── dist/                    # Compiled JavaScript (setelah build)
├── docs/                    # Dokumentasi (folder ini)
├── src/                     # Source code TypeScript
│   ├── baileys/            # Baileys integration
│   ├── config/             # Configuration
│   ├── http/               # HTTP routes & server
│   ├── jobs/               # Background jobs
│   ├── middlewares/        # Middleware functions
│   ├── modules/            # Business logic modules
│   ├── storage/            # Database layer
│   ├── utils/              # Utility functions
│   └── index.ts            # Entry point
├── .env                     # Environment variables (tidak di-commit)
├── .env.example            # Example environment file
├── package.json            # Dependencies
├── tsconfig.json           # TypeScript config
└── README.md               # Project readme

```

## 🐳 Alternatif: Docker Installation

### Menggunakan Docker Compose

```bash
# Build dan jalankan
docker-compose up -d

# Cek logs
docker-compose logs -f

# Stop
docker-compose down
```

### Menggunakan Dockerfile

```bash
# Build image
docker build -t rijan-wa .

# Run container
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e MASTER_KEY=your_master_key_here \
  --name rijan-wa \
  rijan-wa

# Cek logs
docker logs -f rijan-wa

# Stop container
docker stop rijan-wa
```

## 🔧 Konfigurasi Development

### Recommended VS Code Extensions

- ESLint
- Prettier
- TypeScript and JavaScript Language Features

### Setup Git Hooks (Optional)

```bash
# Install husky untuk pre-commit hooks
npm install --save-dev husky
npx husky install

# Add pre-commit hook untuk linting
npx husky add .husky/pre-commit "npm run lint"
```

## 🚨 Troubleshooting Instalasi

### Error: "Cannot find module"

**Solusi**:
```bash
# Hapus node_modules dan reinstall
rm -rf node_modules package-lock.json
npm install
```

### Error: "Port 3000 already in use"

**Solusi 1** - Ganti port di `.env`:
```env
PORT=3001
```

**Solusi 2** - Kill process yang menggunakan port:
```bash
# Linux/macOS
lsof -ti:3000 | xargs kill -9

# Windows PowerShell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force
```

### Error: "MASTER_KEY is required"

**Solusi**: Generate master key terlebih dahulu. Lihat [02-master-key.md](02-master-key.md)

### Error: Database locked

**Solusi**:
```bash
# Stop semua instance yang running
pkill -f "node.*rijan_wa"

# Hapus lock file jika ada
rm data/rijan_wa.db-wal data/rijan_wa.db-shm
```

### TypeScript Compilation Error

**Solusi**:
```bash
# Clean build
rm -rf dist
npm run build
```

## ⏭️ Langkah Selanjutnya

Setelah instalasi berhasil:

1. **[Generate Master Key](02-master-key.md)** - Buat master key untuk admin access
2. **[Jalankan Server](03-running-server.md)** - Start server production mode
3. **[Buat Tenant](04-admin-create-tenant.md)** - Buat tenant pertama Anda

---

**Prev**: [← Daftar Isi](README.md)  
**Next**: [Generate Master Key →](02-master-key.md)
