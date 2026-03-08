import { Command } from 'commander';
import chalk from 'chalk';
import { requireInitialized } from '../db/index.js';
import { blockTask } from '../models/task.js';
import { agentId, jsonOut, isJsonMode, exitError } from './shared.js';

export const blockCommand = new Command('block')
  .description('Mark a task as blocked by other tasks')
  .argument('<taskId>', 'Task ID to mark as blocked')
  .option('--on <taskIds>', 'Comma-separated task IDs that block this task')
  .option('--agent <agentId>', 'Agent ID (or set AITASKS_AGENT_ID)')
  .option('--json', 'Output as JSON')
  .action((taskId: string, opts: { on?: string; agent?: string; json?: boolean }) => {
    requireInitialized();
    const json = isJsonMode(opts.json);

    if (!opts.on) {
      exitError('--on <taskIds> is required. Specify which tasks block this one.', json);
    }

    const blockerIds = opts.on.split(',').map((s) => s.trim().toUpperCase());
    const agent = agentId(opts.agent) ?? undefined;

    const { task, error } = blockTask(taskId.toUpperCase(), blockerIds, agent);

    if (error || !task) exitError(error ?? 'Unknown error', json);

    if (json) return jsonOut(true, task);

    console.log('');
    console.log(chalk.yellow('  ⊘') + `  ${chalk.bold(task.id)} is now blocked by: ${blockerIds.join(', ')}`);
    console.log(chalk.dim(`     Will auto-unblock when all blockers are done`));
    console.log('');
  });
