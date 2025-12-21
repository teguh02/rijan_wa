# Membuat Master Key

Master Key adalah SHA256 hash yang berfungsi sebagai root authentication untuk admin endpoints. Master key ini **wajib** dibuat sebelum bisa menggunakan sistem.

## 🔐 Apa itu Master Key?

Master Key adalah:
- SHA256 hash dari password master Anda
- Digunakan untuk authenticate admin endpoints
- Digunakan sebagai base untuk signing tenant API keys
- Digunakan untuk derivasi encryption keys
- **TIDAK BOLEH** dibagikan ke siapapun

## 📝 Cara Membuat Master Key

### Metode 1: Menggunakan OpenSSL (Recommended)

#### Linux/macOS

```bash
echo -n "your-super-secret-password-here" | openssl dgst -sha256
```

Output:
```
(stdin)= 5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8
```

Copy hash tersebut (tanpa prefix `(stdin)=`).

#### Windows PowerShell

```powershell
$password = "your-super-secret-password-here"
$bytes = [System.Text.Encoding]::UTF8.GetBytes($password)
$hasher = [System.Security.Cryptography.SHA256]::Create()
$hash = $hasher.ComputeHash($bytes)
[BitConverter]::ToString($hash).Replace("-", "").ToLower()
```

### Metode 2: Menggunakan Online Tool (NOT RECOMMENDED untuk Production)

⚠️ **WARNING**: Jangan gunakan online tool untuk production! Hanya untuk testing.

1. Buka https://emn178.github.io/online-tools/sha256.html
2. Masukkan password Anda
3. Copy hash yang dihasilkan

### Metode 3: Menggunakan Node.js

```javascript
// create-master-key.js
const crypto = require('crypto');
const password = 'your-super-secret-password-here';
const hash = crypto.createHash('sha256').update(password).digest('hex');
console.log(hash);
```

Jalankan:
```bash
node create-master-key.js
```

## 🔧 Konfigurasi Master Key

### 1. Edit File `.env`

Buka file `.env` dan update `MASTER_KEY`:

```env
# Security - MASTER_KEY adalah SHA256 hash dari master password
MASTER_KEY=5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8
```

### 2. Verifikasi Format

Master key harus:
- ✅ Panjang **64 karakter** (SHA256 hash)
- ✅ Hanya berisi karakter hexadecimal (0-9, a-f)
- ✅ Lowercase (huruf kecil)

**Contoh VALID**:
```
5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8
```

**Contoh INVALID**:
```
5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d  # Terlalu pendek
5E884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8  # Ada uppercase
your-super-secret-password                                        # Plaintext, bukan hash
```

### 3. Restart Server

Setelah update master key, restart server:

```bash
# Stop server (Ctrl+C)
# Start ulang
npm run dev
```

## ⚠️ PENTING: Plain Text vs Hash

**SALAH PAHAM UMUM**: Banyak developer mengirim SHA256 hash di header X-Master-Key.

### Aturan Emas

| Lokasi | Format | Contoh |
|--------|--------|--------|
| **File `.env`** (Server) | SHA256 hash | `8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918` |
| **Header X-Master-Key** (Client) | Plain text | `admin` |
| **Server Process** | Hash client input → Compare with ENV | `SHA256(admin)` → Compare dengan MASTER_KEY |

### Flow yang BENAR

```
1. Client mengirim plain text:
   X-Master-Key: admin

2. Server menerima dan hash:
   const hash = SHA256('admin')
   → 8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918

3. Server compare dengan ENV:
   MASTER_KEY=8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918
   
4. Jika match → Allow, jika tidak → Reject
```

**JANGAN melakukan ini** ❌:
```bash
# SALAH: Mengirim hash dari client
curl -X GET http://localhost:3000/admin/tenants \
  -H "X-Master-Key: 8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918"
  # ❌ Server akan hash ini lagi, hasilnya tidak cocok!
```

## ✅ Verifikasi Master Key

Test apakah master key bekerja dengan memanggil admin endpoint.

**Asumsikan master password Anda adalah: `admin`**

### cURL Request (Plain Text)

```bash
curl -X GET http://localhost:3000/admin/tenants \
  -H "X-Master-Key: admin"
```

### PowerShell Request (Plain Text)

