import { describe, test, expect } from 'bun:test';
import {
  getAgentInstructions,
  instructionsAlreadyPresent,
  INSTRUCTIONS_START_MARKER,
  INSTRUCTIONS_END_MARKER,
} from '../../src/utils/instructions.js';

const INSTRUCTIONS = getAgentInstructions('1.0.0');

describe('getAgentInstructions', () => {
  test('contains the start marker', () => {
    expect(INSTRUCTIONS).toContain(INSTRUCTIONS_START_MARKER);
  });

  test('contains the end marker', () => {
    expect(INSTRUCTIONS).toContain(INSTRUCTIONS_END_MARKER);
  });

  test('start marker comes before end marker', () => {
    const start = INSTRUCTIONS.indexOf(INSTRUCTIONS_START_MARKER);
    const end = INSTRUCTIONS.indexOf(INSTRUCTIONS_END_MARKER);
    expect(start).toBeLessThan(end);
  });

  test('includes the version number', () => {
    expect(INSTRUCTIONS).toContain('1.0.0');
  });

  test('includes key CLI command references', () => {
    expect(INSTRUCTIONS).toContain('aitasks claim');
    expect(INSTRUCTIONS).toContain('aitasks start');
    expect(INSTRUCTIONS).toContain('aitasks note');
    expect(INSTRUCTIONS).toContain('aitasks check');
    expect(INSTRUCTIONS).toContain('aitasks done');
    expect(INSTRUCTIONS).toContain('aitasks next');
  });

  test('includes AITASKS_AGENT_ID env var reference', () => {
    expect(INSTRUCTIONS).toContain('AITASKS_AGENT_ID');
  });

  test('includes --evidence flag reference', () => {
    expect(INSTRUCTIONS).toContain('--evidence');
  });

  test('differs when version changes', () => {
    const v2 = getAgentInstructions('2.0.0');
    expect(v2).toContain('2.0.0');
    expect(v2).not.toContain('v1.0.0');
  });
});

describe('instructionsAlreadyPresent', () => {
  test('returns true when content contains start marker', () => {
    const content = `# My File\n\n${INSTRUCTIONS_START_MARKER}\nsome content\n${INSTRUCTIONS_END_MARKER}`;
    expect(instructionsAlreadyPresent(content)).toBe(true);
  });

  test('returns false when content does not contain marker', () => {
    const content = '# My File\n\nSome other content\n';
    expect(instructionsAlreadyPresent(content)).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(instructionsAlreadyPresent('')).toBe(false);
  });
});
