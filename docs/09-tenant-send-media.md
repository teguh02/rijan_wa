# Mengirim Media (Tenant)

Panduan lengkap untuk mengirim media (gambar, video, audio, dokumen) melalui WhatsApp API.

## 🔑 Prerequisites

- Device sudah connected
- Tenant API Key tersedia
- Media file sudah ter-upload atau URL accessible

## 📷 Mengirim Gambar (Image)

### Endpoint

```
POST /v1/devices/:deviceId/messages/image
```

### cURL - Send dari URL

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789/messages/image \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "628123456789",
    "image_url": "https://example.com/images/product.jpg",
    "caption": "Produk terbaru kami! 🎉"
  }'
```

### cURL - Upload File

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789/messages/image \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "to=628123456789" \
  -F "caption=Produk terbaru kami!" \
  -F "file=@/path/to/image.jpg"
```

### PowerShell - Send dari URL

```powershell
$headers = @{
    "Authorization" = "Bearer YOUR_API_KEY"
    "Content-Type" = "application/json"
}

$body = @{
    to = "628123456789"
    image_url = "https://example.com/images/product.jpg"
    caption = "Produk terbaru kami! 🎉"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/v1/devices/device_xyz789/messages/image" `
    -Method Post `
    -Headers $headers `
    -Body $body
```

### PowerShell - Upload File

```powershell
$boundary = [System.Guid]::NewGuid().ToString()
$headers = @{
    "Authorization" = "Bearer YOUR_API_KEY"
    "Content-Type" = "multipart/form-data; boundary=$boundary"
}

$filePath = "C:\path\to\image.jpg"
$fileBytes = [System.IO.File]::ReadAllBytes($filePath)
$fileContent = [System.Text.Encoding]::GetEncoding('iso-8859-1').GetString($fileBytes)

$bodyLines = @(
    "--$boundary"
    "Content-Disposition: form-data; name=`"to`""
    ""
    "628123456789"
    "--$boundary"
    "Content-Disposition: form-data; name=`"caption`""
    ""
    "Produk terbaru kami!"
    "--$boundary"
    "Content-Disposition: form-data; name=`"file`"; filename=`"image.jpg`""
    "Content-Type: image/jpeg"
    ""
    $fileContent
    "--$boundary--"
) -join "`r`n"

Invoke-RestMethod -Uri "http://localhost:3000/v1/devices/device_xyz789/messages/image" `
    -Method Post `
    -Headers $headers `
    -Body $bodyLines
```

### Response

```json
{
  "success": true,
  "data": {
    "message_id": "msg_img_abc123",
    "status": "pending",
    "to": "628123456789@s.whatsapp.net",
    "media_type": "image",
    "timestamp": 1703145600
  }
}
```

### Image Specs

| Spec | Value |
|------|-------|
| **Max Size** | 16 MB |
| **Format** | JPG, JPEG, PNG, GIF, WebP |
| **Recommended** | JPEG, max 5 MB |
| **Caption** | Max 1,024 karakter |

## 🎥 Mengirim Video

### Endpoint

```
POST /v1/devices/:deviceId/messages/video
```

### cURL Request

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789/messages/video \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "628123456789",
    "video_url": "https://example.com/videos/tutorial.mp4",
    "caption": "Tutorial penggunaan produk"
  }'
```

### Upload File

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789/messages/video \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "to=628123456789" \
  -F "caption=Tutorial penggunaan" \
  -F "file=@/path/to/video.mp4"
```

### Video Specs

| Spec | Value |
|------|-------|
| **Max Size** | 64 MB |
| **Format** | MP4, 3GP, AVI, MKV |
| **Recommended** | MP4 (H.264), max 30 MB |
| **Caption** | Max 1,024 karakter |

## 🎵 Mengirim Audio

### Endpoint

```
POST /v1/devices/:deviceId/messages/audio
```

### cURL Request

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789/messages/audio \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "628123456789",
    "audio_url": "https://example.com/audio/voicemail.mp3"
  }'
```

### Upload File

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789/messages/audio \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "to=628123456789" \
  -F "file=@/path/to/audio.mp3"
```

### Audio Specs

| Spec | Value |
|------|-------|
| **Max Size** | 16 MB |
| **Format** | MP3, OGG, M4A, AAC, WAV |
| **Recommended** | MP3 atau OGG |
| **PTT** | Set `ptt=true` for voice message |

### Send as Voice Message

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789/messages/audio \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "628123456789",
    "audio_url": "https://example.com/audio/voice.ogg",
    "ptt": true
  }'
```

## 📄 Mengirim Dokumen

### Endpoint

```
POST /v1/devices/:deviceId/messages/document
```

### cURL Request

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789/messages/document \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "628123456789",
    "document_url": "https://example.com/files/invoice.pdf",
    "filename": "Invoice_12345.pdf",
    "caption": "Invoice untuk pesanan #12345"
  }'
```

### Upload File

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789/messages/document \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "to=628123456789" \
  -F "filename=Invoice_12345.pdf" \
  -F "caption=Invoice untuk pesanan #12345" \
  -F "file=@/path/to/invoice.pdf"
