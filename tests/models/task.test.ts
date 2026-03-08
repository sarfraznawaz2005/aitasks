import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createTestContext, cleanupTestContext, type TestContext } from '../setup.js';
import { getTaskEvents } from '../../src/models/event.js';
import { listAgents } from '../../src/models/task.js';
import {
  createTask,
  getTask,
  listTasks,
  updateTask,
  claimTask,
  startTask,
  addImplementationNote,
  checkCriterion,
  completeTask,
  blockTask,
  unblockTask,
  reviewTask,
  rejectTask,
  unclaimTask,
  getNextTask,
  getStats,
} from '../../src/models/task.js';

let ctx: TestContext;

beforeEach(() => { ctx = createTestContext(); });
afterEach(() => { cleanupTestContext(ctx); });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTask(overrides: Parameters<typeof createTask>[0] = { title: 'Test task' }) {
  return createTask({ title: 'Test task', ...overrides });
}

function makeReadyTask(title = 'Ready task') {
  const t = createTask({ title });
  updateTask(t.id, { status: 'ready' });
  return getTask(t.id)!;
}

function fullyComplete(taskId: string, agentId = 'test-agent') {
  const task = getTask(taskId)!;
  startTask(taskId, agentId);
  task.acceptance_criteria.forEach((_, i) => {
    checkCriterion(taskId, i, `evidence for criterion ${i}`, agentId);
  });
  return completeTask(taskId, agentId);
}

// ─── createTask ───────────────────────────────────────────────────────────────

describe('createTask', () => {
  test('creates a task with correct defaults', () => {
    const task = makeTask();
    expect(task.id).toBe('TASK-001');
    expect(task.title).toBe('Test task');
    expect(task.status).toBe('backlog');
    expect(task.priority).toBe('medium');
    expect(task.type).toBe('feature');
    expect(task.assigned_to).toBeNull();
    expect(task.parent_id).toBeNull();
    expect(task.acceptance_criteria).toEqual([]);
    expect(task.blocks).toEqual([]);
    expect(task.blocked_by).toEqual([]);
    expect(task.implementation_notes).toEqual([]);
    expect(task.test_results).toEqual([]);
  });

  test('assigns sequential IDs', () => {
    const a = makeTask({ title: 'A' });
    const b = makeTask({ title: 'B' });
    const c = makeTask({ title: 'C' });
    expect(a.id).toBe('TASK-001');
    expect(b.id).toBe('TASK-002');
    expect(c.id).toBe('TASK-003');
  });

  test('stores acceptance criteria', () => {
    const task = makeTask({
      title: 'T',
      acceptance_criteria: ['API returns 200', 'Response has body'],
    });
    expect(task.acceptance_criteria).toEqual(['API returns 200', 'Response has body']);
  });

  test('stores custom priority and type', () => {
    const task = makeTask({ title: 'T', priority: 'critical', type: 'bug' });
    expect(task.priority).toBe('critical');
    expect(task.type).toBe('bug');
  });

  test('stores description', () => {
    const task = makeTask({ title: 'T', description: 'Full details here' });
    expect(task.description).toBe('Full details here');
  });

  test('stores parent_id for subtasks', () => {
    const parent = makeTask({ title: 'Parent' });
    const child = makeTask({ title: 'Child', parent_id: parent.id });
    expect(child.parent_id).toBe(parent.id);
  });

  test('sets created_at and updated_at to current time', () => {
    const before = Date.now();
    const task = makeTask();
    const after = Date.now();
    expect(task.created_at).toBeGreaterThanOrEqual(before);
    expect(task.created_at).toBeLessThanOrEqual(after);
    expect(task.updated_at).toBeGreaterThanOrEqual(before);
  });

  test('logs a created event', () => {
    const task = makeTask({ title: 'Logged' });
    const events = getTaskEvents(task.id);
    expect(events.some((e) => e.event_type === 'created')).toBe(true);
  });
});

// ─── getTask ──────────────────────────────────────────────────────────────────

