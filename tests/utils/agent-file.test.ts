import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  findExistingAgentFile,
  injectOrCreateAgentFile,
  appendToSpecificFile,
} from '../../src/utils/agent-file.js';
import {
  INSTRUCTIONS_START_MARKER,
  INSTRUCTIONS_END_MARKER,
} from '../../src/utils/instructions.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'aitasks-agentfile-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('findExistingAgentFile', () => {
  test('returns null when no agent files exist', () => {
    expect(findExistingAgentFile(testDir)).toBeNull();
  });

  test('finds CLAUDE.md', () => {
    const p = join(testDir, 'CLAUDE.md');
    writeFileSync(p, '# Claude\n');
    expect(findExistingAgentFile(testDir)).toBe(p);
  });

  test('finds AGENTS.md', () => {
    const p = join(testDir, 'AGENTS.md');
    writeFileSync(p, '# Agents\n');
    expect(findExistingAgentFile(testDir)).toBe(p);
  });

  test('finds GEMINI.md', () => {
    const p = join(testDir, 'GEMINI.md');
    writeFileSync(p, '# Gemini\n');
    expect(findExistingAgentFile(testDir)).toBe(p);
  });

  test('prefers CLAUDE.md over AGENTS.md', () => {
    writeFileSync(join(testDir, 'CLAUDE.md'), '# Claude\n');
    writeFileSync(join(testDir, 'AGENTS.md'), '# Agents\n');
    const result = findExistingAgentFile(testDir);
    expect(result).toContain('CLAUDE.md');
  });
});

describe('injectOrCreateAgentFile', () => {
  test('creates AGENTS.md when no agent file exists', () => {
    const result = injectOrCreateAgentFile(testDir, '1.0.0');
    expect(result.action).toBe('created');
    expect(result.filePath).toContain('AGENTS.md');
    expect(existsSync(result.filePath)).toBe(true);
  });

  test('created file contains the instructions marker', () => {
    injectOrCreateAgentFile(testDir, '1.0.0');
    const content = readFileSync(join(testDir, 'AGENTS.md'), 'utf8');
    expect(content).toContain(INSTRUCTIONS_START_MARKER);
  });

  test('appends to existing CLAUDE.md when marker is absent', () => {
    const p = join(testDir, 'CLAUDE.md');
    writeFileSync(p, '# Existing content\n');
    const result = injectOrCreateAgentFile(testDir, '1.0.0');
    expect(result.action).toBe('appended');
    expect(result.filePath).toBe(p);
    const content = readFileSync(p, 'utf8');
    expect(content).toContain('# Existing content');
    expect(content).toContain(INSTRUCTIONS_START_MARKER);
  });

  test('does not duplicate instructions when marker already present', () => {
    const p = join(testDir, 'AGENTS.md');
    writeFileSync(p, `# Existing\n\n${INSTRUCTIONS_START_MARKER}\nold stuff\n`);
    const result = injectOrCreateAgentFile(testDir, '1.0.0');
    expect(result.action).toBe('skipped');
    const content = readFileSync(p, 'utf8');
    const count = (content.match(new RegExp(INSTRUCTIONS_START_MARKER.replace(/[<>!-]/g, '\\$&'), 'g')) ?? []).length;
    expect(count).toBe(1);
  });

  test('preserves existing content when appending', () => {
    const p = join(testDir, 'CLAUDE.md');
    const existing = '# My Project\n\nSome important notes here.\n';
    writeFileSync(p, existing);
    injectOrCreateAgentFile(testDir, '1.0.0');
    const content = readFileSync(p, 'utf8');
    expect(content.startsWith('# My Project')).toBe(true);
  });
});

