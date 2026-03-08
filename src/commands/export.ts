import { Command } from 'commander';
import { writeFileSync } from 'fs';
import chalk from 'chalk';
import { requireInitialized } from '../db/index.js';
import { listTasks, getStats } from '../models/task.js';
import { getAllEvents } from '../models/event.js';
import { exitError } from './shared.js';

export const exportCommand = new Command('export')
  .description('Export all task data')
  .option('-f, --format <format>', 'Output format: json|csv', 'json')
  .option('-o, --output <file>', 'Write to file instead of stdout')
  .option('--with-events', 'Include event log in JSON export')
  .action((opts: { format: string; output?: string; withEvents?: boolean }) => {
    requireInitialized();

    const tasks = listTasks();

    let output: string;

    if (opts.format === 'json') {
      const data: Record<string, unknown> = {
        exported_at: new Date().toISOString(),
        stats: getStats(),
        tasks,
      };
      if (opts.withEvents) {
        data['events'] = getAllEvents(10000);
      }
      output = JSON.stringify(data, null, 2);
    } else if (opts.format === 'csv') {
      const headers = [
        'id', 'title', 'status', 'priority', 'type',
        'assigned_to', 'parent_id', 'created_at', 'updated_at', 'completed_at',
      ];
      const rows = tasks.map((t) =>
        headers
          .map((h) => {
            const val = (t as unknown as Record<string, unknown>)[h];
            const str = val === null || val === undefined ? '' : String(val);
            return str.includes(',') ? `"${str.replace(/"/g, '""')}"` : str;
          })
          .join(',')
      );
      output = [headers.join(','), ...rows].join('\n');
    } else {
      exitError(`Unknown format: ${opts.format}. Use json or csv.`, false);
    }

    if (opts.output) {
      writeFileSync(opts.output, output, 'utf8');
      console.log(chalk.green(`  ✓  Exported ${tasks.length} tasks to ${opts.output}`));
    } else {
      console.log(output);
    }
  });
