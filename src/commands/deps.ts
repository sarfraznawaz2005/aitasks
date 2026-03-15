import { Command } from 'commander';
import chalk from 'chalk';
import { requireInitialized } from '../db/index.js';
import { getTask, listTasks } from '../models/task.js';
import { jsonOut, isJsonMode } from './shared.js';

export const depsCommand = new Command('deps')
  .description('Show dependency tree for a task (what blocks what)')
  .argument('<taskId>', 'Task ID')
  .option('--json', 'Output as JSON')
  .action((taskId: string, opts: { json?: boolean }) => {
    requireInitialized();
    const json = isJsonMode(opts.json);
    const task = getTask(taskId.toUpperCase());

    if (!task) {
      if (json) return jsonOut(false, undefined, `Task not found: ${taskId.toUpperCase()}`);
      console.error(chalk.red(`  Task not found: ${taskId.toUpperCase()}`));
      process.exit(1);
    }

    // Build dependency tree
    const allTasks = listTasks();
    const taskMap = new Map(allTasks.map(t => [t.id, t]));

    // Find upstream (what this task is blocked by)
    const upstream = collectDependencies(task, taskMap, 'blocked_by');

    // Find downstream (what this task blocks)
    const downstream = collectDependencies(task, taskMap, 'blocks');

    if (json) {
      return jsonOut(true, {
        task: task.id,
        title: task.title,
        upstream: upstream.map(t => t.id),
        downstream: downstream.map(t => t.id),
      });
    }

    console.log('');
    console.log(chalk.bold.white(`${task.id}: ${task.title}`));
    console.log(chalk.dim('─'.repeat(50)));

    // Upstream section
    console.log('');
    console.log(chalk.yellow.bold('  Blocked By (Upstream Dependencies)'));
    if (upstream.length === 0) {
      console.log(chalk.dim('    (none)'));
    } else {
      printDependencyTree(upstream, taskMap, 1);
    }

    // Downstream section
    console.log('');
    console.log(chalk.cyan.bold('  Blocks (Downstream Dependencies)'));
    if (downstream.length === 0) {
      console.log(chalk.dim('    (none)'));
    } else {
      printDependencyTree(downstream, taskMap, 1);
    }

    console.log('');
  });

function collectDependencies(
  task: import('../types.js').Task,
  taskMap: Map<string, import('../types.js').Task>,
  direction: 'blocked_by' | 'blocks'
): import('../types.js').Task[] {
  const result: import('../types.js').Task[] = [];
  const visited = new Set<string>();
  const queue = direction === 'blocked_by' ? task.blocked_by : task.blocks;

  for (const id of queue) {
    if (visited.has(id)) continue;
    visited.add(id);
    const dep = taskMap.get(id);
    if (dep) {
      result.push(dep);
    }
  }

  return result;
}

function printDependencyTree(
  tasks: import('../types.js').Task[],
  taskMap: Map<string, import('../types.js').Task>,
  indent: number
): void {
  const prefix = '  '.repeat(indent);

  for (const task of tasks) {
    const statusIcon = getStatusIcon(task.status);
    console.log(`${prefix}${statusIcon} ${chalk.bold(task.id)}: ${task.title}`);
    console.log(`${prefix}  ${chalk.dim(`[${task.status}]`)}`);
  }
}

function getStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    backlog: '○',
    ready: '◐',
    in_progress: '▶',
    blocked: '⊘',
    review: '◈',
    done: '✓',
  };
  return icons[status] || '○';
}
