# aitasks

> CLI task management built for AI agents.

`aitasks` gives AI agents (Claude, Gemini, GPT, etc.) a structured task queue to work from. Agents can claim tasks, log progress notes, verify acceptance criteria with evidence, and hand off work — all via simple shell commands.

**Requires [Bun](https://bun.sh) ≥ 1.0.0.**

---

## Install

```sh
bun install -g aitasks
```

## Quick Start

```sh
# 1. Initialize in your project
aitasks init

# 2. Create a task
aitasks create --title "Add JWT auth" --desc "Implement user authentication" --priority high --ac "POST /login returns token" --ac "Token expires in 1h"

# 3. Agent picks up work (one-liner with auto-claim)
aitasks next --claim --agent claude-sonnet

# 4. Or claim and start separately
aitasks claim TASK-001 --agent claude-sonnet
aitasks start TASK-001 --agent claude-sonnet

# 5. Log notes along the way
aitasks note TASK-001 "Using bcrypt for hashing — src/auth.ts:L22" --agent claude-sonnet

# 6. Verify acceptance criteria
aitasks check TASK-001 0 --evidence "POST /login returns 200 with token field" --agent claude-sonnet
aitasks check TASK-001 1 --evidence "token exp claim set to now+3600, confirmed in jwt.test.ts:L14"

# 7. Mark done
aitasks done TASK-001 --agent claude-sonnet
```

**Pro tips:**
- Use `aitasks next --claim --agent <id>` to find, claim, and start in one command
- Bulk operations: `aitasks done TASK-001 TASK-002 TASK-003 --agent <id>`
- Pattern matching: `aitasks claim TASK-0* --agent <id>` claims all TASK-00x tasks
- Search: `aitasks search "auth"` finds tasks mentioning authentication
- Undo mistakes: `aitasks undo TASK-001`
- Delete tasks: `aitasks delete TASK-001` (no need to claim first)

---

## Environment Variables

| Variable | Description |
|---|---|
| `AITASKS_AGENT_ID` | Default agent ID — avoids passing `--agent` on every command |
| `AITASKS_JSON` | Set to `true` to force JSON output globally (useful for scripting) |

```sh
export AITASKS_AGENT_ID=claude-sonnet
export AITASKS_JSON=true
```

---

## Commands

### Setup

| Command | Description |
|---|---|
| `aitasks init` | Initialize a task database in the current project |
| `aitasks onboard` | Print or inject agent protocol instructions into CLAUDE.md / AGENTS.md |

### Task Discovery

| Command | Description |
|---|---|
| `aitasks list` | List all tasks, sorted by priority |
| `aitasks list --status ready` | Filter by status (`ready`, `in_progress`, `done`, `blocked`, `needs_review`) |
| `aitasks next` | Show the highest-priority unblocked ready task |
| `aitasks next --claim --agent <id>` | Auto-claim and start the best task |
| `aitasks show <id>` | Full detail on a specific task (includes time tracking) |
| `aitasks search <query>` | Full-text search across titles, descriptions, and notes |
| `aitasks deps <id>` | Show dependency tree (what blocks what) |
| `aitasks board` | Kanban-style board view |

### Task Lifecycle

| Command | Description |
|---|---|
| `aitasks create` | Create a task (interactive if no flags given) |
| `aitasks claim <id...> --agent <id>` | Claim task(s) - supports patterns like `TASK-0*` |
| `aitasks start <id...> --agent <id>` | Begin active work on task(s) |
| `aitasks note <id> <text>` | Add an implementation note |
| `aitasks check <id> <n> --evidence <text>` | Verify acceptance criterion n |
| `aitasks done <id...> --agent <id>` | Mark task(s) complete (all criteria must be verified) |
| `aitasks review <id...> --agent <id>` | Submit for human review |
| `aitasks reject <id> --reason <text>` | Reject and send back to in_progress |
| `aitasks unclaim <id> --agent <id>` | Release a task back to the pool |
| `aitasks undo <id>` | Undo the last action on a task |
| `aitasks delete <id...>` | Delete task(s) - does not require claiming first |

**Note:** Commands marked with `<id...>` support multiple task IDs and pattern matching (e.g., `TASK-0*`).

### Blocking

| Command | Description |
|---|---|
| `aitasks block <id> --on <id,...>` | Mark a task as blocked by others |
| `aitasks unblock <id> --from <id>` | Manually remove a blocker |

### Agents & History

| Command | Description |
|---|---|
| `aitasks agents` | List active agents and their current tasks |
| `aitasks heartbeat [taskId]` | Update agent last-seen timestamp |
| `aitasks log <id>` | Full event history for a task |
| `aitasks export --format json` | Export all tasks as JSON |
| `aitasks export --format csv` | Export all tasks as CSV |

### Database

| Command | Description |
|---|---|
| `aitasks db status` | Show database health and stats |

---

## `create` Flags

```sh
aitasks create \
  --title "My task" \
  --desc "Longer description" \
  --ac "Returns 200" \          # Acceptance criterion (repeatable, at least one required)
  --priority high \             # critical | high | medium | low
  --type feature \              # feature | bug | chore | spike
  --parent TASK-001             # Parent task ID (optional)
```

---

## Agent Protocol

When you run `aitasks init`, it automatically injects a full agent protocol into `CLAUDE.md`, `AGENTS.md`, or `GEMINI.md` (whichever exists, or creates `AGENTS.md`). This tells the AI agent exactly how to use `aitasks`.

You can also inject/view it manually:

```sh
aitasks onboard               # print to stdout
aitasks onboard --append      # append to detected agent file
aitasks onboard --file MY.md  # append to a specific file
aitasks onboard --json        # output as JSON string
```

---

## Data Storage

`aitasks init` creates a `.aitasks/` directory in your project root containing a SQLite database. Add `.aitasks/` to your `.gitignore` if you don't want to commit task data, or commit it to share tasks across your team.

---

## License

MIT
