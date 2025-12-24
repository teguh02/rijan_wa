# Rate Limiting untuk Message APIs

## Mengapa Rate Limiting?

Rate limiting melindungi nomor WhatsApp Anda dari pembatasan/blokir oleh WhatsApp sendiri karena aktivitas mencurigakan (spam massal, pengiriman terlalu cepat, dll).

Contoh scenario yang ingin dihindari:
- Ada script PHP yang looping mengirim pesan ke ribuan nomor dalam hitungan detik
- Attacker menggunakan API Anda untuk spam
- Crash WhatsApp karena terlalu banyak pesan dikirim sekaligus

## Limit Rates untuk Setiap Endpoint

Rijan WA mengimplementasikan rate limiting **per device per tenant** untuk semua message APIs:

| Endpoint | Max Requests | Time Window | Catatan |
|----------|--------------|-------------|---------|
| `/messages/text` | 60 | 1 menit | Text messages paling ringan |
| `/messages/media` | 30 | 1 menit | Media (image, video, dll) lebih berat |
| `/messages/location` | 40 | 1 menit | Location sharing |
| `/messages/contact` | 40 | 1 menit | Contact/vCard |
| `/messages/reaction` | 100 | 1 menit | Emoji reactions |
| `/messages/poll` | 40 | 1 menit | Poll messages |

**Format**: Limit ini dihitung **per device per tenant**. Artinya:
- Tenant A dengan Device 1 mendapat 60 text messages per menit
- Tenant A dengan Device 2 mendapat 60 text messages per menit (terpisah)
- Tenant B dengan Device 1 mendapat 60 text messages per menit (terpisah)

## Cara Kerja

### 1. Request Normal (Allowed)

```bash
curl -X POST http://localhost:3000/v1/devices/device_xyz/messages/text \
  -H "Authorization: Bearer your_tenant_api_key" \
  -H "Content-Type: application/json" \
  -d '{"to": "628123456789", "text": "Hello"}'
```

**Response Headers** (2xx):
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 59
X-RateLimit-Reset: 60
```

| Header | Arti |
|--------|------|
| `X-RateLimit-Limit` | Max requests allowed dalam window |
| `X-RateLimit-Remaining` | Requests yang tersisa dalam window saat ini |
| `X-RateLimit-Reset` | Detik sampai limit reset |

### 2. Request Melampaui Limit (Blocked)

```bash
# Setelah 60 requests dalam 1 menit...
curl -X POST http://localhost:3000/v1/devices/device_xyz/messages/text \
  -H "Authorization: Bearer your_tenant_api_key" \
  -d '{"to": "628123456789", "text": "Hello"}'
```

**Response** (429 Too Many Requests):
```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded for text messages. Max 60 requests per minute. Retry after 45 seconds."
}
```

**Response Headers**:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 45
Retry-After: 45
```

## Implementasi

### Sliding Window Algorithm

Rijan WA menggunakan **sliding window counter** untuk rate limiting:

1. Setiap request dicatat dengan timestamp
2. Dalam window 1 menit, counter dihitung
3. Jika counter < limit → allow request
4. Jika counter >= limit → reject dengan 429

**Keuntungan:**
- Akurat dan fair untuk semua clients
- Memory efficient (cleanup otomatis setiap 5 menit)
- Tidak ada "burst" loopholes (beda dengan simple per-second limits)

### Storage

Rate limit data disimpan **in-memory** (tidak di database):
- Pro: Cepat, tidak ada I/O ke database
- Con: Data hilang saat server restart (tapi itu OK karena counter reset)

## Handling Rate Limit di Client

### Cek Response Headers

Sebelum mengirim banyak pesan, cek `X-RateLimit-Remaining`:

```javascript
async function sendMessage(deviceId, to, text) {
  const response = await fetch(
    `http://localhost:3000/v1/devices/${deviceId}/messages/text`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ to, text })
    }
  );

  // Cek remaining
  const remaining = response.headers.get('X-RateLimit-Remaining');
  const reset = response.headers.get('X-RateLimit-Reset');
  
  console.log(`Remaining: ${remaining}, Reset in: ${reset}s`);
  
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    console.log(`Rate limited! Retry after ${retryAfter} seconds`);
    await sleep(retryAfter * 1000);
    return sendMessage(deviceId, to, text); // Retry
  }
  
  return response.json();
}
```

### Batch & Queue (Recommended)

Untuk mengirim banyak pesan, gunakan queue dengan delay:

```javascript
const messageQueue = [];
let isProcessing = false;

async function queueMessage(deviceId, to, text) {
  messageQueue.push({ deviceId, to, text });
  processQueue();
}

async function processQueue() {
  if (isProcessing || messageQueue.length === 0) return;
  
  isProcessing = true;
  
  while (messageQueue.length > 0) {
    const msg = messageQueue.shift();
    
    try {
      const response = await sendMessage(msg.deviceId, msg.to, msg.text);
      const remaining = response.headers['x-ratelimit-remaining'];
      
      // Dynamic delay based on remaining quota
      if (remaining < 10) {
        await sleep(500); // Slow down if approaching limit
      } else if (remaining < 20) {
        await sleep(200);
      }
    } catch (error) {
      console.error('Failed to send:', error);
      if (error.status === 429) {
        // Put message back in queue
        messageQueue.unshift(msg);
        const retryAfter = error.headers['retry-after'];
        await sleep(retryAfter * 1000);
      }
    }
  }
  
  isProcessing = false;
}

// Usage
await queueMessage('device_1', '628123456789', 'Message 1');
await queueMessage('device_1', '628123456790', 'Message 2');
// ... lebih banyak pesan
// Queue akan diproses dengan rate limit yang aman
```

### PHP Example

```php
<?php
class MessageQueue {
  private $apiKey;
  private $deviceId;
  private $baseUrl = 'http://localhost:3000';
  private $messages = [];
  
