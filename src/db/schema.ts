import type { Database } from 'bun:sqlite';

export const SCHEMA_VERSION = 2;

export function runMigrations(db: Database): void {
  const row = db.query(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as { value: string } | null;
  const current = row ? parseInt(row.value, 10) : 1;

  if (current < 2) {
    db.exec(`UPDATE tasks SET status = 'review' WHERE status = 'needs_review'`);
    db.exec(`INSERT OR IGNORE INTO meta (key, value) VALUES ('review_required', 'false')`);
    db.exec(`UPDATE meta SET value = '2' WHERE key = 'schema_version'`);
  }
}

export function initializeSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id                   TEXT PRIMARY KEY,
      title                TEXT NOT NULL,
      description          TEXT NOT NULL DEFAULT '',
      acceptance_criteria  TEXT NOT NULL DEFAULT '[]',
      status               TEXT NOT NULL DEFAULT 'backlog',
      priority             TEXT NOT NULL DEFAULT 'medium',
      type                 TEXT NOT NULL DEFAULT 'feature',
      assigned_to          TEXT,
      parent_id            TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      blocks               TEXT NOT NULL DEFAULT '[]',
      blocked_by           TEXT NOT NULL DEFAULT '[]',
      implementation_notes TEXT NOT NULL DEFAULT '[]',
      test_results         TEXT NOT NULL DEFAULT '[]',
      created_at           INTEGER NOT NULL,
      updated_at           INTEGER NOT NULL,
      started_at           INTEGER,
      completed_at         INTEGER,
      metadata             TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS agents (
      id           TEXT PRIMARY KEY,
      last_seen    INTEGER NOT NULL,
      current_task TEXT REFERENCES tasks(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id    TEXT REFERENCES tasks(id) ON DELETE CASCADE,
      agent_id   TEXT,
      event_type TEXT NOT NULL,
      payload    TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status      ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_priority    ON tasks(priority);
    CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_tasks_parent_id   ON tasks(parent_id);
    CREATE INDEX IF NOT EXISTS idx_events_task_id    ON events(task_id);
    CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
  `);

  const insert = db.prepare(
    `INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)`
  );
  insert.run('last_task_number', '0');
  insert.run('schema_version', String(SCHEMA_VERSION));
  insert.run('initialized_at', String(Date.now()));
  insert.run('review_required', 'false');
}