describe('getTask', () => {
  test('returns null for unknown ID', () => {
    expect(getTask('TASK-999')).toBeNull();
  });

  test('returns the task by ID', () => {
    const task = makeTask({ title: 'Find me' });
    const found = getTask(task.id);
    expect(found).not.toBeNull();
    expect(found!.title).toBe('Find me');
  });

  test('deserialises JSON fields correctly', () => {
    const task = makeTask({
      title: 'T',
      acceptance_criteria: ['AC1', 'AC2'],
    });
    const found = getTask(task.id)!;
    expect(Array.isArray(found.acceptance_criteria)).toBe(true);
    expect(found.acceptance_criteria).toEqual(['AC1', 'AC2']);
  });
});

// ─── listTasks ────────────────────────────────────────────────────────────────

describe('listTasks', () => {
  test('returns all tasks when no filter', () => {
    makeTask({ title: 'A' });
    makeTask({ title: 'B' });
    makeTask({ title: 'C' });
    expect(listTasks().length).toBe(3);
  });

  test('filters by status', () => {
    const t = makeTask({ title: 'T' });
    updateTask(t.id, { status: 'ready' });
    makeTask({ title: 'U' }); // stays backlog
    const ready = listTasks({ status: 'ready' });
    expect(ready.length).toBe(1);
    expect(ready[0]!.id).toBe(t.id);
  });

  test('filters by multiple statuses', () => {
    const t1 = makeTask({ title: 'A' });
    updateTask(t1.id, { status: 'ready' });
    const t2 = makeTask({ title: 'B' });
    updateTask(t2.id, { status: 'done' });
    makeTask({ title: 'C' }); // backlog
    const result = listTasks({ status: ['ready', 'done'] });
    expect(result.length).toBe(2);
  });

  test('filters by priority', () => {
    makeTask({ title: 'H', priority: 'high' });
    makeTask({ title: 'L', priority: 'low' });
    const result = listTasks({ priority: 'high' });
    expect(result.length).toBe(1);
    expect(result[0]!.priority).toBe('high');
  });

  test('filters by assigned_to', () => {
    const t = makeTask({ title: 'Assigned' });
    updateTask(t.id, { assigned_to: 'agent-1' });
    makeTask({ title: 'Unassigned' });
    const result = listTasks({ assigned_to: 'agent-1' });
    expect(result.length).toBe(1);
    expect(result[0]!.assigned_to).toBe('agent-1');
  });

  test('filters unassigned tasks with "unassigned"', () => {
    const t = makeTask({ title: 'Assigned' });
    updateTask(t.id, { assigned_to: 'agent-1' });
    makeTask({ title: 'Unassigned' });
    const result = listTasks({ assigned_to: 'unassigned' });
    expect(result.length).toBe(1);
    expect(result[0]!.assigned_to).toBeNull();
  });

  test('filters by parent_id', () => {
    const parent = makeTask({ title: 'Parent' });
    makeTask({ title: 'Child', parent_id: parent.id });
    makeTask({ title: 'Root' });
    const subtasks = listTasks({ parent_id: parent.id });
    expect(subtasks.length).toBe(1);
    expect(subtasks[0]!.parent_id).toBe(parent.id);
  });

  test('returns empty array when no tasks match', () => {
    makeTask({ title: 'A' });
    expect(listTasks({ status: 'done' })).toEqual([]);
  });
});

// ─── updateTask ───────────────────────────────────────────────────────────────

describe('updateTask', () => {
  test('updates title', () => {
    const task = makeTask({ title: 'Old' });
    updateTask(task.id, { title: 'New' });
    expect(getTask(task.id)!.title).toBe('New');
  });

  test('updates acceptance_criteria (JSON field)', () => {
    const task = makeTask({ title: 'T', acceptance_criteria: ['Old AC'] });
    updateTask(task.id, { acceptance_criteria: ['New AC 1', 'New AC 2'] });
    expect(getTask(task.id)!.acceptance_criteria).toEqual(['New AC 1', 'New AC 2']);
  });

  test('updates updated_at', () => {
    const task = makeTask();
    const before = task.updated_at;
    // Small sleep to ensure time difference
    Bun.sleepSync(5);
    updateTask(task.id, { title: 'Changed' });
    expect(getTask(task.id)!.updated_at).toBeGreaterThanOrEqual(before);
  });

  test('returns null for unknown ID', () => {
    const result = updateTask('TASK-999', { title: 'X' });
    expect(result).toBeNull();
  });
});

