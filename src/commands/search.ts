import { Command } from 'commander';
import chalk from 'chalk';
import { requireInitialized } from '../db/index.js';
import { listTasks } from '../models/task.js';
import { jsonOut, isJsonMode } from './shared.js';
import type { Task } from '../types.js';

export const searchCommand = new Command('search')
  .description('Full-text search across task titles, descriptions, and notes')
  .argument('<query...>', 'Search query (multiple words are AND-ed together)')
  .option('--status <status>', 'Filter by status')
  .option('--json', 'Output as JSON')
  .action((queryParts: string[], opts: { status?: string; json?: boolean }) => {
    requireInitialized();
    const json = isJsonMode(opts.json);

    if (queryParts.length === 0) {
      if (json) return jsonOut(false, undefined, 'Search query is required');
      console.error(chalk.red('  Search query is required'));
      console.error(chalk.dim('  Example: aitasks search "auth login"'));
      console.error('');
      process.exit(1);
    }

    const query = queryParts.join(' ').toLowerCase();
    const searchTerms = query.split(/\s+/).filter(Boolean);

    const allTasks = listTasks(opts.status ? { status: opts.status as any } : {});
    const results = allTasks.filter(task => matchesSearch(task, searchTerms));

    if (results.length === 0) {
      if (json) return jsonOut(true, { query, results: [] });
      console.log('');
      console.log(chalk.dim(`  No tasks found matching: "${chalk.white(query)}"`));
      console.log('');
      return;
    }

    if (json) {
      return jsonOut(true, { query, results, count: results.length });
    }

    console.log('');
    console.log(chalk.bold(`Search results for "${query}" (${results.length} found)`));
    console.log(chalk.dim('─'.repeat(60)));

    for (const task of results) {
      const statusIcon = getStatusIcon(task.status);
      const priColor = getPriorityColor(task.priority);

      console.log('');
      console.log(
        `${chalk.bold.white(task.id)}  ` +
        `${priColor(task.priority[0].toUpperCase())}  ` +
        `${statusIcon} ` +
        highlightMatches(task.title, searchTerms)
      );

      // Show matching context
      const context = getSearchContext(task, searchTerms);
      if (context) {
        console.log(chalk.dim(`  ${context}`));
      }
    }

    console.log('');
  });

function matchesSearch(task: Task, terms: string[]): boolean {
  const searchable = [
    task.title.toLowerCase(),
    task.description.toLowerCase(),
    ...task.implementation_notes.map(n => n.note.toLowerCase()),
    ...task.acceptance_criteria,
  ].join(' ');

  // All terms must match (AND logic)
  return terms.every(term => searchable.includes(term));
}

function getSearchContext(task: Task, terms: string[]): string | null {
  // Try to find matching context in description
  const descLower = task.description.toLowerCase();
  for (const term of terms) {
    const idx = descLower.indexOf(term);
    if (idx !== -1) {
      const start = Math.max(0, idx - 10);
      const end = Math.min(task.description.length, idx + term.length + 30);
      const prefix = start > 0 ? '...' : '';
      const suffix = end < task.description.length ? '...' : '';
      return `${prefix}${task.description.slice(start, end)}${suffix}`;
    }
  }

  // Try implementation notes
  for (const note of task.implementation_notes) {
    const noteLower = note.note.toLowerCase();
    for (const term of terms) {
      const idx = noteLower.indexOf(term);
      if (idx !== -1) {
        const start = Math.max(0, idx - 5);
        const end = Math.min(note.note.length, idx + term.length + 25);
        return `note: ...${note.note.slice(start, end)}...`;
      }
    }
  }

  return null;
}

function highlightMatches(text: string, terms: string[]): string {
  let result = text;
  for (const term of terms) {
    const regex = new RegExp(`(${escapeRegex(term)})`, 'gi');
    result = result.replace(regex, chalk.cyan('$1'));
  }
  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    backlog: chalk.gray('○'),
    ready: chalk.blue('◐'),
    in_progress: chalk.yellow('▶'),
    blocked: chalk.hex('#FF5C5C')('⊘'),
    needs_review: chalk.magenta('◈'),
    done: chalk.green('✓'),
  };
  return icons[status] || '○';
}

function getPriorityColor(priority: string): (text: string) => string {
  const colors: Record<string, (text: string) => string> = {
    critical: chalk.hex('#FF5C5C'),
    high: chalk.hex('#FF5C5C'),
    medium: chalk.yellow,
    low: chalk.gray,
  };
  return colors[priority] || chalk.white;
}
