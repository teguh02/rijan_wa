# Master Key

The Master Key is the SHA256 hash that acts as the root authentication for admin endpoints.

## What is the Master Key?

- A SHA256 hash of your master password
- Used to authenticate admin endpoints
- Used as the base for signing tenant API keys
- Used to derive encryption keys

## Generate a Master Key

### Method 1: OpenSSL (Linux/macOS)

```bash
echo -n "your-super-secret-password-here" | openssl dgst -sha256
```

### Method 2: Windows PowerShell

```powershell
$password = "your-super-secret-password-here"
$bytes = [System.Text.Encoding]::UTF8.GetBytes($password)
$hasher = [System.Security.Cryptography.SHA256]::Create()
$hash = $hasher.ComputeHash($bytes)
[BitConverter]::ToString($hash).Replace("-", "").ToLower()
```

## Configure `.env`

Put the SHA256 hash (64 hex chars) into `.env`:

```env
MASTER_KEY=5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8
```

## Important: Plain Text vs Hash

A common mistake is sending the hash in the `X-Master-Key` header.

Golden rule:

| Location | Format |
|---|---|
| `.env` on the server | SHA256 hash |
| `X-Master-Key` request header | plain text password |

Correct flow:

1. Client sends plain text:
   `X-Master-Key: admin`
2. Server hashes it with SHA256
3. Server compares the result against `MASTER_KEY` in `.env`

## Verify

Example request (plain text password in header):

```bash
curl -X GET http://localhost:3000/admin/tenants \
  -H "X-Master-Key: admin"
```

---

Indonesian reference: [../id/02-master-key.md](../id/02-master-key.md)
