import { Command } from 'commander';
import { requireInitialized } from '../db/index.js';
import { listTasks } from '../models/task.js';
import { renderBoard, startTreeBoard } from '../display/board.js';
import { jsonOut, isJsonMode } from './shared.js';

export const boardCommand = new Command('board')
  .description('Show a kanban-style board view')
  .option('--all', 'Static view of all statuses (backlog through done)')
  .option('--json', 'Output tasks grouped by status as JSON')
  .action(async (opts: { all?: boolean; json?: boolean }) => {
    requireInitialized();
    const json = isJsonMode(opts.json);

    if (json) {
      const tasks = listTasks();
      const grouped: Record<string, typeof tasks> = {};
      for (const t of tasks) {
        if (!grouped[t.status]) grouped[t.status] = [];
        grouped[t.status]!.push(t);
      }
      return jsonOut(true, grouped);
    }

    if (opts.all) {
      console.log(renderBoard(listTasks()));
      return;
    }

    // Live two-pane tree board — polls DB every 1.5s, press q to exit
    await startTreeBoard(() => listTasks());
  });
