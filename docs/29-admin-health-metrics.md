# Health Check & Metrics (Admin)

Panduan untuk monitoring kesehatan sistem dan metrics WhatsApp Gateway.

## 🔑 Prerequisites

- Master Key tersedia (untuk admin endpoints)
- Server running

## 🏥 Health Check

### Basic Health Check

```bash
curl -X GET http://localhost:3000/health
```

Response:
```json
{
  "status": "alive",
  "timestamp": 1703145600,
  "uptime": 3600,
  "version": "1.0.0"
}
```

### Detailed Health Check (Admin)

```bash
curl -X GET http://localhost:3000/admin/health \
  -H "X-Master-Key: YOUR_MASTER_KEY"
```

Response:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": 1703145600,
    "uptime": 3600,
    "version": "1.0.0",
    "database": {
      "status": "connected",
      "tables": 5,
      "size_mb": 12.5
    },
    "devices": {
      "total": 10,
      "connected": 8,
      "disconnected": 2,
      "connecting": 0
    },
    "tenants": {
      "total": 5,
      "active": 5,
      "suspended": 0
    },
    "memory": {
      "used_mb": 256,
      "free_mb": 768,
      "usage_percent": 25
    },
    "cpu": {
      "usage_percent": 15,
      "load_average": [0.5, 0.6, 0.7]
    }
  }
}
```

## 📊 System Metrics

### Get System Metrics

```bash
curl -X GET http://localhost:3000/admin/metrics \
  -H "X-Master-Key: YOUR_MASTER_KEY"
```

Response:
```json
{
  "success": true,
  "data": {
    "messages": {
      "sent_today": 1250,
      "sent_this_hour": 85,
      "failed_today": 12,
      "success_rate": 99.04
    },
    "devices": {
      "total": 10,
      "active": 8,
      "uptime_percent": 98.5
    },
    "tenants": {
      "total": 5,
      "active_today": 4
    },
    "api": {
      "requests_today": 5420,
      "avg_response_time_ms": 125,
      "error_rate": 0.5
    },
    "storage": {
      "database_size_mb": 12.5,
      "media_size_mb": 450.2,
      "total_size_mb": 462.7
    }
  }
}
```

## 📈 Device Metrics

### List All Devices (Admin)

```bash
curl -X GET http://localhost:3000/admin/devices \
  -H "X-Master-Key: YOUR_MASTER_KEY"
```

Response:
```json
{
  "success": true,
  "data": {
    "devices": [
      {
        "device_id": "device_xyz789",
        "tenant_id": "tenant_abc123",
        "label": "Customer Service",
        "status": "connected",
        "phone_number": "628123456789",
        "uptime_seconds": 86400,
        "messages_sent_today": 150,
        "last_activity": 1703145600
      },
      {
        "device_id": "device_def456",
        "tenant_id": "tenant_abc123",
        "label": "Sales Team",
        "status": "disconnected",
        "phone_number": null,
        "uptime_seconds": 0,
        "messages_sent_today": 0,
        "last_activity": 1703059200
      }
    ],
    "total": 2
  }
}
```

### Device Health (Tenant)

```bash
curl -X GET http://localhost:3000/v1/devices/device_xyz789/health \
  -H "Authorization: Bearer YOUR_TENANT_API_KEY"
```

Response:
```json
{
  "success": true,
  "data": {
    "is_connected": true,
    "status": "connected",
    "wa_jid": "628123456789@s.whatsapp.net",
    "phone_number": "628123456789",
    "last_connect_at": 1703145600,
    "uptime": 86400,
    "battery": {
      "percentage": 85,
      "plugged": true
    },
    "messages_pending": 5
  }
}
```

## 📉 Message Statistics

### Message Stats (Admin)

```bash
curl -X GET http://localhost:3000/admin/messages/stats \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  -H "Content-Type: application/json"
```

Query parameters:
- `period`: `today`, `week`, `month`, `year`
- `tenant_id`: Filter by tenant (optional)
- `device_id`: Filter by device (optional)

Example:
```bash
curl -X GET "http://localhost:3000/admin/messages/stats?period=today&tenant_id=tenant_abc123" \
  -H "X-Master-Key: YOUR_MASTER_KEY"
```

Response:
```json
{
  "success": true,
  "data": {
    "period": "today",
    "total_sent": 1250,
    "total_failed": 12,
    "total_delivered": 1180,
    "total_read": 950,
    "success_rate": 99.04,
    "by_type": {
      "text": 800,
      "image": 300,
      "video": 100,
      "document": 50
    },
    "by_device": [
      {
        "device_id": "device_xyz789",
        "label": "Customer Service",
        "sent": 600,
        "failed": 5
      },
      {
        "device_id": "device_def456",
        "label": "Sales Team",
        "sent": 650,
        "failed": 7
      }
    ]
  }
}
```

## 🚨 Alerts & Monitoring

### Get Alerts (Admin)

```bash
curl -X GET http://localhost:3000/admin/alerts \
  -H "X-Master-Key: YOUR_MASTER_KEY"
```

Response:
```json
{
  "success": true,
  "data": {
    "alerts": [
      {
        "alert_id": "alert_001",
        "level": "warning",
        "type": "device_disconnected",
        "message": "Device device_xyz789 has been disconnected",
        "device_id": "device_xyz789",
        "tenant_id": "tenant_abc123",
        "timestamp": 1703145600,
        "acknowledged": false
      },
      {
        "alert_id": "alert_002",
        "level": "error",
        "type": "high_failure_rate",
        "message": "Message failure rate is 15% (threshold: 5%)",
        "tenant_id": "tenant_def456",
        "timestamp": 1703145500,
        "acknowledged": false
      }
    ],
    "total": 2,
    "unacknowledged": 2
  }
}
```

### Acknowledge Alert

```bash
curl -X POST http://localhost:3000/admin/alerts/alert_001/acknowledge \
  -H "X-Master-Key: YOUR_MASTER_KEY"
