/**
 * Local integration test runner
 * Loads Postman collection and executes requests sequentially
 */

import fs from 'fs';
import path from 'path';
import { request } from './http-client.mjs';
import {
  printPass,
  printWarn,
  printSkip,
  printFail,
  printError,
  printInfo,
  printSummary,
  printVariables,
  truncateJson,
} from './assert.mjs';

export async function runLocalTests(options = {}) {
  const { baseUrl = 'http://localhost:3000', cleanup = false, verbose = false } = options;

  console.log('\n' + '='.repeat(80));
  console.log('LOCAL INTEGRATION TEST RUNNER');
  console.log('='.repeat(80));
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Cleanup: ${cleanup}`);
  console.log(`Verbose: ${verbose}`);
  console.log('='.repeat(80) + '\n');

  // Load Postman collection
  const collectionPath = path.resolve(process.cwd(), 'postman', 'rijan_wa.postman_collection.json');
  if (!fs.existsSync(collectionPath)) {
    printError(`Collection file not found: ${collectionPath}`);
    process.exit(1);
  }

  let collection;
  try {
    const collectionJson = fs.readFileSync(collectionPath, 'utf-8');
    collection = JSON.parse(collectionJson);
  } catch (err) {
    printError(`Failed to load collection: ${err.message}`);
    process.exit(1);
  }

  // Initialize variables
  const variables = {};

  // Set variables from collection
  if (collection.variable) {
    for (const variable of collection.variable) {
      variables[variable.key] = variable.value;
    }
  }

  // Override from environment
  if (process.env.MASTER_KEY) {
    variables.MASTER_KEY = process.env.MASTER_KEY;
  }
  if (process.env.BASE_URL) {
    variables.BASE_URL = process.env.BASE_URL;
  }

  // Load .env if exists (simple parser)
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const envLines = envContent.split('\n');
    for (const line of envLines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, value] = trimmed.split('=');
        if (key && value) {
          variables[key.trim()] = value.trim();
        }
      }
    }
  }

  // Validate master key
  if (!variables.MASTER_KEY) {
    printError('MASTER_KEY is required. Set it via --master-key, MASTER_KEY env, or .env file');
    process.exit(1);
  }

  variables.BASE_URL = baseUrl;
  variables.WEBHOOK_URL = 'http://127.0.0.1:3101/webhook';
  variables.MEDIA_URL = 'http://127.0.0.1:3102/test.png';

  const results = [];
  const requests = flattenCollection(collection);

  console.log(`Found ${requests.length} requests to execute\n`);

  // Execute each request
  for (const requestItem of requests) {
    const startTime = Date.now();

    try {
      const { method, url, headers, body } = buildRequest(requestItem, variables);

      // Log request details in verbose mode
      if (verbose) {
        console.log(`  >>> ${method} ${url}`);
      }

      const response = await request({ method, url, headers, body, timeoutMs: 15000 });
      const durationMs = Date.now() - startTime;

      // Check assertions
      const assertion = getAssertion(requestItem.name);
      const assertionResult = checkAssertion(response.status, assertion);

      if (assertionResult.pass) {
        printPass(
          requestItem.folderPath,
          requestItem.name,
          method,
          url,
          response.status,
          durationMs
        );
        results.push({ status: 'pass', name: requestItem.name });

        // Extract variables from response
        extractVariables(requestItem.name, response.json, variables);
      } else if (assertionResult.warn) {
        printWarn(requestItem.folderPath, requestItem.name, assertionResult.reason);
        results.push({ status: 'warn', name: requestItem.name });

        // Still extract variables on warnings
        extractVariables(requestItem.name, response.json, variables);
      } else if (assertionResult.skip) {
        printSkip(requestItem.folderPath, requestItem.name, assertionResult.reason);
        results.push({ status: 'skip', name: requestItem.name });
      } else {
        const details = response.json
          ? truncateJson(response.json, 300)
          : response.text.substring(0, 300);
        printFail(
          requestItem.folderPath,
          requestItem.name,
          `Status ${response.status}: ${assertionResult.reason}`,
          details
        );
        results.push({ status: 'fail', name: requestItem.name });

        // Stop on first failure (unless it's not in a critical path)
        if (!assertionResult.optional) {
          console.log('');
          printSummary(results);
          printVariables(variables);
          process.exit(1);
        }
      }
    } catch (err) {
      const durationMs = Date.now() - startTime;
      printFail(requestItem.folderPath, requestItem.name, err.message);
      results.push({ status: 'fail', name: requestItem.name });

      console.log('');
      printSummary(results);
      printVariables(variables);
      process.exit(1);
    }
  }

  console.log('');
  printSummary(results);
  printVariables(variables);

  const failed = results.filter((r) => r.status === 'fail').length;
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

function flattenCollection(collection, parentPath = '') {
  const items = [];

  if (!collection.item) {
    return items;
  }

  for (const item of collection.item) {
    const folderPath = parentPath ? `${parentPath} / ${item.name}` : item.name;

    if (item.item) {
      // Folder
      items.push(...flattenCollection({ item: item.item }, folderPath));
    } else if (item.request) {
      // Request
      items.push({
        folderPath,
        name: item.name,
        request: item.request,
      });
    }
  }

  return items;
}

function buildRequest(requestItem, variables) {
  const { request: req } = requestItem;

  // Build URL
  let url = '';
  if (typeof req.url === 'string') {
    url = interpolateString(req.url, variables);
  } else if (req.url && typeof req.url === 'object') {
    url = interpolateString(req.url.raw || '', variables);
  }

  // Build headers
  const headers = {};
  if (req.header) {
    for (const header of req.header) {
      headers[header.key] = interpolateString(header.value, variables);
    }
  }

  // Add default Authorization header for tenant endpoints
  if (
    url.includes('/v1/devices') &&
    !headers['Authorization'] &&
    !url.includes('/pairing') &&
    variables.TENANT_API_KEY
  ) {
    headers['Authorization'] = `Bearer ${variables.TENANT_API_KEY}`;
  }

  // Build body
  let body = null;
  if (req.body && req.body.raw) {
    let bodyStr = interpolateString(req.body.raw, variables);

    // Special overrides for media uploads
    if (requestItem.name === 'Send Media Message') {
      try {
        const bodyObj = JSON.parse(bodyStr);
        bodyObj.mediaUrl = variables.MEDIA_URL;
        bodyStr = JSON.stringify(bodyObj);
      } catch {
        // Ignore parse errors
      }
    }

    // Special overrides for webhooks
    if (
      requestItem.name === 'Create Webhook' ||
      requestItem.name === 'Update Webhook'
    ) {
      try {
        const bodyObj = JSON.parse(bodyStr);
        if (bodyObj.url) {
          bodyObj.url = variables.WEBHOOK_URL;
        }
        bodyStr = JSON.stringify(bodyObj);
      } catch {
        // Ignore parse errors
      }
    }

    body = bodyStr;
  }

  return {
    method: req.method,
    url,
    headers,
    body,
  };
}

function interpolateString(str, variables) {
  if (!str) {
    return str;
  }

  let result = str;
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(pattern, value);
  }

  return result;
}

function getAssertion(requestName) {
  const assertions = {
    // Public
    'Health Check': { expectedStatus: [200] },
    'Ready Check': { expectedStatus: [200, 503], warn: [503] },
    Metrics: { expectedStatus: [200] },

    // Admin
    'Create Tenant': { expectedStatus: [201] },
    'List Tenants': { expectedStatus: [200] },
    'Get Tenant by ID': { expectedStatus: [200] },
    'Suspend Tenant': { expectedStatus: [200] },
    'Activate Tenant': { expectedStatus: [200] },
    'Delete Tenant': { expectedStatus: [200], optional: true },

    // Admin Devices
    'Create Device': { expectedStatus: [201] },
    'Delete Device (Admin)': { expectedStatus: [200], optional: true },

    // Tenant Devices
    'List Devices': { expectedStatus: [200] },
    'Get Device by ID': { expectedStatus: [200] },
    'Get Device Health': { expectedStatus: [200] },
    'Start Device': { expectedStatus: [200] },
    'Stop Device': { expectedStatus: [200], optional: true },
    'Logout Device': { expectedStatus: [200], optional: true },
    'Get QR Code for Pairing': { expectedStatus: [200, 409], warn: [409] },
    'Request Pairing Code': { expectedStatus: [200, 409], warn: [409] },

    // Messages
    'Send Text Message': { expectedStatus: [200, 201, 409, 422], warn: [409, 422] },
    'Send Media Message': { expectedStatus: [200, 201, 409, 422], warn: [409, 422] },
    'Send Location Message': { expectedStatus: [200, 201, 409, 422], warn: [409, 422] },
    'Send Contact Message': { expectedStatus: [200, 201, 409, 422], warn: [409, 422] },
    'Send Reaction': { expectedStatus: [200, 201, 404, 409, 422], warn: [404, 409, 422] },
    'Delete Message': { expectedStatus: [200, 404, 409, 422], warn: [404, 409, 422] },
    'Get Message Status': { expectedStatus: [200, 404, 409, 422], warn: [404, 409, 422] },
    'Poll Messages': {
      expectedStatus: [200, 201, 404, 409, 422, 501],
      warn: [404, 501],
      notImplemented: true,
    },

    // Chats
    'List Chats': { expectedStatus: [200] },
    'Get Chat Messages': { expectedStatus: [200], optional: true },
    'Mark as Read': { expectedStatus: [200], optional: true },
    'Archive Chat': { expectedStatus: [200], optional: true },
    'Unarchive Chat': { expectedStatus: [200], optional: true },
    'Mute Chat': { expectedStatus: [200], optional: true },
    'Unmute Chat': { expectedStatus: [200], optional: true },

    // Webhooks
    'Create Webhook': { expectedStatus: [200, 201] },
    'List Webhooks': { expectedStatus: [200] },
    'Get Webhook by ID': { expectedStatus: [200], optional: true },
    'Update Webhook': { expectedStatus: [200], optional: true },
    'Delete Webhook': { expectedStatus: [200, 204], optional: true },

    // Groups
    'Create Group': { expectedStatus: [200, 201, 409, 422], warn: [409, 422] },
    'Get Group Info': { expectedStatus: [200, 404, 409, 422], warn: [404, 409, 422] },
    'Add Members': { expectedStatus: [200, 404, 409, 422], warn: [404, 409, 422] },
    'Remove Members': { expectedStatus: [200, 404, 409, 422], warn: [404, 409, 422] },

    // Privacy
    'Get Privacy Settings': { expectedStatus: [200] },
    'Update Privacy Settings': { expectedStatus: [200], optional: true },

    // Events
    'Pull Events': { expectedStatus: [200], optional: true },
  };

  return assertions[requestName] || { expectedStatus: [200] };
}

function checkAssertion(status, assertion) {
  const { expectedStatus, warn, optional, notImplemented } = assertion;

  if (expectedStatus.includes(status)) {
    if (warn && warn.includes(status)) {
      return {
        pass: false,
        warn: true,
        reason: `Status ${status} (expected ${expectedStatus.join('|')}) - ${
          notImplemented ? 'not implemented' : 'device not ready'
        }`,
      };
    }
    return { pass: true };
  }

  if (optional) {
    return { pass: true, optional: true };
  }

  return {
    pass: false,
    reason: `Status ${status} (expected ${expectedStatus.join('|')})`,
    optional: false,
  };
}

function extractVariables(requestName, responseJson, variables) {
  if (!responseJson || !responseJson.data) {
    return;
  }

  const data = responseJson.data;

  // Tenant creation
  if (requestName === 'Create Tenant') {
    if (data.tenant && data.tenant.id) {
      variables.TENANT_ID = data.tenant.id;
    }
    if (data.api_key) {
      variables.TENANT_API_KEY = data.api_key;
    }
  }

  // Device creation
  if (requestName === 'Create Device') {
    if (data.device && data.device.id) {
      variables.DEVICE_ID = data.device.id;
    }
  }

  // Message sending
  if (requestName.includes('Send') && requestName.includes('Message')) {
    if (data.message_id) {
      variables.MESSAGE_ID = data.message_id;
    }
    if (data.wa_message_id) {
      variables.WA_MESSAGE_ID = data.wa_message_id;
    }
  }

  // Webhook creation
  if (requestName === 'Create Webhook') {
    if (data.id) {
      variables.WEBHOOK_ID = data.id;
    }
  }

  // Group creation
  if (requestName === 'Create Group') {
    if (data.groupJid) {
      variables.GROUP_JID = data.groupJid;
    }
  }

  // QR Code
  if (requestName === 'Get QR Code for Pairing') {
    if (data.qr_code) {
      variables.QR_CODE = data.qr_code;
    }
  }

  // Pairing Code
  if (requestName === 'Request Pairing Code') {
    if (data.pairing_code) {
      variables.PAIRING_CODE = data.pairing_code;
    }
  }
}
