import { Command } from 'commander';
import chalk from 'chalk';
import { requireInitialized } from '../db/index.js';
import { startTask } from '../models/task.js';
import { jsonOut, requireAgentId, isJsonMode, exitError } from './shared.js';

export const startCommand = new Command('start')
  .description('Start working on a task (transitions to in_progress)')
  .argument('<taskId>', 'Task ID')
  .option('--agent <agentId>', 'Agent ID (or set AITASKS_AGENT_ID)')
  .option('--json', 'Output as JSON')
  .action((taskId: string, opts: { agent?: string; json?: boolean }) => {
    requireInitialized();
    const json = isJsonMode(opts.json);
    const agent = requireAgentId(opts.agent, 'start');

    const { task, error } = startTask(taskId.toUpperCase(), agent);

    if (error || !task) {
      exitError(error ?? 'Unknown error', json);
    }

    if (json) return jsonOut(true, task);

    console.log('');
    console.log(chalk.green('  ▶') + `  Started ${chalk.bold(task.id)} — ${task.title}`);
    if (task.acceptance_criteria.length > 0) {
      console.log(chalk.dim(`     ${task.acceptance_criteria.length} acceptance criteria to verify before done`));
    }
    console.log(chalk.dim(`     Add notes as you go: aitasks note ${task.id} "<your note>"`));
    console.log('');
  });
