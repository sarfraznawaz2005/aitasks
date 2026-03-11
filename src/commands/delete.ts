import { Command } from 'commander';
import chalk from 'chalk';
import { requireInitialized } from '../db/index.js';
import { deleteTask, listTasks } from '../models/task.js';
import { expandPattern } from '../utils/pattern.js';
import { jsonOut, isJsonMode, exitError } from './shared.js';

export const deleteCommand = new Command('delete')
  .description('Delete task(s) - does not require claiming first')
  .argument('<taskIds...>', 'Task ID(s) to delete - supports patterns like TASK-0*')
  .option('--agent <agentId>', 'Agent ID for tracking (or set AITASKS_AGENT_ID)')
  .option('--json', 'Output as JSON')
  .action((taskIds: string[], opts: { agent?: string; json?: boolean }) => {
    requireInitialized();
    const json = isJsonMode(opts.json);
    const agent = opts.agent || process.env.AITASKS_AGENT_ID;

    // Get all existing task IDs for pattern expansion
    const allTaskIds = listTasks().map(t => t.id);
    const resolvedIds = expandPatterns(taskIds.map(id => id.toUpperCase()), allTaskIds);

    if (resolvedIds.length === 0) {
      exitError('No tasks match the provided IDs/patterns', json);
    }

    const results: { id: string; success: boolean; error?: string }[] = [];
    let successCount = 0;

    for (const id of resolvedIds) {
      const { success, error } = deleteTask(id, agent);

      if (success) {
        successCount++;
        results.push({ id, success: true });
      } else {
        results.push({ id, success: false, error });
      }
    }

    if (json) {
      return jsonOut(successCount === resolvedIds.length, {
        deleted: results.filter(r => r.success).map(r => r.id),
        failed: results.filter(r => !r.success),
        total: resolvedIds.length,
        deletedCount: successCount,
      });
    }

    // Print results
    console.log('');
    for (const result of results) {
      if (result.success) {
        console.log(chalk.green('  ✓') + `  Deleted ${chalk.bold(result.id)}`);
      } else {
        console.log(chalk.red('  ✗') + `  Failed to delete ${chalk.bold(result.id)}: ${result.error}`);
      }
    }
    console.log('');
    console.log(chalk.dim(`  ${successCount}/${resolvedIds.length} tasks deleted`));
    console.log('');

    // Exit with error if any deletions failed
    if (successCount < resolvedIds.length) {
      process.exit(1);
    }
  });

function expandPatterns(patterns: string[], existingIds: string[]): string[] {
  const resolved = new Set<string>();

  for (const pattern of patterns) {
    if (pattern.includes('*')) {
      const matches = expandPattern(pattern, existingIds);
      matches.forEach(id => resolved.add(id));
    } else {
      // Check if exact ID exists
      if (existingIds.includes(pattern)) {
        resolved.add(pattern);
      }
    }
  }

  return Array.from(resolved);
}
