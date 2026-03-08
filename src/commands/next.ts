import { Command } from 'commander';
import chalk from 'chalk';
import { requireInitialized } from '../db/index.js';
import { getNextTask } from '../models/task.js';
import { renderTaskDetail } from '../display/detail.js';
import { agentId, jsonOut, isJsonMode } from './shared.js';

export const nextCommand = new Command('next')
  .description('Show the next best task to work on')
  .option('--agent <agentId>', 'Agent ID — prioritises tasks already assigned to this agent')
  .option('--claim', 'Auto-claim the task after finding it')
  .option('--json', 'Output as JSON')
  .action((opts: { agent?: string; claim?: boolean; json?: boolean }) => {
    requireInitialized();
    const json = isJsonMode(opts.json);
    const aid = agentId(opts.agent) ?? undefined;

    const task = getNextTask(aid);

    if (!task) {
      if (json) return jsonOut(true, null);
      console.log('');
      console.log(chalk.dim('  No ready tasks available. Check backlog with: aitasks list'));
      console.log('');
      return;
    }

    if (json) return jsonOut(true, task);

    console.log(renderTaskDetail(task));
    console.log(chalk.dim(`  Claim it: aitasks claim ${task.id} --agent <your-id>`));
    console.log('');
  });
