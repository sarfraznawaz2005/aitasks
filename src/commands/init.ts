import { Command } from 'commander';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { findProjectRoot } from '../utils/project-root.js';
import { createFreshDb, setReviewRequired } from '../db/index.js';
import { injectOrCreateAgentFile } from '../utils/agent-file.js';
import { getVersion } from './shared.js';

export const initCommand = new Command('init')
  .description('Initialize AITasks in the current project')
  .option('--skip-agent-file', 'Skip injecting agent instructions into CLAUDE.md/AGENTS.md/GEMINI.md')
  .option('--with-review', 'Enforce review gate: agents cannot mark tasks done without a passing review')
  .option('--update', 'Refresh the agent instructions block in an existing CLAUDE.md/AGENTS.md/GEMINI.md to the latest version')
  .addHelpText('after', `
Examples:
  $ aitasks init
      Initialize in current directory, inject agent instructions into CLAUDE.md/AGENTS.md.

  $ aitasks init --with-review
      Same as above, but enable the review enforcement gate. Agents must run
      \`aitasks review\` and spawn a review sub-agent before any task can be
      marked done. Running this on an existing project also updates the agent
      instructions file with the review workflow.

  $ aitasks init --update
      Re-inject the latest agent instructions, replacing the existing block
      between the AITasks markers in place. The rest of the file is left
      untouched. Use after upgrading aitasks to pull new protocol docs.

  $ aitasks init --skip-agent-file
      Initialize without touching any CLAUDE.md / AGENTS.md file.`)
  .action(async (opts: { skipAgentFile?: boolean; withReview?: boolean; update?: boolean }) => {
    const root = findProjectRoot();
    const taskieDir = join(root, '.aitasks');

    if (existsSync(join(taskieDir, 'db.sqlite'))) {
      console.log(chalk.yellow('  AITasks is already initialized in this project.'));
      console.log(chalk.dim(`  DB: ${join(taskieDir, 'db.sqlite')}`));

      if (opts.withReview) {
        setReviewRequired(true);
        console.log(chalk.green('  ✓') + '  Review enforcement enabled.');
      }

      if (!opts.skipAgentFile) {
        // force=true so existing instructions are replaced — either to pick up the
        // review-aware variant (--with-review) or to refresh to the latest (--update).
        const force = !!opts.withReview || !!opts.update;
        const result = injectOrCreateAgentFile(root, getVersion(), !!opts.withReview, force);
        printAgentFileResult(result);
      }
      return;
    }

    // Create .aitasks directory
    mkdirSync(taskieDir, { recursive: true });

    // Create DB with schema
    createFreshDb(taskieDir);

    if (opts.withReview) {
      setReviewRequired(true);
    }

    console.log('');
    console.log(chalk.green('  ✓') + chalk.bold('  AITasks initialized'));
    console.log(chalk.dim(`     Project root : ${root}`));
    console.log(chalk.dim(`     Database      : ${join(taskieDir, 'db.sqlite')}`));
    if (opts.withReview) {
      console.log(chalk.magenta('  ◈') + chalk.bold('  Review enforcement enabled'));
      console.log(chalk.dim('     Agents must submit tasks for review before marking done.'));
      console.log(chalk.dim('     Use: aitasks review <id>  →  review sub-agent  →  aitasks done <id>'));
    }
    console.log('');

    if (!opts.skipAgentFile) {
      const result = injectOrCreateAgentFile(root, getVersion(), !!opts.withReview, !!opts.update);
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
    case 'updated':
      console.log(chalk.green('  ✓') + `  Updated agent instructions in ${chalk.bold(rel)}`);
      break;
    case 'skipped':
      console.log(chalk.dim(`  ─  ${rel} already contains AITasks instructions`));
      console.log(chalk.dim(`     Run \`aitasks init --update\` to refresh them to the latest version.`));
      break;
  }
  console.log('');
}
