#!/usr/bin/env bun
import { Command } from 'commander';
import { initCommand }     from './commands/init.js';
import { createCommand }   from './commands/create.js';
import { listCommand }     from './commands/list.js';
import { showCommand }     from './commands/show.js';
import { claimCommand }    from './commands/claim.js';
import { startCommand }    from './commands/start.js';
import { noteCommand }     from './commands/note.js';
import { checkCommand }    from './commands/check.js';
import { doneCommand }     from './commands/done.js';
import { blockCommand }    from './commands/block.js';
import { unblockCommand }  from './commands/unblock.js';
import { reviewCommand }   from './commands/review.js';
import { rejectCommand }   from './commands/reject.js';
import { unclaimCommand }  from './commands/unclaim.js';
import { logCommand }      from './commands/log.js';
import { nextCommand }     from './commands/next.js';
import { updateCommand }   from './commands/update.js';
import { boardCommand }    from './commands/board.js';
import { agentsCommand, heartbeatCommand } from './commands/agents.js';
import { exportCommand }   from './commands/export.js';
import { onboardCommand }  from './commands/onboard.js';
import { dbCommand }       from './commands/db.js';
import { depsCommand }     from './commands/deps.js';
import { searchCommand }   from './commands/search.js';
import { undoCommand }     from './commands/undo.js';

const pkg = require('../package.json') as { version: string };
const program = new Command();

program
  .name('aitasks')
  .description('CLI task management for AI agents')
  .version(pkg.version)
  .option('-C, --dir <path>', 'run as if started in this directory')
  .hook('preAction', () => {
    const dir = program.opts().dir as string | undefined;
    if (dir) {
      try {
        process.chdir(dir);
      } catch {
        console.error(`Error: cannot change to directory: ${dir}`);
        process.exit(1);
      }
    }
  })
  .addHelpText('after', `
Environment variables:
  AITASKS_AGENT_ID   Default agent ID for commands that require --agent
  AITASKS_JSON       Set to "true" to force JSON output globally

Examples:
  aitasks init
  aitasks -C /path/to/project board
  aitasks create --title "Add auth" --desc "Implement authentication" --ac "JWT issued on login"
  aitasks next --agent claude-sonnet
  aitasks next --claim --agent claude-sonnet          # Auto-claim and start
  aitasks claim TASK-001 TASK-002 --agent claude      # Bulk claim
  aitasks claim TASK-0* --agent claude                # Pattern matching
  aitasks start TASK-001
  aitasks note TASK-001 "Using bcrypt for password hashing — src/auth.ts:L22"
  aitasks check TASK-001 0 --evidence "unit test passes: auth.test.ts line 14"
  aitasks done TASK-001 --agent claude-sonnet
  aitasks search "auth"                               # Full-text search
  aitasks deps TASK-001                               # Show dependencies
  aitasks undo TASK-001                               # Undo last action
`);

program.addCommand(initCommand);
program.addCommand(createCommand);
program.addCommand(listCommand);
program.addCommand(showCommand);
program.addCommand(claimCommand);
program.addCommand(startCommand);
program.addCommand(noteCommand);
program.addCommand(checkCommand);
program.addCommand(doneCommand);
program.addCommand(blockCommand);
program.addCommand(unblockCommand);
program.addCommand(reviewCommand);
program.addCommand(rejectCommand);
program.addCommand(unclaimCommand);
program.addCommand(logCommand);
program.addCommand(nextCommand);
program.addCommand(updateCommand);
program.addCommand(boardCommand);
program.addCommand(agentsCommand);
program.addCommand(heartbeatCommand);
program.addCommand(exportCommand);
program.addCommand(onboardCommand);
program.addCommand(dbCommand);
program.addCommand(depsCommand);
program.addCommand(searchCommand);
program.addCommand(undoCommand);

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
