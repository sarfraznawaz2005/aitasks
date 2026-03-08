import { Command } from 'commander';
import chalk from 'chalk';
import { requireInitialized } from '../db/index.js';
import { claimTask } from '../models/task.js';
import { jsonOut, requireAgentId, isJsonMode, exitError } from './shared.js';

export const claimCommand = new Command('claim')
  .description('Claim a task to work on it')
  .argument('<taskId>', 'Task ID')
  .option('--agent <agentId>', 'Agent ID (or set AITASKS_AGENT_ID)')
  .option('--json', 'Output as JSON')
  .action((taskId: string, opts: { agent?: string; json?: boolean }) => {
    requireInitialized();
    const json = isJsonMode(opts.json);
    const agent = requireAgentId(opts.agent, 'claim');

    const { task, error } = claimTask(taskId.toUpperCase(), agent);

    if (error || !task) {
      exitError(error ?? 'Unknown error', json);
    }

    if (json) return jsonOut(true, task);

    console.log('');
    console.log(chalk.green('  ✓') + `  Claimed ${chalk.bold(task.id)} — ${task.title}`);
    console.log(chalk.dim(`     Agent: ${agent}`));
    console.log(chalk.dim(`     Run: aitasks start ${task.id} when you begin work`));
    console.log('');
  });
