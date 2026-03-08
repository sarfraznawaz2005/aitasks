import { mkdtempSync, rmSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Database } from 'bun:sqlite';
import { createFreshDb, _resetForTesting } from '../src/db/index.js';

export interface TestContext {
  dir: string;
  db: Database;
}

/**
 * Creates an isolated temporary directory with a fresh AITasks DB.
 * Call this in beforeEach. Pair with cleanupTestContext in afterEach.
 */
export function createTestContext(): TestContext {
  const dir = mkdtempSync(join(tmpdir(), 'aitasks-test-'));
  const db = createFreshDb(dir);
  return { dir, db };
}

/**
 * Closes the DB and removes the temp directory.
 * On Windows, SQLite WAL/SHM files may stay locked briefly after close —
 * we attempt to remove them explicitly first, then fall back silently.
 */
export function cleanupTestContext(ctx: TestContext): void {
  _resetForTesting();

  // Remove WAL and SHM files explicitly before deleting the directory.
  // On Windows these can remain locked briefly after db.close().
  const dbBase = join(ctx.dir, 'db.sqlite');
  for (const suffix of ['-wal', '-shm']) {
    const f = dbBase + suffix;
    if (existsSync(f)) try { unlinkSync(f); } catch {}
  }

  try {
    rmSync(ctx.dir, { recursive: true, force: true });
  } catch {
    // On Windows, any remaining locked WAL files are cleaned up by the OS — not fatal.
  }
}

/**
 * Spawn the aitasks CLI against a given project root directory.
 * Returns { stdout, stderr, exitCode }.
 */
export function runCli(
  args: string[],
  opts: { cwd?: string; env?: Record<string, string> } = {}
): { stdout: string; stderr: string; exitCode: number } {
  const cliPath = join(import.meta.dir, '../src/index.ts');

  const result = Bun.spawnSync(['bun', 'run', cliPath, ...args], {
    cwd: opts.cwd ?? process.cwd(),
    env: {
      ...process.env,
      // Suppress colour codes in CLI output for easier assertions
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      ...opts.env,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode ?? 0,
  };
}

/**
 * Creates a temp project directory, runs `aitasks init` in it, and returns
 * the path. Use for CLI integration tests.
 */
export function createInitedProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'aitasks-cli-'));
  const result = runCli(['init'], { cwd: dir });
  if (result.exitCode !== 0) {
    throw new Error(`aitasks init failed:\n${result.stderr}`);
  }
  return dir;
}

export function removeProject(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
