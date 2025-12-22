# Menjalankan Server

Panduan lengkap untuk menjalankan Rijan WA Gateway dalam berbagai mode.

## 🚀 Mode Development

Mode development dengan hot-reload untuk development:

```bash
npm run dev
```

**Karakteristik**:
- ✅ Auto-reload saat ada perubahan code
- ✅ Pretty logs dengan warna
- ✅ Detailed error messages
- ✅ Source maps enabled
- ❌ Tidak untuk production

## 📦 Mode Production

### 1. Build Project

Compile TypeScript ke JavaScript:

```bash
npm run build
```

### 2. Start Production Server

```bash
npm start
```

atau langsung:

```bash
NODE_ENV=production node dist/index.js
```

**Karakteristik**:
- ✅ Optimized performance
- ✅ Minimal logging (JSON format)
- ✅ Production-ready
- ❌ No auto-reload
- ❌ No source maps

## 🐳 Menggunakan Docker

### Docker Compose (Recommended)

```bash
# Start
docker-compose up -d

# Lihat logs
docker-compose logs -f

# Restart
docker-compose restart

# Stop
docker-compose down
```

### Docker Manual

```bash
# Build image
docker build -t rijan-wa:latest .

# Run container
docker run -d \
  --name rijan-wa \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e MASTER_KEY=your_master_key_here \
  -e PORT=3000 \
  -e NODE_ENV=production \
  rijan-wa:latest

# Lihat logs
docker logs -f rijan-wa

# Stop
docker stop rijan-wa

# Remove
docker rm rijan-wa
```

## 🔧 Environment Variables

Semua environment variables di file `.env`:

```env
# Security (WAJIB)
MASTER_KEY=<your_sha256_hash>

# Server
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
TIMEZONE=Asia/Jakarta

# Database
DATABASE_PATH=./data/rijan_wa.db

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000

# Encryption
ENCRYPTION_ALGORITHM=aes-256-gcm

# Multi-instance (Optional)
INSTANCE_ID=instance-1
```

### Override via Command Line

```bash
# Custom port
PORT=8080 npm run dev

# Production mode
NODE_ENV=production npm start

# Debug logging
LOG_LEVEL=debug npm run dev

# Custom instance ID
INSTANCE_ID=instance-2 npm run dev
```

## 📊 Verifikasi Server Running

### 1. Check Health Endpoint

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "alive",
  "timestamp": 1703145600000,
  "uptime": 123.456
}
```

### 2. Check Readiness

```bash
curl http://localhost:3000/ready
```

Response jika ready:
```json
{
  "ready": true,
  "db": true,
  "worker": true
}
```

Response jika NOT ready:
```json
{
  "ready": false,
  "db": false,
  "worker": true
}
```
Status code: 503

### 3. Check Swagger Docs

Buka browser: `http://localhost:3000/docs`

## 📝 Log Output

### Development Logs

```
[09:00:00 Asia/Jakarta] INFO: Running database migrations...
[09:00:00 Asia/Jakarta] INFO: Database connected
    path: "./data/rijan_wa.db"
[09:00:00 Asia/Jakarta] INFO: All migrations completed
    currentVersion: 1
[09:00:01 Asia/Jakarta] INFO: Server listening on http://0.0.0.0:3000
[09:00:01 Asia/Jakarta] INFO: OpenAPI docs available at http://localhost:3000/docs
[09:00:01 Asia/Jakarta] INFO: Message processor started
    intervalMs: 3000
[09:00:01 Asia/Jakarta] INFO: Starting device recovery...
[09:00:01 Asia/Jakarta] INFO: Device recovery completed
```

### Production Logs (JSON)

```json
{"level":30,"time":1703145600000,"msg":"Server listening on http://0.0.0.0:3000"}
{"level":30,"time":1703145600001,"msg":"Message processor started","intervalMs":3000}
{"level":30,"time":1703145600002,"msg":"Device recovery completed"}
```

## 🔄 Process Management

### Menggunakan PM2 (Recommended untuk Production)

#### 1. Install PM2

```bash
npm install -g pm2
```

#### 2. Start dengan PM2

