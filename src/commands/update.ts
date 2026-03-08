import { Command } from 'commander';
import chalk from 'chalk';
import { requireInitialized } from '../db/index.js';
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
  .option('-p, --priority <priority>', 'New priority: critical|high|medium|low')
  .option('--type <type>', 'New type: feature|bug|chore|spike')
  .option('--status <status>', 'Manually set status (use with care)')
  .option('--json', 'Output as JSON')
  .action((taskId: string, opts: {
    title?: string;
    desc?: string;
    ac: string[];
    replaceAc?: string;
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

    if (opts.replaceAc) {
      changes.acceptance_criteria = opts.replaceAc
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (opts.ac.length > 0) {
      changes.acceptance_criteria = [...task.acceptance_criteria, ...opts.ac];
    }

    if (Object.keys(changes).length === 0) {
      exitError('No changes specified. Use --help to see available options.', json);
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
