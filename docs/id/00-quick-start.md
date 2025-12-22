# Panduan Mulai Cepat (Quick Start)

Panduan cepat untuk mulai menggunakan Rijan WA Gateway hanya dalam **5 menit**.

## 🚀 Setup Awal

### Langkah 1: Instal Dependencies

Buka terminal di folder `rijan_wa` dan jalankan:

```bash
cd rijan_wa
npm install
```

| Istilah | Arti |
|---------|------|
| `npm install` | Mengunduh dan menginstal semua package yang diperlukan |
| `dependencies` | Paket atau library yang dibutuhkan aplikasi |

### Langkah 2: Generate Master Key (Kunci Admin)

Gateway menggunakan model berikut:

- Kamu menyimpan `MASTER_KEY` di `.env` sebagai **SHA256 hash** (64 hex)
- Saat memanggil endpoint admin, kamu mengirim **master password (plain text)** di header `X-Master-Key`

#### Opsi A (Linux/macOS): generate master password + hash

```bash
MASTER_PASSWORD="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 16)"
echo "MASTER PASSWORD: $MASTER_PASSWORD"
echo -n "$MASTER_PASSWORD" | sha256sum
```

#### Opsi B (Windows PowerShell): generate master password + hash

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

**Contoh output**:
```
abc123def456xyz789abc123def456xyz789abc123def456xyz789abc123def456
```

| Istilah | Arti | Contoh |
|---------|------|--------|
| **Master Key** | Kunci admin untuk mengelola sistem | `abc123...` |
| **32 byte** | Panjang kunci (256-bit) untuk keamanan tinggi | Automatically generated |

⚠️ **PENTING**: Simpan master key ini di tempat aman!

### Langkah 3: Konfigurasi Environment (.env)

Buat file bernama `.env` di folder root `rijan_wa`:

```env
NODE_ENV=development
PORT=3000
MASTER_KEY=YOUR_GENERATED_MASTER_KEY_SHA256_HEX
DATABASE_PATH=data/rijan_wa.db
LOG_LEVEL=info
TIMEZONE=Asia/Jakarta
```

| Variabel | Arti | Nilai |
|----------|------|-------|
| `NODE_ENV` | Mode environment | `development` atau `production` |
| `PORT` | Port server berjalan | Default `3000` |
| `MASTER_KEY` | Kunci admin (dari langkah 2) | Key yang sudah di-generate |
| `DATABASE_PATH` | Lokasi database SQLite | `data/rijan_wa.db` |
| `LOG_LEVEL` | Level log yang ditampilkan | `debug`, `info`, `warn`, `error` |
| `TIMEZONE` | Zona waktu server | `Asia/Jakarta`, `Asia/Bangkok`, dll |

### Langkah 4: Jalankan Server

```bash
npm run dev
```

**Jika sukses**, akan tampil:
```
[10:30:45 Asia/Jakarta] INFO: Server listening at http://localhost:3000
```

Server sudah ready! 🎉

## 📱 Alur Test Cepat (5 Langkah)

### 🧭 Ilustrasi Alur End-to-End (Admin → Tenant → Kirim Pesan)

Di bawah ini adalah gambaran **alur lengkap** dari pertama kali sistem disiapkan sampai tenant bisa mengirim pesan.

**Ringkasnya begini:**

1. **Admin membuat tenant** memakai `X-Master-Key` (master password).
2. Sistem mengembalikan **`tenant_id` + `tenant_api_key`** (dibagikan ke pihak tenant).
3. **Admin membuat device** untuk tenant tersebut → dapat **`device_id`**.
4. **Tenant men-start device** memakai `Authorization: Bearer tenant_api_key`.
5. Tenant minta **QR**, lalu scan di WhatsApp (Linked devices) sampai status **`connected`**.
6. Setelah connected, tenant bisa **kirim pesan** via endpoint messages.

Berikut flowchart-nya (kode Mermaid). Kamu bisa copy-paste untuk di-render jadi gambar:

