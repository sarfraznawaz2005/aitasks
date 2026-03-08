import { Command } from 'commander';
import chalk from 'chalk';
import { requireInitialized } from '../db/index.js';
import { getTask, addImplementationNote } from '../models/task.js';
import { jsonOut, requireAgentId, isJsonMode, exitError } from './shared.js';

export const noteCommand = new Command('note')
  .description('Add an implementation note to a task')
  .argument('<taskId>', 'Task ID')
  .argument('<note>', 'The note text')
  .option('--agent <agentId>', 'Agent ID (or set AITASKS_AGENT_ID)')
  .option('--json', 'Output as JSON')
  .action((taskId: string, note: string, opts: { agent?: string; json?: boolean }) => {
    requireInitialized();
    const json = isJsonMode(opts.json);
    const agent = requireAgentId(opts.agent, 'note');

    const task = getTask(taskId.toUpperCase());
    if (!task) exitError(`Task not found: ${taskId}`, json);

    const updated = addImplementationNote(taskId.toUpperCase(), note, agent);

    if (json) return jsonOut(true, updated);

    console.log('');
    console.log(chalk.green('  ✓') + `  Note added to ${chalk.bold(taskId.toUpperCase())}`);
    console.log(chalk.dim(`     ${note}`));
    console.log('');
  });
