import { Command } from 'commander';
import chalk from 'chalk';
import { requireInitialized } from '../db/index.js';
import { completeTask } from '../models/task.js';
import { jsonOut, requireAgentId, isJsonMode, exitError } from './shared.js';

export const doneCommand = new Command('done')
  .description('Mark a task as complete (all acceptance criteria must be verified)')
  .argument('<taskId>', 'Task ID')
  .option('--agent <agentId>', 'Agent ID (or set AITASKS_AGENT_ID)')
  .option('--json', 'Output as JSON')
  .action((taskId: string, opts: { agent?: string; json?: boolean }) => {
    requireInitialized();
    const json = isJsonMode(opts.json);
    const agent = requireAgentId(opts.agent, 'done');

    const { task, error, unchecked } = completeTask(taskId.toUpperCase(), agent);

    if (error || !task) {
      if (json) return jsonOut(false, undefined, error);

      console.error('');
      console.error(chalk.red(`  ✗  Cannot complete ${taskId.toUpperCase()}: ${error}`));

      if (unchecked && unchecked.length > 0) {
        console.error(chalk.dim('\n  Unverified criteria:'));
        for (const c of unchecked) {
          console.error(chalk.red(`    ○ ${c}`));
        }
        console.error('');
        console.error(chalk.dim(`  Use: aitasks check ${taskId.toUpperCase()} <index> --evidence "<proof>"`));
      }
      console.error('');
      process.exit(1);
    }

    if (json) return jsonOut(true, task);

    console.log('');
    console.log(chalk.green('  ✓✓') + chalk.bold(`  ${task.id} is DONE`));
    console.log(chalk.dim(`     ${task.title}`));
    if (task.blocks.length > 0) {
      console.log(chalk.green(`\n  Automatically unblocked: ${task.blocks.join(', ')}`));
    }
    console.log('');
  });
