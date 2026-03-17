import { getDb, getReviewRequired } from '../db/index.js';
import { logEvent, getLastReviewEvent } from './event.js';
import type { Database } from 'bun:sqlite';
import type { SQLQueryBindings } from 'bun:sqlite';
import type {
  Task,
  TaskRow,
  TaskStatus,
  TaskPriority,
  TaskType,
  ImplementationNote,
  TestResult,
} from '../types.js';

// ─── Prepared statement cache ────────────────────────────────────────────────

let _stmtDb: Database | null = null;
let _getTaskStmt: ReturnType<Database['query']> | null = null;
let _getAllIdsStmt: ReturnType<Database['query']> | null = null;
let _getMetaStmt: ReturnType<Database['query']> | null = null;
let _updateMetaStmt: ReturnType<Database['query']> | null = null;
let _upsertAgentStmt: ReturnType<Database['query']> | null = null;
let _heartbeatStmt: ReturnType<Database['query']> | null = null;
let _releaseAgentStmt: ReturnType<Database['query']> | null = null;
let _subtaskCountStmt: ReturnType<Database['query']> | null = null;

function stmts() {
  const db = getDb();
  if (_stmtDb !== db) {
    _stmtDb = db;
    _getTaskStmt = db.query('SELECT * FROM tasks WHERE id = ?');
    _getAllIdsStmt = db.query('SELECT id FROM tasks');
    _getMetaStmt = db.query(`SELECT value FROM meta WHERE key = 'last_task_number'`);
    _updateMetaStmt = db.query(`UPDATE meta SET value = ? WHERE key = 'last_task_number'`);
    _upsertAgentStmt = db.query(
      `INSERT INTO agents (id, first_seen, last_seen, current_task)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen, current_task = excluded.current_task`
    );
    _heartbeatStmt = db.query(
      `INSERT INTO agents (id, first_seen, last_seen, current_task)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen`
    );
    _releaseAgentStmt = db.query(`UPDATE agents SET current_task = NULL WHERE id = ?`);
    _subtaskCountStmt = db.query(`SELECT COUNT(*) as count FROM tasks WHERE parent_id = ?`);
  }
  return {
    db,
    getTask: _getTaskStmt!,
    getAllIds: _getAllIdsStmt!,
    getMeta: _getMetaStmt!,
    updateMeta: _updateMetaStmt!,
    upsertAgent: _upsertAgentStmt!,
    heartbeat: _heartbeatStmt!,
    releaseAgent: _releaseAgentStmt!,
    subtaskCount: _subtaskCountStmt!,
  };
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

function parseTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    acceptance_criteria: JSON.parse(row.acceptance_criteria) as string[],
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    type: row.type as TaskType,
    assigned_to: row.assigned_to,
    parent_id: row.parent_id,
    blocks: JSON.parse(row.blocks) as string[],
    blocked_by: JSON.parse(row.blocked_by) as string[],
    implementation_notes: JSON.parse(row.implementation_notes) as ImplementationNote[],
    test_results: JSON.parse(row.test_results) as TestResult[],
    created_at: row.created_at,
    updated_at: row.updated_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
  };
}

// ─── ID Generation ────────────────────────────────────────────────────────────