// ─── claimTask ────────────────────────────────────────────────────────────────

describe('claimTask', () => {
  test('claims an available task', () => {
    const task = makeTask({ title: 'Available' });
    const { task: claimed, error } = claimTask(task.id, 'agent-1');
    expect(error).toBeUndefined();
    expect(claimed!.assigned_to).toBe('agent-1');
    expect(claimed!.status).toBe('ready');
  });

  test('fails on non-existent task', () => {
    const { error } = claimTask('TASK-999', 'agent-1');
    expect(error).toContain('not found');
  });

  test('fails on a task already in_progress', () => {
    const task = makeTask();
    updateTask(task.id, { status: 'in_progress', assigned_to: 'agent-1' });
    const { error } = claimTask(task.id, 'agent-2');
    expect(error).toContain('in progress');
  });

  test('fails on a blocked task', () => {
    const blocker = makeTask({ title: 'Blocker' });
    const task = makeTask({ title: 'Blocked' });
    blockTask(task.id, [blocker.id]);
    const { error } = claimTask(task.id, 'agent-1');
    expect(error).toContain('blocked');
  });

  test('fails on a done task', () => {
    const task = makeTask({ title: 'Done' });
    updateTask(task.id, { status: 'done' });
    const { error } = claimTask(task.id, 'agent-1');
    expect(error).toContain('done');
  });

  test('registers the agent in the agents table', () => {
    const task = makeTask();
    claimTask(task.id, 'agent-xyz');
    const agents = listAgents();
    expect(agents.some((a) => a.id === 'agent-xyz')).toBe(true);
  });
});

// ─── startTask ────────────────────────────────────────────────────────────────

describe('startTask', () => {
  test('transitions a claimed task to in_progress', () => {
    const task = makeTask();
    claimTask(task.id, 'agent-1');
    const { task: started, error } = startTask(task.id, 'agent-1');
    expect(error).toBeUndefined();
    expect(started!.status).toBe('in_progress');
  });

  test('sets started_at timestamp', () => {
    const before = Date.now();
    const task = makeTask();
    claimTask(task.id, 'agent-1');
    startTask(task.id, 'agent-1');
    const updated = getTask(task.id)!;
    expect(updated.started_at).not.toBeNull();
    expect(updated.started_at!).toBeGreaterThanOrEqual(before);
  });

  test('auto-claims if unassigned', () => {
    const task = makeTask();
    const { task: started, error } = startTask(task.id, 'agent-1');
    expect(error).toBeUndefined();
    expect(started!.assigned_to).toBe('agent-1');
    expect(started!.status).toBe('in_progress');
  });

  test('fails when claimed by a different agent', () => {
    const task = makeTask();
    claimTask(task.id, 'agent-1');
    const { error } = startTask(task.id, 'agent-2');
    expect(error).toContain('agent-1');
  });

  test('fails if already in_progress', () => {
    const task = makeTask();
    claimTask(task.id, 'agent-1');
    startTask(task.id, 'agent-1');
    const { error } = startTask(task.id, 'agent-1');
    expect(error).toContain('already in progress');
  });
});

// ─── addImplementationNote ────────────────────────────────────────────────────

describe('addImplementationNote', () => {
  test('appends a note with timestamp and agent', () => {
    const task = makeTask();
    addImplementationNote(task.id, 'First note', 'agent-1');
    const updated = getTask(task.id)!;
    expect(updated.implementation_notes.length).toBe(1);
    expect(updated.implementation_notes[0]!.note).toBe('First note');
    expect(updated.implementation_notes[0]!.agent).toBe('agent-1');
    expect(updated.implementation_notes[0]!.timestamp).toBeGreaterThan(0);
  });

  test('accumulates multiple notes', () => {
    const task = makeTask();
    addImplementationNote(task.id, 'Note 1', 'agent-1');
    addImplementationNote(task.id, 'Note 2', 'agent-2');
    addImplementationNote(task.id, 'Note 3', 'agent-1');
    const updated = getTask(task.id)!;
    expect(updated.implementation_notes.length).toBe(3);
    expect(updated.implementation_notes[2]!.note).toBe('Note 3');
  });

  test('returns null for unknown task', () => {
    const result = addImplementationNote('TASK-999', 'Note', 'agent-1');
    expect(result).toBeNull();
  });
});

