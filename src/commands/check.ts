import { Command } from 'commander';
import chalk from 'chalk';
import { requireInitialized } from '../db/index.js';
import { getTask, checkCriterion } from '../models/task.js';
import { jsonOut, requireAgentId, isJsonMode, exitError } from './shared.js';

export const checkCommand = new Command('check')
  .description('Verify an acceptance criterion with evidence')
  .argument('<taskId>', 'Task ID')
  .argument('<index>', 'Criterion index (0-based, e.g. 0, 1, 2)')
  .option('-e, --evidence <text>', 'Concrete proof this criterion is satisfied')
  .option('--agent <agentId>', 'Agent ID (or set AITASKS_AGENT_ID)')
  .option('--json', 'Output as JSON')
  .action((taskId: string, indexStr: string, opts: {
    evidence?: string;
    agent?: string;
    json?: boolean;
  }) => {
    requireInitialized();
    const json = isJsonMode(opts.json);
    const agent = requireAgentId(opts.agent, 'check');

    if (!opts.evidence) {
      exitError('--evidence is required. Provide concrete proof this criterion is satisfied.', json);
    }

    // Commander treats negative numbers like -1 as flags, so they never reach here.
    // Users should use: aitasks check TASK-001 0 (always non-negative)
    const index = parseInt(indexStr, 10);
    if (isNaN(index) || index < 0) {
      exitError(`Invalid index "${indexStr}". Use a non-negative integer: 0, 1, 2, …`, json);
    }

    const { task, error } = checkCriterion(taskId.toUpperCase(), index, opts.evidence, agent);

    if (error || !task) {
      exitError(error ?? 'Unknown error', json);
    }

    if (json) return jsonOut(true, task);

    const criterion = task.acceptance_criteria[index]!;
    const checked = task.test_results.length;
    const total = task.acceptance_criteria.length;

    console.log('');
    console.log(chalk.green('  ✓') + `  Criterion ${index} verified on ${chalk.bold(task.id)}`);
    console.log(chalk.dim(`     Criterion: ${criterion}`));
    console.log(chalk.dim(`     Evidence:  ${opts.evidence}`));
    console.log('');

    if (checked === total) {
      console.log(chalk.green(`  All ${total} criteria verified! Run: aitasks done ${task.id}`));
    } else {
      console.log(chalk.dim(`  ${checked}/${total} criteria verified`));
    }
    console.log('');
  });