```powershell
$headers = @{
    "X-Master-Key" = "admin"
}

Invoke-RestMethod -Uri "http://localhost:3000/admin/tenants" `
    -Method Get `
    -Headers $headers
```

### Response jika BERHASIL

```json
{
  "success": true,
  "data": {
    "tenants": [],
    "total": 0
  }
}
```

### Response jika GAGAL (master key salah)

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid master key"
  }
}
```

## 🔒 Best Practices

### 1. Password yang Kuat

Gunakan password yang:
- Minimal 20 karakter
- Kombinasi huruf besar, kecil, angka, dan simbol
- Tidak menggunakan kata dalam kamus
- Tidak menggunakan informasi personal

**Contoh password kuat**:
```
My$uper$3cr3t!P@ssw0rd#2025
```

### 2. Simpan dengan Aman

- ✅ Simpan di password manager (1Password, Bitwarden, LastPass)
- ✅ Simpan di environment variables di production
- ✅ Gunakan secrets management (AWS Secrets Manager, HashiCorp Vault)
- ❌ JANGAN commit ke Git
- ❌ JANGAN simpan di plaintext di server
- ❌ JANGAN bagikan via email/chat

### 3. Rotasi Master Key (Advanced)

Untuk production, pertimbangkan rotasi master key secara berkala:

1. Generate master key baru
2. Update `.env` dengan key baru
3. Regenerate semua tenant API keys
4. Deploy dengan zero-downtime strategy

## 🔄 Mengganti Master Key

Jika master key ter-compromise atau ingin diganti:

### 1. Generate Master Key Baru

```bash
echo -n "new-super-secret-password" | openssl dgst -sha256
```

### 2. Update di Environment

```env
MASTER_KEY=new_hash_here
```

### 3. Regenerate Tenant API Keys

⚠️ **PENTING**: Semua tenant API key yang lama akan INVALID!

Semua tenant perlu request API key baru dari admin.

### 4. Komunikasikan ke Users

Inform semua tenant bahwa mereka perlu API key baru.

## 🚨 Troubleshooting

### Error: "MASTER_KEY is required"

**Penyebab**: File `.env` tidak ada atau MASTER_KEY kosong

**Solusi**:
```bash
# Pastikan file .env ada
ls -la .env

# Edit dan tambahkan MASTER_KEY
nano .env
```

### Error: "MASTER_KEY must be a valid SHA256 hash"

**Penyebab**: Format master key tidak valid (bukan 64 karakter hex)

**Solusi**: Generate ulang dengan cara yang benar (lihat di atas)

### Error: "Invalid master key" saat API call

**Penyebab**: Master key di request header tidak match dengan di server

**Solusi**:
1. Pastikan tidak ada typo
2. Pastikan tidak ada whitespace/newline
3. Pastikan menggunakan hash yang benar

```bash
# Test dengan curl verbose
curl -v -X GET http://localhost:3000/admin/tenants \
  -H "X-Master-Key: YOUR_MASTER_KEY_HERE"
```

## 📋 Checklist

Setelah membuat master key:

- [ ] Master key sudah di-generate dengan SHA256
- [ ] Master key berformat valid (64 hex characters)
- [ ] File `.env` sudah diupdate dengan MASTER_KEY
- [ ] Server bisa restart tanpa error
- [ ] Admin endpoint bisa diakses dengan master key
- [ ] Master key tersimpan aman (password manager)
- [ ] File `.env` sudah ada di `.gitignore`

## 🔐 Security Notes

**Yang BOLEH**:
- ✅ Generate master key dari password yang kuat
- ✅ Simpan hash di environment variables
- ✅ Gunakan master key untuk admin operations
- ✅ Rotasi master key secara berkala

**Yang TIDAK BOLEH**:
- ❌ Commit master key ke Git repository
- ❌ Share master key via email/chat/dokumen
- ❌ Hardcode master key di source code
- ❌ Log master key di application logs
- ❌ Expose master key di error messages

## ⏭️ Langkah Selanjutnya

Setelah master key siap:

1. **[Jalankan Server](03-running-server.md)** - Start server dengan master key
2. **[Buat Tenant](04-admin-create-tenant.md)** - Buat tenant pertama menggunakan admin API

---

**Prev**: [← Setup dan Instalasi](01-setup-instalasi.md)  
**Next**: [Jalankan Server →](03-running-server.md)
