import { Command } from 'commander';
import chalk from 'chalk';
import { requireInitialized } from '../db/index.js';
import { rejectTask } from '../models/task.js';
import { agentId, jsonOut, isJsonMode, exitError } from './shared.js';

export const rejectCommand = new Command('reject')
  .description('Reject a task under review, sending it back to in_progress')
  .argument('<taskId>', 'Task ID')
  .option('-r, --reason <text>', 'Reason for rejection')
  .option('--agent <agentId>', 'Reviewer agent/human ID')
  .option('--json', 'Output as JSON')
  .action((taskId: string, opts: { reason?: string; agent?: string; json?: boolean }) => {
    requireInitialized();
    const json = isJsonMode(opts.json);

    if (!opts.reason) {
      exitError('--reason is required. Explain what needs to change.', json);
    }

    const reviewer = agentId(opts.agent) ?? 'human';
    const { task, error } = rejectTask(taskId.toUpperCase(), opts.reason, reviewer);

    if (error || !task) exitError(error ?? 'Unknown error', json);

    if (json) return jsonOut(true, task);

    console.log('');
    console.log(chalk.red('  ✗') + `  ${chalk.bold(task.id)} rejected, back to in_progress`);
    console.log(chalk.dim(`     Reason: ${opts.reason}`));
    console.log(chalk.dim(`     Rejection note added to task history`));
    console.log('');
  });
