import { getDb } from '../db/index.js';
import type { Database } from 'bun:sqlite';
import type { TaskEvent, TaskEventRow } from '../types.js';

// ─── Prepared statement cache ────────────────────────────────────────────────

let _stmtDb: Database | null = null;
let _insertEvent: ReturnType<Database['query']> | null = null;
let _selectTaskEvents: ReturnType<Database['query']> | null = null;
let _selectAllEvents: ReturnType<Database['query']> | null = null;
let _selectLastReviewEvent: ReturnType<Database['query']> | null = null;

function stmts() {
  const db = getDb();
  if (_stmtDb !== db) {
    _stmtDb = db;
    _insertEvent = db.query(
      `INSERT INTO events (task_id, agent_id, event_type, payload, created_at)
       VALUES (?, ?, ?, ?, ?)`
    );
    _selectTaskEvents = db.query(
      'SELECT * FROM events WHERE task_id = ? ORDER BY created_at ASC'
    );
    _selectAllEvents = db.query(
      'SELECT * FROM events ORDER BY created_at DESC LIMIT ?'
    );
    _selectLastReviewEvent = db.query(
      `SELECT * FROM events WHERE task_id = ? AND event_type = 'review_requested'
       ORDER BY created_at DESC LIMIT 1`
    );
  }
  return { _insertEvent: _insertEvent!, _selectTaskEvents: _selectTaskEvents!, _selectAllEvents: _selectAllEvents!, _selectLastReviewEvent: _selectLastReviewEvent! };
}

// ─── Public API ──────────────────────────────────────────────────────────────

function parseEvent(r: TaskEventRow): TaskEvent {
  return { ...r, payload: JSON.parse(r.payload) as Record<string, unknown> };
}

export function logEvent(data: {
  task_id: string;
  agent_id?: string | undefined;
  event_type: string;
  payload?: Record<string, unknown> | undefined;
}): void {
  stmts()._insertEvent.run(
    data.task_id,
    data.agent_id ?? null,
    data.event_type,
    JSON.stringify(data.payload ?? {}),
    Date.now(),
  );
}

export function getTaskEvents(taskId: string): TaskEvent[] {
  const rows = stmts()._selectTaskEvents.all(taskId) as TaskEventRow[];
  return rows.map(parseEvent);
}

export function getLastReviewEvent(taskId: string): TaskEvent | null {
  const row = stmts()._selectLastReviewEvent.get(taskId) as TaskEventRow | null;
  return row ? parseEvent(row) : null;
}

export function getAllEvents(limit = 100): TaskEvent[] {
  const rows = stmts()._selectAllEvents.all(limit) as TaskEventRow[];
  return rows.map(parseEvent);
}
