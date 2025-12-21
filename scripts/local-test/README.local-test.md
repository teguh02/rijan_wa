# Local Integration Test Runner

Automated HTTP-based integration testing for Rijan WA Gateway without Jest/Vitest/Mocha.

## Quick Start

```bash
# Run full test suite (start server + stub servers + tests + cleanup)
npm run test:local

# Run tests only (assumes server is already running)
npm run test:local:only

# With options
npm run test:local -- --verbose=true --cleanup=true
npm run test:local:only -- --skip-server=true
```

## Features

- ✅ Loads Postman collection (`postman/rijan_wa.postman_collection.json`)
- ✅ Automatic variable interpolation (`{{VAR}}`)
- ✅ Sequential request execution with proper status code assertions
- ✅ Automatic variable extraction from responses (TENANT_ID, DEVICE_ID, etc.)
- ✅ Stub servers for webhooks and media (no external network needed)
- ✅ Colored output with PASS/WARN/SKIP/FAIL reporting
- ✅ Cross-platform support (Windows, Linux, macOS)

## Environment Setup

### Required: MASTER_KEY

The test runner requires a MASTER_KEY. Set it via:

1. **Environment variable**:
   ```bash
   export MASTER_KEY=admin
   npm run test:local
   ```

2. **`.env` file** (simplest):
   ```env
   MASTER_KEY=admin
   BASE_URL=http://localhost:3000
   ```

3. **CLI parameter** (not yet implemented):
   ```bash
   npm run test:local -- --master-key=admin
   ```

## Test Execution Flow

1. Start local stub servers (webhook on :3101, media on :3102)
2. Start development server (`npm run dev`)
3. Wait for `/health` endpoint (max 30 seconds)
4. Execute requests from Postman collection in order
5. Extract variables from responses
6. Print colored results (PASS/WARN/SKIP/FAIL)
7. Stop development server
8. Stop stub servers
9. Exit with code 0 (all pass) or 1 (any fail)

## File Structure

```
scripts/local-test/
├── run-local-tests.mjs      # Main entrypoint (starts servers + tests)
├── local-tests.mjs          # Test runner (loads collection + executes)
├── http-client.mjs          # HTTP request wrapper with timeout
├── assert.mjs               # Assertions and colored output
├── servers.mjs              # Stub servers (webhook + media)
├── fixtures/
│   └── test.png            # Test image for media upload
└── README.local-test.md     # This file
```

## CLI Options

```bash
npm run test:local -- [options]

Options:
  --verbose=true|false        Enable verbose logging (default: false)
  --cleanup=true|false        Delete created resources at end (default: false)
  --base-url=...              API base URL (default: http://localhost:3000)
  --skip-server=true|false    Don't start dev server (default: false)
```

## Output Example

```
================================================================================
LOCAL INTEGRATION TEST RUNNER
================================================================================
Base URL: http://localhost:3000
Cleanup: false
Verbose: false
================================================================================

Found 63 requests to execute

  Webhook stub server started on http://127.0.0.1:3101
  Media stub server started on http://127.0.0.1:3102

Waiting for server to be ready at http://localhost:3000...
[INFO] Server is ready!

Starting tests...

[PASS] Public (No Auth) :: Health Check GET http://localhost:3000/health (200) 2ms
[PASS] Public (No Auth) :: Ready Check GET http://localhost:3000/ready (200) 1ms
[PASS] Public (No Auth) :: Metrics GET http://localhost:3000/metrics (200) 2ms
[PASS] Admin (X-Master-Key) :: Tenants :: Create Tenant POST http://localhost:3000/admin/tenants (201) 10ms
[PASS] Admin (X-Master-Key) :: Tenants :: List Tenants GET http://localhost:3000/admin/tenants (200) 5ms
[PASS] Admin (X-Master-Key) :: Devices (Admin Provisioning) :: Create Device POST http://localhost:3000/admin/tenants/tenant_abc123/devices (201) 8ms
[PASS] Tenant (Authorization Bearer) :: Devices :: List Devices GET http://localhost:3000/v1/devices (200) 3ms
...

================================================================================
TEST SUMMARY
================================================================================
Total:   63
Passed:  58
Warned:  3
Skipped: 2
Failed:  0
================================================================================

VARIABLES SAVED
────────────────────────────────────────────────────────────────────────────────
  TENANT_ID: tenant_ab462087ad0c606ee91a03ca30571275
  TENANT_API_KEY: tenant_ab462087ad0c606ee91a03ca30571275.17...
  DEVICE_ID: device_f936ddd472be5482b13b8276540c6dad
  MESSAGE_ID: msg_123456
  WA_MESSAGE_ID: 3EB0123456789F01
  WEBHOOK_ID: webhook_xyz789
  GROUP_JID: 1234567890-1234567890@g.us
  PAIRING_CODE: 123-456-789
────────────────────────────────────────────────────────────────────────────────
```

