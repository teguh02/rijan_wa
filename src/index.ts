import { startServer } from './http/server.js';

// Start the server
startServer().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
