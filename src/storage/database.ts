import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import config from '../config/index.js';
import logger from '../utils/logger.js';

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    // Ensure directory exists
    const dbDir = path.dirname(config.database.path);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(config.database.path);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    
    logger.info({ path: config.database.path }, 'Database connected');
  }
  
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}

export default { getDatabase, closeDatabase };
