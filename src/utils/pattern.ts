/**
 * Expands a pattern like "TASK-00*" to matching task IDs.
 * Supports * wildcard (matches any characters).
 */
export function expandPattern(pattern: string, existingIds: string[]): string[] {
  // If no wildcard, return as-is if it exists
  if (!pattern.includes('*')) {
    return existingIds.includes(pattern) ? [pattern] : [];
  }

  // Convert glob-like pattern to regex
  const regexPattern = '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
  const regex = new RegExp(regexPattern, 'i');

  return existingIds.filter(id => regex.test(id));
}

/**
 * Checks if a string is a pattern (contains wildcards)
 */
export function isPattern(str: string): boolean {
  return str.includes('*');
}

/**
 * Resolves task IDs - expands patterns or returns single ID
 */
export function resolveTaskIds(input: string | string[], existingIds: string[]): string[] {
  const inputs = Array.isArray(input) ? input : [input];
  const result: string[] = [];

  for (const item of inputs) {
    if (isPattern(item)) {
      result.push(...expandPattern(item, existingIds));
    } else {
      result.push(item);
    }
  }

  return result;
}