```

### Document Specs

| Spec | Value |
|------|-------|
| **Max Size** | 100 MB |
| **Format** | PDF, DOC, DOCX, XLS, XLSX, PPT, ZIP, TXT, etc. |
| **Filename** | Required |
| **Caption** | Optional, max 1,024 karakter |

## 🎯 Use Cases

### 1. Product Catalog

```bash
# Send product image
curl -X POST http://localhost:3000/v1/devices/device_xyz789/messages/image \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "628123456789",
    "image_url": "https://cdn.shop.com/products/product-001.jpg",
    "caption": "*Samsung Galaxy S23*\n\nHarga: Rp 10.999.000\nStok: Tersedia\n\nBeli sekarang! 🛒"
  }'
```

### 2. Invoice Document

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789/messages/document \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "628123456789",
    "document_url": "https://invoices.company.com/INV-12345.pdf",
    "filename": "Invoice_INV-12345.pdf",
    "caption": "*Invoice Pembayaran*\n\nOrder ID: #12345\nTotal: Rp 5.500.000\n\nMohon segera dilakukan pembayaran."
  }'
```

### 3. Tutorial Video

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789/messages/video \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "628123456789",
    "video_url": "https://tutorials.company.com/setup-guide.mp4",
    "caption": "📹 *Tutorial Setup*\n\nDurasi: 5 menit\nLevel: Beginner"
  }'
```

### 4. Voice Message

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz789/messages/audio \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "628123456789",
    "audio_url": "https://storage.company.com/voicemails/vm-001.ogg",
    "ptt": true
  }'
```

## 🔒 Media URL Security

### ⚠️ SSRF Protection

API ini **memvalidasi** URL media untuk mencegah SSRF attacks:

**BLOCKED URLs**:
```
http://localhost/file.jpg          # Localhost
http://127.0.0.1/file.jpg          # Loopback
http://192.168.1.100/file.jpg      # Private IP
http://10.0.0.1/file.jpg           # Private IP
http://172.16.0.1/file.jpg         # Private IP
ftp://example.com/file.jpg         # Non-HTTP(S)
file:///etc/passwd                 # File protocol
```

**ALLOWED URLs**:
```
https://cdn.example.com/file.jpg   # Public HTTPS
http://cdn.example.com/file.jpg    # Public HTTP
https://storage.googleapis.com/... # Cloud storage
https://s3.amazonaws.com/...       # AWS S3
```

### Error: Blocked URL

```json
{
  "success": false,
  "error": {
    "code": "INVALID_MEDIA_URL",
    "message": "Media URL is not allowed: localhost/private IP detected"
  }
}
```

## 📤 Upload vs URL

### Option 1: Upload File (Multipart)

**Pros**:
- ✅ No need external hosting
- ✅ Secure - file tidak perlu public
- ✅ API handles storage

**Cons**:
- ❌ Slow untuk file besar
- ❌ Consume upload bandwidth

**When to use**: File kecil (<5 MB), private files

### Option 2: Send from URL

**Pros**:
- ✅ Fast - no upload needed
- ✅ Good untuk file besar
- ✅ CDN support

**Cons**:
- ❌ File must be publicly accessible
- ❌ Need external hosting

**When to use**: File besar, already hosted on CDN

## 🚨 Error Handling

### Error: File Too Large

```json
{
  "success": false,
  "error": {
    "code": "FILE_TOO_LARGE",
    "message": "File size exceeds maximum allowed size"
  }
}
```

**Solusi**: Compress file atau gunakan format yang lebih kecil

### Error: Unsupported Format

```json
{
  "success": false,
  "error": {
    "code": "UNSUPPORTED_FORMAT",
    "message": "File format not supported for this media type"
  }
}
```

**Solusi**: Convert ke format yang supported

### Error: Download Failed

```json
{
  "success": false,
  "error": {
    "code": "MEDIA_DOWNLOAD_FAILED",
    "message": "Failed to download media from URL"
  }
}
```

**Solusi**: 
- Verify URL accessible
- Check file permissions
- Try upload instead

### Error: Invalid URL

```json
{
  "success": false,
  "error": {
    "code": "INVALID_MEDIA_URL",
    "message": "Invalid media URL format"
  }
}
```

**Solusi**: Use full URL dengan `http://` atau `https://`

## 💡 Best Practices

### 1. Optimize Images

```bash
# Compress image before sending
convert input.jpg -quality 85 -resize 1920x1080\> output.jpg

# Send optimized image
curl -X POST http://localhost:3000/v1/devices/device_xyz789/messages/image \
  -H "Authorization: Bearer $API_KEY" \
  -F "to=628123456789" \
  -F "caption=Produk kami" \
  -F "file=@output.jpg"
```

### 2. Check File Size

```javascript
async function sendMedia(file) {
  const maxSize = 5 * 1024 * 1024; // 5 MB
  
  if (file.size > maxSize) {
    console.error('File too large');
    return false;
  }
  
  // Send file...
}
```

### 3. Retry Logic

```javascript
async function sendMediaWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await sendMediaUrl(url);
      if (response.success) return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
}
```

### 4. Use CDN

```javascript
// Good - Use CDN
const imageUrl = "https://cdn.myshop.com/products/product-001.jpg";

// Bad - Direct server
const imageUrl = "https://myshop.com/uploads/product-001.jpg";
```

## ⏭️ Langkah Selanjutnya

1. **[Mengirim Location](10-tenant-send-location.md)** - Kirim lokasi GPS
2. **[Mengirim Contact](11-tenant-send-contact.md)** - Kirim contact card
3. **[Download Media](15-tenant-download-media.md)** - Download media dari received messages

---

**Prev**: [← Mengirim Pesan Text](08-tenant-send-text.md)  
**Next**: [Mengirim Location →](10-tenant-send-location.md)
