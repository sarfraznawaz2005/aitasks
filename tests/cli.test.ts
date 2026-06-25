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

  test('--update refreshes the instructions block in place, preserving other content', () => {
    const agentsPath = join(projectDir, 'AGENTS.md');

    // Simulate a stale instructions block and surrounding user content.
    const original = readFileSync(agentsPath, 'utf8');
    const tampered =
      '# My Project\n\nExisting notes.\n\n' +
      original.replace('## AITasks — Agent Task Protocol', '## AITasks — STALE PROTOCOL') +
      '\n\n## Footer kept by user\n';
    const { writeFileSync } = require('fs');
    writeFileSync(agentsPath, tampered);

    const result = runCli(['init', '--update'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Updated agent instructions');

    const updated = readFileSync(agentsPath, 'utf8');
    // Surrounding content survives, stale block is replaced, no duplication.
    expect(updated).toContain('# My Project');
    expect(updated).toContain('## Footer kept by user');
    expect(updated).not.toContain('STALE PROTOCOL');
    expect((updated.match(/<!-- aitasks:instructions -->/g) ?? []).length).toBe(1);
  });

  test('second init without --update skips and hints at --update', () => {
    const result = runCli(['init'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('aitasks init --update');
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
      ['create', '--title', 'My first task', '--desc', 'Task description', '--ac', 'Criterion', '--priority', 'high', '--type', 'bug'],
      { cwd: projectDir }
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('TASK-001');
    expect(result.stdout).toContain('My first task');
  });

  test('creates task with acceptance criteria', () => {
    const result = runCli(
      ['create', '--title', 'With AC', '--desc', 'Task description', '--ac', 'Returns 200', '--ac', 'Has body'],
      { cwd: projectDir }
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('2 acceptance');
  });

  test('returns JSON when AITASKS_JSON=true', () => {
    const result = runCli(
      ['create', '--title', 'JSON task', '--desc', 'Task description', '--ac', 'Criterion'],
      { cwd: projectDir, env: { AITASKS_JSON: 'true' } }
    );
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.success).toBe(true);
    expect(parsed.data.title).toBe('JSON task');
    expect(parsed.data.id).toBe('TASK-001');
  });

  test('assigns sequential IDs across calls', () => {
    runCli(['create', '--title', 'First', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    const result = runCli(
      ['create', '--title', 'Second', '--desc', 'Task description', '--ac', 'AC'],
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
    runCli(['create', '--title', 'List me', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    const result = runCli(['list'], { cwd: projectDir });
    expect(result.stdout).toContain('TASK-001');
    expect(result.stdout).toContain('List me');
  });

  test('filters by status with --status flag', () => {
    runCli(['create', '--title', 'T1', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    const result = runCli(['list', '--status', 'done'], { cwd: projectDir });
    expect(result.stdout).toContain('No tasks');
  });

  test('outputs valid JSON when AITASKS_JSON=true', () => {
    runCli(['create', '--title', 'JSON list task', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    const result = runCli(['list'], { cwd: projectDir, env: { AITASKS_JSON: 'true' } });
    const parsed = JSON.parse(result.stdout);
    expect(parsed.success).toBe(true);
    expect(Array.isArray(parsed.data)).toBe(true);
    expect(parsed.data[0]!.title).toBe('JSON list task');
  });

  test('shows task stats with --stats', () => {
    runCli(['create', '--title', 'T', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    const result = runCli(['list', '--stats'], { cwd: projectDir });
    expect(result.stdout).toContain('Total');
  });
});

// ─── show ─────────────────────────────────────────────────────────────────────

describe('aitasks show', () => {
  test('shows task details', () => {
    runCli(['create', '--title', 'Show me', '--desc', 'Full details', '--ac', 'Criterion'], { cwd: projectDir });
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
    runCli(['create', '--title', 'T', '--desc', 'Task description', '--ac', 'Returns 404', '--ac', 'Has JSON body'], { cwd: projectDir });
    const result = runCli(['show', 'TASK-001'], { cwd: projectDir });
    expect(result.stdout).toContain('Returns 404');
    expect(result.stdout).toContain('Has JSON body');
  });
});

// ─── claim / start / note ─────────────────────────────────────────────────────

describe('aitasks claim + start + note', () => {
  test('claim marks task as ready with agent assigned', () => {
    runCli(['create', '--title', 'Claimable', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    const result = runCli(['claim', 'TASK-001', '--agent', 'test-agent'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Claimed');
  });

  test('start transitions task to in_progress', () => {
    runCli(['create', '--title', 'Startable', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    runCli(['claim', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    const result = runCli(['start', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Started');
  });

  test('note adds an implementation note', () => {
    runCli(['create', '--title', 'T', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
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
    runCli(['create', '--title', 'Blocker', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    runCli(['create', '--title', 'Blocked', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    runCli(['block', 'TASK-002', '--on', 'TASK-001'], { cwd: projectDir });
    const result = runCli(['claim', 'TASK-002', '--agent', 'agent-a'], { cwd: projectDir });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('blocked');
  });

  test('AITASKS_AGENT_ID env var is used when --agent is omitted', () => {
    runCli(['create', '--title', 'T', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
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
    runCli(['create', '--title', 'T', '--desc', 'Task description', '--ac', 'AC1', '--ac', 'AC2'], { cwd: projectDir });
    runCli(['start', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    const result = runCli(['done', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('AC1');
  });

  test('done succeeds when all criteria are verified', () => {
    runCli(['create', '--title', 'T', '--desc', 'Task description', '--ac', 'AC1'], { cwd: projectDir });
    runCli(['start', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    runCli(['check', 'TASK-001', '0', '--evidence', 'proof', '--agent', 'agent-a'], { cwd: projectDir });
    const result = runCli(['done', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('DONE');
  });

  test('done succeeds when all criteria are checked', () => {
    runCli(['create', '--title', 'Multi AC task', '--desc', 'Task description', '--ac', 'AC1', '--ac', 'AC2'], { cwd: projectDir });
    runCli(['start', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    runCli(['check', 'TASK-001', '0', '--evidence', 'proof-0', '--agent', 'agent-a'], { cwd: projectDir });
    runCli(['check', 'TASK-001', '1', '--evidence', 'proof-1', '--agent', 'agent-a'], { cwd: projectDir });
    const result = runCli(['done', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
  });

  test('done auto-unblocks dependent tasks', () => {
    runCli(['create', '--title', 'Blocker', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    runCli(['create', '--title', 'Dependent', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    runCli(['block', 'TASK-002', '--on', 'TASK-001'], { cwd: projectDir });
    runCli(['start', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    runCli(['check', 'TASK-001', '0', '--evidence', 'proof', '--agent', 'agent-a'], { cwd: projectDir });
    const done = runCli(['done', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    expect(done.stdout).toContain('TASK-002'); // mentioned in auto-unblock message

    // TASK-002 should now be claimable
    const claim = runCli(['claim', 'TASK-002', '--agent', 'agent-a'], { cwd: projectDir });
    expect(claim.exitCode).toBe(0);
  });

  test('check requires --evidence flag', () => {
    runCli(['create', '--title', 'T', '--desc', 'Task description', '--ac', 'AC1'], { cwd: projectDir });
    const result = runCli(['check', 'TASK-001', '0', '--agent', 'agent-a'], { cwd: projectDir });
    expect(result.exitCode).not.toBe(0);
  });
});

// ─── update (acceptance criteria) ───────────────────────────────────────────────

describe('aitasks update — acceptance criteria', () => {
  function criteria(): string[] {
    const result = runCli(['show', 'TASK-001'], { cwd: projectDir, env: { AITASKS_JSON: 'true' } });
    return JSON.parse(result.stdout).data.acceptance_criteria;
  }

  test('--ac appends without replacing existing criteria', () => {
    runCli(['create', '--title', 'T', '--desc', 'Task description', '--ac', 'First', '--ac', 'Second'], { cwd: projectDir });
    const result = runCli(['update', 'TASK-001', '--ac', 'Third'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(criteria()).toEqual(['First', 'Second', 'Third']);
  });

  test('--set-ac replaces a single criterion in place', () => {
    runCli(['create', '--title', 'T', '--desc', 'Task description', '--ac', 'First', '--ac', 'Second', '--ac', 'Third'], { cwd: projectDir });
    const result = runCli(['update', 'TASK-001', '--set-ac', '1=Corrected second'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(criteria()).toEqual(['First', 'Corrected second', 'Third']);
  });

  test('--set-ac keeps "=" characters in the criterion text', () => {
    runCli(['create', '--title', 'T', '--desc', 'Task description', '--ac', 'First'], { cwd: projectDir });
    runCli(['update', 'TASK-001', '--set-ac', '0=x = y + 1'], { cwd: projectDir });
    expect(criteria()).toEqual(['x = y + 1']);
  });

  test('--set-ac clears the prior verification for that criterion', () => {
    runCli(['create', '--title', 'T', '--desc', 'Task description', '--ac', 'First', '--ac', 'Second'], { cwd: projectDir });
    runCli(['start', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    runCli(['check', 'TASK-001', '0', '--evidence', 'proof-0', '--agent', 'agent-a'], { cwd: projectDir });
    runCli(['check', 'TASK-001', '1', '--evidence', 'proof-1', '--agent', 'agent-a'], { cwd: projectDir });

    runCli(['update', 'TASK-001', '--set-ac', '0=Reworded first'], { cwd: projectDir });

    // Criterion 0's verification is gone, so done must now fail.
    const done = runCli(['done', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    expect(done.exitCode).not.toBe(0);

    const show = runCli(['show', 'TASK-001'], { cwd: projectDir, env: { AITASKS_JSON: 'true' } });
    const results = JSON.parse(show.stdout).data.test_results;
    expect(results.map((r: { index: number }) => r.index)).toEqual([1]);
  });

  test('--remove-ac deletes a criterion and re-indexes verifications', () => {
    runCli(['create', '--title', 'T', '--desc', 'Task description', '--ac', 'First', '--ac', 'Second', '--ac', 'Third'], { cwd: projectDir });
    runCli(['start', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    runCli(['check', 'TASK-001', '2', '--evidence', 'proof-third', '--agent', 'agent-a'], { cwd: projectDir });

    const result = runCli(['update', 'TASK-001', '--remove-ac', '0'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(criteria()).toEqual(['Second', 'Third']);

    // The verification that pointed at index 2 ("Third") now points at index 1.
    const show = runCli(['show', 'TASK-001'], { cwd: projectDir, env: { AITASKS_JSON: 'true' } });
    const results = JSON.parse(show.stdout).data.test_results;
    expect(results).toHaveLength(1);
    expect(results[0].index).toBe(1);
    expect(results[0].criterion).toBe('Third');
  });

  test('rejects an out-of-range index', () => {
    runCli(['create', '--title', 'T', '--desc', 'Task description', '--ac', 'First'], { cwd: projectDir });
    const result = runCli(['update', 'TASK-001', '--set-ac', '5=Nope'], { cwd: projectDir });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('out of range');
  });

  test('rejects --set-ac without an "=" separator', () => {
    runCli(['create', '--title', 'T', '--desc', 'Task description', '--ac', 'First'], { cwd: projectDir });
    const result = runCli(['update', 'TASK-001', '--set-ac', '0 missing separator'], { cwd: projectDir });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('<index>=<text>');
  });

  test('rejects combining multiple acceptance-criteria modes', () => {
    runCli(['create', '--title', 'T', '--desc', 'Task description', '--ac', 'First'], { cwd: projectDir });
    const result = runCli(['update', 'TASK-001', '--ac', 'New', '--remove-ac', '0'], { cwd: projectDir });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('only one of');
  });
});

// ─── block / unblock ─────────────────────────────────────────────────────────

describe('aitasks block + unblock', () => {
  test('block sets task to blocked status', () => {
    runCli(['create', '--title', 'B1', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    runCli(['create', '--title', 'B2', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    runCli(['block', 'TASK-002', '--on', 'TASK-001'], { cwd: projectDir });
    const result = runCli(['show', 'TASK-002'], { cwd: projectDir, env: { AITASKS_JSON: 'true' } });
    const parsed = JSON.parse(result.stdout);
    expect(parsed.data.status).toBe('blocked');
  });

  test('unblock removes blocker and sets task to ready', () => {
    runCli(['create', '--title', 'B1', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    runCli(['create', '--title', 'B2', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
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
    runCli(['create', '--title', 'T', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    runCli(['start', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    const result = runCli(['review', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('review');
  });

  test('reject sends task back to in_progress', () => {
    runCli(['create', '--title', 'T', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    runCli(['start', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    runCli(['review', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    const result = runCli(['reject', 'TASK-001', '--reason', 'Missing tests'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    const show = runCli(['show', 'TASK-001'], { cwd: projectDir, env: { AITASKS_JSON: 'true' } });
    const parsed = JSON.parse(show.stdout);
    expect(parsed.data.status).toBe('in_progress');
  });


  test('reject requires --reason flag', () => {
    runCli(['create', '--title', 'T', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    runCli(['start', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    runCli(['review', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    const result = runCli(['reject', 'TASK-001'], { cwd: projectDir });
    expect(result.exitCode).not.toBe(0);
  });
});

// ─── next ─────────────────────────────────────────────────────────────────────

describe('aitasks next', () => {
  test('shows no tasks message when nothing is ready', () => {
    runCli(['create', '--title', 'Backlog task', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    const result = runCli(['next'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No ready tasks');
  });

  test('shows the highest priority ready task', () => {
    // Claim+unclaim to put tasks into 'ready' status
    runCli(['create', '--title', 'High pri', '--desc', 'Task description', '--ac', 'AC', '--priority', 'high'], { cwd: projectDir });
    runCli(['claim', 'TASK-001', '--agent', 'a'], { cwd: projectDir });
    runCli(['unclaim', 'TASK-001', '--agent', 'a'], { cwd: projectDir });
    const result = runCli(['next'], { cwd: projectDir });
    expect(result.stdout).toContain('TASK-001');
  });
});

// ─── log ──────────────────────────────────────────────────────────────────────

describe('aitasks log', () => {
  test('shows event history for a task', () => {
    runCli(['create', '--title', 'T', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
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
    runCli(['create', '--title', 'Export me', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    const result = runCli(['export', '--format', 'json'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.tasks).toBeDefined();
    expect(parsed.tasks[0].title).toBe('Export me');
  });

  test('exports CSV to stdout', () => {
    runCli(['create', '--title', 'CSV task', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
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
    runCli(['create', '--title', 'T', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
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
    runCli(['create', '--title', 'T', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
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

// ─── next --claim (auto-claim) ────────────────────────────────────────────────

describe('aitasks next --claim', () => {
  test('--claim requires --agent', () => {
    runCli(['create', '--title', 'T', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    const result = runCli(['next', '--claim'], { cwd: projectDir });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('--claim requires --agent');
  });

  test('auto-claims and starts the task', () => {
    runCli(['create', '--title', 'Auto-claim task', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    // Put task in ready state by claiming and unclaiming
    runCli(['claim', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    runCli(['unclaim', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });

    const result = runCli(['next', '--claim', '--agent', 'auto-agent'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Claimed and started');
    expect(result.stdout).toContain('TASK-001');

    // Verify task is now in_progress
    const show = runCli(['show', 'TASK-001'], { cwd: projectDir, env: { AITASKS_JSON: 'true' } });
    const parsed = JSON.parse(show.stdout);
    expect(parsed.data.status).toBe('in_progress');
    expect(parsed.data.assigned_to).toBe('auto-agent');
  });
});

// ─── Bulk operations ──────────────────────────────────────────────────────────

describe('bulk operations', () => {
  test('done accepts multiple task IDs', () => {
    runCli(['create', '--title', 'T1', '--desc', 'Task description', '--ac', 'AC1'], { cwd: projectDir });
    runCli(['create', '--title', 'T2', '--desc', 'Task description', '--ac', 'AC2'], { cwd: projectDir });
    runCli(['start', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    runCli(['start', 'TASK-002', '--agent', 'agent-a'], { cwd: projectDir });
    runCli(['check', 'TASK-001', '0', '--evidence', 'proof', '--agent', 'agent-a'], { cwd: projectDir });
    runCli(['check', 'TASK-002', '0', '--evidence', 'proof', '--agent', 'agent-a'], { cwd: projectDir });

    const result = runCli(['done', 'TASK-001', 'TASK-002', '--agent', 'agent-a'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('TASK-001 is DONE');
    expect(result.stdout).toContain('TASK-002 is DONE');
  });

  test('claim accepts multiple task IDs', () => {
    runCli(['create', '--title', 'T1', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    runCli(['create', '--title', 'T2', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });

    const result = runCli(['claim', 'TASK-001', 'TASK-002', '--agent', 'multi-agent'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Claimed TASK-001');
    expect(result.stdout).toContain('Claimed TASK-002');
  });

  test('start accepts multiple task IDs', () => {
    runCli(['create', '--title', 'T1', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    runCli(['create', '--title', 'T2', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    runCli(['claim', 'TASK-001', 'TASK-002', '--agent', 'agent-a'], { cwd: projectDir });

    const result = runCli(['start', 'TASK-001', 'TASK-002', '--agent', 'agent-a'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Started TASK-001');
    expect(result.stdout).toContain('Started TASK-002');
  });

  test('bulk done outputs JSON with results array', () => {
    runCli(['create', '--title', 'T1', '--desc', 'Task description', '--ac', 'AC1'], { cwd: projectDir });
    runCli(['create', '--title', 'T2', '--desc', 'Task description', '--ac', 'AC2'], { cwd: projectDir });
    runCli(['start', 'TASK-001', 'TASK-002', '--agent', 'agent-a'], { cwd: projectDir });
    runCli(['check', 'TASK-001', '0', '--evidence', 'proof', '--agent', 'agent-a'], { cwd: projectDir });
    runCli(['check', 'TASK-002', '0', '--evidence', 'proof', '--agent', 'agent-a'], { cwd: projectDir });

    const result = runCli(['done', 'TASK-001', 'TASK-002', '--agent', 'agent-a'], {
      cwd: projectDir,
      env: { AITASKS_JSON: 'true' },
    });
    const parsed = JSON.parse(result.stdout);
    expect(parsed.data.results).toHaveLength(2);
    expect(parsed.data.results.every((r: any) => r.success)).toBe(true);
  });
});

// ─── deps command ─────────────────────────────────────────────────────────────

describe('aitasks deps', () => {
  test('shows dependency tree', () => {
    runCli(['create', '--title', 'Blocker', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    runCli(['create', '--title', 'Dependent', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    runCli(['block', 'TASK-002', '--on', 'TASK-001'], { cwd: projectDir });

    const result = runCli(['deps', 'TASK-002'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Blocked By');
    expect(result.stdout).toContain('TASK-001');
  });

  test('shows downstream dependencies', () => {
    runCli(['create', '--title', 'Blocker', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    runCli(['create', '--title', 'Dependent', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    runCli(['block', 'TASK-002', '--on', 'TASK-001'], { cwd: projectDir });

    const result = runCli(['deps', 'TASK-001'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Blocks');
    expect(result.stdout).toContain('TASK-002');
  });

  test('outputs JSON with upstream and downstream', () => {
    runCli(['create', '--title', 'Blocker', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    runCli(['create', '--title', 'Dependent', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    runCli(['block', 'TASK-002', '--on', 'TASK-001'], { cwd: projectDir });

    const result = runCli(['deps', 'TASK-002', '--json'], { cwd: projectDir });
    const parsed = JSON.parse(result.stdout);
    expect(parsed.success).toBe(true);
    expect(parsed.data.upstream).toContain('TASK-001');
    expect(parsed.data.downstream).toEqual([]);
  });
});

// ─── search command ───────────────────────────────────────────────────────────

describe('aitasks search', () => {
  test('finds tasks by title', () => {
    runCli(['create', '--title', 'Authentication system', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    runCli(['create', '--title', 'Database setup', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });

    const result = runCli(['search', 'auth'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Authentication');
    expect(result.stdout).not.toContain('Database');
  });

  test('finds tasks by description', () => {
    runCli(['create', '--title', 'T1', '--desc', 'Implement user login with JWT', '--ac', 'AC'], { cwd: projectDir });
    runCli(['create', '--title', 'T2', '--desc', 'Setup database', '--ac', 'AC'], { cwd: projectDir });

    const result = runCli(['search', 'login'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('T1');
  });

  test('returns empty when no matches', () => {
    runCli(['create', '--title', 'Task one', '--desc', 'Description one', '--ac', 'AC'], { cwd: projectDir });

    const result = runCli(['search', 'nonexistent'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No tasks found');
  });

  test('search requires query argument', () => {
    const result = runCli(['search'], { cwd: projectDir });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('missing required argument');
  });
});

// ─── undo command ─────────────────────────────────────────────────────────────

describe('aitasks undo', () => {
  test('undo claimed task', () => {
    runCli(['create', '--title', 'T', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    runCli(['claim', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });

    const result = runCli(['undo', 'TASK-001'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Undone: claimed');

    // Verify task is now unclaimed
    const show = runCli(['show', 'TASK-001'], { cwd: projectDir, env: { AITASKS_JSON: 'true' } });
    const parsed = JSON.parse(show.stdout);
    expect(parsed.data.assigned_to).toBeNull();
  });

  test('undo started task', () => {
    runCli(['create', '--title', 'T', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    runCli(['claim', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    runCli(['start', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });

    const result = runCli(['undo', 'TASK-001'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Undone: started');

    // Verify task is back to ready
    const show = runCli(['show', 'TASK-001'], { cwd: projectDir, env: { AITASKS_JSON: 'true' } });
    const parsed = JSON.parse(show.stdout);
    expect(parsed.data.status).toBe('ready');
    expect(parsed.data.started_at).toBeNull();
  });

  test('undo completed task', () => {
    runCli(['create', '--title', 'T', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    runCli(['start', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    runCli(['check', 'TASK-001', '0', '--evidence', 'proof', '--agent', 'agent-a'], { cwd: projectDir });
    runCli(['done', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });

    const result = runCli(['undo', 'TASK-001'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Undone: completed');

    // Verify task is back to in_progress
    const show = runCli(['show', 'TASK-001'], { cwd: projectDir, env: { AITASKS_JSON: 'true' } });
    const parsed = JSON.parse(show.stdout);
    expect(parsed.data.status).toBe('in_progress');
    expect(parsed.data.completed_at).toBeNull();
  });

  test('undo criterion checked', () => {
    runCli(['create', '--title', 'T', '--desc', 'Task description', '--ac', 'AC1', '--ac', 'AC2'], { cwd: projectDir });
    runCli(['start', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    runCli(['check', 'TASK-001', '0', '--evidence', 'proof', '--agent', 'agent-a'], { cwd: projectDir });

    // Undo the last action (criterion_checked)
    const result = runCli(['undo', 'TASK-001'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Undone: criterion_checked');

    // Verify criterion is no longer checked
    const show = runCli(['show', 'TASK-001'], { cwd: projectDir, env: { AITASKS_JSON: 'true' } });
    const parsed = JSON.parse(show.stdout);
    expect(parsed.data.test_results).toHaveLength(0);
  });

  test('undo note added', () => {
    runCli(['create', '--title', 'T', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    runCli(['claim', 'TASK-001', '--agent', 'agent-a'], { cwd: projectDir });
    runCli(['note', 'TASK-001', 'Test note content', '--agent', 'agent-a'], { cwd: projectDir });

    // Undo the last action (note_added)
    const result = runCli(['undo', 'TASK-001'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Undone: note_added');

    // Verify note is removed
    const show = runCli(['show', 'TASK-001'], { cwd: projectDir, env: { AITASKS_JSON: 'true' } });
    const parsed = JSON.parse(show.stdout);
    expect(parsed.data.implementation_notes).toHaveLength(0);
  });
});

// ─── Pattern matching ─────────────────────────────────────────────────────────

describe('pattern matching', () => {
  test('claim with exact task IDs', () => {
    runCli(['create', '--title', 'T1', '--desc', 'desc', '--ac', 'AC'], { cwd: projectDir });
    runCli(['create', '--title', 'T2', '--desc', 'desc', '--ac', 'AC'], { cwd: projectDir });

    const result = runCli(['claim', 'TASK-001', 'TASK-002', '--agent', 'pattern-agent'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Claimed TASK-001');
    expect(result.stdout).toContain('Claimed TASK-002');
  });

  test('wildcard pattern matches multiple tasks', () => {
    // TASK-0* matches all TASK-00x tasks since * matches any characters
    runCli(['create', '--title', 'T1', '--desc', 'desc', '--ac', 'AC'], { cwd: projectDir });
    runCli(['create', '--title', 'T2', '--desc', 'desc', '--ac', 'AC'], { cwd: projectDir });
    runCli(['create', '--title', 'T3', '--desc', 'desc', '--ac', 'AC'], { cwd: projectDir });

    const result = runCli(['claim', 'TASK-0*', '--agent', 'wildcard-agent'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Claimed TASK-001');
    expect(result.stdout).toContain('Claimed TASK-002');
    expect(result.stdout).toContain('Claimed TASK-003');
  });

  test('done with wildcard pattern', () => {
    runCli(['create', '--title', 'T1', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    runCli(['create', '--title', 'T2', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });
    runCli(['start', 'TASK-001', 'TASK-002', '--agent', 'agent-a'], { cwd: projectDir });
    runCli(['check', 'TASK-001', '0', '--evidence', 'proof', '--agent', 'agent-a'], { cwd: projectDir });
    runCli(['check', 'TASK-002', '0', '--evidence', 'proof', '--agent', 'agent-a'], { cwd: projectDir });

    const result = runCli(['done', 'TASK-0*', '--agent', 'agent-a'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('TASK-001 is DONE');
    expect(result.stdout).toContain('TASK-002 is DONE');
  });

  test('pattern with no matches', () => {
    runCli(['create', '--title', 'T', '--desc', 'Task description', '--ac', 'AC'], { cwd: projectDir });

    const result = runCli(['claim', 'TASK-99*', '--agent', 'agent-a'], { cwd: projectDir });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('No tasks match');
  });
});

// ─── delete command ───────────────────────────────────────────────────────────

describe('aitasks delete', () => {
  test('delete a single task by ID', () => {
    runCli(['create', '--title', 'To delete', '--desc', 'Task to delete', '--ac', 'AC'], { cwd: projectDir });
    const result = runCli(['delete', 'TASK-001'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Deleted');
    expect(result.stdout).toContain('TASK-001');

    // Verify task is gone
    const list = runCli(['list'], { cwd: projectDir });
    expect(list.stdout).not.toContain('TASK-001');
  });

  test('delete fails for non-existent task', () => {
    const result = runCli(['delete', 'TASK-999'], { cwd: projectDir });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('No tasks match');
  });

  test('delete with pattern matching', () => {
    runCli(['create', '--title', 'T1', '--desc', 'desc', '--ac', 'AC'], { cwd: projectDir });
    runCli(['create', '--title', 'T2', '--desc', 'desc', '--ac', 'AC'], { cwd: projectDir });
    runCli(['create', '--title', 'T3', '--desc', 'desc', '--ac', 'AC'], { cwd: projectDir });

    const result = runCli(['delete', 'TASK-0*'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('TASK-001');
    expect(result.stdout).toContain('TASK-002');
    expect(result.stdout).toContain('TASK-003');

    // Verify all are deleted
    const list = runCli(['list'], { cwd: projectDir });
    expect(list.stdout).toContain('No tasks');
  });

  test('delete outputs JSON with --json flag', () => {
    runCli(['create', '--title', 'T1', '--desc', 'desc', '--ac', 'AC'], { cwd: projectDir });
    runCli(['create', '--title', 'T2', '--desc', 'desc', '--ac', 'AC'], { cwd: projectDir });

    const result = runCli(['delete', 'TASK-001', 'TASK-002'], {
      cwd: projectDir,
      env: { AITASKS_JSON: 'true' },
    });
    const parsed = JSON.parse(result.stdout);
    expect(parsed.success).toBe(true);
    expect(parsed.data.deleted).toContain('TASK-001');
    expect(parsed.data.deleted).toContain('TASK-002');
    expect(parsed.data.deletedCount).toBe(2);
  });

  test('cannot delete task with subtasks', () => {
    runCli(['create', '--title', 'Parent', '--desc', 'Parent task', '--ac', 'AC'], { cwd: projectDir });
    runCli(['create', '--title', 'Subtask', '--desc', 'Sub', '--ac', 'AC', '--parent', 'TASK-001'], { cwd: projectDir });

    const result = runCli(['delete', 'TASK-001'], { cwd: projectDir });
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain('subtask');

    // Parent should still exist
    const show = runCli(['show', 'TASK-001'], { cwd: projectDir, env: { AITASKS_JSON: 'true' } });
    const parsed = JSON.parse(show.stdout);
    expect(parsed.data.id).toBe('TASK-001');
  });

  test('delete removes task from other tasks blocked_by', () => {
    runCli(['create', '--title', 'Blocker', '--desc', 'desc', '--ac', 'AC'], { cwd: projectDir });
    runCli(['create', '--title', 'Blocked', '--desc', 'desc', '--ac', 'AC'], { cwd: projectDir });
    runCli(['block', 'TASK-002', '--on', 'TASK-001'], { cwd: projectDir });

    // Verify TASK-002 is blocked
    let show = runCli(['show', 'TASK-002'], { cwd: projectDir, env: { AITASKS_JSON: 'true' } });
    let parsed = JSON.parse(show.stdout);
    expect(parsed.data.status).toBe('blocked');

    // Delete the blocker
    runCli(['delete', 'TASK-001'], { cwd: projectDir });

    // TASK-002 should now be ready
    show = runCli(['show', 'TASK-002'], { cwd: projectDir, env: { AITASKS_JSON: 'true' } });
    parsed = JSON.parse(show.stdout);
    expect(parsed.data.status).toBe('ready');
    expect(parsed.data.blocked_by).toEqual([]);
  });

  test('delete removes task from other tasks blocks', () => {
    runCli(['create', '--title', 'Blocker', '--desc', 'desc', '--ac', 'AC'], { cwd: projectDir });
    runCli(['create', '--title', 'Blocked', '--desc', 'desc', '--ac', 'AC'], { cwd: projectDir });
    runCli(['block', 'TASK-002', '--on', 'TASK-001'], { cwd: projectDir });

    // Delete the blocked task
    runCli(['delete', 'TASK-002'], { cwd: projectDir });

    // TASK-001 should no longer have TASK-002 in its blocks
    const show = runCli(['show', 'TASK-001'], { cwd: projectDir, env: { AITASKS_JSON: 'true' } });
    const parsed = JSON.parse(show.stdout);
    expect(parsed.data.blocks).toEqual([]);
  });
});

// ─── Pattern matching ─────────────────────────────────────────────────────────
