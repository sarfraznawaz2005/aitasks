import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync } from 'fs';
import { join } from 'path';
import { createTestContext, cleanupTestContext, type TestContext } from './setup.js';

let ctx: TestContext;

beforeEach(() => { ctx = createTestContext(); });
afterEach(() => { cleanupTestContext(ctx); });

describe('database initialization', () => {
  test('creates db.sqlite file in .aitasks dir', () => {
    expect(existsSync(join(ctx.dir, 'db.sqlite'))).toBe(true);
  });

  test('creates all required tables', () => {
    const tables = ctx.db
      .query(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('tasks');
    expect(names).toContain('agents');
    expect(names).toContain('events');
    expect(names).toContain('meta');
  });

  test('creates required indexes', () => {
    const indexes = ctx.db
      .query(`SELECT name FROM sqlite_master WHERE type='index'`)
      .all() as { name: string }[];
    const names = indexes.map((i) => i.name);
    expect(names).toContain('idx_tasks_status');
    expect(names).toContain('idx_tasks_priority');
    expect(names).toContain('idx_tasks_assigned_to');
    expect(names).toContain('idx_events_task_id');
  });

  test('enables WAL journal mode', () => {
    const row = ctx.db.query('PRAGMA journal_mode').get() as { journal_mode: string };
    expect(row.journal_mode).toBe('wal');
  });

  test('sets auto_vacuum to incremental (2)', () => {
    const row = ctx.db.query('PRAGMA auto_vacuum').get() as { auto_vacuum: number };
    expect(row.auto_vacuum).toBe(2);
  });

  test('enables foreign key enforcement', () => {
    const row = ctx.db.query('PRAGMA foreign_keys').get() as { foreign_keys: number };
    expect(row.foreign_keys).toBe(1);
  });

  test('passes quick_check integrity test', () => {
    const row = ctx.db.query('PRAGMA quick_check').get() as { quick_check: string };
    expect(row.quick_check).toBe('ok');
  });

  test('initializes meta table with seed values', () => {
    const rows = ctx.db
      .query('SELECT key, value FROM meta ORDER BY key')
      .all() as { key: string; value: string }[];
    const meta = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(meta['last_task_number']).toBe('0');
    expect(meta['schema_version']).toBe('4');
    expect(meta['initialized_at']).toBeDefined();
  });

  test('initializes last_task_number at 0', () => {
    const row = ctx.db
      .query(`SELECT value FROM meta WHERE key = 'last_task_number'`)
      .get() as { value: string };
    expect(row.value).toBe('0');
  });
});

describe('backup', () => {
  test('creates backup file on second init within same day', async () => {
    // First access already happened via createTestContext.
    // Force a second backup call by importing and calling directly.
    const { performBackupIfNeeded } = await import('../src/db/backup.js');
    // Remove last_backup stamp so it triggers
    const stampPath = join(ctx.dir, 'last_backup');
    if (existsSync(stampPath)) {
      const { unlinkSync } = await import('fs');
      unlinkSync(stampPath);
    }
    performBackupIfNeeded(ctx.dir);
    expect(existsSync(join(ctx.dir, 'db.sqlite.bak'))).toBe(true);
  });

  test('restoreFromBackup returns false when no backup exists', async () => {
    const { restoreFromBackup } = await import('../src/db/backup.js');
    // Fresh dir with no backup
    const { mkdtempSync } = await import('fs');
    const { tmpdir } = await import('os');
    const emptyDir = mkdtempSync(join(tmpdir(), 'aitasks-nobackup-'));
    const result = restoreFromBackup(emptyDir);
    expect(result).toBe(false);
    const { rmSync } = await import('fs');
    rmSync(emptyDir, { recursive: true, force: true });
  });
});
