import { Command } from 'commander';
import chalk from 'chalk';
import { requireInitialized } from '../db/index.js';
import { startTask, listTasks } from '../models/task.js';
import { jsonOut, requireAgentId, isJsonMode, exitError } from './shared.js';
import { resolveTaskIds, isPattern } from '../utils/pattern.js';

export const startCommand = new Command('start')
  .description('Start working on task(s) (transitions to in_progress) - supports patterns')
  .argument('<taskId...>', 'Task ID(s) - can specify multiple or use patterns (e.g., TASK-00*)')
  .option('--agent <agentId>', 'Agent ID (or set AITASKS_AGENT_ID)')
  .option('--json', 'Output as JSON')
  .action((taskIds: string[], opts: { agent?: string; json?: boolean }) => {
    requireInitialized();
    const json = isJsonMode(opts.json);
    const agent = requireAgentId(opts.agent, 'start');

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
      const { task, error } = startTask(taskId, agent);

      if (error || !task) {
        allSuccess = false;
        results.push({ id: taskId, success: false, error });

        if (!json) {
          console.error('');
          console.error(chalk.red(`  ✗  Cannot start ${taskId}: ${error}`));
        }
        continue;
      }

      results.push({ id: taskId, success: true });

      if (!json) {
        console.log('');
        console.log(chalk.green('  ▶') + `  Started ${chalk.bold(task.id)} — ${task.title}`);
        if (task.acceptance_criteria.length > 0) {
          console.log(chalk.dim(`     ${task.acceptance_criteria.length} acceptance criteria to verify before done`));
        }
        console.log(chalk.dim(`     Add notes as you go: aitasks note ${task.id} "<your note>"`));
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