```

## 📊 Prometheus Metrics

### Metrics Endpoint

```bash
curl -X GET http://localhost:3000/metrics
```

Response (Prometheus format):
```
# HELP whatsapp_messages_sent_total Total messages sent
# TYPE whatsapp_messages_sent_total counter
whatsapp_messages_sent_total{tenant="tenant_abc123",device="device_xyz789"} 1250

# HELP whatsapp_messages_failed_total Total messages failed
# TYPE whatsapp_messages_failed_total counter
whatsapp_messages_failed_total{tenant="tenant_abc123",device="device_xyz789"} 12

# HELP whatsapp_devices_connected Current number of connected devices
# TYPE whatsapp_devices_connected gauge
whatsapp_devices_connected 8

# HELP whatsapp_api_requests_total Total API requests
# TYPE whatsapp_api_requests_total counter
whatsapp_api_requests_total{method="POST",endpoint="/v1/devices/:id/messages/text",status="200"} 5420
```

### Prometheus Configuration

`prometheus.yml`:
```yaml
scrape_configs:
  - job_name: 'whatsapp-gateway'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
```

## 📈 Grafana Dashboard

### Import Dashboard

1. Open Grafana
2. Go to **Dashboards** → **Import**
3. Use dashboard ID atau upload JSON

### Key Metrics to Monitor

**Device Health**:
- Total devices
- Connected devices
- Device uptime
- Connection status changes

**Message Metrics**:
- Messages sent per minute
- Message success rate
- Message delivery time
- Failed message count

**System Resources**:
- CPU usage
- Memory usage
- Disk usage
- API response time

**Business Metrics**:
- Active tenants
- Messages per tenant
- Revenue (if applicable)

## 🔍 Log Monitoring

### View Logs (Admin)

```bash
curl -X GET http://localhost:3000/admin/logs \
  -H "X-Master-Key: YOUR_MASTER_KEY"
```

Query parameters:
- `level`: `debug`, `info`, `warn`, `error`
- `limit`: Default 100, max 1000
- `since`: Unix timestamp

Example:
```bash
curl -X GET "http://localhost:3000/admin/logs?level=error&limit=50" \
  -H "X-Master-Key: YOUR_MASTER_KEY"
```

Response:
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "timestamp": 1703145600,
        "level": "error",
        "message": "Failed to send message",
        "device_id": "device_xyz789",
        "error": "Connection timeout",
        "stack_trace": "..."
      }
    ],
    "total": 50
  }
}
```

### Live Logs (Server)

```bash
# Development
npm run dev

# Production with PM2
pm2 logs rijan-wa

# Follow logs
tail -f logs/app.log

# Filter errors only
tail -f logs/app.log | grep ERROR
```

## 🎯 Monitoring Best Practices

### 1. Set Up Alerts

Monitor critical metrics:
- Device disconnections
- High message failure rate (>5%)
- API error rate (>1%)
- High memory/CPU usage (>80%)
- Disk space low (<10% free)

### 2. Regular Health Checks

```bash
#!/bin/bash
# healthcheck.sh

response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health)

if [ $response -ne 200 ]; then
  echo "Health check failed with status $response"
  # Send alert
  curl -X POST "https://alerts.company.com/webhook" \
    -H "Content-Type: application/json" \
    -d '{"message": "WhatsApp Gateway health check failed"}'
fi
```

### 3. Monitor Device Uptime

```javascript
// Check device uptime every 5 minutes
setInterval(async () => {
  const devices = await getDevices();
  
  for (const device of devices) {
    const health = await checkDeviceHealth(device.device_id);
    
    if (!health.is_connected && device.status === 'connected') {
      // Device disconnected unexpectedly
      await sendAlert({
        type: 'device_disconnected',
        device_id: device.device_id,
        message: `Device ${device.label} disconnected`
      });
    }
  }
}, 5 * 60 * 1000);
```

### 4. Track Message Success Rate

```javascript
// Monitor message success rate
async function checkMessageSuccessRate() {
  const stats = await getMessageStats('today');
  const successRate = (stats.total_sent - stats.total_failed) / stats.total_sent * 100;
  
  if (successRate < 95) {
    await sendAlert({
      type: 'low_success_rate',
      message: `Message success rate is ${successRate.toFixed(2)}%`,
      threshold: 95
    });
  }
}

// Check every hour
setInterval(checkMessageSuccessRate, 60 * 60 * 1000);
```

## 🚨 Troubleshooting

### High Memory Usage

```bash
# Check memory
curl -X GET http://localhost:3000/admin/health \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  | jq '.data.memory'

# If high (>80%), restart services
pm2 restart rijan-wa
```

### High CPU Usage

```bash
# Check CPU
curl -X GET http://localhost:3000/admin/health \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  | jq '.data.cpu'

# Check processes
top -p $(pgrep -f "node")
```

### Database Growing

```bash
# Check database size
curl -X GET http://localhost:3000/admin/metrics \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  | jq '.data.storage'

# Cleanup old data
curl -X POST http://localhost:3000/admin/cleanup \
  -H "X-Master-Key: YOUR_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"older_than_days": 90}'
```

## ⏭️ Langkah Selanjutnya

1. **[Troubleshooting](30-troubleshooting.md)** - Common issues dan solutions
2. **[Security Best Practices](33-security-practices.md)** - Secure your gateway
3. **[API Reference](README.md)** - Complete API documentation

---

**Prev**: [← Privacy Settings](28-tenant-privacy-settings.md)  
**Next**: [Troubleshooting →](30-troubleshooting.md)
