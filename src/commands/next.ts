import { Command } from 'commander';
import chalk from 'chalk';
import { requireInitialized, getReviewRequired } from '../db/index.js';
import { getNextTask, claimTask, startTask } from '../models/task.js';
import { renderTaskDetail } from '../display/detail.js';
import { agentId, jsonOut, isJsonMode, requireAgentId } from './shared.js';

export const nextCommand = new Command('next')
  .description('Show the next best task to work on')
  .option('--agent <agentId>', 'Agent ID — prioritises tasks already assigned to this agent')
  .option('--claim', 'Auto-claim and start the task after finding it')
  .option('--json', 'Output as JSON')
  .action(async (opts: { agent?: string; claim?: boolean; json?: boolean }) => {
    requireInitialized();
    const json = isJsonMode(opts.json);

    if (opts.claim && !opts.agent) {
      if (json) return jsonOut(false, undefined, '--claim requires --agent or AITASKS_AGENT_ID to be set');
      console.error(chalk.red('  --claim requires --agent or AITASKS_AGENT_ID to be set'));
      process.exit(1);
    }

    const aid = opts.claim ? requireAgentId(opts.agent, 'next --claim') : (agentId(opts.agent) ?? undefined);

    const task = getNextTask(aid);
    const reviewRequired = getReviewRequired();

    if (!task) {
      if (json) return jsonOut(true, { task: null, review_required: reviewRequired });
      console.log('');
      console.log(chalk.dim('  No ready tasks available. Check backlog with: aitasks list'));
      console.log('');
      return;
    }

    if (opts.claim && aid) {
      // Auto-claim the task
      const claimResult = claimTask(task.id, aid);
      if (claimResult.error) {
        if (json) return jsonOut(false, undefined, claimResult.error);
        console.error(chalk.red(`  ${claimResult.error}`));
        process.exit(1);
      }

      // Auto-start the task
      const startResult = startTask(task.id, aid);
      if (startResult.error) {
        if (json) return jsonOut(false, undefined, startResult.error);
        console.error(chalk.red(`  ${startResult.error}`));
        process.exit(1);
      }

      const updatedTask = startResult.task!;

      if (json) return jsonOut(true, { ...updatedTask, review_required: reviewRequired });

      console.log('');
      console.log(chalk.green('  ✓') + `  Claimed and started ${chalk.bold(updatedTask.id)}: ${updatedTask.title}`);
      console.log(chalk.dim(`     Priority: ${updatedTask.priority}  ·  Type: ${updatedTask.type}`));
      console.log(chalk.dim(`     Agent: ${aid}`));
      if (reviewRequired) {
        console.log('');
        console.log(chalk.yellow('  ⚠ ') + chalk.bold(' Review enforcement is ON.') + chalk.dim(' When done: aitasks review → spawn review sub-agent → aitasks done'));
      }
      console.log('');
      return;
    }

    if (json) return jsonOut(true, { ...task, review_required: reviewRequired });

    console.log(renderTaskDetail(task));
    if (reviewRequired) {
      console.log(chalk.yellow('  ⚠ ') + chalk.bold(' Review enforcement is ON.') + chalk.dim(' When done: aitasks review → spawn review sub-agent → aitasks done'));
    }
    console.log(chalk.dim(`  Claim it: aitasks claim ${task.id} --agent <your-id>`));
    console.log('');
  });