// ─── checkCriterion ───────────────────────────────────────────────────────────

describe('checkCriterion', () => {
  test('stores evidence and agent for valid index', () => {
    const task = makeTask({ title: 'T', acceptance_criteria: ['AC1', 'AC2'] });
    const { task: updated, error } = checkCriterion(task.id, 0, 'proof here', 'agent-1');
    expect(error).toBeUndefined();
    expect(updated!.test_results.length).toBe(1);
    expect(updated!.test_results[0]!.evidence).toBe('proof here');
    expect(updated!.test_results[0]!.agent).toBe('agent-1');
    expect(updated!.test_results[0]!.criterion).toBe('AC1');
    expect(updated!.test_results[0]!.index).toBe(0);
  });

  test('fails for out-of-range index', () => {
    const task = makeTask({ title: 'T', acceptance_criteria: ['AC1'] });
    const { error } = checkCriterion(task.id, 5, 'proof', 'agent-1');
    expect(error).toContain('out of range');
  });

  test('fails for negative index', () => {
    const task = makeTask({ title: 'T', acceptance_criteria: ['AC1'] });
    const { error } = checkCriterion(task.id, -1, 'proof', 'agent-1');
    expect(error).toContain('out of range');
  });

  test('overwrites previous check for same index', () => {
    const task = makeTask({ title: 'T', acceptance_criteria: ['AC1'] });
    checkCriterion(task.id, 0, 'first proof', 'agent-1');
    const { task: updated } = checkCriterion(task.id, 0, 'better proof', 'agent-2');
    expect(updated!.test_results.length).toBe(1);
    expect(updated!.test_results[0]!.evidence).toBe('better proof');
    expect(updated!.test_results[0]!.agent).toBe('agent-2');
  });

  test('fails for unknown task', () => {
    const { error } = checkCriterion('TASK-999', 0, 'proof', 'agent-1');
    expect(error).toContain('not found');
  });
});

// ─── completeTask ─────────────────────────────────────────────────────────────

