# Troubleshooting

This document lists common issues and quick fixes.

## Common checks

- Ensure the server is running: `npm run dev`
- Verify health: `GET /health`
- Verify readiness: `GET /ready`
- Ensure the device is connected: `GET /v1/devices/:deviceId/health`

## Pairing issues

- If QR code expires, request a new one:
  `POST /v1/devices/:deviceId/pairing/qr`
- If you logged out the device, you must pair again.

## Auth issues

- Admin endpoints: `X-Master-Key` must be **plain text** master password.
- Tenant endpoints: `Authorization: Bearer <TENANT_API_KEY>`.

---

Indonesian reference: [../id/30-troubleshooting.md](../id/30-troubleshooting.md)
