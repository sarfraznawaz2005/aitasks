import { getDb, getReviewRequired } from '../db/index.js';
import { logEvent, getTaskEvents } from './event.js';
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
  const db = getDb();
  const meta = db
    .query(`SELECT value FROM meta WHERE key = 'last_task_number'`)
    .get() as { value: string };
  const next = parseInt(meta.value, 10) + 1;
  db.run(`UPDATE meta SET value = ? WHERE key = 'last_task_number'`, [String(next)]);
  return `TASK-${String(next).padStart(3, '0')}`;
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export function getTask(id: string): Task | null {
  const db = getDb();
  const row = db.query('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | null;
  return row ? parseTask(row) : null;
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
  const db = getDb();
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
  const db = getDb();
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
  const db = getDb();
  const fields: string[] = ['updated_at = ?'];
  const params: unknown[] = [Date.now()];

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    params.push(JSON_FIELDS.has(key) ? JSON.stringify(value) : value);
  }

  params.push(id);
  db.run(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, params as SQLQueryBindings[]);
  return getTask(id);
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
  const db = getDb();
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

  // Upsert agent record
  db.run(
    `INSERT INTO agents (id, first_seen, last_seen, current_task)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen, current_task = excluded.current_task`,
    [agentId, Date.now(), Date.now(), taskId]
  );

  const updated = updateTask(taskId, { assigned_to: agentId, status: 'ready' });
  logEvent({ task_id: taskId, agent_id: agentId, event_type: 'claimed', payload: {} });
  return { task: updated };
}

export function startTask(
  taskId: string,
  agentId: string
): { task: Task | null; error?: string } {
  const task = getTask(taskId);
  if (!task) return { task: null, error: 'Task not found' };
  if (task.status === 'in_progress') return { task: null, error: 'Task is already in progress' };
  if (task.assigned_to && task.assigned_to !== agentId) {
    return { task: null, error: `Task is assigned to ${task.assigned_to}, not ${agentId}` };
  }

  const db = getDb();
  // Claim it on the fly if unassigned
  if (!task.assigned_to) {
    db.run(
      `INSERT INTO agents (id, first_seen, last_seen, current_task)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen, current_task = excluded.current_task`,
      [agentId, Date.now(), Date.now(), taskId]
    );
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
  const db = getDb();
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
    const events = getTaskEvents(taskId);
    const reviewEvent = [...events].reverse().find(e => e.event_type === 'review_requested');
    if (reviewEvent?.agent_id && reviewEvent.agent_id === agentId) {
      return {
        task: null,
        error:
          `Self-approval blocked: ${agentId} submitted this task for review and cannot also approve it.\n` +
          `  A separate review sub-agent must run: aitasks done ${taskId} --agent <review-agent-id>`,
      };
    }

    // Require the approving agent to have been registered BEFORE the review was submitted.
    // This blocks the pattern: "heartbeat right before done" used to fake a reviewer.
    // Skipped when no --agent is given (human/operator approving directly — trusted action).
    if (agentId) {
      const reviewerRow = db.query(`SELECT first_seen FROM agents WHERE id = ?`).get(agentId) as { first_seen: number } | null;
      const reviewSubmittedAt = reviewEvent?.created_at ?? 0;
      if (!reviewerRow || reviewerRow.first_seen > reviewSubmittedAt) {
        return {
          task: null,
          error:
            `Review agent '${agentId}' was not active before this review was submitted.\n` +
            `  A real review sub-agent must be independently spawned — it cannot be registered\n` +
            `  moments before approving. The reviewer must have prior activity in the system\n` +
            `  before the review was submitted.`,
        };
      }
    }
  }

  const updated = updateTask(taskId, { status: 'done', completed_at: Date.now() });
  logEvent({ task_id: taskId, agent_id: agentId, event_type: 'completed', payload: {} });

  // Auto-unblock dependent tasks
  const pendingRows = db
    .query(`SELECT id, blocked_by FROM tasks WHERE status != 'done'`)
    .all() as { id: string; blocked_by: string }[];

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
  if (agentId) db.run(`UPDATE agents SET current_task = NULL WHERE id = ?`, [agentId]);

  return { task: updated };
}

export function blockTask(
  taskId: string,
  blockerIds: string[],
  agentId?: string
): { task: Task | null; error?: string } {
  const task = getTask(taskId);
  if (!task) return { task: null, error: 'Task not found' };

  for (const bid of blockerIds) {
    const blocker = getTask(bid);
    if (!blocker) return { task: null, error: `Blocker not found: ${bid}` };
    if (blocker.status === 'done') {
      return { task: null, error: `Cannot block on completed task: ${bid}` };
    }
    if (detectCycle(taskId, bid)) {
      return { task: null, error: `Circular dependency detected: ${taskId} → ${bid}` };
    }
  }

  const newBlockedBy = [...new Set([...task.blocked_by, ...blockerIds])];

  // Mirror the relationship on each blocker
  for (const bid of blockerIds) {
    const blocker = getTask(bid)!;
    updateTask(bid, { blocks: [...new Set([...blocker.blocks, taskId])] });
  }

  const updated = updateTask(taskId, { blocked_by: newBlockedBy, status: 'blocked' });
  logEvent({
    task_id: taskId,
    agent_id: agentId,
    event_type: 'blocked',
    payload: { blocked_by: blockerIds },
  });

  return { task: updated };
}

function detectCycle(
  taskId: string,
  candidateBlocker: string,
  visited = new Set<string>()
): boolean {
  if (candidateBlocker === taskId) return true;
  if (visited.has(candidateBlocker)) return false;
  visited.add(candidateBlocker);
  const blocker = getTask(candidateBlocker);
  if (!blocker) return false;
  return blocker.blocked_by.some((id) => detectCycle(taskId, id, visited));
}

