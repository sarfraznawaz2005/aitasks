import { Command } from 'commander';
import chalk from 'chalk';
import { requireInitialized, getReviewRequired } from '../db/index.js';
import { reviewTask, listTasks } from '../models/task.js';
import { requireAgentId, jsonOut, isJsonMode, exitError } from './shared.js';
import { resolveTaskIds, isPattern } from '../utils/pattern.js';

export const reviewCommand = new Command('review')
  .description('Request human review for task(s) - supports patterns')
  .argument('<taskId...>', 'Task ID(s) - can specify multiple or use patterns (e.g., TASK-00*)')
  .option('--agent <agentId>', 'Agent ID (or set AITASKS_AGENT_ID)')
  .option('--json', 'Output as JSON')
  .action((taskIds: string[], opts: { agent?: string; json?: boolean }) => {
    requireInitialized();
    const json = isJsonMode(opts.json);
    const agent = requireAgentId(opts.agent, 'review');

    // Get all existing task IDs for pattern expansion
    const allTaskIds = listTasks().map(t => t.id);

    // Resolve patterns to actual task IDs
    const resolvedIds = resolveTaskIds(taskIds.map(id => id.toUpperCase()), allTaskIds);

    if (resolvedIds.length === 0) {
      const patternUsed = taskIds.some(id => isPattern(id));
      if (json) {
        return jsonOut(false, undefined, patternUsed ? 'No tasks match the specified pattern(s)' : 'No valid task IDs provided');
      }
      console.error('');
      console.error(chalk.red(patternUsed ? '  ✗  No tasks match the specified pattern(s)' : '  ✗  No valid task IDs provided'));
      console.error('');
      process.exit(1);
    }

    const reviewRequired = getReviewRequired();
    const results: { id: string; success: boolean; error?: string; status?: string; next_action?: string; review_commands?: { approve: string; reject: string } }[] = [];
    let allSuccess = true;

    for (const taskId of resolvedIds) {
      const { task, error } = reviewTask(taskId, agent);

      if (error || !task) {
        allSuccess = false;
        results.push({ id: taskId, success: false, error });

        if (!json) {
          console.error('');
          console.error(chalk.red(`  ✗  Cannot request review for ${taskId}: ${error}`));
        }
        continue;
      }

      if (reviewRequired) {
        results.push({
          id: taskId,
          success: true,
          status: 'review',
          next_action: 'REQUIRED: Spawn a review sub-agent immediately. This task is NOT complete until the review agent approves it.',
          review_commands: {
            approve: `aitasks done ${taskId} --agent <review-agent-id>`,
            reject: `aitasks reject ${taskId} --reason "<specific feedback>" --agent <review-agent-id>`,
          },
        });
      } else {
        results.push({ id: taskId, success: true, status: 'review' });
      }

      if (!json) {
        console.log('');
        console.log(chalk.magenta('  ◈') + `  ${chalk.bold(task.id)} submitted for review`);
        if (reviewRequired) {
          console.log(chalk.yellow('  ⚠ ') + chalk.bold(' This task is NOT complete yet.'));
          console.log('');
          console.log(`  You MUST ${chalk.bold('immediately spawn a review sub-agent')} to inspect the implementation.`);
          console.log(chalk.dim('  The task remains incomplete until the review agent moves it to done.'));
          console.log('');
          console.log(chalk.dim('  Review sub-agent steps:'));
          console.log(chalk.dim(`  1. Examine implementation and verify all acceptance criteria`));
          console.log(chalk.dim(`  2. Approve:  aitasks done ${task.id} --agent <review-agent-id>`));
          console.log(chalk.dim(`     Reject:   aitasks reject ${task.id} --reason "<feedback>" --agent <review-agent-id>`));
        } else {
          console.log(chalk.dim(`     Approve: aitasks done ${task.id} --agent <review-agent-id>`));
          console.log(chalk.dim(`     Reject:  aitasks reject ${task.id} --reason "<feedback>"`));
        }
      }
    }

    if (json) {
      return jsonOut(allSuccess, { results });
    }

    console.log('');
    if (!allSuccess) {
      process.exit(1);
    }
  });
