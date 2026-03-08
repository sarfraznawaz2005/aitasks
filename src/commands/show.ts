import { Command } from 'commander';
import chalk from 'chalk';
import { requireInitialized } from '../db/index.js';
import { getTask, getSubtasks } from '../models/task.js';
import { renderTaskDetail } from '../display/detail.js';
import { renderCompactList } from '../display/table.js';
import { jsonOut, isJsonMode, exitError } from './shared.js';

export const showCommand = new Command('show')
  .alias('s')
  .description('Show full detail of a task')
  .argument('<taskId>', 'Task ID (e.g. TASK-001)')
  .option('--json', 'Output as JSON')
  .action((taskId: string, opts: { json?: boolean }) => {
    requireInitialized();
    const json = isJsonMode(opts.json);

    const task = getTask(taskId.toUpperCase());
    if (!task) {
      exitError(`Task not found: ${taskId}`, json);
    }

    if (json) return jsonOut(true, task);

    console.log(renderTaskDetail(task));

    const subtasks = getSubtasks(task.id);
    if (subtasks.length > 0) {
      console.log(chalk.bold.dim('  Subtasks'));
      console.log(chalk.dim('  ' + '─'.repeat(50)));
      console.log(renderCompactList(subtasks));
      console.log('');
    }
  });
