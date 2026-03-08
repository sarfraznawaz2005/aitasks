import { existsSync } from 'fs';
import { join, dirname } from 'path';

const ROOT_MARKERS = [
  '.aitasks',
  'package.json',
  'Cargo.toml',
  'pyproject.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  '.git',
];

export function findProjectRoot(startDir?: string): string {
  let current = startDir ?? process.cwd();

  while (true) {
    for (const marker of ROOT_MARKERS) {
      if (existsSync(join(current, marker))) {
        return current;
      }
    }

    const parent = dirname(current);
    if (parent === current) {
      // Reached filesystem root — fall back to cwd
      return process.cwd();
    }
    current = parent;
  }
}