describe('completeTask', () => {
  test('fails when acceptance criteria are not checked', () => {
    const task = makeTask({ title: 'T', acceptance_criteria: ['AC1', 'AC2'] });
    startTask(task.id, 'agent-1');
    const { error, unchecked } = completeTask(task.id, 'agent-1');
    expect(error).toContain('acceptance criteria');
    expect(unchecked).toHaveLength(2);
    expect(unchecked![0]).toContain('AC1');
  });

  test('fails when only some criteria are checked', () => {
    const task = makeTask({ title: 'T', acceptance_criteria: ['AC1', 'AC2'] });
    startTask(task.id, 'agent-1');
    checkCriterion(task.id, 0, 'proof 0', 'agent-1');
    const { error, unchecked } = completeTask(task.id, 'agent-1');
    expect(error).toBeDefined();
    expect(unchecked).toHaveLength(1);
    expect(unchecked![0]).toContain('AC2');
  });

  test('succeeds when all criteria are checked', () => {
    const task = makeTask({ title: 'T', acceptance_criteria: ['AC1', 'AC2'] });
    startTask(task.id, 'agent-1');
    checkCriterion(task.id, 0, 'proof 0', 'agent-1');
    checkCriterion(task.id, 1, 'proof 1', 'agent-1');
    const { task: done, error } = completeTask(task.id, 'agent-1');
    expect(error).toBeUndefined();
    expect(done!.status).toBe('done');
  });

  test('succeeds with no acceptance criteria', () => {
    const task = makeTask({ title: 'T', acceptance_criteria: [] });
    startTask(task.id, 'agent-1');
    const { task: done, error } = completeTask(task.id, 'agent-1');
    expect(error).toBeUndefined();
    expect(done!.status).toBe('done');
  });

  test('sets completed_at timestamp', () => {
    const before = Date.now();
    const task = makeTask({ title: 'T' });
    startTask(task.id, 'agent-1');
    completeTask(task.id, 'agent-1');
    const done = getTask(task.id)!;
    expect(done.completed_at).not.toBeNull();
    expect(done.completed_at!).toBeGreaterThanOrEqual(before);
  });

  test('auto-unblocks tasks that were waiting on it', () => {
    const blocker = makeTask({ title: 'Blocker' });
    const waiter = makeTask({ title: 'Waiter' });
    blockTask(waiter.id, [blocker.id]);

    expect(getTask(waiter.id)!.status).toBe('blocked');

    startTask(blocker.id, 'agent-1');
    completeTask(blocker.id, 'agent-1');

    expect(getTask(waiter.id)!.status).toBe('ready');
    expect(getTask(waiter.id)!.blocked_by).toEqual([]);
  });

  test('only fully unblocks when all blockers are done', () => {
    const b1 = makeTask({ title: 'Blocker 1' });
    const b2 = makeTask({ title: 'Blocker 2' });
    const waiter = makeTask({ title: 'Waiter' });
    blockTask(waiter.id, [b1.id, b2.id]);

    startTask(b1.id, 'agent-1');
    completeTask(b1.id, 'agent-1');

    // b2 still pending — waiter should still be blocked
    const mid = getTask(waiter.id)!;
    expect(mid.status).toBe('blocked');
    expect(mid.blocked_by).toEqual([b2.id]);

    startTask(b2.id, 'agent-1');
    completeTask(b2.id, 'agent-1');

    expect(getTask(waiter.id)!.status).toBe('ready');
  });

  test('releases agent current_task on completion', () => {
    const task = makeTask({ title: 'T' });
    claimTask(task.id, 'agent-1');
    startTask(task.id, 'agent-1');
    completeTask(task.id, 'agent-1');

    const db = ctx.db;
    const agent = db
      .query(`SELECT current_task FROM agents WHERE id = 'agent-1'`)
      .get() as { current_task: string | null };
    expect(agent.current_task).toBeNull();
  });

  test('fails for unknown task', () => {
    const { error } = completeTask('TASK-999', 'agent-1');
    expect(error).toContain('not found');
  });
});

// ─── blockTask ────────────────────────────────────────────────────────────────

describe('blockTask', () => {
  test('sets task status to blocked', () => {
    const blocker = makeTask({ title: 'Blocker' });
    const task = makeTask({ title: 'Task' });
    blockTask(task.id, [blocker.id]);
    expect(getTask(task.id)!.status).toBe('blocked');
  });

  test('populates blocked_by on the blocked task', () => {
    const b = makeTask({ title: 'B' });
    const t = makeTask({ title: 'T' });
    blockTask(t.id, [b.id]);
    expect(getTask(t.id)!.blocked_by).toEqual([b.id]);
  });

  test('mirrors relationship — blocker.blocks includes the blocked task', () => {
    const b = makeTask({ title: 'B' });
    const t = makeTask({ title: 'T' });
    blockTask(t.id, [b.id]);
    expect(getTask(b.id)!.blocks).toContain(t.id);
  });

  test('fails when blocker does not exist', () => {
    const t = makeTask({ title: 'T' });
    const { error } = blockTask(t.id, ['TASK-999']);
    expect(error).toContain('not found');
  });

  test('fails when blocking on a completed task', () => {
    const b = makeTask({ title: 'Done' });
    updateTask(b.id, { status: 'done' });
    const t = makeTask({ title: 'T' });
    const { error } = blockTask(t.id, [b.id]);
    expect(error).toContain('completed');
  });

  test('detects direct cycle (A blocked_by A)', () => {
    const t = makeTask({ title: 'T' });
    const { error } = blockTask(t.id, [t.id]);
    expect(error).toContain('Circular');
  });

  test('detects indirect cycle (A→B→A)', () => {
    const a = makeTask({ title: 'A' });
    const b = makeTask({ title: 'B' });
    blockTask(a.id, [b.id]); // A is blocked by B
    const { error } = blockTask(b.id, [a.id]); // B blocked by A — cycle!
    expect(error).toContain('Circular');
  });

  test('accumulates multiple blockers', () => {
    const b1 = makeTask({ title: 'B1' });
    const b2 = makeTask({ title: 'B2' });
    const t = makeTask({ title: 'T' });
    blockTask(t.id, [b1.id, b2.id]);
    const blocked = getTask(t.id)!;
    expect(blocked.blocked_by).toContain(b1.id);
    expect(blocked.blocked_by).toContain(b2.id);
  });
});

