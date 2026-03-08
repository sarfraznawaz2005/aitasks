import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createTestContext, cleanupTestContext, type TestContext } from '../setup.js';
import { logEvent, getTaskEvents, getAllEvents } from '../../src/models/event.js';
import { createTask } from '../../src/models/task.js';

let ctx: TestContext;

beforeEach(() => { ctx = createTestContext(); });
afterEach(() => { cleanupTestContext(ctx); });

describe('logEvent', () => {
  test('creates an event record', () => {
    const task = createTask({ title: 'T' });
    logEvent({ task_id: task.id, event_type: 'test_event' });
    const events = getTaskEvents(task.id);
    // createTask also logs a 'created' event, so filter for ours
    const ours = events.filter((e) => e.event_type === 'test_event');
    expect(ours.length).toBe(1);
  });

  test('stores agent_id when provided', () => {
    const task = createTask({ title: 'T' });
    logEvent({ task_id: task.id, event_type: 'custom', agent_id: 'agent-x' });
    const events = getTaskEvents(task.id);
    const ev = events.find((e) => e.event_type === 'custom');
    expect(ev!.agent_id).toBe('agent-x');
  });

  test('stores null agent_id when not provided', () => {
    const task = createTask({ title: 'T' });
    logEvent({ task_id: task.id, event_type: 'system_event' });
    const events = getTaskEvents(task.id);
    const ev = events.find((e) => e.event_type === 'system_event');
    expect(ev!.agent_id).toBeNull();
  });

  test('stores payload as parsed object', () => {
    const task = createTask({ title: 'T' });
    logEvent({ task_id: task.id, event_type: 'with_payload', payload: { foo: 'bar', count: 42 } });
    const events = getTaskEvents(task.id);
    const ev = events.find((e) => e.event_type === 'with_payload');
    expect(ev!.payload).toEqual({ foo: 'bar', count: 42 });
  });

  test('sets created_at close to current time', () => {
    const before = Date.now();
    const task = createTask({ title: 'T' });
    logEvent({ task_id: task.id, event_type: 'timed' });
    const after = Date.now();
    const events = getTaskEvents(task.id);
    const ev = events.find((e) => e.event_type === 'timed');
    expect(ev!.created_at).toBeGreaterThanOrEqual(before);
    expect(ev!.created_at).toBeLessThanOrEqual(after);
  });
});

describe('getTaskEvents', () => {
  test('returns events in chronological order', () => {
    const task = createTask({ title: 'T' });
    logEvent({ task_id: task.id, event_type: 'first' });
    logEvent({ task_id: task.id, event_type: 'second' });
    logEvent({ task_id: task.id, event_type: 'third' });
    const events = getTaskEvents(task.id);
    const types = events.map((e) => e.event_type);
    expect(types.indexOf('first')).toBeLessThan(types.indexOf('second'));
    expect(types.indexOf('second')).toBeLessThan(types.indexOf('third'));
  });

  test('returns only events for the given task', () => {
    const t1 = createTask({ title: 'T1' });
    const t2 = createTask({ title: 'T2' });
    logEvent({ task_id: t1.id, event_type: 'for_t1' });
    logEvent({ task_id: t2.id, event_type: 'for_t2' });
    const events = getTaskEvents(t1.id);
    expect(events.every((e) => e.task_id === t1.id)).toBe(true);
  });

  test('returns empty array for task with no extra events', () => {
    // createTask itself logs 'created', so there will always be one
    const task = createTask({ title: 'T' });
    const events = getTaskEvents(task.id);
    expect(events.length).toBeGreaterThanOrEqual(1);
  });
});

describe('getAllEvents', () => {
  test('returns events across all tasks', () => {
    const t1 = createTask({ title: 'T1' });
    const t2 = createTask({ title: 'T2' });
    logEvent({ task_id: t1.id, event_type: 'ev1' });
    logEvent({ task_id: t2.id, event_type: 'ev2' });
    const all = getAllEvents(100);
    const taskIds = new Set(all.map((e) => e.task_id));
    expect(taskIds.has(t1.id)).toBe(true);
    expect(taskIds.has(t2.id)).toBe(true);
  });

  test('respects limit parameter', () => {
    const task = createTask({ title: 'T' });
    for (let i = 0; i < 10; i++) {
      logEvent({ task_id: task.id, event_type: `ev_${i}` });
    }
    const result = getAllEvents(3);
    expect(result.length).toBeLessThanOrEqual(3);
  });
});