```mermaid
flowchart TD
  %% End-to-end flow: Admin creates tenant/device, Tenant pairs WhatsApp, then sends message

  start([Mulai]):::system

  subgraph Admin[Admin]
    direction TB
    a1[Generate MASTER PASSWORD\n(simpan baik-baik)]:::admin
    a2[Admin API: Create Tenant\nPOST /admin/tenants\nHeader: X-Master-Key]:::admin
    a3[Terima tenant_id + tenant_api_key\n(bagikan ke tenant)]:::admin
    a4[Admin API: Create Device\nPOST /admin/tenants/{tenant_id}/devices\nHeader: X-Master-Key]:::admin
    a5[Terima device_id\n(status: disconnected)]:::admin
  end

  subgraph Tenant[Tenant]
    direction TB
    t1[Start Device\nPOST /v1/devices/{device_id}/start\nHeader: Authorization: Bearer tenant_api_key]:::tenant
    t2[Request QR\nPOST /v1/devices/{device_id}/pairing/qr]:::tenant
    t3[Scan QR di WhatsApp\nLinked devices / Perangkat tertaut]:::tenant
    t4[Send Message\nPOST /v1/devices/{device_id}/messages/text\nBody: to, text]:::tenant
  end

  subgraph WhatsApp[WhatsApp]
    direction TB
    w1[(WA Account/Device)]:::wa
    w2[Pairing Session]:::wa
    w3[Deliver Message]:::wa
  end

  db[(SQLite + Sessions Storage)]:::storage

  start --> a1 --> a2
  a2 --> okTenant{Tenant dibuat?}:::decision
  okTenant -- Tidak --> fixTenant[Periksa MASTER PASSWORD\n& response error]:::system --> a2
  okTenant -- Ya --> a3 --> a4

  a4 --> okDevice{Device dibuat?}:::decision
  okDevice -- Tidak --> fixDevice[Periksa tenant_id\n& payload request]:::system --> a4
  okDevice -- Ya --> a5

  %% Handover to tenant
  a3 -. bagikan tenant_api_key .-> t1
  a5 -. bagikan device_id .-> t1

  %% Tenant pairing & sending
  t1 --> t2 --> t3 --> w1 --> w2
  w2 --> paired{Pairing berhasil?}:::decision
  paired -- Tidak --> t2
  paired -- Ya --> connected[Device status: connected\n(siap kirim pesan)]:::system
  connected --> t4 --> w3 --> done([Selesai: messageId + status]):::system

  %% Storage side-effects
  a2 -. simpan tenant .-> db
  a4 -. simpan device .-> db
  w2 -. simpan session .-> db

  classDef admin fill:#E8F3FF,stroke:#2B6CB0,stroke-width:1px,color:#0B1F33;
  classDef tenant fill:#ECFDF3,stroke:#2F855A,stroke-width:1px,color:#0B1F33;
  classDef wa fill:#F7FAFC,stroke:#4A5568,stroke-width:1px,color:#0B1F33;
  classDef storage fill:#FFF7ED,stroke:#C05621,stroke-width:1px,color:#0B1F33;
  classDef system fill:#FFFFFF,stroke:#A0AEC0,stroke-width:1px,color:#0B1F33;
  classDef decision fill:#F7FAFC,stroke:#805AD5,stroke-width:1px,color:#0B1F33;
```

Catatan penting:

- `MASTER_KEY` di `.env` adalah **hash SHA256**, tapi header `X-Master-Key` berisi **master password (plain)**.
- Header `Authorization: Bearer ...` dipakai tenant untuk semua endpoint `/v1/...`.
- Kalau QR kedaluwarsa, cukup request QR lagi lalu scan ulang.

### Langkah 1: Buat Tenant (Admin)

**Tenant** = Perusahaan/klien yang menggunakan layanan WhatsApp Gateway.

```bash
curl -X POST http://localhost:3000/admin/tenants \
  -H "X-Master-Key: YOUR_MASTER_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Perusahaan Saya"
  }'
```

### Langkah 2: Buat Device (Admin)

**Device** = Nomor WhatsApp yang akan mengirim pesan (bisa multiple nomor).

Ganti `TENANT_ID` dengan `tenant_id` dari langkah 1:

```bash
curl -X POST http://localhost:3000/admin/tenants/TENANT_ID/devices \
  -H "X-Master-Key: YOUR_MASTER_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Customer Service"
  }'
```

**Response contoh**:
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

| Field | Arti | Kegunaan |
|-------|------|----------|
| `device_id` | ID unik device | Untuk start/stop device |
| `label` | Nama/label device | Identifikasi device |
| `status` | Status koneksi | `disconnected` (belum connect) |

**⭐ SIMPAN**: Copy `device.id` - kita butuh langkah berikutnya!

### Langkah 3: Start Device (Tenant)

Ganti dengan `DEVICE_ID` dan `API_KEY` dari langkah sebelumnya:

```bash
curl -X POST http://localhost:3000/v1/devices/DEVICE_ID/start \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

**Response**:
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

### Langkah 4: Dapatkan QR Code (Tenant)

Untuk connect ke WhatsApp, kita butuh scan QR code:

```bash
curl -X POST http://localhost:3000/v1/devices/DEVICE_ID/pairing/qr \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

