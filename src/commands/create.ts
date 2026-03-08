import { Command } from 'commander';
import * as p from '@clack/prompts';
import chalk from 'chalk';
import { requireInitialized } from '../db/index.js';
import { createTask } from '../models/task.js';
import { getTask } from '../models/task.js';
import type { TaskPriority, TaskType } from '../types.js';
import { renderTaskDetail } from '../display/detail.js';
import { jsonOut, isJsonMode } from './shared.js';

export const createCommand = new Command('create')
  .description('Create a new task')
  .option('-t, --title <title>', 'Task title')
  .option('-d, --desc <description>', 'Task description')
  .option('-a, --ac <criterion>', 'Acceptance criterion (repeatable)', collect, [])
  .option('-p, --priority <priority>', 'Priority: critical|high|medium|low', 'medium')
  .option('--type <type>', 'Type: feature|bug|chore|spike', 'feature')
  .option('--parent <taskId>', 'Parent task ID for subtasks')
  .option('--json', 'Output as JSON')
  .action(async (opts: {
    title?: string;
    desc?: string;
    ac: string[];
    priority: string;
    type: string;
    parent?: string;
    json?: boolean;
  }) => {
    requireInitialized();
    const json = isJsonMode(opts.json);

    // If all required fields are provided, skip interactive mode
    if (opts.title) {
      if (opts.parent) {
        const parent = getTask(opts.parent);
        if (!parent) {
          if (json) return jsonOut(false, undefined, `Parent task not found: ${opts.parent}`);
          console.error(chalk.red(`  Parent task not found: ${opts.parent}`));
          process.exit(1);
        }
      }

      const task = createTask({
        title: opts.title,
        description: opts.desc ?? '',
        acceptance_criteria: opts.ac,
        priority: opts.priority as TaskPriority,
        type: opts.type as TaskType,
        parent_id: opts.parent,
      });

      if (json) return jsonOut(true, task);

      console.log('');
      console.log(chalk.green('  ✓') + `  Created ${chalk.bold(task.id)}: ${task.title}`);
      console.log(chalk.dim(`     Priority: ${task.priority}  ·  Type: ${task.type}`));
      if (task.acceptance_criteria.length > 0) {
        console.log(chalk.dim(`     ${task.acceptance_criteria.length} acceptance criterion/criteria`));
      }
      console.log('');
      return;
    }

    // Interactive mode
    p.intro(chalk.bold.cyan('  Create a new task'));

    const answers = await p.group(
      {
        title: () =>
          p.text({
            message: 'Task title',
            placeholder: 'Implement user authentication',
            validate: (v) => (!v.trim() ? 'Title is required' : undefined),
          }),

        description: () =>
          p.text({
            message: 'Description (optional)',
            placeholder: 'What needs to be done and why',
          }),

        priority: () =>
          p.select({
            message: 'Priority',
            initialValue: 'medium',
            options: [
              { value: 'critical', label: chalk.red.bold('critical') + '  — must ship now' },
              { value: 'high',     label: chalk.red('high') + '      — important, do soon' },
              { value: 'medium',   label: chalk.yellow('medium') + '    — normal priority' },
              { value: 'low',      label: chalk.gray('low') + '       — nice to have' },
            ],
          }),

        type: () =>
          p.select({
            message: 'Task type',
            initialValue: 'feature',
            options: [
              { value: 'feature', label: 'feature  — new functionality' },
              { value: 'bug',     label: 'bug      — something is broken' },
              { value: 'chore',   label: 'chore    — maintenance/tooling' },
              { value: 'spike',   label: 'spike    — research/investigation' },
            ],
          }),

        criteria: () =>
          p.text({
            message: 'Acceptance criteria (one per line, empty to skip)',
            placeholder: 'API returns 404 for unknown user\nUnit tests pass',
          }),

        parent: () =>
          p.text({
            message: 'Parent task ID (optional, for subtasks)',
            placeholder: 'TASK-001',
          }),
      },
      {
        onCancel: () => {
          p.cancel('Cancelled.');
          process.exit(0);
        },
      }
    );

    const criteria = answers.criteria
      ? answers.criteria
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    if (answers.parent) {
      const parent = getTask(answers.parent);
      if (!parent) {
        p.cancel(`Parent task not found: ${answers.parent}`);
        process.exit(1);
      }
    }

    const task = createTask({
      title: answers.title,
      description: answers.description ?? '',
      acceptance_criteria: criteria,
      priority: answers.priority as TaskPriority,
      type: answers.type as TaskType,
      parent_id: answers.parent || undefined,
    });

    p.outro(chalk.green(`Created ${chalk.bold(task.id)}: ${task.title}`));
  });

function collect(val: string, acc: string[]): string[] {
  acc.push(val);
  return acc;
}