function nextTaskId(): string {
  const s = stmts();
  const meta = s.getMeta.get() as { value: string };
  const next = parseInt(meta.value, 10) + 1;
  s.updateMeta.run(String(next));
  return `TASK-${String(next).padStart(3, '0')}`;
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export function getTask(id: string): Task | null {
  const row = stmts().getTask.get(id) as TaskRow | null;
  return row ? parseTask(row) : null;
}

/** Return just the IDs of all tasks (lightweight — no JSON parsing). */
export function getAllTaskIds(): string[] {
  const rows = stmts().getAllIds.all() as { id: string }[];
  return rows.map(r => r.id);
}

const PRIORITY_ORDER = `CASE priority
  WHEN 'critical' THEN 0
  WHEN 'high'     THEN 1
  WHEN 'medium'   THEN 2
  WHEN 'low'      THEN 3 END`;

const STATUS_ORDER = `CASE status
  WHEN 'in_progress'  THEN 0
  WHEN 'review'       THEN 1
  WHEN 'blocked'      THEN 2
  WHEN 'ready'        THEN 3
  WHEN 'backlog'      THEN 4
  WHEN 'done'         THEN 5 END`;

export function listTasks(filters: {
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority;
  type?: TaskType;
  assigned_to?: string;
  parent_id?: string | null;
} = {}): Task[] {
  const db = stmts().db;
  const conds: string[] = [];
  const params: unknown[] = [];

  if (filters.status) {
    if (Array.isArray(filters.status)) {
      conds.push(`status IN (${filters.status.map(() => '?').join(',')})`);
      params.push(...filters.status);
    } else {
      conds.push('status = ?');
      params.push(filters.status);
    }
  }
  if (filters.priority) { conds.push('priority = ?'); params.push(filters.priority); }
  if (filters.type)     { conds.push('type = ?');     params.push(filters.type); }

  if (filters.assigned_to !== undefined) {
    if (filters.assigned_to === 'unassigned') {
      conds.push('assigned_to IS NULL');
    } else {
      conds.push('assigned_to = ?');
      params.push(filters.assigned_to);
    }
  }

  if (filters.parent_id !== undefined) {
    if (filters.parent_id === null) {
      conds.push('parent_id IS NULL');
    } else {
      conds.push('parent_id = ?');
      params.push(filters.parent_id);
    }
  }

  const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
  const sql = `SELECT * FROM tasks ${where}
               ORDER BY ${STATUS_ORDER}, ${PRIORITY_ORDER}, created_at ASC`;
  const rows = db.query(sql).all(...(params as SQLQueryBindings[])) as TaskRow[];
  return rows.map(parseTask);
}

export function getSubtasks(parentId: string): Task[] {
  return listTasks({ parent_id: parentId });
}

/** SQL-level pre-filter for search — uses LIKE on text columns. */
export function searchTasks(terms: string[], status?: TaskStatus): Task[] {
  const db = stmts().db;
  const conds: string[] = [];
  const params: string[] = [];

  if (status) {
    conds.push('status = ?');
    params.push(status);
  }

  for (const term of terms) {
    conds.push(
      `(title LIKE ? OR description LIKE ? OR implementation_notes LIKE ? OR acceptance_criteria LIKE ?)`
    );
    const like = `%${term}%`;
    params.push(like, like, like, like);
  }

  const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = db.query(`SELECT * FROM tasks ${where}`).all(...params) as TaskRow[];
  return rows.map(parseTask);
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function createTask(data: {
  title: string;
  description?: string;
  acceptance_criteria?: string[];
  priority?: TaskPriority;
  type?: TaskType;
  parent_id?: string;
  metadata?: Record<string, unknown>;
  created_by?: string;
}): Task {
  const db = stmts().db;
  const id = nextTaskId();
  const now = Date.now();

  db.run(
    `INSERT INTO tasks
       (id, title, description, acceptance_criteria, status, priority, type,
        parent_id, blocks, blocked_by, implementation_notes, test_results,
        created_at, updated_at, metadata)
     VALUES (?, ?, ?, ?, 'backlog', ?, ?, ?, '[]', '[]', '[]', '[]', ?, ?, ?)`,
    [
      id,
      data.title,
      data.description ?? '',
      JSON.stringify(data.acceptance_criteria ?? []),
      data.priority ?? 'medium',
      data.type ?? 'feature',
      data.parent_id ?? null,
      now,
      now,
      JSON.stringify(data.metadata ?? {}),
    ]
  );

  logEvent({ task_id: id, agent_id: data.created_by, event_type: 'created', payload: { title: data.title } });
  return getTask(id)!;
}

type UpdatableFields = Partial<{
  title: string;
  description: string;
  acceptance_criteria: string[];
  status: TaskStatus;
  priority: TaskPriority;
  type: TaskType;
  assigned_to: string | null;
  parent_id: string | null;
  blocks: string[];
  blocked_by: string[];
  implementation_notes: ImplementationNote[];
  test_results: TestResult[];
  started_at: number | null;
  completed_at: number | null;
  metadata: Record<string, unknown>;
}>;

const JSON_FIELDS = new Set([
  'acceptance_criteria',
  'blocks',
  'blocked_by',
  'implementation_notes',
  'test_results',
  'metadata',
]);

export function updateTask(id: string, updates: UpdatableFields): Task | null {
  const db = stmts().db;
  const fields: string[] = ['updated_at = ?'];
  const params: unknown[] = [Date.now()];

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    params.push(JSON_FIELDS.has(key) ? JSON.stringify(value) : value);
  }

  params.push(id);
  const row = db.query(
    `UPDATE tasks SET ${fields.join(', ')} WHERE id = ? RETURNING *`
  ).get(...(params as SQLQueryBindings[])) as TaskRow | null;
  return row ? parseTask(row) : null;
}

// ─── Domain operations ────────────────────────────────────────────────────────

export function addImplementationNote(
  taskId: string,
  note: string,
  agentId: string
): Task | null {
  const task = getTask(taskId);
  if (!task) return null;

  const entry: ImplementationNote = {
    timestamp: Date.now(),
    agent: agentId,
    note,
  };

  const updated = updateTask(taskId, {
    implementation_notes: [...task.implementation_notes, entry],
  });

  logEvent({ task_id: taskId, agent_id: agentId, event_type: 'note_added', payload: { note } });
  return updated;
}

export function checkCriterion(
  taskId: string,
  index: number,
  evidence: string,
  agentId: string
): { task: Task | null; error?: string } {
  const task = getTask(taskId);
  if (!task) return { task: null, error: 'Task not found' };

  if (index < 0 || index >= task.acceptance_criteria.length) {
    return {
      task: null,
      error: `Index ${index} out of range — task has ${task.acceptance_criteria.length} criteria (0-based)`,
    };
  }

  const criterion = task.acceptance_criteria[index]!;
  const result: TestResult = {
    index,
    criterion,
    passed: true,
    evidence,
    checked_at: Date.now(),
    agent: agentId,
  };

  // Replace existing check for same index, or append
  const results = task.test_results.filter((r) => r.index !== index);
  results.push(result);

  const updated = updateTask(taskId, { test_results: results });
  logEvent({
    task_id: taskId,
    agent_id: agentId,
    event_type: 'criterion_checked',
    payload: { index, criterion, evidence },
  });

  return { task: updated };
}

export function claimTask(
  taskId: string,
  agentId: string
): { task: Task | null; error?: string } {
  const s = stmts();
  const task = getTask(taskId);
  if (!task) return { task: null, error: 'Task not found' };
  if (task.status === 'done') return { task: null, error: 'Task is already done' };
  if (task.status === 'in_progress') {
    return { task: null, error: `Task is already in progress (assigned to ${task.assigned_to})` };
  }
  if (task.blocked_by.length > 0) {
    return {
      task: null,
      error: `Task is blocked by: ${task.blocked_by.join(', ')}. Complete those first.`,
    };
  }

  const now = Date.now();
  s.upsertAgent.run(agentId, now, now, taskId);

  const updated = updateTask(taskId, { assigned_to: agentId, status: 'ready' });
  logEvent({ task_id: taskId, agent_id: agentId, event_type: 'claimed', payload: {} });
  return { task: updated };
}

export function startTask(
  taskId: string,
  agentId: string
): { task: Task | null; error?: string } {
  const s = stmts();
  const task = getTask(taskId);
  if (!task) return { task: null, error: 'Task not found' };
  if (task.status === 'in_progress') return { task: null, error: 'Task is already in progress' };
  if (task.assigned_to && task.assigned_to !== agentId) {
    return { task: null, error: `Task is assigned to ${task.assigned_to}, not ${agentId}` };
  }

  // Claim it on the fly if unassigned
  if (!task.assigned_to) {
    const now = Date.now();
    s.upsertAgent.run(agentId, now, now, taskId);
  }

  const updated = updateTask(taskId, {
    assigned_to: agentId,
    status: 'in_progress',
    started_at: Date.now(),
  });

  logEvent({ task_id: taskId, agent_id: agentId, event_type: 'started', payload: {} });
  return { task: updated };
}

export function completeTask(
  taskId: string,
  agentId?: string
): { task: Task | null; error?: string; unchecked?: string[] } {
  const s = stmts();
  const task = getTask(taskId);
  if (!task) return { task: null, error: 'Task not found' };

  // Enforce all criteria are verified
  const checkedIndices = new Set(task.test_results.map((r) => r.index));
  const unchecked: string[] = [];
  task.acceptance_criteria.forEach((c, i) => {
    if (!checkedIndices.has(i)) unchecked.push(`[${i}] ${c}`);
  });
  if (unchecked.length > 0) {
    return { task: null, error: 'Not all acceptance criteria are verified', unchecked };
  }

  // Enforce review gate if enabled
  if (getReviewRequired()) {
    if (task.status !== 'review') {
      return {
        task: null,
        error:
          'Review required: submit this task for review first.\n' +
          '  1. aitasks review <taskId> --agent $AITASKS_AGENT_ID\n' +
          '  2. Spawn a review sub-agent to inspect the work\n' +
          '  3. Review agent approves: aitasks done <taskId> --agent <review-agent-id>\n' +
          '     Review agent rejects: aitasks reject <taskId> --reason "<feedback>"\n' +
          '  Tasks cannot be moved to Done without a passing review.',
      };
    }

    // Prevent the implementing agent from self-approving their own review
    if (task.assigned_to && task.assigned_to === agentId) {
      return {
        task: null,
        error:
          `Self-approval blocked: ${agentId} is the implementing agent and cannot approve their own review.\n` +
          `  A separate review sub-agent must run: aitasks done ${taskId} --agent <review-agent-id>`,
      };
    }

    // Prevent the agent who submitted the review from also approving it
    // Targeted query: only fetch the last review_requested event, not all events
    const reviewEvent = getLastReviewEvent(taskId);
    if (reviewEvent?.agent_id && reviewEvent.agent_id === agentId) {
      return {
        task: null,
        error:
          `Self-approval blocked: ${agentId} submitted this task for review and cannot also approve it.\n` +
          `  A separate review sub-agent must run: aitasks done ${taskId} --agent <review-agent-id>`,
      };
    }
  }

  // Wrap the multi-write completion logic in a transaction
  const db = s.db;
  const doComplete = db.transaction(() => {
    const updated = updateTask(taskId, { status: 'done', completed_at: Date.now() });
    logEvent({ task_id: taskId, agent_id: agentId, event_type: 'completed', payload: {} });

    // Auto-unblock dependent tasks — use SQL LIKE to avoid fetching all tasks
    const pendingRows = db
      .query(
        `SELECT id, blocked_by FROM tasks
         WHERE status != 'done' AND blocked_by LIKE '%' || ? || '%'`
      )
      .all(taskId) as { id: string; blocked_by: string }[];

    for (const row of pendingRows) {
      const blockedBy = JSON.parse(row.blocked_by) as string[];
      if (!blockedBy.includes(taskId)) continue;

      const remaining = blockedBy.filter((id) => id !== taskId);
      const newStatus: TaskStatus = remaining.length === 0 ? 'ready' : 'blocked';
      db.run(
        `UPDATE tasks SET blocked_by = ?, status = ?, updated_at = ? WHERE id = ?`,
        [JSON.stringify(remaining), newStatus, Date.now(), row.id]
      );
      if (newStatus === 'ready') {
        logEvent({
          task_id: row.id,
          event_type: 'auto_unblocked',
          payload: { unblocked_by: taskId },
        });
      }
    }

    // Release agent
    if (agentId) s.releaseAgent.run(agentId);

    return updated;
  });

  const updated = doComplete();
  return { task: updated };
}

export function blockTask(
  taskId: string,
  blockerIds: string[],
  agentId?: string
): { task: Task | null; error?: string } {
  const s = stmts();
  const db = s.db;
  const task = getTask(taskId);
  if (!task) return { task: null, error: 'Task not found' };

  // Batch-fetch all blocker tasks in one query to avoid N+1
  const placeholders = blockerIds.map(() => '?').join(',');
  const blockerRows = db
    .query(`SELECT * FROM tasks WHERE id IN (${placeholders})`)
    .all(...(blockerIds as SQLQueryBindings[])) as TaskRow[];
  const blockerMap = new Map(blockerRows.map(r => [r.id, parseTask(r)]));

  // Pre-fetch all tasks into a map for cycle detection
  const allRows = db.query('SELECT * FROM tasks').all() as TaskRow[];
  const allTaskMap = new Map(allRows.map(r => [r.id, parseTask(r)]));

  for (const bid of blockerIds) {
    const blocker = blockerMap.get(bid);
    if (!blocker) return { task: null, error: `Blocker not found: ${bid}` };
    if (blocker.status === 'done') {
      return { task: null, error: `Cannot block on completed task: ${bid}` };
    }
    if (detectCycleFromMap(taskId, bid, allTaskMap)) {
      return { task: null, error: `Circular dependency detected: ${taskId} → ${bid}` };
    }
  }

  const newBlockedBy = [...new Set([...task.blocked_by, ...blockerIds])];

  // Wrap mirror updates + main update in a transaction
  const doBlock = db.transaction(() => {
    // Mirror the relationship on each blocker using direct SQL
    for (const bid of blockerIds) {
      const blocker = blockerMap.get(bid)!;
      const newBlocks = JSON.stringify([...new Set([...blocker.blocks, taskId])]);
      db.run(
        `UPDATE tasks SET blocks = ?, updated_at = ? WHERE id = ?`,
        [newBlocks, Date.now(), bid]
      );
    }

    const updated = updateTask(taskId, { blocked_by: newBlockedBy, status: 'blocked' });
    logEvent({
      task_id: taskId,
      agent_id: agentId,
      event_type: 'blocked',
      payload: { blocked_by: blockerIds },
    });

    return updated;
  });

  return { task: doBlock() };
}

/** Cycle detection using a pre-fetched task map — no per-node queries. */
function detectCycleFromMap(
  taskId: string,
  candidateBlocker: string,
  taskMap: Map<string, Task>,
  visited = new Set<string>()
): boolean {
  if (candidateBlocker === taskId) return true;
  if (visited.has(candidateBlocker)) return false;
  visited.add(candidateBlocker);
  const blocker = taskMap.get(candidateBlocker);
  if (!blocker) return false;
  return blocker.blocked_by.some((id) => detectCycleFromMap(taskId, id, taskMap, visited));
}

export function unblockTask(
  taskId: string,
  fromId: string,
  agentId?: string
): { task: Task | null; error?: string } {
  const db = stmts().db;
  const task = getTask(taskId);
  if (!task) return { task: null, error: 'Task not found' };
  if (!task.blocked_by.includes(fromId)) {
    return { task: null, error: `${taskId} is not blocked by ${fromId}` };
  }

  const remaining = task.blocked_by.filter((id) => id !== fromId);

  // Mirror on the former blocker — direct SQL to avoid extra read
  const blockerRow = db.query('SELECT blocks FROM tasks WHERE id = ?').get(fromId) as { blocks: string } | null;
  if (blockerRow) {
    const blocks = (JSON.parse(blockerRow.blocks) as string[]).filter((id) => id !== taskId);
    db.run(
      `UPDATE tasks SET blocks = ?, updated_at = ? WHERE id = ?`,
      [JSON.stringify(blocks), Date.now(), fromId]
    );
  }

  const newStatus: TaskStatus = remaining.length === 0 ? 'ready' : 'blocked';
  const updated = updateTask(taskId, { blocked_by: remaining, status: newStatus });
  logEvent({ task_id: taskId, agent_id: agentId, event_type: 'unblocked', payload: { from: fromId } });

  return { task: updated };
}

export function reviewTask(
  taskId: string,
  agentId: string
): { task: Task | null; error?: string } {
  const task = getTask(taskId);
  if (!task) return { task: null, error: 'Task not found' };
  if (task.status !== 'in_progress') {
    return { task: null, error: 'Task must be in_progress to request review' };
  }

  const updated = updateTask(taskId, { status: 'review' });
  logEvent({ task_id: taskId, agent_id: agentId, event_type: 'review_requested', payload: {} });
  return { task: updated };
}

export function rejectTask(
  taskId: string,
  reason: string,
  agentId?: string
): { task: Task | null; error?: string } {
  const task = getTask(taskId);
  if (!task) return { task: null, error: 'Task not found' };
  if (task.status !== 'review') {
    return { task: null, error: 'Task must be in review status to reject' };
  }

  // Combine status change + note addition into a single updateTask call
  const agent = agentId ?? 'human';
  const entry: ImplementationNote = {
    timestamp: Date.now(),
    agent,
    note: `REVIEW REJECTED: ${reason}`,
  };
  const updated = updateTask(taskId, {
    status: 'in_progress',
    implementation_notes: [...task.implementation_notes, entry],
  });

  logEvent({ task_id: taskId, agent_id: agentId, event_type: 'note_added', payload: { note: entry.note } });
  logEvent({
    task_id: taskId,
    agent_id: agentId,
    event_type: 'rejected',
    payload: { reason },
  });

  return { task: updated };
}

export function unclaimTask(
  taskId: string,
  agentId: string,
  reason?: string
): { task: Task | null; error?: string } {
  const s = stmts();
  const task = getTask(taskId);
  if (!task) return { task: null, error: 'Task not found' };
  if (task.assigned_to !== agentId) {
    return { task: null, error: `Task is not assigned to ${agentId}` };
  }

  const backStatus: TaskStatus = task.blocked_by.length > 0 ? 'blocked' : 'ready';
  let updated: Task | null;

  if (reason) {
    // Combine status reset + note addition to reduce reads
    const entry: ImplementationNote = {
      timestamp: Date.now(),
      agent: agentId,
      note: `UNCLAIMED by ${agentId}: ${reason}`,
    };
    updated = updateTask(taskId, {
      assigned_to: null,
      status: backStatus,
      started_at: null,
      implementation_notes: [...task.implementation_notes, entry],
    });
    logEvent({ task_id: taskId, agent_id: agentId, event_type: 'note_added', payload: { note: entry.note } });
  } else {
    updated = updateTask(taskId, { assigned_to: null, status: backStatus, started_at: null });
  }

  s.releaseAgent.run(agentId);
  logEvent({
    task_id: taskId,
    agent_id: agentId,
    event_type: 'unclaimed',
    payload: { reason: reason ?? '' },
  });

  return { task: updated };
}

export function heartbeat(agentId: string, taskId?: string): void {
  const now = Date.now();
  stmts().heartbeat.run(agentId, now, now, taskId ?? null);
}

export function listAgents(): { id: string; first_seen: number; last_seen: number; current_task: string | null }[] {
  const db = stmts().db;
  return db
    .query('SELECT * FROM agents ORDER BY last_seen DESC')
    .all() as { id: string; first_seen: number; last_seen: number; current_task: string | null }[];
}

export function getNextTask(agentId?: string): Task | null {
  const db = stmts().db;

  // Try agent's own assigned ready task first (single row fetch)
  if (agentId) {
    const mine = db.query(
      `SELECT * FROM tasks WHERE status = 'ready' AND assigned_to = ?
       ORDER BY ${PRIORITY_ORDER}, created_at ASC LIMIT 1`
    ).get(agentId) as TaskRow | null;
    if (mine) return parseTask(mine);
  }

  // Highest priority unassigned ready task
  const unassigned = db.query(
    `SELECT * FROM tasks WHERE status = 'ready' AND assigned_to IS NULL
     ORDER BY ${PRIORITY_ORDER}, created_at ASC LIMIT 1`
  ).get() as TaskRow | null;
  if (unassigned) return parseTask(unassigned);

  // Fallback: any ready task
  const any = db.query(
    `SELECT * FROM tasks WHERE status = 'ready'
     ORDER BY ${PRIORITY_ORDER}, created_at ASC LIMIT 1`
  ).get() as TaskRow | null;
  return any ? parseTask(any) : null;
}

export function getStats(): {
  by_status: Record<string, number>;
  by_priority: Record<string, number>;
  by_type: Record<string, number>;
  total: number;
} {
  const db = stmts().db;

  // Single query to get all breakdown data at once
  const rows = db
    .query('SELECT status, priority, type, COUNT(*) as count FROM tasks GROUP BY status, priority, type')
    .all() as { status: string; priority: string; type: string; count: number }[];

  const by_status: Record<string, number> = {};
  const by_priority: Record<string, number> = {};
  const by_type: Record<string, number> = {};
  let total = 0;

  for (const row of rows) {
    by_status[row.status] = (by_status[row.status] ?? 0) + row.count;
    by_priority[row.priority] = (by_priority[row.priority] ?? 0) + row.count;
    by_type[row.type] = (by_type[row.type] ?? 0) + row.count;
    total += row.count;
  }

  return { by_status, by_priority, by_type, total };
}

export function deleteTask(
  taskId: string,
  agentId?: string
): { success: boolean; error?: string } {
  const s = stmts();
  const db = s.db;
  const task = getTask(taskId);

  if (!task) {
    return { success: false, error: 'Task not found' };
  }

  // Check if this task has subtasks
  const subtaskCount = (s.subtaskCount.get(taskId) as { count: number }).count;
  if (subtaskCount > 0) {
    return {
      success: false,
      error: `Cannot delete ${taskId} - it has ${subtaskCount} subtask(s). Delete subtasks first.`,
    };
  }

  // Wrap entire delete + cleanup in a transaction for atomicity
  const doDelete = db.transaction(() => {
    // Log the delete event BEFORE deleting the task (events reference task_id)
    logEvent({
      task_id: taskId,
      agent_id: agentId,
      event_type: 'deleted',
      payload: {},
    });

    // Remove this task from other tasks' blocks/blocked_by arrays using SQL LIKE filter
    const blocksRows = db
      .query(`SELECT id, blocks FROM tasks WHERE blocks LIKE '%' || ? || '%' AND id != ?`)
      .all(taskId, taskId) as { id: string; blocks: string }[];
    for (const row of blocksRows) {
      const blocks = (JSON.parse(row.blocks) as string[]).filter(id => id !== taskId);
      db.run(
        `UPDATE tasks SET blocks = ?, updated_at = ? WHERE id = ?`,
        [JSON.stringify(blocks), Date.now(), row.id]
      );
    }

    const blockedByRows = db
      .query(`SELECT id, blocked_by FROM tasks WHERE blocked_by LIKE '%' || ? || '%' AND id != ?`)
      .all(taskId, taskId) as { id: string; blocked_by: string }[];
    for (const row of blockedByRows) {
      const remaining = (JSON.parse(row.blocked_by) as string[]).filter(id => id !== taskId);
      const newStatus: TaskStatus = remaining.length === 0 ? 'ready' : 'blocked';
      db.run(
        `UPDATE tasks SET blocked_by = ?, status = ?, updated_at = ? WHERE id = ?`,
        [JSON.stringify(remaining), newStatus, Date.now(), row.id]
      );
    }

    // Clear parent references with direct SQL
    db.run(
      `UPDATE tasks SET parent_id = NULL, updated_at = ? WHERE parent_id = ?`,
      [Date.now(), taskId]
    );

    // Delete associated events
    db.run('DELETE FROM events WHERE task_id = ?', [taskId]);

    // Clear any agent's current_task if pointing to this task
    db.run('UPDATE agents SET current_task = NULL WHERE current_task = ?', [taskId]);

    // Delete the task
    db.run('DELETE FROM tasks WHERE id = ?', [taskId]);
  });

  doDelete();
  return { success: true };
}