**Response**:
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

### Langkah 5: Scan QR Code

1. Buka WhatsApp di HP
2. Masuk ke menu **Linked devices / Perangkat tertaut**
3. Scan QR code dari response di atas

Jika pairing berhasil, status device akan menjadi **connected**.

### Langkah 6 (Bonus): Kirim Pesan (Tenant)

Setelah device **CONNECTED**, kita bisa kirim pesan:

```bash
curl -X POST http://localhost:3000/v1/devices/DEVICE_ID/messages/text \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "628123456789",
    "text": "Halo dari Rijan WA Gateway! 🎉"
  }'
```

| Parameter | Arti | Contoh |
|-----------|------|--------|
| `to` | Nomor WhatsApp tujuan | `628123456789` (tanpa +62) |
| `text` | Isi pesan | `"Halo dari Rijan WA Gateway!"` |

**Response**:
```json
{
  "id": "msg_abc123xyz789",
  "messageId": "msg_abc123xyz789",
  "status": "pending",
  "timestamp": 1703145600
}
```

## ⏭️ Langkah Berikutnya

### Pelajari Lebih Lanjut

Setelah quick start, baca dokumentasi detail:

1. **[Setup & Instalasi](01-setup-instalasi.md)** - Panduan instalasi lengkap
2. **[Master Key](02-master-key.md)** - Best practices keamanan
3. **[Menjalankan Server](03-running-server.md)** - Setup production
4. **[Admin Operations](04-admin-create-tenant.md)** - Manajemen tenant
5. **[Mengirim Pesan](08-tenant-send-text.md)** - Semua tipe pesan
6. **[Webhooks](19-webhooks-configuration.md)** - Events real-time
7. **[Troubleshooting](30-troubleshooting.md)** - Masalah & solusi

### Deployment ke Production

Untuk menjalankan di production:

1. **[Setup Production](03-running-server.md#production)**
   - PM2 process manager
   - Nginx reverse proxy
   - HTTPS configuration

2. **[Keamanan](33-security-practices.md)**
   - Master key security
   - Manajemen API key
   - SSRF protection
   - Rate limiting

3. **[Monitoring](29-admin-health-metrics.md)**
   - Health checks
   - Metrics & alerts
   - Log monitoring

## 📖 Glossary (Kamus Istilah)

Istilah-istilah penting yang akan sering Anda temui:

| Istilah | Arti | Keterangan |
|---------|------|-----------|
| **Tenant** | Klien/Perusahaan | Satu tenant = satu perusahaan yang menggunakan layanan |
| **Device** | Nomor WhatsApp | Satu device = satu nomor WhatsApp untuk mengirim pesan |
| **Master Key** | Kunci Admin | Untuk admin mengelola tenant dan device |
| **API Key** | Kunci Tenant | Untuk tenant send messages dan manage device |
| **QR Code** | Kode Pairing | Untuk connect nomor WhatsApp ke gateway |
| **Webhook** | URL Callback | Untuk receive notifikasi/events dari gateway |
| **JID** | WhatsApp ID | Identitas WhatsApp (contoh: `628123456789@s.whatsapp.net`) |
| **Authentication** | Autentikasi | Cara verify bahwa request legitimate |
| **Endpoint** | URL API | Alamat untuk memanggil API |
| **HTTP Method** | Tipe Request | GET (ambil), POST (kirim), PUT (update), DELETE (hapus) |

### Status Pesan

| Status | Arti | Keterangan |
|--------|------|-----------|
| `pending` | Menunggu | Pesan dalam antrian untuk dikirim |
| `queued` | Antrian | Pesan sudah dalam antrian, tinggal tunggu |
| `sending` | Mengirim | Pesan sedang dikirim ke server WhatsApp |
| `sent` | Terkirim | Pesan berhasil dikirim (1 checkmark) |
| `delivered` | Tersampaikan | Pesan sudah diterima (2 checkmark) |
| `read` | Dibaca | Pesan sudah dibaca penerima (2 checkmark biru) |
| `failed` | Gagal | Pengiriman pesan gagal |

### Status Device

| Status | Arti | Aksi |
|--------|------|------|
| `disconnected` | Tidak terhubung | Mulai device & scan QR |
| `connecting` | Sedang connect | Tunggu atau scan QR |
| `pairing` | Menunggu pairing | Scan/enter pairing code |
| `connected` | Terhubung ✅ | Siap kirim pesan |
| `failed` | Gagal connect | Restart dan coba lagi |

## 🎯 Contoh Kasus Penggunaan

### 1. Customer Service Bot

Auto-reply ke customer:
```javascript
// Pseudocode
if (pesan.includes("harga")) {
  reply("Harga: Rp 100.000");
} else if (pesan.includes("jam buka")) {
  reply("Buka jam 09:00-17:00");
}
```

### 2. Order Notification

Notifikasi ke customer saat ada order:
```
Pesanan Anda berhasil! 🎉
Order ID: #12345
Status: Dikemas
Estimasi: 2-3 hari
```

### 3. OTP Verification

Kirim kode OTP untuk verifikasi:
```
Kode OTP: 123456
Jangan bagikan ke siapapun!
```
  }
}
```🛠️ Tips Praktis

### Format Nomor WhatsApp

Pastikan nomor dalam format yang BENAR:

| ✅ BENAR | ❌ SALAH | Kenapa |
|---------|---------|--------|
| `628123456789` | `+628123456789` | Jangan pakai `+` |
| `628123456789` | `08123456789` | Jangan pakai `0` di awal |
| `628123456789` | `62 812 345 6789` | Jangan pakai spasi |
| `628123456789` | `62-812-345-6789` | Jangan pakai tanda `-` |

### Perintah Berguna

**Check Server Status**:
```bash
curl http://localhost:3000/health
```

**View Logs**:
```bash
npm run dev
# atau untuk production:
pm2 logs rijan-wa
```

**Stop Server**:
```bash
# Press Ctrl+C (dalam terminal)
```

### Variabel Lingkungan untuk Development

Buat `.env.example`:
```env
# Development
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug
DATABASE_PATH=data/rijan_wa.db

