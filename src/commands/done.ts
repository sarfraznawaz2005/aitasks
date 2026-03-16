import { Command } from 'commander';
import chalk from 'chalk';
import { requireInitialized } from '../db/index.js';
import { completeTask, listTasks } from '../models/task.js';
import { jsonOut, isJsonMode, exitError } from './shared.js';
import { resolveTaskIds, isPattern } from '../utils/pattern.js';

export const doneCommand = new Command('done')
  .description('Mark task(s) as complete (all acceptance criteria must be verified) - supports patterns')
  .argument('<taskId...>', 'Task ID(s) - can specify multiple or use patterns (e.g., TASK-00*)')
  .option('--agent <agentId>', 'Agent ID (or set AITASKS_AGENT_ID)')
  .option('--json', 'Output as JSON')
  .action((taskIds: string[], opts: { agent?: string; json?: boolean }) => {
    requireInitialized();
    const json = isJsonMode(opts.json);
    const agent = opts.agent ?? process.env.AITASKS_AGENT_ID;

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

    const results: { id: string; success: boolean; error?: string }[] = [];
    let allSuccess = true;

    for (const taskId of resolvedIds) {
      const { task, error, unchecked } = completeTask(taskId, agent);

      if (error || !task) {
        allSuccess = false;
        results.push({ id: taskId, success: false, error });

        if (!json) {
          console.error('');
          console.error(chalk.red(`  ✗  Cannot complete ${taskId}: ${error}`));

          if (unchecked && unchecked.length > 0) {
            console.error(chalk.dim('\n  Unverified criteria:'));
            for (const c of unchecked) {
              console.error(chalk.red(`    ○ ${c}`));
            }
          }
        }
        continue;
      }

      results.push({ id: taskId, success: true });

      if (!json) {
        console.log('');
        console.log(chalk.green('  ✓✓') + chalk.bold(`  ${task.id} is DONE`));
        console.log(chalk.dim(`     ${task.title}`));
        if (task.blocks.length > 0) {
          console.log(chalk.green(`  Automatically unblocked: ${task.blocks.join(', ')}`));
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
