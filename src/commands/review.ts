import { Command } from 'commander';
import chalk from 'chalk';
import { requireInitialized } from '../db/index.js';
import { reviewTask } from '../models/task.js';
import { requireAgentId, jsonOut, isJsonMode, exitError } from './shared.js';

export const reviewCommand = new Command('review')
  .description('Request human review for a task')
  .argument('<taskId>', 'Task ID')
  .option('--agent <agentId>', 'Agent ID (or set AITASKS_AGENT_ID)')
  .option('--json', 'Output as JSON')
  .action((taskId: string, opts: { agent?: string; json?: boolean }) => {
    requireInitialized();
    const json = isJsonMode(opts.json);
    const agent = requireAgentId(opts.agent, 'review');

    const { task, error } = reviewTask(taskId.toUpperCase(), agent);

    if (error || !task) exitError(error ?? 'Unknown error', json);

    if (json) return jsonOut(true, task);

    console.log('');
    console.log(chalk.magenta('  ◈') + `  ${chalk.bold(task.id)} submitted for review`);
    console.log(chalk.dim(`     A human can approve with: aitasks done ${task.id}`));
    console.log(chalk.dim(`     Or reject with: aitasks reject ${task.id} --reason "<reason>"`));
    console.log('');
  });
