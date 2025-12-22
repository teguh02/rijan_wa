# Troubleshooting Guide

Panduan lengkap untuk mengatasi masalah umum pada Rijan WA Gateway.

## 🔍 Diagnostik Awal

### 1. Check Server Status

```bash
# Health check
curl http://localhost:3000/health

# Expected output:
# {"status":"alive","timestamp":1703145600,"uptime":3600,"version":"1.0.0"}
```

### 2. Check Logs

```bash
# PM2 logs
pm2 logs rijan-wa --lines 100

# Direct logs
tail -f logs/app.log

# Error logs only
tail -f logs/app.log | grep ERROR
```

### 3. Check Device Status

```bash
curl -X GET http://localhost:3000/v1/devices/DEVICE_ID/health \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## 🚨 Common Issues

### Issue 1: Server Won't Start

**Symptoms**:
```
Error: Cannot find module '@fastify/cors'
Error: Port 3000 already in use
```

**Solutions**:

**A. Missing Dependencies**
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

**B. Port Already in Use**
```bash
# Check what's using port
netstat -ano | findstr :3000

# Kill process (Windows)
taskkill /PID <PID> /F

# Or change port in .env
PORT=3001
```

**C. Database File Locked**
```bash
# Stop all instances
pm2 delete all

# Remove lock file
rm data/app.db-shm
rm data/app.db-wal

# Restart
npm run dev
```

### Issue 2: Device Won't Connect

**Symptoms**:
```json
{
  "is_connected": false,
  "status": "disconnected"
}
```

**Solutions**:

**Step 1: Verify Device Exists**
```bash
curl -X GET http://localhost:3000/admin/devices \
  -H "X-Master-Key: YOUR_MASTER_KEY"
```

**Step 2: Start Device**
```bash
curl -X POST http://localhost:3000/v1/devices/DEVICE_ID/start \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Step 3: Get QR Code**
```bash
curl -X POST http://localhost:3000/v1/devices/DEVICE_ID/pairing/qr \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Step 4: Check Firewall**
```bash
# Windows Firewall
netsh advfirewall firewall show rule name=all | findstr 3000

# Allow port
netsh advfirewall firewall add rule name="Rijan WA" dir=in action=allow protocol=TCP localport=3000
```

**Step 5: Check Internet Connection**
```bash
# Ping WhatsApp servers
ping web.whatsapp.com

# DNS resolution
nslookup web.whatsapp.com
```

### Issue 3: QR Code Expired

**Symptoms**:
```json
{
  "error": "QR code expired"
}
```

**Solution**:

QR code expires setelah **30 detik**. Request QR baru:

```bash
curl -X POST http://localhost:3000/v1/devices/DEVICE_ID/pairing/qr \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Issue 4: Message Sending Failed

**Symptoms**:
```json
{
  "success": false,
  "error": {
    "code": "MESSAGE_SEND_FAILED",
    "message": "Failed to send message"
  }
}
```

**Solutions**:

**A. Check Device Connected**
```bash
curl -X GET http://localhost:3000/v1/devices/DEVICE_ID/health \
  -H "Authorization: Bearer YOUR_API_KEY"

# Must return: "is_connected": true
```

**B. Verify Phone Number Format**
```bash
# ✅ Correct format
{
  "to": "628123456789"
}

# ❌ Wrong formats
{
  "to": "+62 812-3456-789"  # Has + and -
}
{
  "to": "0812-3456-789"     # Has 0 at start
}
```

**C. Check Rate Limits**
```bash
# Get tenant info
curl -X GET http://localhost:3000/admin/tenants/TENANT_ID \
  -H "X-Master-Key: YOUR_MASTER_KEY"

# Check rate limit
# Default: 100 requests/minute
```

**D. Check Message Size**
```bash
# Text messages: max 10,000 characters
# Images: max 16 MB
# Videos: max 64 MB
# Documents: max 100 MB
```

### Issue 5: Device Disconnects Randomly

**Symptoms**:
- Device connected, tapi tiba-tiba disconnect
- Status berubah dari `connected` → `disconnected`

**Solutions**:

**A. Check WhatsApp on Phone**
- Buka WhatsApp di smartphone
- Go to **Linked Devices**
- Verify device masih listed

**B. Check Session Files**
```bash
# List session files
ls -la data/sessions/

# Should see: DEVICE_ID_session/
# If missing or corrupted, need to re-pair
```

**C. Check Memory Usage**
```bash
# Check memory
curl http://localhost:3000/admin/health \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  | jq '.data.memory'

# If high (>90%), restart
pm2 restart rijan-wa
```

**D. Enable Auto-Reconnect**

Auto-reconnect sudah enabled by default. Check logs:
```bash
tail -f logs/app.log | grep "reconnect"
```

### Issue 6: Invalid API Key

**Symptoms**:
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired API key"
  }
}
```

**Solutions**:

**A. Verify API Key Format**
```
tenant_abc123.1703145600.1735689600.salt123.signature
```

**B. Check API Key Expiration**
```bash
# Get tenant info
curl -X GET http://localhost:3000/admin/tenants/TENANT_ID \
  -H "X-Master-Key: YOUR_MASTER_KEY"

# Check: api_key_expires_at
```

**C. Regenerate API Key**
```bash
curl -X POST http://localhost:3000/admin/tenants/TENANT_ID/regenerate-key \
  -H "X-Master-Key: YOUR_MASTER_KEY"
```

### Issue 7: Webhook Not Receiving Events

**Symptoms**:
- Webhook registered
- Events tidak diterima di endpoint

**Solutions**:

**A. Verify Webhook Registration**
```bash
curl -X GET http://localhost:3000/v1/webhooks \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**B. Check Webhook URL Accessible**
```bash
# Test from server
curl -X POST https://your-app.com/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# Should return 200 OK
```

