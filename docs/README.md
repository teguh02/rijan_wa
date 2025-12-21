# Dokumentasi Rijan WA Gateway

Selamat datang di dokumentasi Rijan WA Gateway - WhatsApp Gateway berbasis Baileys dengan arsitektur multi-tenant dan multi-device.

## 📚 Daftar Isi

### 🚀 Getting Started
1. [Setup dan Instalasi](01-setup-instalasi.md)
2. [Membuat Master Key](02-master-key.md)
3. [Menjalankan Server](03-running-server.md)

### 👨‍💼 Admin (Master Key Required)
4. [Membuat Tenant](04-admin-create-tenant.md)
5. [Membuat Device untuk Tenant](05-admin-create-device.md)
6. [Management Tenant](06-admin-manage-tenant.md)

### 📱 Tenant Operations (API Key Required)
7. [Start Device & Pairing](07-tenant-start-device.md)
8. [Mengirim Pesan Text](08-tenant-send-text.md)
9. [Mengirim Media (Gambar/Video/Audio)](09-tenant-send-media.md)
10. [Mengirim Location](10-tenant-send-location.md)
11. [Mengirim Contact](11-tenant-send-contact.md)
12. [Mengirim Reaction](12-tenant-send-reaction.md)
13. [Menghapus Pesan](13-tenant-delete-message.md)

### 💬 Chat Management
14. [List Chats](14-tenant-list-chats.md)
15. [Get Messages](15-tenant-get-messages.md)
16. [Mark as Read](16-tenant-mark-read.md)
17. [Archive/Unarchive Chat](17-tenant-archive-chat.md)
18. [Mute/Unmute Chat](18-tenant-mute-chat.md)

### 🔔 Webhooks & Events
19. [Registrasi Webhook](19-tenant-webhook-register.md)
20. [Mengelola Webhook](20-tenant-webhook-manage.md)
21. [Menerima Event Inbound](21-tenant-receive-events.md)
22. [Pull Events dari Server](22-tenant-pull-events.md)

### 👥 Group Management
23. [Membuat Group](23-tenant-create-group.md)
24. [Get Group Info](24-tenant-group-info.md)
25. [Menambah Member Group](25-tenant-add-members.md)
26. [Menghapus Member Group](26-tenant-remove-members.md)

### 🔒 Privacy Settings
27. [Get Privacy Settings](27-tenant-get-privacy.md)
28. [Update Privacy Settings](28-tenant-update-privacy.md)

### 📊 Monitoring & Troubleshooting
29. [Health Check & Metrics](29-health-metrics.md)
30. [Error Handling](30-error-handling.md)
31. [Troubleshooting](31-troubleshooting.md)

### 📖 Advanced Topics
32. [Multi-Instance Deployment](32-multi-instance.md)
33. [Security Best Practices](33-security-practices.md)
34. [Rate Limiting](34-rate-limiting.md)
35. [Audit Logging](35-audit-logging.md)

## 🎯 Quick Start Guide

Untuk memulai dengan cepat:

1. **Setup Server** → [01-setup-instalasi.md](01-setup-instalasi.md)
2. **Generate Master Key** → [02-master-key.md](02-master-key.md)
3. **Buat Tenant** → [04-admin-create-tenant.md](04-admin-create-tenant.md)
4. **Buat Device** → [05-admin-create-device.md](05-admin-create-device.md)
5. **Start & Pairing** → [07-tenant-start-device.md](07-tenant-start-device.md)
6. **Kirim Pesan** → [08-tenant-send-text.md](08-tenant-send-text.md)

## 🌟 Fitur Utama

- ✅ Multi-tenant dengan isolasi penuh
- ✅ Multi-device WhatsApp per tenant
- ✅ QR Code & Pairing Code authentication
- ✅ Kirim berbagai tipe pesan (text, media, location, contact, reaction)
- ✅ Chat management (list, archive, mute, mark read)
- ✅ Group management (create, add/remove members)
- ✅ Webhook system dengan HMAC-SHA256 signing
- ✅ Event system (inbound messages, receipts, group updates)
- ✅ Privacy settings control
- ✅ Health check & Prometheus metrics
- ✅ Distributed locking untuk multi-instance
- ✅ Audit logging untuk operasi sensitif
- ✅ Rate limiting per tenant
- ✅ Auto-reconnect & session recovery

## 🔐 Security Model

- **MASTER_KEY**: SHA256 hash untuk admin authentication
- **API Key**: HMAC-signed token per tenant dengan expiration (365 hari)
- **Encryption**: AES-256-GCM untuk credential storage
- **Isolation**: Tenant data isolation di semua layer

## 📞 Support

Jika menemui masalah:
1. Cek [Troubleshooting](31-troubleshooting.md)
2. Review [Error Handling](30-error-handling.md)
3. Cek health endpoint `/health` dan `/ready`

## 📄 License

MIT License

---

**Version**: 1.3.1  
**Last Updated**: December 21, 2025
