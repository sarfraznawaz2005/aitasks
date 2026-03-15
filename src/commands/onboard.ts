import { Command } from 'commander';
import chalk from 'chalk';
import { getAgentInstructions } from '../utils/instructions.js';
import { appendToSpecificFile, injectOrCreateAgentFile } from '../utils/agent-file.js';
import { findProjectRoot } from '../utils/project-root.js';
import { isInitialized, getReviewRequired } from '../db/index.js';

const VERSION = '1.0.0';

export const onboardCommand = new Command('onboard')
  .description('Print or inject agent protocol instructions')
  .option('--append', 'Auto-detect and append to CLAUDE.md/AGENTS.md/GEMINI.md')
  .option('--file <path>', 'Append to a specific file')
  .option('--json', 'Output the instructions as a JSON string')
  .action((opts: { append?: boolean; file?: string; json?: boolean }) => {
    const reviewRequired = isInitialized() ? getReviewRequired() : false;
    const instructions = getAgentInstructions(VERSION, { reviewRequired });

    if (opts.json) {
      console.log(JSON.stringify({ instructions }, null, 2));
      return;
    }

    if (opts.file) {
      const result = appendToSpecificFile(opts.file, VERSION, reviewRequired);
      const rel = opts.file.replace(process.cwd() + '/', '');
      switch (result.action) {
        case 'created':
          console.log(chalk.green(`  ✓  Created ${chalk.bold(rel)} with agent instructions`));
          break;
        case 'appended':
          console.log(chalk.green(`  ✓  Appended agent instructions to ${chalk.bold(rel)}`));
          break;
        case 'skipped':
          console.log(chalk.dim(`  ─  ${rel} already contains AITasks instructions`));
          break;
      }
      return;
    }

    if (opts.append) {
      const root = findProjectRoot();
      const result = injectOrCreateAgentFile(root, VERSION, reviewRequired);
      const rel = result.filePath.replace(process.cwd() + '/', '');
      switch (result.action) {
        case 'created':
          console.log(chalk.green(`  ✓  Created ${chalk.bold(rel)} with agent instructions`));
          break;
        case 'appended':
          console.log(chalk.green(`  ✓  Appended agent instructions to ${chalk.bold(rel)}`));
          break;
        case 'skipped':
          console.log(chalk.dim(`  ─  ${rel} already contains AITasks instructions`));
          break;
      }
      return;
    }

    // Default: print to stdout
    console.log(instructions);
  });