**C. Check Failed Events**
```bash
curl -X GET http://localhost:3000/v1/webhooks/failed \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**D. Verify Signature**
```javascript
// Make sure webhook endpoint validates signature
const crypto = require('crypto');

function verifySignature(payload, signature, secret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return signature === expected;
}
```

**E. Use Ngrok for Local Testing**
```bash
# Install ngrok
# Start ngrok
ngrok http 3001

# Register webhook with ngrok URL
curl -X POST http://localhost:3000/v1/webhooks \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://abc123.ngrok.io/webhook/whatsapp",
    "events": ["message.received"]
  }'
```

### Issue 8: Database Locked

**Symptoms**:
```
Error: SQLITE_BUSY: database is locked
```

**Solutions**:

**A. Stop All Instances**
```bash
# PM2
pm2 delete all

# Or kill node processes
taskkill /F /IM node.exe
```

**B. Remove Lock Files**
```bash
cd data
rm app.db-shm
rm app.db-wal
```

**C. Backup & Recreate**
```bash
# Backup database
cp data/app.db data/app.db.backup

# Remove and recreate
rm data/app.db*

# Restart server (will create new database)
npm run dev
```

### Issue 9: High Memory Usage

**Symptoms**:
- Server becomes slow
- Memory usage >80%

**Solutions**:

**A. Check Memory**
```bash
curl http://localhost:3000/admin/health \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  | jq '.data.memory'
```

**B. Restart Server**
```bash
pm2 restart rijan-wa
```

**C. Cleanup Old Sessions**
```bash
# Remove old session files (>30 days)
find data/sessions -type d -mtime +30 -exec rm -rf {} +
```

**D. Optimize Database**
```bash
sqlite3 data/app.db "VACUUM;"
```

### Issue 10: Cannot Upload Media

**Symptoms**:
```json
{
  "error": "File too large"
}
```

**Solutions**:

**A. Check File Size**
```bash
# Images: max 16 MB
# Videos: max 64 MB
# Documents: max 100 MB
```

**B. Compress File**
```bash
# Compress image
convert input.jpg -quality 85 -resize 1920x1080\> output.jpg

# Compress video
ffmpeg -i input.mp4 -vcodec h264 -acodec aac output.mp4
```

**C. Use URL Instead**
```bash
# Upload to CDN first
# Then send via URL
curl -X POST http://localhost:3000/v1/devices/DEVICE_ID/messages/image \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "628123456789",
    "image_url": "https://cdn.example.com/image.jpg"
  }'
```

## 🛠️ Advanced Diagnostics

### Enable Debug Logging

Edit `.env`:
```env
LOG_LEVEL=debug
```

Restart server:
```bash
pm2 restart rijan-wa
```

View debug logs:
```bash
pm2 logs rijan-wa --lines 200
```

### Database Inspection

```bash
# Open database
sqlite3 data/app.db

# List tables
.tables

# Check tenants
SELECT * FROM tenants;

# Check devices
SELECT * FROM devices;

# Check messages (recent)
SELECT * FROM messages ORDER BY created_at DESC LIMIT 10;

# Exit
.quit
```

### Network Diagnostics

```bash
# Check listening ports
netstat -ano | findstr :3000

# Check connections
netstat -ano | findstr ESTABLISHED

# Test DNS
nslookup web.whatsapp.com

# Test connectivity
curl -v https://web.whatsapp.com
```

## 📞 Getting Help

### Collect Diagnostic Information

```bash
# System info
node --version
npm --version

# Server info
curl http://localhost:3000/health

# Device info
curl http://localhost:3000/admin/devices \
  -H "X-Master-Key: YOUR_MASTER_KEY"

# Recent logs
pm2 logs rijan-wa --lines 100 --nostream > logs.txt
```

### Create GitHub Issue

When reporting issues:

1. **Environment**:
   - OS: Windows/Linux/macOS
   - Node version: `node --version`
   - npm version: `npm --version`

2. **Steps to Reproduce**:
   - What you did
   - What you expected
   - What actually happened

3. **Logs**:
   ```bash
   pm2 logs rijan-wa --lines 200 --nostream
   ```

4. **Configuration** (remove sensitive data):
   ```env
   NODE_ENV=production
   PORT=3000
   # etc
   ```

## 🎯 Prevention Tips

### 1. Regular Backups

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backups/$DATE"

mkdir -p $BACKUP_DIR

# Backup database
cp data/app.db $BACKUP_DIR/

# Backup sessions
cp -r data/sessions $BACKUP_DIR/

# Backup .env
cp .env $BACKUP_DIR/

echo "Backup completed: $BACKUP_DIR"
```

### 2. Monitor Health

```bash
# Add to crontab
*/5 * * * * curl -s http://localhost:3000/health || systemctl restart rijan-wa
```

### 3. Cleanup Old Data

```bash
# Remove old messages (>90 days)
sqlite3 data/app.db "DELETE FROM messages WHERE created_at < datetime('now', '-90 days');"

# Vacuum database
sqlite3 data/app.db "VACUUM;"
```

### 4. Update Dependencies

```bash
# Check outdated packages
npm outdated

# Update all
npm update

# Or update specific package
npm update @fastify/cors
```

## ⏭️ Langkah Selanjutnya

1. **[Security Best Practices](33-security-practices.md)** - Secure your gateway
2. **[Performance Tuning](31-performance-tuning.md)** - Optimize performance
3. **[API Reference](README.md)** - Complete API documentation

---

**Prev**: [← Health & Metrics](29-admin-health-metrics.md)  
**Next**: [Security Practices →](33-security-practices.md)