```bash
# Start
pm2 start dist/index.js --name rijan-wa

# Start dengan environment
pm2 start dist/index.js \
  --name rijan-wa \
  -i max \
  --env production

# Lihat logs
pm2 logs rijan-wa

# Monitor
pm2 monit

# Restart
pm2 restart rijan-wa

# Stop
pm2 stop rijan-wa

# Delete
pm2 delete rijan-wa
```

#### 3. PM2 Ecosystem File

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'rijan-wa',
    script: './dist/index.js',
    instances: 1,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    env_production: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn',
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    watch: false,
    max_memory_restart: '500M',
  }]
};
```

Start dengan config:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Menggunakan systemd (Linux)

Create `/etc/systemd/system/rijan-wa.service`:

```ini
[Unit]
Description=Rijan WA Gateway
After=network.target

[Service]
Type=simple
User=nodejs
WorkingDirectory=/opt/rijan_wa
Environment="NODE_ENV=production"
Environment="PORT=3000"
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=rijan-wa

[Install]
WantedBy=multi-user.target
```

Manage service:
```bash
# Enable auto-start
sudo systemctl enable rijan-wa

# Start
sudo systemctl start rijan-wa

# Status
sudo systemctl status rijan-wa

# Restart
sudo systemctl restart rijan-wa

# Stop
sudo systemctl stop rijan-wa

# View logs
journalctl -u rijan-wa -f
```

## 🌐 Reverse Proxy Setup

### Nginx

```nginx
upstream rijan_wa {
    server 127.0.0.1:3000;
    # Multi-instance
    # server 127.0.0.1:3001;
    # server 127.0.0.1:3002;
}

server {
    listen 80;
    server_name wa-api.example.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name wa-api.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://rijan_wa;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts untuk long-polling
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

Reload Nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Apache

```apache
<VirtualHost *:80>
    ServerName wa-api.example.com
    Redirect permanent / https://wa-api.example.com/
</VirtualHost>

<VirtualHost *:443>
    ServerName wa-api.example.com

    SSLEngine on
    SSLCertificateFile /path/to/cert.pem
    SSLCertificateKeyFile /path/to/key.pem

    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/

    <Location />
        Require all granted
    </Location>
</VirtualHost>
```

## 🚨 Troubleshooting

### Server tidak bisa start

**Error**: `EADDRINUSE: address already in use`

**Solusi**:
```bash
# Find and kill process
# Linux/macOS
lsof -ti:3000 | xargs kill -9

# Windows PowerShell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force
```

### Database locked

**Error**: `SQLITE_BUSY: database is locked`

**Solusi**:
```bash
# Stop all instances
pkill -f "node.*rijan"

# Remove lock files
rm data/*.db-wal data/*.db-shm
```

### Memory leak

**Gejala**: Memory usage terus naik

**Solusi**:
1. Set memory limit dengan PM2:
```bash
pm2 start dist/index.js --max-memory-restart 500M
```

2. Monitor dengan PM2:
```bash
pm2 monit
```

### Crash loop

**Solusi**:
1. Cek logs:
```bash
pm2 logs rijan-wa --lines 100
```

2. Cek environment variables
3. Cek database connectivity
4. Cek MASTER_KEY validity

## 📈 Monitoring

### PM2 Monitoring

```bash
# Real-time monitoring
pm2 monit

# Process list
pm2 list

# Describe process
pm2 describe rijan-wa
```

### Health Check Script

Create `check-health.sh`:

```bash
#!/bin/bash
HEALTH_URL="http://localhost:3000/health"
READY_URL="http://localhost:3000/ready"

# Check health
if curl -f $HEALTH_URL > /dev/null 2>&1; then
    echo "✅ Server is alive"
else
    echo "❌ Server is down"
    exit 1
fi

# Check readiness
if curl -f $READY_URL > /dev/null 2>&1; then
    echo "✅ Server is ready"
else
    echo "⚠️  Server is not ready"
    exit 1
fi
```

Add to cron:
```bash
# Run every 5 minutes
*/5 * * * * /path/to/check-health.sh
```

## ⏭️ Langkah Selanjutnya

Setelah server running:

1. **[Buat Tenant](04-admin-create-tenant.md)** - Setup tenant pertama
2. **[Buat Device](05-admin-create-device.md)** - Tambah device untuk tenant

---

**Prev**: [← Membuat Master Key](02-master-key.md)  
**Next**: [Membuat Tenant →](04-admin-create-tenant.md)