export function unblockTask(
  taskId: string,
  fromId: string,
  agentId?: string
): { task: Task | null; error?: string } {
  const task = getTask(taskId);
  if (!task) return { task: null, error: 'Task not found' };
  if (!task.blocked_by.includes(fromId)) {
    return { task: null, error: `${taskId} is not blocked by ${fromId}` };
  }

  const remaining = task.blocked_by.filter((id) => id !== fromId);

  // Mirror on the former blocker
  const blocker = getTask(fromId);
  if (blocker) {
    updateTask(fromId, { blocks: blocker.blocks.filter((id) => id !== taskId) });
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

  updateTask(taskId, { status: 'in_progress' });
  addImplementationNote(taskId, `REVIEW REJECTED: ${reason}`, agentId ?? 'human');
  logEvent({
    task_id: taskId,
    agent_id: agentId,
    event_type: 'rejected',
    payload: { reason },
  });

  return { task: getTask(taskId) };
}

export function unclaimTask(
  taskId: string,
  agentId: string,
  reason?: string
): { task: Task | null; error?: string } {
  const db = getDb();
  const task = getTask(taskId);
  if (!task) return { task: null, error: 'Task not found' };
  if (task.assigned_to !== agentId) {
    return { task: null, error: `Task is not assigned to ${agentId}` };
  }

  const backStatus: TaskStatus = task.blocked_by.length > 0 ? 'blocked' : 'ready';
  updateTask(taskId, { assigned_to: null, status: backStatus, started_at: null });

  if (reason) {
    addImplementationNote(taskId, `UNCLAIMED by ${agentId}: ${reason}`, agentId);
  }

  db.run(`UPDATE agents SET current_task = NULL WHERE id = ?`, [agentId]);
  logEvent({
    task_id: taskId,
    agent_id: agentId,
    event_type: 'unclaimed',
    payload: { reason: reason ?? '' },
  });

  return { task: getTask(taskId) };
}

export function heartbeat(agentId: string, taskId?: string): void {
  const db = getDb();
  db.run(
    `INSERT INTO agents (id, first_seen, last_seen, current_task)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen`,
    [agentId, Date.now(), Date.now(), taskId ?? null]
  );
}

export function listAgents(): { id: string; first_seen: number; last_seen: number; current_task: string | null }[] {
  const db = getDb();
  return db
    .query('SELECT * FROM agents ORDER BY last_seen DESC')
    .all() as { id: string; first_seen: number; last_seen: number; current_task: string | null }[];
}

export function getNextTask(agentId?: string): Task | null {
  const tasks = listTasks({ status: 'ready' });
  // Prefer tasks already assigned to this agent
  if (agentId) {
    const mine = tasks.find((t) => t.assigned_to === agentId);
    if (mine) return mine;
  }
  // Highest priority unassigned ready task
  return tasks.find((t) => t.assigned_to === null) ?? tasks[0] ?? null;
}

export function getStats(): {
  by_status: Record<string, number>;
  by_priority: Record<string, number>;
  by_type: Record<string, number>;
  total: number;
} {
  const db = getDb();

  const byStatus = db
    .query('SELECT status, COUNT(*) as count FROM tasks GROUP BY status')
    .all() as { status: string; count: number }[];
  const byPriority = db
    .query('SELECT priority, COUNT(*) as count FROM tasks GROUP BY priority')
    .all() as { priority: string; count: number }[];
  const byType = db
    .query('SELECT type, COUNT(*) as count FROM tasks GROUP BY type')
    .all() as { type: string; count: number }[];
  const total = (db.query('SELECT COUNT(*) as count FROM tasks').get() as { count: number }).count;

  return {
    by_status: Object.fromEntries(byStatus.map((r) => [r.status, r.count])),
    by_priority: Object.fromEntries(byPriority.map((r) => [r.priority, r.count])),
    by_type: Object.fromEntries(byType.map((r) => [r.type, r.count])),
    total,
  };
}

export function deleteTask(
  taskId: string,
  agentId?: string
): { success: boolean; error?: string } {
  const db = getDb();
  const task = getTask(taskId);

  if (!task) {
    return { success: false, error: 'Task not found' };
  }

  // Check if this task has subtasks
  const subtasks = listTasks({ parent_id: taskId });
  if (subtasks.length > 0) {
    return {
      success: false,
      error: `Cannot delete ${taskId} - it has ${subtasks.length} subtask(s). Delete subtasks first.`,
    };
  }

  // Log the delete event BEFORE deleting the task (events reference task_id)
  logEvent({
    task_id: taskId,
    agent_id: agentId,
    event_type: 'deleted',
    payload: {},
  });

  // Remove this task from other tasks' blocks/blocked_by arrays
  const allTasks = listTasks();
  for (const t of allTasks) {
    if (t.blocks.includes(taskId)) {
      updateTask(t.id, { blocks: t.blocks.filter(id => id !== taskId) });
    }
    if (t.blocked_by.includes(taskId)) {
      const remaining = t.blocked_by.filter(id => id !== taskId);
      updateTask(t.id, {
        blocked_by: remaining,
        status: remaining.length === 0 ? 'ready' : 'blocked',
      });
    }
    // Remove parent reference if this task was a parent
    if (t.parent_id === taskId) {
      updateTask(t.id, { parent_id: null });
    }
  }

  // Delete associated events first (before deleting the task)
  db.run('DELETE FROM events WHERE task_id = ?', [taskId]);

  // Clear any agent's current_task if pointing to this task
  db.run('UPDATE agents SET current_task = NULL WHERE current_task = ?', [taskId]);

  // Delete the task
  db.run('DELETE FROM tasks WHERE id = ?', [taskId]);

  return { success: true };
}

