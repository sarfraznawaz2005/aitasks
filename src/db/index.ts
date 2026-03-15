import { Database } from 'bun:sqlite';
import { join } from 'path';
import { existsSync } from 'fs';
import { initializeSchema, runMigrations } from './schema.js';
import { performBackupIfNeeded, restoreFromBackup } from './backup.js';
import { findProjectRoot } from '../utils/project-root.js';

let _db: Database | null = null;
let _taskieDir: string | null = null;
let _cleanupRegistered = false;

const BASE_PRAGMAS = `
  PRAGMA journal_mode  = WAL;
  PRAGMA synchronous   = NORMAL;
  PRAGMA foreign_keys  = ON;
  PRAGMA busy_timeout  = 5000;
  PRAGMA cache_size    = -16000;
  PRAGMA temp_store    = MEMORY;
`;

export function getTaskieDir(): string {
  if (_taskieDir) return _taskieDir;
  _taskieDir = join(findProjectRoot(), '.aitasks');
  return _taskieDir;
}

export function isInitialized(): boolean {
  return existsSync(join(getTaskieDir(), 'db.sqlite'));
}

export function requireInitialized(): void {
  if (!isInitialized()) {
    console.error('AITasks is not initialized here. Run: aitasks init');
    process.exit(1);
  }
}

function applyPragmas(db: Database): void {
  db.exec(BASE_PRAGMAS);
}

function checkIntegrity(db: Database, taskieDir: string): void {
  const row = db.query('PRAGMA quick_check').get() as { quick_check: string };
  if (row.quick_check !== 'ok') {
    db.close();
    console.error('Database corruption detected. Attempting restore from backup...');
    if (restoreFromBackup(taskieDir)) {
      console.error('Backup restored successfully. Please retry your command.');
    } else {
      console.error('No backup available. Run: aitasks db repair');
    }
    process.exit(1);
  }
}

function registerCleanup(): void {
  if (_cleanupRegistered) return;
  _cleanupRegistered = true;

  // Always close the *current* _db, not a captured reference,
  // so tests can swap it between runs safely.
  const close = () => {
    if (_db) {
      try { _db.exec('PRAGMA optimize;'); _db.close(); } catch {}
      _db = null;
    }
  };
  process.on('exit', close);
  process.on('SIGINT',  () => { close(); process.exit(0); });
  process.on('SIGTERM', () => { close(); process.exit(0); });
}

/** Only for use in tests — tears down the current DB and resets module state. */
export function _resetForTesting(): void {
  if (_db) {
    try { _db.close(); } catch {}
    _db = null;
  }
  _taskieDir = null;
}

export function getDb(): Database {
  if (_db) return _db;

  const taskieDir = getTaskieDir();
  const dbPath = join(taskieDir, 'db.sqlite');

  if (!existsSync(dbPath)) {
    throw new Error('AITasks is not initialized. Run: aitasks init');
  }

  performBackupIfNeeded(taskieDir);

  const db = new Database(dbPath);
  applyPragmas(db);
  checkIntegrity(db, taskieDir);
  runMigrations(db);
  registerCleanup();

  _db = db;
  return db;
}

export function getReviewRequired(): boolean {
  const db = getDb();
  const row = db.query(`SELECT value FROM meta WHERE key = 'review_required'`).get() as { value: string } | null;
  return row?.value === 'true';
}

export function setReviewRequired(enabled: boolean): void {
  const db = getDb();
  db.run(`INSERT OR REPLACE INTO meta (key, value) VALUES ('review_required', ?)`, [enabled ? 'true' : 'false']);
}

/**
 * Used only by `aitasks init` — creates a fresh DB with auto_vacuum set
 * before any tables exist (required for auto_vacuum to take effect).
 */
export function createFreshDb(taskieDir: string): Database {
  const dbPath = join(taskieDir, 'db.sqlite');
  const db = new Database(dbPath);

  // auto_vacuum must be set before schema creation
  db.exec(`
    PRAGMA auto_vacuum = INCREMENTAL;
    ${BASE_PRAGMAS}
  `);

  initializeSchema(db);
  registerCleanup();

  _db = db;
  _taskieDir = taskieDir;

  return db;
}
