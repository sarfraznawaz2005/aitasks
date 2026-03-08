import { Command } from 'commander';
import chalk from 'chalk';
import { requireInitialized } from '../db/index.js';
import { getTask } from '../models/task.js';
import { getTaskEvents } from '../models/event.js';
import { renderTaskDetail } from '../display/detail.js';
import { jsonOut, isJsonMode, exitError } from './shared.js';
import { formatDate } from '../utils/format.js';

export const logCommand = new Command('log')
  .description('Show the full event history of a task')
  .argument('<taskId>', 'Task ID')
  .option('--json', 'Output as JSON')
  .action((taskId: string, opts: { json?: boolean }) => {
    requireInitialized();
    const json = isJsonMode(opts.json);
    const id = taskId.toUpperCase();

    const task = getTask(id);
    if (!task) exitError(`Task not found: ${taskId}`, json);

    const events = getTaskEvents(id);

    if (json) return jsonOut(true, { task, events });

    console.log(renderTaskDetail(task, events));

    if (events.length === 0) {
      console.log(chalk.dim('  No events recorded.\n'));
      return;
    }

    // The detail renderer already includes events when passed, so we're done
  });