# Admin
MASTER_KEY=abc123...

# Settings
TIMEZONE=Asia/Jakarta
```

## 🚨 Troubleshooting Cepat

| Masalah | Solusi |
|---------|--------|
| Port 3000 in use | Ubah PORT di `.env` atau kill proses lama |
| Module not found | Jalankan `npm install` |
| Device won't connect | Pastikan internet ON, ambil QR baru |
| Message failed | Cek device connected dengan `/health` |
| Invalid API key | Pastikan key tidak expired |
| QR code expired | Ambil QR baru (expires 30 detik) |

## 💬 Contoh Pesan Lengkap

### Pesan dengan Formatting

```
*Judul Pesan*

Pesan dengan _italic_ dan ~strikethrough~.

Bisa juga pakai:
- Bold: *teks*
- Italic: _teks_
- Strikethrough: ~teks~

Gunakan \n untuk line break.
```

### Pesan Multiline (Template)

```json
{
  "to": "628123456789",
  "text": "Halo!\n\nPesan multi-line\nBaris 2\nBaris 3\n\nTerima kasih!"
}
```

Akan tampil di WhatsApp:
```
Halo!

Pesan multi-line
Baris 2
Baris 3

Terima kasih!  - HTTPS configuration

2. **[Security](33-security-practices.md)**
   - Master key security
   - API key management
   - SSRF protection
   - Rate limiting

3. **[Monitoring](29-admin-health-metrics.md)**
   🎓 Belajar Lebih Lanjut dari Dokumentasi

Setelah familiar dengan quick start, lanjut ke dokumentasi detail:

### Untuk Admin
- Setup production dengan PM2/Docker
- Manajemen tenant dan device
- Monitoring sistem
- Keamanan dan backup

### Untuk Developer (Tenant)
- Mengirim berbagai tipe pesan (text, media, location)
- Setup webhooks untuk receive events
- Handle message status dan delivery confirmation
- Group management & privacy settings

### Untuk Production Deployment
- Setup HTTPS dengan Nginx
- Configure rate limiting
- Implement monitoring dan alerting
- Backup dan disaster recovery

## ⚡ Quick Reference (Referensi Cepat)

### API Endpoints Penting

```
Admin Endpoints (pakai X-Master-Key):
- POST /admin/tenants                          # Buat tenant
- GET  /admin/tenants/:id/devices              # List devices
- POST /admin/tenants/:id/devices              # Buat device

Tenant Endpoints (pakai Authorization: Bearer):
- POST /v1/devices/:id/start                   # Start device
- POST /v1/devices/:id/pairing/qr              # Get QR code
- GET  /v1/devices/:id/health                  # Check status
- POST /v1/devices/:id/messages/text           # Kirim pesan
- POST /v1/devices/:id/messages/image          # Kirim gambar
- POST /v1/webhooks                            # Register webhook
```

### cURL Header Templates

**Admin Request**:
```bash
-H "X-Master-Key: YOUR_MASTER_PASSWORD"
-H "Content-Type: application/json"
```

