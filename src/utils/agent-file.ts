import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  getAgentInstructions,
  instructionsAlreadyPresent,
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
  version: string
): AgentFileResult {
  const instructions = getAgentInstructions(version);
  const existing = findExistingAgentFile(projectRoot);

  if (existing) {
    const content = readFileSync(existing, 'utf8');
    if (instructionsAlreadyPresent(content)) {
      return { filePath: existing, action: 'skipped' };
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

export function appendToSpecificFile(
  filePath: string,
  version: string
): AgentFileResult {
  const instructions = getAgentInstructions(version);

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