// ─── unblockTask ──────────────────────────────────────────────────────────────

describe('unblockTask', () => {
  test('removes the blocker from blocked_by', () => {
    const b = makeTask({ title: 'B' });
    const t = makeTask({ title: 'T' });
    blockTask(t.id, [b.id]);
    unblockTask(t.id, b.id);
    expect(getTask(t.id)!.blocked_by).toEqual([]);
  });

  test('transitions to ready when no blockers remain', () => {
    const b = makeTask({ title: 'B' });
    const t = makeTask({ title: 'T' });
    blockTask(t.id, [b.id]);
    unblockTask(t.id, b.id);
    expect(getTask(t.id)!.status).toBe('ready');
  });

  test('stays blocked with remaining blockers', () => {
    const b1 = makeTask({ title: 'B1' });
    const b2 = makeTask({ title: 'B2' });
    const t = makeTask({ title: 'T' });
    blockTask(t.id, [b1.id, b2.id]);
    unblockTask(t.id, b1.id);
    expect(getTask(t.id)!.status).toBe('blocked');
    expect(getTask(t.id)!.blocked_by).toEqual([b2.id]);
  });

  test('removes task from blocker.blocks', () => {
    const b = makeTask({ title: 'B' });
    const t = makeTask({ title: 'T' });
    blockTask(t.id, [b.id]);
    unblockTask(t.id, b.id);
    expect(getTask(b.id)!.blocks).not.toContain(t.id);
  });

  test('fails if task is not blocked by the given task', () => {
    const b = makeTask({ title: 'B' });
    const t = makeTask({ title: 'T' });
    const { error } = unblockTask(t.id, b.id);
    expect(error).toContain('not blocked');
  });

  test('fails for unknown task', () => {
    const { error } = unblockTask('TASK-999', 'TASK-001');
    expect(error).toContain('not found');
  });
});

// ─── reviewTask ───────────────────────────────────────────────────────────────

describe('reviewTask', () => {
  test('transitions in_progress task to needs_review', () => {
    const task = makeTask();
    startTask(task.id, 'agent-1');
    const { task: reviewed, error } = reviewTask(task.id, 'agent-1');
    expect(error).toBeUndefined();
    expect(reviewed!.status).toBe('needs_review');
  });

  test('fails when task is not in_progress', () => {
    const task = makeTask();
    const { error } = reviewTask(task.id, 'agent-1');
    expect(error).toContain('in_progress');
  });
});

// ─── rejectTask ───────────────────────────────────────────────────────────────

describe('rejectTask', () => {
  test('sends needs_review back to in_progress', () => {
    const task = makeTask();
    startTask(task.id, 'agent-1');
    reviewTask(task.id, 'agent-1');
    const { task: rejected, error } = rejectTask(task.id, 'Tests are missing', 'human');
    expect(error).toBeUndefined();
    expect(rejected!.status).toBe('in_progress');
  });

  test('adds rejection note to implementation_notes', () => {
    const task = makeTask();
    startTask(task.id, 'agent-1');
    reviewTask(task.id, 'agent-1');
    rejectTask(task.id, 'Needs more tests', 'human');
    const updated = getTask(task.id)!;
    expect(updated.implementation_notes.some((n) => n.note.includes('Needs more tests'))).toBe(true);
  });

  test('fails when task is not needs_review', () => {
    const task = makeTask();
    const { error } = rejectTask(task.id, 'Reason', 'human');
    expect(error).toContain('needs_review');
  });
});

// ─── unclaimTask ──────────────────────────────────────────────────────────────