## Result Codes

- **[PASS]** - Request succeeded with expected status code
- **[WARN]** - Request succeeded but returned a warning status (e.g., device not connected)
- **[SKIP]** - Request skipped due to missing prerequisites (e.g., no MESSAGE_ID yet)
- **[FAIL]** - Request failed with unexpected status code (stops execution)

## Assertions

Status codes are checked against expected ranges:

- **Public endpoints**: Must return 200
- **Admin Create Tenant**: Must return 201
- **Admin Create Device**: Must return 201
- **Pairing endpoints**: Allow 200 or 409 (device already connected)
- **Messaging**: Allow 200/201/409/422 (allow device not connected)
- **Webhooks**: Allow 200/201 or 204 (varies by operation)

See `local-tests.mjs` `getAssertion()` function for complete rules.

## Variable Extraction

Automatically saved from responses:

| Variable Name | Extracted From | Used In |
|---|---|---|
| TENANT_ID | CreateTenant → data.tenant.id | Admin operations |
| TENANT_API_KEY | CreateTenant → data.api_key | Tenant endpoints (Bearer) |
| DEVICE_ID | CreateDevice → data.device.id | Device operations |
| MESSAGE_ID | Send Message → data.message_id | Message status checks |
| WA_MESSAGE_ID | Send Message → data.wa_message_id | Message operations |
| WEBHOOK_ID | Create Webhook → data.id | Webhook operations |
| GROUP_JID | Create Group → data.groupJid | Group operations |
| PAIRING_CODE | Request Pairing Code → data.pairing_code | Device pairing |
| QR_CODE | Get QR Code → data.qr_code | QR pairing |

## Stub Servers

### Webhook Receiver (localhost:3101)

Simple HTTP server that accepts webhook POSTs:

```
POST http://127.0.0.1:3101/webhook
Response: { ok: true }
```

Logs all requests with X-Rijan-Signature header for validation.

### Media Server (localhost:3102)

Serves a dummy PNG file for media upload tests:

```
GET http://127.0.0.1:3102/test.png
Response: 1x1 PNG file
```

Automatically creates `fixtures/test.png` if missing.

## Troubleshooting

### "MASTER_KEY is required"

Set MASTER_KEY in `.env`:
```env
MASTER_KEY=admin
```

Or via environment:
```bash
export MASTER_KEY=admin
npm run test:local
```

### "Server failed to start"

1. Check if port 3000 is already in use
2. Check `.env` file for valid configuration
3. Run `npm install` to ensure dependencies are installed
4. Check for TypeScript compilation errors in `npm run dev`

### "Collection file not found"

Ensure `postman/rijan_wa.postman_collection.json` exists in the project root.

### Tests stop at first failure

By design, a FAIL stops execution to help identify issues. Optional endpoints won't stop execution.

## Notes

- Tests are **not** unit tests, they're integration smoke tests via HTTP
- No real WhatsApp connection needed (device connection failures are expected warnings)
- Webhook and media servers are local stubs, no external network required
- Cross-platform: Works on Windows (npm.cmd), Linux/macOS (npm)
- Timeout is 15 seconds per request, 30 seconds for server startup
