import { startServer } from './http/server';

// Start the server
startServer().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