describe('injectOrCreateAgentFile — force replace', () => {
  test('replaces instructions block when force=true and marker already present', () => {
    const p = join(testDir, 'AGENTS.md');
    const oldBlock = `${INSTRUCTIONS_START_MARKER}\nOLD CONTENT\n${INSTRUCTIONS_END_MARKER}`;
    writeFileSync(p, `# Project\n\n${oldBlock}\n`);
    const result = injectOrCreateAgentFile(testDir, '1.0.0', false, true);
    expect(result.action).toBe('appended');
    const content = readFileSync(p, 'utf8');
    expect(content).not.toContain('OLD CONTENT');
    expect(content).toContain(INSTRUCTIONS_START_MARKER);
    expect(content).toContain(INSTRUCTIONS_END_MARKER);
  });

  test('force replace preserves content before the instructions block', () => {
    const p = join(testDir, 'AGENTS.md');
    const oldBlock = `${INSTRUCTIONS_START_MARKER}\nOLD\n${INSTRUCTIONS_END_MARKER}`;
    writeFileSync(p, `# My Project\n\nSome notes.\n\n${oldBlock}\n`);
    injectOrCreateAgentFile(testDir, '1.0.0', false, true);
    const content = readFileSync(p, 'utf8');
    expect(content).toContain('# My Project');
    expect(content).toContain('Some notes.');
  });

  test('force replace preserves content after the instructions block', () => {
    const p = join(testDir, 'AGENTS.md');
    const oldBlock = `${INSTRUCTIONS_START_MARKER}\nOLD\n${INSTRUCTIONS_END_MARKER}`;
    writeFileSync(p, `${oldBlock}\n\n## Footer section\n`);
    injectOrCreateAgentFile(testDir, '1.0.0', false, true);
    const content = readFileSync(p, 'utf8');
    expect(content).toContain('## Footer section');
  });

  test('force replace injects review-aware instructions', () => {
    const p = join(testDir, 'AGENTS.md');
    const oldBlock = `${INSTRUCTIONS_START_MARKER}\nOLD\n${INSTRUCTIONS_END_MARKER}`;
    writeFileSync(p, oldBlock + '\n');
    injectOrCreateAgentFile(testDir, '1.0.0', true /* reviewRequired */, true);
    const content = readFileSync(p, 'utf8');
    expect(content).toContain('REVIEW REQUIRED');
  });

  test('without force, skips even when review content differs', () => {
    const p = join(testDir, 'AGENTS.md');
    const oldBlock = `${INSTRUCTIONS_START_MARKER}\nOLD\n${INSTRUCTIONS_END_MARKER}`;
    writeFileSync(p, oldBlock + '\n');
    const result = injectOrCreateAgentFile(testDir, '1.0.0', true, false);
    expect(result.action).toBe('skipped');
    const content = readFileSync(p, 'utf8');
    expect(content).toContain('OLD');
  });

  test('no duplicate markers after force replace', () => {
    const p = join(testDir, 'AGENTS.md');
    const oldBlock = `${INSTRUCTIONS_START_MARKER}\nOLD\n${INSTRUCTIONS_END_MARKER}`;
    writeFileSync(p, oldBlock + '\n');
    injectOrCreateAgentFile(testDir, '1.0.0', false, true);
    const content = readFileSync(p, 'utf8');
    const startCount = (content.match(new RegExp(INSTRUCTIONS_START_MARKER.replace(/[<>!-]/g, '\\$&'), 'g')) ?? []).length;
    expect(startCount).toBe(1);
  });
});

describe('appendToSpecificFile', () => {
  test('creates the file if it does not exist', () => {
    const p = join(testDir, 'MY_AGENTS.md');
    const result = appendToSpecificFile(p, '1.0.0');
    expect(result.action).toBe('created');
    expect(existsSync(p)).toBe(true);
  });

  test('appends to existing file without marker', () => {
    const p = join(testDir, 'MY_AGENTS.md');
    writeFileSync(p, 'existing content\n');
    const result = appendToSpecificFile(p, '1.0.0');
    expect(result.action).toBe('appended');
    const content = readFileSync(p, 'utf8');
    expect(content).toContain('existing content');
    expect(content).toContain(INSTRUCTIONS_START_MARKER);
  });

  test('skips when marker already present', () => {
    const p = join(testDir, 'MY_AGENTS.md');
    writeFileSync(p, `${INSTRUCTIONS_START_MARKER}\ncontent\n`);
    const result = appendToSpecificFile(p, '1.0.0');
    expect(result.action).toBe('skipped');
  });
});