**Tenant Request**:
```bash
-H "Authorization: Bearer YOUR_TENANT_API_KEY"
-H "Content-Type: application/json"
```

## 🎯 Checklist Implementasi

Gunakan checklist ini untuk memastikan setup benar:

- [ ] Install npm dependencies
- [ ] Generate dan simpan master key
- [ ] Create `.env` file
- [ ] Start server (`npm run dev`)
- [ ] Create tenant (admin)
- [ ] Create device (admin)
- [ ] Start device (tenant)
- [ ] Get QR code dan scan
- [ ] Verify device connected
- [ ] Send test message
- [ ] Check message di WhatsApp

Semua checkmark ✅ = Setup sukses! 🎉
function Get-Tenants {
  curl -X GET "http://localhost:3000/admin/tenants" `
    -H "X-Master-Key: $env:MASTER_KEY"
}

function Get-Devices {
  param([string]$TenantId)
  curl -X GET "http://localhost:3000/admin/tenants/$TenantId/devices" `
    -H "X-Master-Key: $env:MASTER_KEY"
}

# Tenant endpoints
function Send-Message {
  param(
    [string]$DeviceId,
    [string]$To,
    [string]$Text
  )
  
  $body = @{
    to = $To
    text = $Text
  } | ConvertTo-Json
  
  curl -X POST "http://localhost:3000/v1/devices/$DeviceId/messages/text" `
    � FAQ (Pertanyaan Umum)

**Q: Berapa lama setup membutuhkan waktu?**
A: Setup cepat hanya 5-10 menit dari awal sampai kirim pesan pertama.

**Q: Bisa pakai Windows/Mac/Linux?**
A: Bisa! Requirements cuma Node.js 18+ dan npm. Kompatibel semua OS.

**Q: Berapa banyak device bisa di-setup?**
A: Unlimited! Satu tenant bisa pakai banyak device (nomor WhatsApp).

**Q: API key bisa di-reset?**
A: Ya, dengan regenerate-key endpoint. Akan generate key baru, key lama jadi invalid.

**Q: Pesan gagal, apa penyebabnya?**
A: Biasanya karena device tidak connected. Check health endpoint terlebih dahulu.

**Q: Bisa kirim WhatsApp dari banyak nomor?**
A: Ya! Create multiple device untuk tenant yang sama, masing-masing pakai nomor berbeda.

**Q: Bagaimana cara receive incoming messages?**
A: Setup webhooks untuk get notifikasi real-time saat ada pesan masuk.

## 📞 Support & Bantuan

Jika butuh bantuan:

1. **Dokumentasi Lengkap**: [Kembali ke README](README.md)
2. **Troubleshooting**: [Baca 30-troubleshooting.md](30-troubleshooting.md)
3. **Specific Topic**: Cek dokumentasi file yang relevan

## 🎉 Siap Mulai!

Sekarang Anda sudah siap membangun WhatsApp integration! 

**Next Steps**:
1. Setup server dengan quick start ini
2. Kirim pesan pertama Anda
3. Eksplorasi fitur lain di dokumentasi lengkap
4. Deploy ke production dengan panduan production

---

**Dokumentasi Lengkap**: [Lihat Semua File
Get-Tenants
Get-Devices -TenantId "tenant_abc123"
Send-Message -DeviceId "device_xyz789" -To "628123456789" -Text "Hello!"
```

### Environment Variables

```powershell
# Development
$env:NODE_ENV = "development"
$env:LOG_LEVEL = "debug"

# Production
$env:NODE_ENV = "production"
$env:LOG_LEVEL = "info"
```

## 🐛 Quick Debugging

### Check Server Status

```bash
curl http://localhost:3000/health
```

### Check Device Status

```bash
curl http://localhost:3000/v1/devices/DEVICE_ID/health \
  -H "Authorization: Bearer API_KEY"
```

### View Logs

```bash
# PM2
pm2 logs rijan-wa --lines 50

# Direct
tail -f logs/app.log
```

### Common Issues

| Issue | Solution |
|-------|----------|
| Port 3000 in use | Change `PORT` in `.env` |
| Device won't connect | Check internet, get new QR |
| Message failed | Verify device connected |
| Invalid API key | Check key not expired |

## 📞 Support

- **Documentation**: [docs/README.md](README.md)
- **Troubleshooting**: [docs/30-troubleshooting.md](30-troubleshooting.md)
- **GitHub Issues**: Create issue with logs

## 🎉 You're Ready!

Start building your WhatsApp integration now!

---

**Next**: [Complete Documentation →](README.md)
