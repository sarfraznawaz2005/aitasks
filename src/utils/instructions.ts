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
aitasks show TASK-001                 # Full detail on a specific task
\`\`\`

---

### Starting a Task

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

   If human review is needed instead:
   \`\`\`bash
   aitasks review TASK-001 --agent $AITASKS_AGENT_ID
   \`\`\`

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

---

### Quick Reference

\`\`\`
aitasks next                              Find best task to work on
aitasks list [--status <s>] [--json]      List tasks
aitasks show <id>                         Full task detail
aitasks create --title <t> --desc <d> --ac <c> [--ac <c> ...]   Create a task
aitasks claim <id> --agent <id>           Claim a task
aitasks start <id> --agent <id>           Begin work
aitasks note <id> <text> --agent <id>     Add implementation note
aitasks check <id> <n> --evidence <text>  Verify acceptance criterion n
aitasks done <id> --agent <id>            Mark complete
aitasks review <id> --agent <id>          Request human review
aitasks block <id> --on <id,...>          Mark as blocked
aitasks unblock <id> --from <id>          Remove a blocker
aitasks unclaim <id> --agent <id>         Release task
aitasks log <id>                          Full event history
aitasks agents                            List active agents
aitasks export --format json              Export all tasks
\`\`\`

${INSTRUCTIONS_END_MARKER}`;
}

export function instructionsAlreadyPresent(content: string): boolean {
  return content.includes(INSTRUCTIONS_START_MARKER);
}
