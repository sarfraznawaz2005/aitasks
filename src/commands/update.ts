import { Command } from 'commander';
import chalk from 'chalk';
import { requireInitialized, getReviewRequired } from '../db/index.js';
import { getTask, updateTask } from '../models/task.js';
import type { TaskPriority, TaskType, TaskStatus } from '../types.js';
import { jsonOut, isJsonMode, exitError } from './shared.js';

export const updateCommand = new Command('update')
  .description('Update task fields')
  .argument('<taskId>', 'Task ID')
  .option('-t, --title <title>', 'New title')
  .option('-d, --desc <description>', 'New description')
  .option('-a, --ac <criterion>', 'Add an acceptance criterion (repeatable)', collect, [])
  .option('--replace-ac <criteria>', 'Replace ALL acceptance criteria (newline-separated)')
  .option('--set-ac <index=text>', 'Replace a single acceptance criterion by 0-based index, e.g. --set-ac 1="New text"')
  .option('--remove-ac <index>', 'Remove a single acceptance criterion by 0-based index')
  .option('-p, --priority <priority>', 'New priority: critical|high|medium|low')
  .option('--type <type>', 'New type: feature|bug|chore|spike')
  .option('--status <status>', 'Manually set status (use with care)')
  .option('--json', 'Output as JSON')
  .addHelpText('after', `
Acceptance criteria editing:
  --ac <text>            Append a new criterion (repeatable). Does NOT replace existing ones.
  --set-ac <index=text>  Replace just the criterion at <index> (0-based). Re-verify it afterward —
                         any prior verification of that criterion is cleared since the wording changed.
  --remove-ac <index>    Delete the criterion at <index> (0-based). Verifications are re-indexed.
  --replace-ac <list>    Overwrite the entire list (newline-separated).

  Only one acceptance-criteria mode may be used per invocation.

Examples:
  $ aitasks update TASK-001 --set-ac 1="Returns 404 with a JSON error body"
  $ aitasks update TASK-001 --remove-ac 2
  $ aitasks update TASK-001 --ac "New criterion to append"`)
  .action((taskId: string, opts: {
    title?: string;
    desc?: string;
    ac: string[];
    replaceAc?: string;
    setAc?: string;
    removeAc?: string;
    priority?: string;
    type?: string;
    status?: string;
    json?: boolean;
  }) => {
    requireInitialized();
    const json = isJsonMode(opts.json);
    const id = taskId.toUpperCase();

    const task = getTask(id);
    if (!task) exitError(`Task not found: ${taskId}`, json);

    const changes: Parameters<typeof updateTask>[1] = {};

    if (opts.title)    changes.title = opts.title;
    if (opts.desc)     changes.description = opts.desc;
    if (opts.priority) changes.priority = opts.priority as TaskPriority;
    if (opts.type)     changes.type = opts.type as TaskType;
    if (opts.status)   changes.status = opts.status as TaskStatus;

    // Acceptance-criteria mutations are mutually exclusive — picking more than
    // one mode at once is ambiguous (and index-based modes race with replaces).
    const acModes = [
      opts.ac.length > 0,
      opts.replaceAc !== undefined,
      opts.setAc !== undefined,
      opts.removeAc !== undefined,
    ].filter(Boolean).length;
    if (acModes > 1) {
      exitError('Use only one of --ac, --replace-ac, --set-ac, or --remove-ac per invocation.', json);
    }

    if (opts.replaceAc !== undefined) {
      changes.acceptance_criteria = opts.replaceAc
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (opts.ac.length > 0) {
      changes.acceptance_criteria = [...task.acceptance_criteria, ...opts.ac];
    } else if (opts.setAc !== undefined) {
      const eq = opts.setAc.indexOf('=');
      if (eq < 0) {
        exitError('--set-ac requires the format <index>=<text>, e.g. --set-ac 1="New criterion".', json);
      }
      const index = parseCriterionIndex(opts.setAc.slice(0, eq), task.acceptance_criteria.length, json);
      const text = opts.setAc.slice(eq + 1).trim();
      if (!text) exitError('--set-ac text cannot be empty.', json);

      const criteria = [...task.acceptance_criteria];
      criteria[index] = text;
      changes.acceptance_criteria = criteria;

      // The criterion's wording changed — any prior verification of it is stale.
      if (task.test_results.some((r) => r.index === index)) {
        changes.test_results = task.test_results.filter((r) => r.index !== index);
      }
    } else if (opts.removeAc !== undefined) {
      const index = parseCriterionIndex(opts.removeAc, task.acceptance_criteria.length, json);

      changes.acceptance_criteria = task.acceptance_criteria.filter((_, i) => i !== index);

      // Drop the removed criterion's verification and shift higher indices down by one.
      changes.test_results = task.test_results
        .filter((r) => r.index !== index)
        .map((r) => (r.index > index ? { ...r, index: r.index - 1 } : r));
    }

    if (Object.keys(changes).length === 0) {
      exitError('No changes specified. Use --help to see available options.', json);
    }

    // Enforce review gate: cannot bypass it by setting status=done directly
    if (opts.status === 'done' && getReviewRequired() && task.status !== 'review') {
      exitError(
        'Review required: use `aitasks done` which enforces the review gate.\n' +
        '  Submit for review first: aitasks review <taskId> --agent $AITASKS_AGENT_ID',
        json
      );
    }

    const updated = updateTask(id, changes);

    if (json) return jsonOut(true, updated);

    console.log('');
    console.log(chalk.green('  ✓') + `  Updated ${chalk.bold(id)}`);
    for (const [k, v] of Object.entries(changes)) {
      console.log(chalk.dim(`     ${k}: ${JSON.stringify(v)}`));
    }
    console.log('');
  });

function collect(val: string, acc: string[]): string[] {
  acc.push(val);
  return acc;
}

function parseCriterionIndex(raw: string, total: number, json: boolean): number {
  const index = parseInt(raw.trim(), 10);
  if (isNaN(index) || index < 0) {
    exitError(`Invalid criterion index "${raw.trim()}". Use a non-negative integer: 0, 1, 2, …`, json);
  }
  if (index >= total) {
    exitError(`Index ${index} out of range — task has ${total} criteria (0-based, so valid range is 0–${total - 1}).`, json);
  }
  return index;
}
