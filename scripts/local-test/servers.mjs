/**
 * Stub servers for local testing
 * - Webhook receiver on :3101
 * - Static media server on :3102
 */

import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let webhookServer = null;
let mediaServer = null;

export function startStubServers() {
  return Promise.all([startWebhookServer(), startMediaServer()]);
}

export function stopStubServers() {
  return Promise.all([
    webhookServer
      ? new Promise((resolve) => webhookServer.close(() => resolve()))
      : Promise.resolve(),
    mediaServer
      ? new Promise((resolve) => mediaServer.close(() => resolve()))
      : Promise.resolve(),
  ]);
}

function startWebhookServer() {
  return new Promise((resolve, reject) => {
    webhookServer = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/webhook') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          console.log(`  [WEBHOOK] Received POST /webhook`);
          console.log(`    X-Rijan-Signature: ${req.headers['x-rijan-signature'] || 'N/A'}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    webhookServer.listen(3101, '127.0.0.1', () => {
      console.log('  Webhook stub server started on http://127.0.0.1:3101');
      resolve();
    });

    webhookServer.on('error', reject);
  });
}

function startMediaServer() {
  return new Promise((resolve, reject) => {
    // Create a dummy test image if it doesn't exist
    const fixturesDir = path.join(__dirname, 'fixtures');
    const testPngPath = path.join(fixturesDir, 'test.png');

    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    if (!fs.existsSync(testPngPath)) {
      // Create a minimal 1x1 PNG file
      const png = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
        0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x08, 0x99, 0x63, 0x00,
        0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
      ]);
      fs.writeFileSync(testPngPath, png);
    }

    mediaServer = http.createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/test.png') {
        const fileContent = fs.readFileSync(testPngPath);
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(fileContent);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    mediaServer.listen(3102, '127.0.0.1', () => {
      console.log('  Media stub server started on http://127.0.0.1:3102');
      resolve();
    });

    mediaServer.on('error', reject);
  });
}
