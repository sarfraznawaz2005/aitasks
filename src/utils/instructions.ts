export const INSTRUCTIONS_START_MARKER = '<!-- aitasks:instructions -->';
export const INSTRUCTIONS_END_MARKER = '<!-- aitasks:instructions:end -->';

export function getAgentInstructions(version: string, opts: { reviewRequired?: boolean } = {}): string {
  const reviewRequired = opts.reviewRequired ?? false;
  return `${INSTRUCTIONS_START_MARKER}

## AITasks — Agent Task Protocol (v${version})
${reviewRequired ? `
> ⚠️  **REVIEW ENFORCEMENT IS ENABLED ON THIS PROJECT**
> You cannot mark any task done directly. Every task requires a review step:
> \`aitasks review\` → spawn review sub-agent → \`aitasks done\`
> Tasks are only complete when their status is \`done\`. All other statuses mean work is still in progress.
` : ''}
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
aitasks delete TASK-001               # Delete a task (no need to claim first)
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

**Bulk operations:** You can claim, start, or complete multiple tasks at once:
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

### Completing a Task${reviewRequired ? ' ⚠️  REVIEW REQUIRED' : ''}

> **A task is only complete when its status is \`done\`. Verified criteria, implementation notes, and \`review\` status do NOT mean the task is done. You have not finished a task until \`aitasks done\` has succeeded.**

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

${reviewRequired ? `3. Submit for review — you CANNOT mark done directly:
   \`\`\`bash
   aitasks review TASK-001 --agent $AITASKS_AGENT_ID
   \`\`\`
   **STOP HERE. Do not run \`aitasks done\` yourself.** The system will block self-approval.

4. **IMMEDIATELY spawn a review sub-agent with a DIFFERENT agent ID** to inspect the implementation.
   The review sub-agent must first register itself, then approve or reject:
   \`\`\`bash
   # Review sub-agent registers itself
   aitasks heartbeat --agent <review-agent-id>

   # Approve (moves task to done):
   aitasks done TASK-001 --agent <review-agent-id>

   # OR reject (sends task back to in_progress with feedback):
   aitasks reject TASK-001 --reason "<specific feedback>" --agent <review-agent-id>
   \`\`\`
   The task is still incomplete until the review agent approves it.
   **The system will block approval from any agent that has not registered or that submitted the review itself.**

5. If rejected: address the feedback, re-check criteria, and repeat from step 3.

> The task is only done when \`aitasks done\` completes successfully. \`review\` status means awaiting approval — it is not done.` : `3. Mark done (will FAIL if any criterion is unchecked):
   \`\`\`bash
   aitasks done TASK-001 --agent $AITASKS_AGENT_ID
   \`\`\`

> The task is only done when \`aitasks done\` completes successfully. Do not treat a task as finished until you see the done confirmation.`}

---

### Undoing Mistakes

Made a mistake? Use undo to revert the last action:
\`\`\`bash
aitasks undo TASK-001    # Undoes the last action (claim, start, done, check, note, etc.)
\`\`\`

Undoable actions:
- claimed → unclaims the task
- started → reverts to ready status
- completed → reverts to in_progress${reviewRequired ? `
- review_requested → reverts to in_progress` : ''}
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

1. **A task is only complete when its status is \`done\`.** No other status — not criteria-verified, not \`review\`, not \`in_progress\` — counts as complete. Your work on a task is not finished until \`aitasks done\` succeeds.
2. Never mark a task done without checking EVERY acceptance criterion with evidence.
3. Never start a task you haven't claimed.
4. Never silently abandon a task — always unclaim with a reason.
5. Add implementation notes continuously, not just at the end.
6. If a task needs splitting, create subtasks BEFORE marking parent done.
7. Your evidence strings must be concrete and verifiable — not vague affirmations.
8. Always provide --desc and at least one --ac when creating a task. Both are required.${reviewRequired ? `
9. NEVER move a task to done directly. Always submit for review first with \`aitasks review\`, then IMMEDIATELY spawn a review sub-agent with a DIFFERENT agent ID. Do NOT call \`aitasks done\` yourself after submitting for review — the system blocks self-approval.` : ''}

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
aitasks done <id...> --agent <id>           Mark task(s) complete (only valid completion)${reviewRequired ? `
aitasks review <id...> --agent <id>         Submit for review — then spawn review sub-agent immediately
aitasks reject <id> --reason <r>            Reject review — sends back to in_progress` : ''}
aitasks block <id> --on <id,...>            Mark as blocked
aitasks unblock <id> --from <id>            Remove a blocker
aitasks unclaim <id> --agent <id>           Release task
aitasks undo <id>                           Undo last action on task
aitasks delete <id...>                      Delete task(s) - no claim required
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
