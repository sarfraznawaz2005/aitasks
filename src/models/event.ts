import { getDb } from '../db/index.js';
import type { TaskEvent, TaskEventRow } from '../types.js';

export function logEvent(data: {
  task_id: string;
  agent_id?: string | undefined;
  event_type: string;
  payload?: Record<string, unknown> | undefined;
}): void {
  const db = getDb();
  db.run(
    `INSERT INTO events (task_id, agent_id, event_type, payload, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      data.task_id,
      data.agent_id ?? null,
      data.event_type,
      JSON.stringify(data.payload ?? {}),
      Date.now(),
    ]
  );
}

export function getTaskEvents(taskId: string): TaskEvent[] {
  const db = getDb();
  const rows = db
    .query('SELECT * FROM events WHERE task_id = ? ORDER BY created_at ASC')
    .all(taskId) as TaskEventRow[];
  return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) as Record<string, unknown> }));
}

export function getAllEvents(limit = 100): TaskEvent[] {
  const db = getDb();
  const rows = db
    .query('SELECT * FROM events ORDER BY created_at DESC LIMIT ?')
    .all(limit) as TaskEventRow[];
  return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) as Record<string, unknown> }));
}
