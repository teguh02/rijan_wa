#!/usr/bin/env node

/**
 * Main test runner entrypoint
 * Starts dev server, waits for health check, runs tests, then stops server
 */

import { spawn } from 'child_process';
import { platform } from 'os';
import { waitForServer } from './http-client.mjs';
import { startStubServers, stopStubServers } from './servers.mjs';
import { runLocalTests } from './local-tests.mjs';
import { printError, printInfo } from './assert.mjs';

async function main() {
  const args = process.argv.slice(2);
  const options = {};

  // Parse CLI arguments
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      options[key] = value === undefined ? true : value === 'true';
    }
  }

  const baseUrl = options['base-url'] || 'http://localhost:3000';
  const cleanup = options.cleanup === true || options.cleanup === 'true';
  const verbose = options.verbose === true || options.verbose === 'true';
  const skipServer = options['skip-server'] === true || options['skip-server'] === 'true';

  let devServerProcess = null;

  try {
    // Start stub servers
    console.log('\nStarting stub servers...');
    await startStubServers();

    // Start dev server if not skipped
    if (!skipServer) {
      console.log('\nStarting development server...');
      devServerProcess = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev'], {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'development' },
        stdio: 'pipe',
      });

      // Log dev server output
      devServerProcess.stdout.on('data', (data) => {
        if (verbose) {
          console.log(data.toString());
        }
      });

      devServerProcess.stderr.on('data', (data) => {
        if (verbose) {
          console.log(data.toString());
        }
      });

      // Wait for server to be ready
      console.log(`\nWaiting for server to be ready at ${baseUrl}...`);
      try {
        await waitForServer(baseUrl, 30000);
        printInfo(`Server is ready!`);
      } catch (err) {
        printError(`Server failed to start: ${err.message}`);
        if (devServerProcess) {
          devServerProcess.kill();
        }
        await stopStubServers();
        process.exit(1);
      }
    } else {
      printInfo('Skipping server start (--skip-server flag set)');
      console.log(`\nWaiting for server at ${baseUrl}...`);
      try {
        await waitForServer(baseUrl, 30000);
        printInfo(`Server is ready!`);
      } catch (err) {
        printError(`Server is not ready: ${err.message}`);
        await stopStubServers();
        process.exit(1);
      }
    }

    // Run tests
    console.log('\nStarting tests...');
    await runLocalTests({
      baseUrl,
      cleanup,
      verbose,
    });
  } catch (err) {
    printError(`Test runner error: ${err.message}`);
    if (devServerProcess) {
      devServerProcess.kill();
    }
    await stopStubServers();
    process.exit(1);
  } finally {
    // Cleanup
    if (devServerProcess) {
      console.log('\nStopping development server...');
      devServerProcess.kill();
    }

    console.log('Stopping stub servers...');
    await stopStubServers();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
