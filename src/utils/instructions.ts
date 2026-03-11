export const INSTRUCTIONS_START_MARKER = '<!-- aitasks:instructions -->';
export const INSTRUCTIONS_END_MARKER = '<!-- aitasks:instructions:end -->';

export function getAgentInstructions(version: string): string {
  return `${INSTRUCTIONS_START_MARKER}

## AITasks — Agent Task Protocol (v${version})

You have access to the \`aitasks\` CLI. This is your single source of truth for
all work in this project. Follow this protocol without exception.

### Environment Setup

Set your agent ID once so all commands use it automatically:
\`\`\`
export AITASKS_AGENT_ID=<your-unique-agent-id>
\`\`\`

Use a stable, descriptive ID (e.g. \`claude-sonnet-4-6\`, \`agent-backend-1\`).
For machine-readable output on any command, add \`--json\` or set \`AITASKS_JSON=true\`.

---

### Discovering Work

\`\`\`bash
aitasks list                          # All tasks, sorted by priority
aitasks list --status ready           # Only tasks available to claim
aitasks list --status in_progress     # Currently active work
aitasks next                          # Highest-priority unblocked ready task (recommended)
aitasks next --claim --agent <id>     # Auto-claim and start the best task (one-liner)
aitasks show TASK-001                 # Full detail on a specific task
aitasks search <query>                # Full-text search across titles, descriptions, notes
aitasks deps TASK-001                 # Show dependency tree (what blocks what)
\`\`\`

---

### Starting a Task

**Option 1: One-liner (recommended)**
\`\`\`bash
aitasks next --claim --agent $AITASKS_AGENT_ID
\`\`\`
This finds the best task, claims it, and starts it in one command.

**Option 2: Step by step**
1. Find available work:
   \`\`\`bash
   aitasks next --agent $AITASKS_AGENT_ID
   \`\`\`

2. Claim it (prevents other agents from taking it):
   \`\`\`bash
   aitasks claim TASK-001 --agent $AITASKS_AGENT_ID
   \`\`\`
   This will FAIL if the task is blocked. Fix blockers first.

3. Start it when you begin active work:
   \`\`\`bash
   aitasks start TASK-001 --agent $AITASKS_AGENT_ID
   \`\`\`

**Bulk operations:** You can claim, start, review, or complete multiple tasks at once:
\`\`\`bash
aitasks claim TASK-001 TASK-002 TASK-003 --agent $AITASKS_AGENT_ID
aitasks start TASK-001 TASK-002 --agent $AITASKS_AGENT_ID
aitasks done TASK-001 TASK-002 TASK-003 --agent $AITASKS_AGENT_ID  # all criteria must be verified
\`\`\`

**Pattern matching:** Use wildcards to match multiple tasks:
\`\`\`bash
aitasks claim TASK-0* --agent $AITASKS_AGENTID    # Claims TASK-001, TASK-002, ..., TASK-009
aitasks done TASK-01* --agent $AITASKS_AGENT_ID   # Claims TASK-010 through TASK-019
\`\`\`

---

### During Implementation

After every significant decision, discovery, or file change:
\`\`\`bash
aitasks note TASK-001 "Discovered rate limit of 100 req/min — added backoff in src/retry.ts:L44" --agent $AITASKS_AGENT_ID
\`\`\`

Always note:
- Architectural decisions and why alternatives were rejected
- File paths and line numbers of key changes
- External dependencies added
- Gotchas, edge cases, or known limitations
- If you split a task into subtasks

Creating subtasks:
\`\`\`bash
aitasks create --title "Write unit tests for auth" --desc "Add unit tests covering all auth edge cases" --ac "All tests pass" --ac "Coverage ≥ 90%" --parent TASK-001 --priority high --type chore
\`\`\`

If you discover your task is blocked by something:
\`\`\`bash
aitasks block TASK-001 --on TASK-002,TASK-003
\`\`\`

View dependencies:
\`\`\`bash
aitasks deps TASK-001    # Shows what this task is blocked by and what it blocks
\`\`\`

---

### Completing a Task

You MUST verify every acceptance criterion before marking done.

1. View all criteria:
   \`\`\`bash
   aitasks show TASK-001
   \`\`\`

2. Check off each criterion with concrete evidence:
   \`\`\`bash
   aitasks check TASK-001 0 --evidence "curl -X GET /users/999 returns 404 with body {error:'not found'}"
   aitasks check TASK-001 1 --evidence "unit test UserService.patch_invalid passes, see test output line 47"
   aitasks check TASK-001 2 --evidence "integration test suite passes: 12/12 green"
   \`\`\`

3. Mark done (will FAIL if any criterion is unchecked):
   \`\`\`bash
   aitasks done TASK-001 --agent $AITASKS_AGENT_ID
   \`\`\`

   **Note:** When you complete a subtask, if ALL sibling subtasks are also done, the parent task will be automatically marked as done.

   If human review is needed instead:
   \`\`\`bash
   aitasks review TASK-001 --agent $AITASKS_AGENT_ID
   \`\`\`

---

### Undoing Mistakes

Made a mistake? Use undo to revert the last action:
\`\`\`bash
aitasks undo TASK-001    # Undoes the last action (claim, start, done, check, note, etc.)
\`\`\`

Undoable actions:
- claimed → unclaims the task
- started → reverts to ready status
- completed → reverts to in_progress
- review_requested → reverts to in_progress
- criterion_checked → removes the verification
- note_added → removes the implementation note

---

### Abandoning a Task

If you must stop working on a task, NEVER silently abandon it:
\`\`\`bash
aitasks unclaim TASK-001 --agent $AITASKS_AGENT_ID --reason "Blocked on missing API credentials — needs human input"
\`\`\`

---

### Rules

1. Never mark a task done without checking EVERY acceptance criterion with evidence.
2. Never start a task you haven't claimed.
3. Never silently abandon a task — always unclaim with a reason.
4. Add implementation notes continuously, not just at the end.
5. If a task needs splitting, create subtasks BEFORE marking parent done.
6. Your evidence strings must be concrete and verifiable — not vague affirmations.
7. Always provide --desc and at least one --ac when creating a task. Both are required.
8. When completing a subtask, the parent auto-completes if ALL subtasks are done.

---

### Quick Reference

\`\`\`
aitasks next [--claim] [--agent <id>]       Find best task (optionally auto-claim/start)
aitasks list [--status <s>] [--json]        List tasks
aitasks show <id>                           Full task detail (includes time tracking)
aitasks search <query>                      Search titles, descriptions, notes
aitasks deps <id>                           Show dependency tree
aitasks create --title <t> --desc <d> --ac <c> [--ac <c> ...]   Create a task
aitasks claim <id...> --agent <id>          Claim task(s) - supports patterns like TASK-0*
aitasks start <id...> --agent <id>          Begin work on task(s)
aitasks note <id> <text> --agent <id>       Add implementation note
aitasks check <id> <n> --evidence <text>    Verify acceptance criterion n
aitasks done <id...> --agent <id>           Mark task(s) complete
aitasks review <id...> --agent <id>         Request human review
aitasks block <id> --on <id,...>            Mark as blocked
aitasks unblock <id> --from <id>            Remove a blocker
aitasks unclaim <id> --agent <id>           Release task
aitasks undo <id>                           Undo last action on task
aitasks log <id>                            Full event history
aitasks agents                              List active agents
aitasks export --format json                Export all tasks
\`\`\`

**Time tracking:** The \`show\` command displays duration for in-progress and completed tasks (e.g., "2h 34m" or "1d 5h ongoing").

${INSTRUCTIONS_END_MARKER}`;
}

export function instructionsAlreadyPresent(content: string): boolean {
  return content.includes(INSTRUCTIONS_START_MARKER);
}
