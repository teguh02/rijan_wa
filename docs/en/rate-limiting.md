# Rate Limiting for Message APIs

## Why Rate Limiting?

Rate limiting protects your WhatsApp number from being throttled or blocked by WhatsApp itself due to suspicious activity (mass spam, excessive sending speed, etc.).

Example scenarios to avoid:
- A PHP script loops and sends messages to thousands of numbers in seconds
- An attacker uses your API for spam
- WhatsApp crashes due to too many messages sent at once

## Rate Limits for Each Endpoint

Rijan WA implements **per device per tenant** rate limiting for all message APIs:

| Endpoint | Max Requests | Time Window | Notes |
|----------|--------------|-------------|-------|
| `/messages/text` | 60 | 1 minute | Text messages are lightweight |
| `/messages/media` | 30 | 1 minute | Media (images, videos, etc) is heavier |
| `/messages/location` | 40 | 1 minute | Location sharing |
| `/messages/contact` | 40 | 1 minute | Contact/vCard |
| `/messages/reaction` | 100 | 1 minute | Emoji reactions |
| `/messages/poll` | 40 | 1 minute | Poll messages |

**Format**: Limits are calculated **per device per tenant**. Meaning:
- Tenant A with Device 1 gets 60 text messages per minute
- Tenant A with Device 2 gets 60 text messages per minute (separate)
- Tenant B with Device 1 gets 60 text messages per minute (separate)

## How It Works

### 1. Normal Request (Allowed)

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

| Header | Meaning |
|--------|---------|
| `X-RateLimit-Limit` | Max requests allowed in window |
| `X-RateLimit-Remaining` | Remaining requests in current window |
| `X-RateLimit-Reset` | Seconds until limit resets |

### 2. Request Exceeds Limit (Blocked)

```bash
# After 60 requests within 1 minute...
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

## Implementation

### Sliding Window Algorithm

Rijan WA uses **sliding window counter** for rate limiting:

1. Each request is recorded with a timestamp
2. Within 1 minute window, counter is calculated
3. If counter < limit → allow request
4. If counter >= limit → reject with 429

**Advantages:**
- Accurate and fair for all clients
- Memory efficient (auto cleanup every 5 minutes)
- No "burst" loopholes (different from simple per-second limits)

### Storage

Rate limit data is stored **in-memory** (not in database):
- Pro: Fast, no database I/O
- Con: Data lost on server restart (but that's OK since counter resets)

## Handling Rate Limits in Your Client

### Check Response Headers

Before sending many messages, check `X-RateLimit-Remaining`:

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

  // Check remaining quota
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

For sending many messages, use a queue with delays:

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
// ... more messages
// Queue will be processed safely with rate limit
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
    // Store from previous response or default to 60
    return 60;
  }
}

// Usage
$queue = new MessageQueue($apiKey, 'device_xyz');

// Don't loop curl directly!
// Use $queue->addMessage(...) for each message
// Then call $queue->send() once

for ($i = 0; $i < 1000; $i++) {
  $queue->addMessage('628123456789', "Message $i");
}

$queue->send(); // Safe, will handle rate limit automatically
```

### Python Example

```python
import requests
import time

class MessageQueue:
    def __init__(self, api_key, device_id, base_url='http://localhost:3000'):
        self.api_key = api_key
        self.device_id = device_id
        self.base_url = base_url
        self.messages = []
    
    def add_message(self, to, text):
        self.messages.append({'to': to, 'text': text})
    
    def send(self):
        while self.messages:
            msg = self.messages.pop(0)
            
            try:
                response = requests.post(
                    f"{self.base_url}/v1/devices/{self.device_id}/messages/text",
                    headers={
                        'Authorization': f'Bearer {self.api_key}',
                        'Content-Type': 'application/json'
                    },
                    json=msg
                )
                
                if response.status_code == 429:
                    # Rate limited
                    retry_after = int(response.headers.get('Retry-After', 60))
                    print(f"Rate limited! Waiting {retry_after} seconds...")
                    time.sleep(retry_after)
                    self.messages.insert(0, msg)  # Put back in queue
                elif response.status_code != 200:
                    print(f"Failed: {response.status_code} - {response.text}")
                else:
                    print(f"Message sent: {msg['to']}")
                    
            except requests.exceptions.RequestException as e:
                print(f"Error: {e}")
                self.messages.insert(0, msg)  # Put back in queue

# Usage
queue = MessageQueue(api_key='your_key', device_id='device_xyz')

for i in range(1000):
    queue.add_message('628123456789', f'Message {i}')

queue.send()  # Safe, will handle rate limit automatically
```

## Best Practices

### ✅ DO

1. **Use queue with delays** for bulk message sending
2. **Check response headers** `X-RateLimit-Remaining` before sending
3. **Implement exponential backoff** for retries
4. **Use idempotency key** to prevent duplicates on retry
5. **Monitor logs** for 429 errors

### ❌ DON'T

1. Loop curl directly for thousands of messages (DON'T DO THIS!)
   ```javascript
   // ❌ WRONG - Will be rate limited and cause issues
   for (let i = 0; i < 1000; i++) {
     await fetch(`...messages/text`, { body: JSON.stringify({...}) });
   }
   ```

2. Ignore Retry-After header
3. Send messages more than 1x/second per device
4. Send to thousands of different numbers at once (will be detected as spam)

## Advanced: Custom Rate Limits

If you want to change rate limits, edit `src/utils/rate-limit.ts`:

```typescript
export const MESSAGE_RATE_LIMITS: Record<string, RateLimitConfig> = {
  text: {
    maxRequests: 120,  // Change from 60 to 120
    windowMs: 60 * 1000,
  },
  // ... other endpoints
};
```

After changes, rebuild and restart the server.

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
| 429 Too Many Requests | Exceeded rate limit | Wait per `Retry-After` header, implement queue |
| X-RateLimit-Remaining: 0 | Already exceeded limit | Wait `X-RateLimit-Reset` seconds |
| Messages sending slowly | Queue too large or rate limit too strict | Increase limit or scale with multiple devices |
| WhatsApp number blocked | Sent too many messages before rate limiting | Contact WhatsApp support, wait cooldown period |

## FAQ

**Q: What if I need to send messages to 10,000 numbers?**
A: Use queue/batch processing with delays between requests. Spread across multiple devices if possible. Estimate: 60 messages/minute = 1,000 numbers per ~16 minutes.

**Q: Is rate limit per device or per tenant?**
A: Per device. So if a tenant has 3 devices, each device has its own quota.

**Q: What happens if the server restarts, does rate limit reset?**
A: Yes, the in-memory rate limit will reset. That's OK since the goal is to protect production, not for accounting.

**Q: Can I disable rate limit?**
A: Yes, but not recommended. If needed, set `maxRequests` to a very high number in rate-limit.ts.

---

This rate limiting implementation ensures your WhatsApp number is protected from throttling by WhatsApp!
