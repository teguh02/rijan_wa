# Security Best Practices

## Key recommendations

- Keep `MASTER_KEY` secret and never commit it.
- Use HTTPS in production.
- Store Tenant API keys securely (treat them like passwords).
- Verify webhook signatures (`X-Rijan-Signature`).
- Limit network exposure (firewall / reverse proxy).

---

Indonesian reference: [../id/33-security-practices.md](../id/33-security-practices.md)
