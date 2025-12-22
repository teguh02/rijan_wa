# Health Check & Metrics (Admin)

This document explains how to monitor system health and metrics.

## Endpoints

### Basic health

`GET /health`

```bash
curl http://localhost:3000/health
```

### Detailed admin health

`GET /admin/health`

```bash
curl -X GET http://localhost:3000/admin/health \
  -H "X-Master-Key: YOUR_PLAIN_TEXT_PASSWORD"
```

### Admin metrics

`GET /admin/metrics`

```bash
curl -X GET http://localhost:3000/admin/metrics \
  -H "X-Master-Key: YOUR_PLAIN_TEXT_PASSWORD"
```

---

Indonesian reference: [../id/29-admin-health-metrics.md](../id/29-admin-health-metrics.md)
