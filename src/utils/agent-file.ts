import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  getAgentInstructions,
  instructionsAlreadyPresent,
  INSTRUCTIONS_START_MARKER,
  INSTRUCTIONS_END_MARKER,
} from './instructions.js';

const CANDIDATE_FILES = ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md'];

export interface AgentFileResult {
  filePath: string;
  action: 'created' | 'appended' | 'skipped';
}

export function findExistingAgentFile(projectRoot: string): string | null {
  for (const name of CANDIDATE_FILES) {
    const p = join(projectRoot, name);
    if (existsSync(p)) return p;
  }
  return null;
}

export function injectOrCreateAgentFile(
  projectRoot: string,
  version: string,
  reviewRequired = false,
  force = false
): AgentFileResult {
  const instructions = getAgentInstructions(version, { reviewRequired });
  const existing = findExistingAgentFile(projectRoot);

  if (existing) {
    const content = readFileSync(existing, 'utf8');
    if (instructionsAlreadyPresent(content)) {
      if (!force) return { filePath: existing, action: 'skipped' };
      // Replace the existing instructions block with updated ones
      const replaced = replaceInstructionsBlock(content, instructions);
      writeFileSync(existing, replaced, 'utf8');
      return { filePath: existing, action: 'appended' };
    }
    // Append with a blank line separator
    const separator = content.endsWith('\n') ? '\n' : '\n\n';
    writeFileSync(existing, content + separator + instructions + '\n', 'utf8');
    return { filePath: existing, action: 'appended' };
  }

  // None found — create AGENTS.md
  const newPath = join(projectRoot, 'AGENTS.md');
  writeFileSync(newPath, instructions + '\n', 'utf8');
  return { filePath: newPath, action: 'created' };
}

function replaceInstructionsBlock(content: string, newInstructions: string): string {
  const start = content.indexOf(INSTRUCTIONS_START_MARKER);
  const end = content.indexOf(INSTRUCTIONS_END_MARKER);
  if (start === -1 || end === -1) return content;
  const before = content.slice(0, start).replace(/\n+$/, '');
  const after = content.slice(end + INSTRUCTIONS_END_MARKER.length).replace(/^\n+/, '');
  const sep = before.length > 0 ? '\n\n' : '';
  const tail = after.length > 0 ? '\n\n' + after : '\n';
  return before + sep + newInstructions + '\n' + tail;
}

export function appendToSpecificFile(
  filePath: string,
  version: string,
  reviewRequired = false
): AgentFileResult {
  const instructions = getAgentInstructions(version, { reviewRequired });

  if (!existsSync(filePath)) {
    writeFileSync(filePath, instructions + '\n', 'utf8');
    return { filePath, action: 'created' };
  }

  const content = readFileSync(filePath, 'utf8');
  if (instructionsAlreadyPresent(content)) {
    return { filePath, action: 'skipped' };
  }

  const separator = content.endsWith('\n') ? '\n' : '\n\n';
  writeFileSync(filePath, content + separator + instructions + '\n', 'utf8');
  return { filePath, action: 'appended' };
}