describe('unclaimTask', () => {
  test('releases the task from the agent', () => {
    const task = makeTask();
    claimTask(task.id, 'agent-1');
    const { task: released, error } = unclaimTask(task.id, 'agent-1');
    expect(error).toBeUndefined();
    expect(released!.assigned_to).toBeNull();
  });

  test('reverts status to ready when not blocked', () => {
    const task = makeTask();
    claimTask(task.id, 'agent-1');
    unclaimTask(task.id, 'agent-1');
    expect(getTask(task.id)!.status).toBe('ready');
  });

  test('reverts status to blocked when blockers remain', () => {
    const blocker = makeTask({ title: 'Blocker' });
    const task = makeTask({ title: 'Task' });
    // Manually set up a claimed-but-blocked scenario
    updateTask(task.id, { assigned_to: 'agent-1', status: 'in_progress', blocked_by: [blocker.id] });
    unclaimTask(task.id, 'agent-1');
    expect(getTask(task.id)!.status).toBe('blocked');
  });

  test('adds reason as implementation note', () => {
    const task = makeTask();
    claimTask(task.id, 'agent-1');
    unclaimTask(task.id, 'agent-1', 'Need more info');
    const updated = getTask(task.id)!;
    expect(updated.implementation_notes.some((n) => n.note.includes('Need more info'))).toBe(true);
  });

  test('fails when agent does not own the task', () => {
    const task = makeTask();
    claimTask(task.id, 'agent-1');
    const { error } = unclaimTask(task.id, 'agent-2');
    expect(error).toContain('agent-2');
  });
});

// ─── getNextTask ──────────────────────────────────────────────────────────────

describe('getNextTask', () => {
  test('returns null when no ready tasks', () => {
    makeTask({ title: 'T' }); // backlog
    expect(getNextTask()).toBeNull();
  });

  test('returns the highest priority ready task', () => {
    const lo = makeTask({ title: 'Low', priority: 'low' });
    updateTask(lo.id, { status: 'ready' });
    const hi = makeTask({ title: 'High', priority: 'high' });
    updateTask(hi.id, { status: 'ready' });
    const med = makeTask({ title: 'Med', priority: 'medium' });
    updateTask(med.id, { status: 'ready' });
    const next = getNextTask();
    expect(next!.id).toBe(hi.id);
  });

  test('prefers tasks already assigned to the given agent', () => {
    const unassigned = makeTask({ title: 'Unassigned', priority: 'critical' });
    updateTask(unassigned.id, { status: 'ready' });
    const mine = makeTask({ title: 'Mine', priority: 'low' });
    updateTask(mine.id, { status: 'ready', assigned_to: 'agent-1' });
    const next = getNextTask('agent-1');
    expect(next!.id).toBe(mine.id);
  });
});

// ─── getStats ─────────────────────────────────────────────────────────────────

describe('getStats', () => {
  test('returns zero counts on empty DB', () => {
    const stats = getStats();
    expect(stats.total).toBe(0);
    expect(stats.by_status).toEqual({});
  });

  test('counts tasks by status correctly', () => {
    const t1 = makeTask({ title: 'A' });
    makeTask({ title: 'B' });
    updateTask(t1.id, { status: 'done' });
    const stats = getStats();
    expect(stats.by_status['done']).toBe(1);
    expect(stats.by_status['backlog']).toBe(1);
    expect(stats.total).toBe(2);
  });

  test('counts tasks by priority', () => {
    makeTask({ title: 'H', priority: 'high' });
    makeTask({ title: 'L', priority: 'low' });
    makeTask({ title: 'L2', priority: 'low' });
    const stats = getStats();
    expect(stats.by_priority['high']).toBe(1);
    expect(stats.by_priority['low']).toBe(2);
  });

  test('counts tasks by type', () => {
    makeTask({ title: 'F', type: 'feature' });
    makeTask({ title: 'B', type: 'bug' });
    makeTask({ title: 'B2', type: 'bug' });
    const stats = getStats();
    expect(stats.by_type['feature']).toBe(1);
    expect(stats.by_type['bug']).toBe(2);
  });
});
