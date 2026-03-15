import { Command } from 'commander';
import chalk from 'chalk';
import { requireInitialized, getReviewRequired } from '../db/index.js';
import { getTask, updateTask, listTasks } from '../models/task.js';
import { getTaskEvents } from '../models/event.js';
import { jsonOut, isJsonMode, requireAgentId } from './shared.js';
import type { TaskStatus } from '../types.js';

// Define which events can be undone and their reverse action
const UNDOABLE_EVENTS = new Set([
  'claimed',
  'started',
  'completed',
  'review_requested',
  'criterion_checked',
  'note_added',
]);

// Status transitions for undo
const STATUS_UNDO: Record<string, TaskStatus> = {
  completed: 'in_progress',        // done -> in_progress
  review_requested: 'in_progress', // review -> in_progress
  started: 'ready',                // in_progress -> ready
  claimed: 'backlog',              // ready -> backlog (unclaim)
};

export const undoCommand = new Command('undo')
  .description('Undo the last action on a task')
  .argument('<taskId>', 'Task ID')
  .option('--agent <agentId>', 'Agent ID (required for some undo operations)')
  .option('--json', 'Output as JSON')
  .action((taskId: string, opts: { agent?: string; json?: boolean }) => {
    requireInitialized();
    const json = isJsonMode(opts.json);
    const task = getTask(taskId.toUpperCase());

    if (!task) {
      if (json) return jsonOut(false, undefined, `Task not found: ${taskId.toUpperCase()}`);
      console.error(chalk.red(`  Task not found: ${taskId.toUpperCase()}`));
      process.exit(1);
    }

    const events = getTaskEvents(task.id);
    if (events.length === 0) {
      if (json) return jsonOut(false, undefined, 'No events to undo');
      console.error(chalk.red('  No events to undo'));
      console.error('');
      process.exit(1);
    }

    // Find the last undoable event
    const lastUndoableEvent = [...events].reverse().find(e => UNDOABLE_EVENTS.has(e.event_type));

    if (!lastUndoableEvent) {
      if (json) return jsonOut(false, undefined, 'No undoable events found');
      console.error(chalk.red('  No undoable events found'));
      console.error(chalk.dim('  Only the following can be undone: claimed, started, completed, review_requested, criterion_checked, note_added'));
      console.error('');
      process.exit(1);
    }

    // Perform the undo based on event type
    let result: { success: boolean; message: string; data?: unknown };

    switch (lastUndoableEvent.event_type) {
      case 'completed':
        result = undoComplete(task);
        break;
      case 'review_requested':
        result = undoReviewRequested(task);
        break;
      case 'started':
        result = undoStarted(task);
        break;
      case 'claimed':
        result = undoClaimed(task);
        break;
      case 'criterion_checked':
        result = undoCriterionChecked(task, lastUndoableEvent.payload);
        break;
      case 'note_added':
        result = undoNoteAdded(task, lastUndoableEvent.payload);
        break;
      default:
        result = { success: false, message: `Cannot undo: ${lastUndoableEvent.event_type}` };
    }

    if (json) {
      return jsonOut(result.success, result.data, result.success ? undefined : result.message);
    }

    if (result.success) {
      console.log('');
      console.log(chalk.green('  ✓') + `  Undone: ${lastUndoableEvent.event_type}`);
      console.log(chalk.dim(`  ${result.message}`));
      console.log('');
    } else {
      console.error('');
      console.error(chalk.red(`  ✗  ${result.message}`));
      console.error('');
      process.exit(1);
    }
  });

function undoComplete(task: import('../types.js').Task): { success: boolean; message: string; data?: unknown } {
  // When review is required, undo of done goes back to review (re-submit needed)
  // Otherwise revert to in_progress
  const newStatus = getReviewRequired() ? 'review' : 'in_progress';
  updateTask(task.id, {
    status: newStatus,
    completed_at: null,
  });
  return {
    success: true,
    message: `${task.id} reverted from done to ${newStatus}`,
    data: { task: task.id, previousStatus: 'done', newStatus },
  };
}

function undoReviewRequested(task: import('../types.js').Task): { success: boolean; message: string; data?: unknown } {
  if (task.status !== 'review') {
    return { success: false, message: `${task.id} is not in review status` };
  }
  updateTask(task.id, { status: 'in_progress' });
  return {
    success: true,
    message: `${task.id} reverted from review to in_progress`,
    data: { task: task.id, previousStatus: 'review', newStatus: 'in_progress' },
  };
}

function undoStarted(task: import('../types.js').Task): { success: boolean; message: string; data?: unknown } {
  if (task.status !== 'in_progress') {
    return { success: false, message: `${task.id} is not in in_progress status` };
  }
  updateTask(task.id, {
    status: 'ready',
    started_at: null,
  });
  return {
    success: true,
    message: `${task.id} reverted from in_progress to ready`,
    data: { task: task.id, previousStatus: 'in_progress', newStatus: 'ready' },
  };
}

function undoClaimed(task: import('../types.js').Task): { success: boolean; message: string; data?: unknown } {
  if (!task.assigned_to) {
    return { success: false, message: `${task.id} is not assigned to anyone` };
  }
  updateTask(task.id, {
    assigned_to: null,
    status: 'backlog',
  });
  return {
    success: true,
    message: `${task.id} unclaimed and returned to backlog`,
    data: { task: task.id, wasAssignedTo: task.assigned_to, newStatus: 'backlog' },
  };
}

function undoCriterionChecked(
  task: import('../types.js').Task,
  payload: Record<string, unknown>
): { success: boolean; message: string; data?: unknown } {
  const index = payload.index as number | undefined;
  if (index === undefined || index === null) {
    return { success: false, message: 'Could not determine which criterion was checked' };
  }

  const newTestResults = task.test_results.filter(r => r.index !== index);
  updateTask(task.id, { test_results: newTestResults });

  const criterion = task.acceptance_criteria[index] || `criterion ${index}`;
  return {
    success: true,
    message: `Removed verification for: ${criterion}`,
    data: { task: task.id, criterionIndex: index, criterion },
  };
}

function undoNoteAdded(
  task: import('../types.js').Task,
  payload: Record<string, unknown>
): { success: boolean; message: string; data?: unknown } {
  const noteText = payload.note as string | undefined;
  if (!noteText) {
    return { success: false, message: 'Could not determine which note to remove' };
  }

  // Find and remove the most recent matching note
  const noteIndex = task.implementation_notes.findIndex(n => n.note === noteText);
  if (noteIndex === -1) {
    return { success: false, message: 'Note not found in task' };
  }

  const newNotes = [...task.implementation_notes];
  newNotes.splice(noteIndex, 1);
  updateTask(task.id, { implementation_notes: newNotes });

  return {
    success: true,
    message: `Removed note: ${noteText.slice(0, 50)}${noteText.length > 50 ? '...' : ''}`,
    data: { task: task.id, removedNote: noteText },
  };
}
