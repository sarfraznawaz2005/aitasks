import { Command } from 'commander';
import chalk from 'chalk';
import { requireInitialized } from '../db/index.js';
import { unclaimTask } from '../models/task.js';
import { requireAgentId, jsonOut, isJsonMode, exitError } from './shared.js';

export const unclaimCommand = new Command('unclaim')
  .description('Release a task back to the pool')
  .argument('<taskId>', 'Task ID')
  .option('-r, --reason <text>', 'Why you are releasing this task')
  .option('--agent <agentId>', 'Agent ID (or set AITASKS_AGENT_ID)')
  .option('--json', 'Output as JSON')
  .action((taskId: string, opts: { reason?: string; agent?: string; json?: boolean }) => {
    requireInitialized();
    const json = isJsonMode(opts.json);
    const agent = requireAgentId(opts.agent, 'unclaim');

    const { task, error } = unclaimTask(taskId.toUpperCase(), agent, opts.reason);

    if (error || !task) exitError(error ?? 'Unknown error', json);

    if (json) return jsonOut(true, task);

    console.log('');
    console.log(chalk.yellow('  ○') + `  Released ${chalk.bold(task.id)}, now ${task.status}`);
    if (opts.reason) {
      console.log(chalk.dim(`     Reason: ${opts.reason}`));
    }
    console.log('');
  });
