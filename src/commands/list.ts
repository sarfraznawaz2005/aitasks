import { Command } from 'commander';
import { requireInitialized } from '../db/index.js';
import { listTasks, getStats } from '../models/task.js';
import type { TaskStatus, TaskPriority, TaskType } from '../types.js';
import { renderTaskTable } from '../display/table.js';
import { jsonOut, isJsonMode } from './shared.js';
import chalk from 'chalk';

export const listCommand = new Command('list')
  .alias('ls')
  .description('List tasks')
  .option('-s, --status <status>', 'Filter by status (comma-separated)')
  .option('-p, --priority <priority>', 'Filter by priority')
  .option('--type <type>', 'Filter by type')
  .option('--agent <agentId>', 'Filter by assigned agent (use "unassigned" for unassigned)')
  .option('--parent <taskId>', 'Filter by parent task')
  .option('--stats', 'Show summary statistics')
  .option('--json', 'Output as JSON')
  .action((opts: {
    status?: string;
    priority?: string;
    type?: string;
    agent?: string;
    parent?: string;
    stats?: boolean;
    json?: boolean;
  }) => {
    requireInitialized();
    const json = isJsonMode(opts.json);

    if (opts.stats) {
      const stats = getStats();
      if (json) return jsonOut(true, stats);
      printStats(stats);
      return;
    }

    const statuses = opts.status
      ? (opts.status.split(',').map((s) => s.trim()) as TaskStatus[])
      : undefined;

    const tasks = listTasks({
      status: statuses,
      priority: opts.priority as TaskPriority | undefined,
      type: opts.type as TaskType | undefined,
      assigned_to: opts.agent,
      parent_id: opts.parent,
    });

    if (json) return jsonOut(true, tasks);

    console.log('');
    console.log(renderTaskTable(tasks));

    const visible = tasks.length;
    const total = listTasks({}).length;
    if (opts.status || opts.priority || opts.type || opts.agent) {
      console.log(chalk.white(`  Showing ${visible} of ${total} tasks`));
    } else {
      console.log(chalk.white(`  ${total} task${total !== 1 ? 's' : ''} total`));
    }
    console.log('');
  });

function printStats(stats: ReturnType<typeof getStats>): void {
  console.log('');
  console.log(chalk.bold('  Project Statistics'));
  console.log(chalk.dim('  ' + '─'.repeat(40)));

  console.log(`\n  ${chalk.bold('By Status')}`);
  for (const [status, count] of Object.entries(stats.by_status)) {
    console.log(`    ${status.padEnd(14)} ${chalk.white(String(count))}`);
  }

  console.log(`\n  ${chalk.bold('By Priority')}`);
  for (const [priority, count] of Object.entries(stats.by_priority)) {
    console.log(`    ${priority.padEnd(14)} ${chalk.white(String(count))}`);
  }

  console.log(`\n  ${chalk.bold('By Type')}`);
  for (const [type, count] of Object.entries(stats.by_type)) {
    console.log(`    ${type.padEnd(14)} ${chalk.white(String(count))}`);
  }

  console.log('');
  console.log(`  ${chalk.bold('Total:')} ${chalk.white(String(stats.total))}`);
  console.log('');
}
