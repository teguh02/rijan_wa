/**
 * Assertion and reporting utilities
 * Handles colored output and test result tracking
 */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

export function colorize(text, color) {
  return `${colors[color] || ''}${text}${colors.reset}`;
}

export function printPass(folderPath, name, method, url, status, durationMs) {
  console.log(
    `${colorize('[PASS]', 'green')} ${folderPath} :: ${colorize(name, 'cyan')} ${method} ${url} ${colorize(`(${status})`, 'gray')} ${durationMs}ms`
  );
}

export function printWarn(folderPath, name, reason) {
  console.log(
    `${colorize('[WARN]', 'yellow')} ${folderPath} :: ${colorize(name, 'cyan')} - ${reason}`
  );
}

export function printSkip(folderPath, name, reason) {
  console.log(
    `${colorize('[SKIP]', 'cyan')} ${folderPath} :: ${colorize(name, 'cyan')} - ${reason}`
  );
}

export function printFail(folderPath, name, reason, details = '') {
  console.log(`${colorize('[FAIL]', 'red')} ${folderPath} :: ${colorize(name, 'cyan')} - ${reason}`);
  if (details) {
    console.log(`  ${colorize('Details:', 'red')} ${details}`);
  }
}

export function printError(message) {
  console.log(`${colorize('[ERROR]', 'red')} ${message}`);
}

export function printInfo(message) {
  console.log(`${colorize('[INFO]', 'cyan')} ${message}`);
}

export function printSummary(results) {
  console.log('\n' + colorize('='.repeat(80), 'cyan'));
  console.log(colorize('TEST SUMMARY', 'bright'));
  console.log(colorize('='.repeat(80), 'cyan'));

  const total = results.length;
  const passed = results.filter((r) => r.status === 'pass').length;
  const warned = results.filter((r) => r.status === 'warn').length;
  const skipped = results.filter((r) => r.status === 'skip').length;
  const failed = results.filter((r) => r.status === 'fail').length;

  console.log(`${colorize('Total:  ', 'cyan')} ${total}`);
  console.log(`${colorize('Passed: ', 'green')} ${passed}`);
  console.log(`${colorize('Warned: ', 'yellow')} ${warned}`);
  console.log(`${colorize('Skipped:', 'cyan')} ${skipped}`);
  console.log(`${colorize('Failed: ', 'red')} ${failed}`);

  console.log(colorize('='.repeat(80), 'cyan'));
}

export function printVariables(variables) {
  console.log('\n' + colorize('VARIABLES SAVED', 'cyan'));
  console.log(colorize('-'.repeat(80), 'gray'));

  const importantVars = [
    'TENANT_ID',
    'TENANT_API_KEY',
    'DEVICE_ID',
    'MESSAGE_ID',
    'WA_MESSAGE_ID',
    'WEBHOOK_ID',
    'GROUP_JID',
    'PAIRING_CODE',
    'QR_CODE',
  ];

  for (const varName of importantVars) {
    if (variables[varName]) {
      const value = variables[varName];
      const truncated = value.length > 50 ? value.substring(0, 47) + '...' : value;
      console.log(`  ${colorize(varName, 'yellow')}: ${truncated}`);
    }
  }

  console.log(colorize('-'.repeat(80), 'gray'));
}

export function truncateJson(json, maxChars = 500) {
  const str = JSON.stringify(json, null, 2);
  if (str.length > maxChars) {
    return str.substring(0, maxChars) + '\n... (truncated)';
  }
  return str;
}
