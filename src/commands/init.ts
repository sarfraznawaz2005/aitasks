import { Command } from 'commander';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { findProjectRoot } from '../utils/project-root.js';
import { createFreshDb } from '../db/index.js';
import { injectOrCreateAgentFile } from '../utils/agent-file.js';

export const initCommand = new Command('init')
  .description('Initialize AITasks in the current project')
  .option('--skip-agent-file', 'Skip injecting agent instructions into CLAUDE.md/AGENTS.md/GEMINI.md')
  .action(async (opts: { skipAgentFile?: boolean }) => {
    const root = findProjectRoot();
    const taskieDir = join(root, '.aitasks');

    if (existsSync(join(taskieDir, 'db.sqlite'))) {
      console.log(chalk.yellow('  AITasks is already initialized in this project.'));
      console.log(chalk.dim(`  DB: ${join(taskieDir, 'db.sqlite')}`));

      if (!opts.skipAgentFile) {
        const result = injectOrCreateAgentFile(root, getVersion());
        printAgentFileResult(result);
      }
      return;
    }

    // Create .aitasks directory
    mkdirSync(taskieDir, { recursive: true });

    // Create DB with schema
    createFreshDb(taskieDir);

    console.log('');
    console.log(chalk.green('  ✓') + chalk.bold('  AITasks initialized'));
    console.log(chalk.dim(`     Project root : ${root}`));
    console.log(chalk.dim(`     Database      : ${join(taskieDir, 'db.sqlite')}`));
    console.log('');

    if (!opts.skipAgentFile) {
      const result = injectOrCreateAgentFile(root, getVersion());
      printAgentFileResult(result);
    }

    console.log(chalk.dim('  Run `aitasks create` to add your first task.'));
    console.log('');
  });

function printAgentFileResult(result: { filePath: string; action: string }) {
  const rel = result.filePath.replace(process.cwd() + '/', '');
  switch (result.action) {
    case 'created':
      console.log(chalk.green('  ✓') + `  Created ${chalk.bold(rel)} with agent instructions`);
      break;
    case 'appended':
      console.log(chalk.green('  ✓') + `  Appended agent instructions to ${chalk.bold(rel)}`);
      break;
    case 'skipped':
      console.log(chalk.dim(`  ─  ${rel} already contains AITasks instructions`));
      break;
  }
  console.log('');
}

function getVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../../package.json') as { version: string };
    return pkg.version;
  } catch {
    return '1.0.0';
  }
}
