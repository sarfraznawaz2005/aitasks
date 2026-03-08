/**
 * CLI integration tests — spawn the real aitasks binary against temp project dirs.
 * These are slower than unit tests but validate the full command pipeline.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  runCli,
  createInitedProject,
  removeProject,
} from './setup.js';
import { INSTRUCTIONS_START_MARKER } from '../src/utils/instructions.js';

let projectDir: string;

beforeEach(() => {
  projectDir = createInitedProject();
});

afterEach(() => {
  removeProject(projectDir);
});

// ─── init ─────────────────────────────────────────────────────────────────────

describe('aitasks init', () => {
  test('creates .aitasks/db.sqlite', () => {
    expect(existsSync(join(projectDir, '.aitasks', 'db.sqlite'))).toBe(true);
  });

  test('creates AGENTS.md with instructions when no agent file exists', () => {
    const agentsPath = join(projectDir, 'AGENTS.md');
    expect(existsSync(agentsPath)).toBe(true);
    const content = readFileSync(agentsPath, 'utf8');
    expect(content).toContain(INSTRUCTIONS_START_MARKER);
  });

  test('is idempotent — safe to run twice', () => {
    const result = runCli(['init'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('already initialized');
  });

  test('does not duplicate instructions on second init', () => {
    runCli(['init'], { cwd: projectDir });
    const content = readFileSync(join(projectDir, 'AGENTS.md'), 'utf8');
    const count = (content.match(/<!-- aitasks:instructions -->/g) ?? []).length;
    expect(count).toBe(1);
  });

  test('appends to existing CLAUDE.md without overwriting', () => {
    removeProject(projectDir); // fresh dir
    const { mkdtempSync, writeFileSync } = require('fs');
    const { tmpdir } = require('os');
    const dir = mkdtempSync(join(tmpdir(), 'aitasks-cli-claude-'));
    writeFileSync(join(dir, 'CLAUDE.md'), '# My Project\n\nExisting notes.\n');
    runCli(['init'], { cwd: dir });
    const content = readFileSync(join(dir, 'CLAUDE.md'), 'utf8');
    expect(content).toContain('# My Project');
    expect(content).toContain(INSTRUCTIONS_START_MARKER);
    removeProject(dir);
    projectDir = createInitedProject(); // restore for afterEach
  });
});

// ─── create ───────────────────────────────────────────────────────────────────

describe('aitasks create', () => {
  test('creates a task via flags', () => {
    const result = runCli(
      ['create', '--title', 'My first task', '--priority', 'high', '--type', 'bug'],
      { cwd: projectDir }
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('TASK-001');
    expect(result.stdout).toContain('My first task');
  });

  test('creates task with acceptance criteria', () => {
    const result = runCli(
      ['create', '--title', 'With AC', '--ac', 'Returns 200', '--ac', 'Has body'],
      { cwd: projectDir }
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('2 acceptance');
  });

  test('returns JSON when AITASKS_JSON=true', () => {
    const result = runCli(
      ['create', '--title', 'JSON task'],
      { cwd: projectDir, env: { AITASKS_JSON: 'true' } }
    );
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.success).toBe(true);
    expect(parsed.data.title).toBe('JSON task');
    expect(parsed.data.id).toBe('TASK-001');
  });

  test('assigns sequential IDs across calls', () => {
    runCli(['create', '--title', 'First'], { cwd: projectDir });
    const result = runCli(
      ['create', '--title', 'Second'],
      { cwd: projectDir, env: { AITASKS_JSON: 'true' } }
    );
    const parsed = JSON.parse(result.stdout);
    expect(parsed.data.id).toBe('TASK-002');
  });
});

// ─── list ─────────────────────────────────────────────────────────────────────

describe('aitasks list', () => {
  test('shows empty state message when no tasks', () => {
    const result = runCli(['list'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No tasks');
  });

  test('shows created tasks', () => {
    runCli(['create', '--title', 'List me'], { cwd: projectDir });
    const result = runCli(['list'], { cwd: projectDir });
    expect(result.stdout).toContain('TASK-001');
    expect(result.stdout).toContain('List me');
  });

  test('filters by status with --status flag', () => {
    runCli(['create', '--title', 'T1'], { cwd: projectDir });
    const result = runCli(['list', '--status', 'done'], { cwd: projectDir });
    expect(result.stdout).toContain('No tasks');
  });

  test('outputs valid JSON when AITASKS_JSON=true', () => {
    runCli(['create', '--title', 'JSON list task'], { cwd: projectDir });
    const result = runCli(['list'], { cwd: projectDir, env: { AITASKS_JSON: 'true' } });
    const parsed = JSON.parse(result.stdout);
    expect(parsed.success).toBe(true);
    expect(Array.isArray(parsed.data)).toBe(true);
    expect(parsed.data[0]!.title).toBe('JSON list task');
  });

  test('shows task stats with --stats', () => {
    runCli(['create', '--title', 'T'], { cwd: projectDir });
    const result = runCli(['list', '--stats'], { cwd: projectDir });
    expect(result.stdout).toContain('Total');
  });
});

// ─── show ─────────────────────────────────────────────────────────────────────

describe('aitasks show', () => {
  test('shows task details', () => {
    runCli(['create', '--title', 'Show me', '--desc', 'Full details'], { cwd: projectDir });
    const result = runCli(['show', 'TASK-001'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('TASK-001');
    expect(result.stdout).toContain('Show me');
    expect(result.stdout).toContain('Full details');
  });

  test('exits with error for unknown task', () => {
    const result = runCli(['show', 'TASK-999'], { cwd: projectDir });
    expect(result.exitCode).not.toBe(0);
  });

  test('shows acceptance criteria', () => {
    runCli(['create', '--title', 'T', '--ac', 'Returns 404', '--ac', 'Has JSON body'], { cwd: projectDir });
    const result = runCli(['show', 'TASK-001'], { cwd: projectDir });
    expect(result.stdout).toContain('Returns 404');
    expect(result.stdout).toContain('Has JSON body');
  });
});

// ─── claim / start / note ─────────────────────────────────────────────────────

describe('aitasks claim + start + note', () => {
  test('claim marks task as ready with agent assigned', () => {
    runCli(['create', '--title', 'Claimable'], { cwd: projectDir });
    const result = runCli(['claim', 'TASK-001', '--agent', 'test-agent'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Claimed');
  });

  test('start transitions task to in_progress', () => {
    runCli(['create', '--title', 'Startable'], { cwd: projectDir });
    runCli(['claim', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    const result = runCli(['start', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Started');
  });

  test('note adds an implementation note', () => {
    runCli(['create', '--title', 'T'], { cwd: projectDir });
    runCli(['claim', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    const result = runCli(
      ['note', 'TASK-001', 'Used bcrypt for hashing', '--agent', 'agent-a'],
      { cwd: projectDir }
    );
    expect(result.exitCode).toBe(0);
    // Verify note appears in show
    const show = runCli(['show', 'TASK-001'], { cwd: projectDir });
    expect(show.stdout).toContain('Used bcrypt for hashing');
  });

  test('claim fails on blocked task', () => {
    runCli(['create', '--title', 'Blocker'], { cwd: projectDir });
    runCli(['create', '--title', 'Blocked'], { cwd: projectDir });
    runCli(['block', 'TASK-002', '--on', 'TASK-001'], { cwd: projectDir });
    const result = runCli(['claim', 'TASK-002', '--agent', 'agent-a'], { cwd: projectDir });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('blocked');
  });

  test('AITASKS_AGENT_ID env var is used when --agent is omitted', () => {
    runCli(['create', '--title', 'T'], { cwd: projectDir });
    const result = runCli(['claim', 'TASK-001'], {
      cwd: projectDir,
      env: { AITASKS_AGENT_ID: 'env-agent' },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('env-agent');
  });
});

// ─── check / done ─────────────────────────────────────────────────────────────

describe('aitasks check + done', () => {
  test('done fails when criteria are not checked', () => {
    runCli(['create', '--title', 'T', '--ac', 'AC1', '--ac', 'AC2'], { cwd: projectDir });
    runCli(['start', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    const result = runCli(['done', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('AC1');
  });

  test('done succeeds when all criteria are verified', () => {
    runCli(['create', '--title', 'T', '--ac', 'AC1'], { cwd: projectDir });
    runCli(['start', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    runCli(['check', 'TASK-001', '0', '--evidence', 'proof', '--agent', 'agent-a'], { cwd: projectDir });
    const result = runCli(['done', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('DONE');
  });

  test('done with no criteria succeeds immediately', () => {
    runCli(['create', '--title', 'No AC task'], { cwd: projectDir });
    runCli(['start', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    const result = runCli(['done', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
  });

  test('done auto-unblocks dependent tasks', () => {
    runCli(['create', '--title', 'Blocker'], { cwd: projectDir });
    runCli(['create', '--title', 'Dependent'], { cwd: projectDir });
    runCli(['block', 'TASK-002', '--on', 'TASK-001'], { cwd: projectDir });
    runCli(['start', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    const done = runCli(['done', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    expect(done.stdout).toContain('TASK-002'); // mentioned in auto-unblock message

    // TASK-002 should now be claimable
    const claim = runCli(['claim', 'TASK-002', '--agent', 'agent-a'], { cwd: projectDir });
    expect(claim.exitCode).toBe(0);
  });

  test('check requires --evidence flag', () => {
    runCli(['create', '--title', 'T', '--ac', 'AC1'], { cwd: projectDir });
    const result = runCli(['check', 'TASK-001', '0', '--agent', 'agent-a'], { cwd: projectDir });
    expect(result.exitCode).not.toBe(0);
  });
});

// ─── block / unblock ─────────────────────────────────────────────────────────

describe('aitasks block + unblock', () => {
  test('block sets task to blocked status', () => {
    runCli(['create', '--title', 'B1'], { cwd: projectDir });
    runCli(['create', '--title', 'B2'], { cwd: projectDir });
    runCli(['block', 'TASK-002', '--on', 'TASK-001'], { cwd: projectDir });
    const result = runCli(['show', 'TASK-002'], { cwd: projectDir, env: { AITASKS_JSON: 'true' } });
    const parsed = JSON.parse(result.stdout);
    expect(parsed.data.status).toBe('blocked');
  });

  test('unblock removes blocker and sets task to ready', () => {
    runCli(['create', '--title', 'B1'], { cwd: projectDir });
    runCli(['create', '--title', 'B2'], { cwd: projectDir });
    runCli(['block', 'TASK-002', '--on', 'TASK-001'], { cwd: projectDir });
    runCli(['unblock', 'TASK-002', '--from', 'TASK-001'], { cwd: projectDir });
    const result = runCli(['show', 'TASK-002'], { cwd: projectDir, env: { AITASKS_JSON: 'true' } });
    const parsed = JSON.parse(result.stdout);
    expect(parsed.data.status).toBe('ready');
  });
});

// ─── review / reject ──────────────────────────────────────────────────────────

describe('aitasks review + reject', () => {
  test('review transitions in_progress task to needs_review', () => {
    runCli(['create', '--title', 'T'], { cwd: projectDir });
    runCli(['start', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    const result = runCli(['review', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('review');
  });

  test('reject sends task back to in_progress', () => {
    runCli(['create', '--title', 'T'], { cwd: projectDir });
    runCli(['start', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    runCli(['review', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    const result = runCli(['reject', 'TASK-001', '--reason', 'Missing tests'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    const show = runCli(['show', 'TASK-001'], { cwd: projectDir, env: { AITASKS_JSON: 'true' } });
    const parsed = JSON.parse(show.stdout);
    expect(parsed.data.status).toBe('in_progress');
  });


  test('reject requires --reason flag', () => {
    runCli(['create', '--title', 'T'], { cwd: projectDir });
    runCli(['start', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    runCli(['review', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    const result = runCli(['reject', 'TASK-001'], { cwd: projectDir });
    expect(result.exitCode).not.toBe(0);
  });
});

// ─── next ─────────────────────────────────────────────────────────────────────

describe('aitasks next', () => {
  test('shows no tasks message when nothing is ready', () => {
    runCli(['create', '--title', 'Backlog task'], { cwd: projectDir });
    const result = runCli(['next'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No ready tasks');
  });

  test('shows the highest priority ready task', () => {
    // Claim+unclaim to put tasks into 'ready' status
    runCli(['create', '--title', 'High pri', '--priority', 'high'], { cwd: projectDir });
    runCli(['claim', 'TASK-001', '--agent', 'a'], { cwd: projectDir });
    runCli(['unclaim', 'TASK-001', '--agent', 'a'], { cwd: projectDir });
    const result = runCli(['next'], { cwd: projectDir });
    expect(result.stdout).toContain('TASK-001');
  });
});

// ─── log ──────────────────────────────────────────────────────────────────────

describe('aitasks log', () => {
  test('shows event history for a task', () => {
    runCli(['create', '--title', 'T'], { cwd: projectDir });
    runCli(['claim', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    const result = runCli(['log', 'TASK-001'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('created');
    expect(result.stdout).toContain('claimed');
  });
});

// ─── export ───────────────────────────────────────────────────────────────────

describe('aitasks export', () => {
  test('exports JSON to stdout', () => {
    runCli(['create', '--title', 'Export me'], { cwd: projectDir });
    const result = runCli(['export', '--format', 'json'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.tasks).toBeDefined();
    expect(parsed.tasks[0].title).toBe('Export me');
  });

  test('exports CSV to stdout', () => {
    runCli(['create', '--title', 'CSV task'], { cwd: projectDir });
    const result = runCli(['export', '--format', 'csv'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('id,title');
    expect(result.stdout).toContain('CSV task');
  });
});

// ─── db ───────────────────────────────────────────────────────────────────────

describe('aitasks db status', () => {
  test('shows database status', () => {
    const result = runCli(['db', 'status'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Integrity');
    expect(result.stdout).toContain('ok');
    expect(result.stdout).toContain('wal');
  });
});

// ─── onboard ──────────────────────────────────────────────────────────────────

describe('aitasks onboard', () => {
  test('prints agent instructions to stdout', () => {
    const result = runCli(['onboard'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(INSTRUCTIONS_START_MARKER);
    expect(result.stdout).toContain('AITASKS_AGENT_ID');
  });

  test('outputs JSON with --json flag on onboard command', () => {
    // onboard --json is self-contained and does not use AITASKS_JSON env var
    const result = runCli(['onboard', '--json'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    // onboard --json outputs {"instructions":"..."} directly, not via jsonOut wrapper
    // Verify it's parseable JSON containing the marker
    const parsed = JSON.parse(result.stdout);
    expect(typeof parsed.instructions).toBe('string');
    expect(parsed.instructions).toContain(INSTRUCTIONS_START_MARKER);
  });
});

// ─── agents ───────────────────────────────────────────────────────────────────

describe('aitasks agents', () => {
  test('shows no agents initially', () => {
    const result = runCli(['agents'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No agents');
  });

  test('shows agent after claim', () => {
    runCli(['create', '--title', 'T'], { cwd: projectDir });
    runCli(['claim', 'TASK-001', '--agent', 'visible-agent'], { cwd: projectDir });
    const result = runCli(['agents'], { cwd: projectDir });
    expect(result.stdout).toContain('visible-agent');
  });
});

// ─── error handling ───────────────────────────────────────────────────────────

describe('error handling', () => {
  test('commands exit non-zero when task not found', () => {
    const result = runCli(['show', 'TASK-999'], { cwd: projectDir });
    expect(result.exitCode).not.toBe(0);
  });

  test('claim requires --agent or AITASKS_AGENT_ID', () => {
    runCli(['create', '--title', 'T'], { cwd: projectDir });
    const result = runCli(['claim', 'TASK-001'], { cwd: projectDir });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('Agent ID required');
  });

  test('error output is valid JSON when AITASKS_JSON=true', () => {
    const result = runCli(['show', 'TASK-999'], {
      cwd: projectDir,
      env: { AITASKS_JSON: 'true' },
    });
    expect(result.exitCode).not.toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.success).toBe(false);
    expect(typeof parsed.error).toBe('string');
  });
});
