import { Command } from 'commander';
import chalk from 'chalk';
import { requireInitialized } from '../db/index.js';
import { unblockTask } from '../models/task.js';
import { agentId, jsonOut, isJsonMode, exitError } from './shared.js';

export const unblockCommand = new Command('unblock')
  .description('Manually remove a blocker from a task')
  .argument('<taskId>', 'Task ID to unblock')
  .option('--from <taskId>', 'The task that was blocking it')
  .option('--agent <agentId>', 'Agent ID (or set AITASKS_AGENT_ID)')
  .option('--json', 'Output as JSON')
  .action((taskId: string, opts: { from?: string; agent?: string; json?: boolean }) => {
    requireInitialized();
    const json = isJsonMode(opts.json);

    if (!opts.from) {
      exitError('--from <taskId> is required. Specify which blocker to remove.', json);
    }

    const agent = agentId(opts.agent) ?? undefined;
    const { task, error } = unblockTask(taskId.toUpperCase(), opts.from.toUpperCase(), agent);

    if (error || !task) exitError(error ?? 'Unknown error', json);

    if (json) return jsonOut(true, task);

    console.log('');
    const newStatus = task.blocked_by.length === 0 ? chalk.green('ready') : chalk.yellow('still blocked');
    console.log(chalk.green('  ✓') + `  Removed blocker ${chalk.bold(opts.from.toUpperCase())} from ${chalk.bold(task.id)}`);
    console.log(chalk.dim(`     Task is now: ${newStatus}`));
    console.log('');
  });