  public function __construct($apiKey, $deviceId) {
    $this->apiKey = $apiKey;
    $this->deviceId = $deviceId;
  }
  
  public function addMessage($to, $text) {
    $this->messages[] = ['to' => $to, 'text' => $text];
  }
  
  public function send() {
    while (count($this->messages) > 0) {
      $msg = array_shift($this->messages);
      
      try {
        $this->sendMessage($msg['to'], $msg['text']);
      } catch (Exception $e) {
        if (strpos($e->getMessage(), '429') !== false) {
          // Rate limited, wait and retry
          $retryAfter = $this->getRetryAfter();
          echo "Rate limited! Waiting $retryAfter seconds...\n";
          sleep($retryAfter);
          
          // Put message back
          array_unshift($this->messages, $msg);
        } else {
          throw $e;
        }
      }
    }
  }
  
  private function sendMessage($to, $text) {
    $ch = curl_init();
    curl_setopt_array($ch, [
      CURLOPT_URL => "{$this->baseUrl}/v1/devices/{$this->deviceId}/messages/text",
      CURLOPT_HTTPHEADER => [
        "Authorization: Bearer {$this->apiKey}",
        'Content-Type: application/json'
      ],
      CURLOPT_POSTFIELDS => json_encode(['to' => $to, 'text' => $text]),
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_HEADER => true,
    ]);
    
    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($http_code === 429) {
      throw new Exception("Rate limited: $http_code");
    }
    
    if ($http_code !== 200) {
      throw new Exception("Failed: $http_code");
    }
  }
  
  private function getRetryAfter() {
    // Simpan dari response sebelumnya atau default 60
    return 60;
  }
}

// Usage
$queue = new MessageQueue($apiKey, 'device_xyz');

// Jangan looping curl langsung!
// $queue->addMessage(...) untuk setiap pesan
// Kemudian $queue->send() sekali

for ($i = 0; $i < 1000; $i++) {
  $queue->addMessage('628123456789', "Message $i");
}

$queue->send(); // Safe, akan handle rate limit otomatis
```

## Best Practices

### ✅ DO

1. **Gunakan queue dengan delay** untuk bulk messages
2. **Cek response headers** `X-RateLimit-Remaining` sebelum send
3. **Implement exponential backoff** untuk retry
4. **Gunakan idempotency key** untuk prevent duplicates jika retry
5. **Monitor log** untuk 429 errors

### ❌ DON'T

1. Langsung looping curl untuk ribuan pesan (JANGAN LAKUKAN!)
   ```javascript
   // ❌ WRONG - Will be rate limited and cause issues
   for (let i = 0; i < 1000; i++) {
     await fetch(`...messages/text`, { body: JSON.stringify({...}) });
   }
   ```

2. Mengabaikan Retry-After header
3. Mengirim pesan lebih dari 1x/detik per device
4. Mengirim ke ribuan nomor berbeda sekaligus (akan terdeteksi sebagai spam)

## Advanced: Custom Rate Limits

Jika ingin mengubah rate limit, edit `src/utils/rate-limit.ts`:

```typescript
export const MESSAGE_RATE_LIMITS: Record<string, RateLimitConfig> = {
  text: {
    maxRequests: 120,  // Ubah dari 60 ke 120
    windowMs: 60 * 1000,
  },
  // ... endpoint lainnya
};
```

Setelah perubahan, rebuild dan restart server.

## Monitoring

### Check Rate Limit Status (Admin)

```bash
curl -X GET http://localhost:3000/admin/rate-limit/stats \
  -H "X-Master-Key: your_master_password"
```

Response:
```json
{
  "totalKeys": 5,
  "entries": [
    {
      "key": "tenant_1:device_1:text",
      "count": 45,
      "resetIn": 15000
    },
    {
      "key": "tenant_1:device_1:media",
      "count": 20,
      "resetIn": 15000
    }
  ]
}
```

### Reset Rate Limit (Admin)

```bash
curl -X POST http://localhost:3000/admin/rate-limit/reset \
  -H "X-Master-Key: your_master_password" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "tenant_1",
    "deviceId": "device_1"
  }'
```

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| 429 Too Many Requests | Melebihi rate limit | Tunggu sesuai `Retry-After` header, implementasi queue |
| X-RateLimit-Remaining: 0 | Sudah melebihi limit | Tunggu `X-RateLimit-Reset` detik |
| Messages lambat dikirim | Queue terlalu besar atau rate limit terlalu ketat | Increase limit atau scale dengan multiple devices |
| WhatsApp nomor terblokir | Sudah mengirim terlalu banyak pesan sebelum rate limiting | Hubungi WhatsApp support, tunggu cooldown period |

## FAQ

**Q: Bagaimana jika ingin mengirim pesan ke 10.000 nomor?**
A: Gunakan queue/batch processing dengan delay antar request. Spread across multiple devices jika possible. Estimate: 60 messages/menit = 1.000 nomor per ~16 menit.

**Q: Apakah rate limit per device atau per tenant?**
A: Per device. Jadi jika tenant punya 3 device, setiap device punya quota tersendiri.

**Q: Bagaimana jika server di-restart, apakah rate limit reset?**
A: Ya, rate limit in-memory akan reset. Tidak apa-apa karena tujuannya protect production bukan accounting.

**Q: Bisa disable rate limit?**
A: Bisa, tapi tidak recommended. Jika perlu, set `maxRequests` ke angka sangat tinggi di rate-limit.ts.

---

Implementasi rate limiting ini memastikan nomor WhatsApp Anda aman dari pembatasan oleh WhatsApp!
