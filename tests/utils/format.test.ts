import { describe, test, expect } from 'bun:test';
import { truncate, wrapText, terminalWidth, formatDate, formatTime, timeAgo } from '../../src/utils/format.js';

describe('truncate', () => {
  test('returns string unchanged when shorter than maxLen', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  test('returns string unchanged when exactly maxLen', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  test('truncates and adds ellipsis when longer than maxLen', () => {
    const result = truncate('hello world', 8);
    expect(result.length).toBe(8);
    expect(result.endsWith('…')).toBe(true);
  });

  test('truncates to exactly maxLen characters', () => {
    const result = truncate('abcdefghij', 5);
    expect(result.length).toBe(5);
  });

  test('handles empty string', () => {
    expect(truncate('', 5)).toBe('');
  });
});

describe('wrapText', () => {
  test('wraps long text at word boundary', () => {
    const text = 'one two three four five six';
    const result = wrapText(text, 15);
    const lines = result.split('\n');
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(15);
    }
  });

  test('preserves all words after wrapping', () => {
    const text = 'the quick brown fox jumps over the lazy dog';
    const result = wrapText(text, 20);
    // All words should still be present
    expect(result.replace(/\n/g, ' ').trim()).toBe(text);
  });

  test('applies indent to each line', () => {
    const result = wrapText('one two three four', 12, '  ');
    const lines = result.split('\n');
    for (const line of lines) {
      expect(line.startsWith('  ')).toBe(true);
    }
  });

  test('returns single line for short text', () => {
    const result = wrapText('hello', 80);
    expect(result.includes('\n')).toBe(false);
  });
});

describe('terminalWidth', () => {
  test('returns a positive number', () => {
    const w = terminalWidth();
    expect(w).toBeGreaterThan(0);
  });

  test('returns no more than 120', () => {
    expect(terminalWidth()).toBeLessThanOrEqual(120);
  });
});

describe('formatDate', () => {
  test('returns a formatted date string', () => {
    const ts = new Date('2026-03-08T14:30:00Z').getTime();
    const result = formatDate(ts);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    // Should contain year
    expect(result).toContain('2026');
  });
});

describe('formatTime', () => {
  test('returns HH:mm format string', () => {
    const result = formatTime(Date.now());
    expect(/^\d{2}:\d{2}$/.test(result)).toBe(true);
  });
});

describe('timeAgo', () => {
  test('returns a relative time string', () => {
    const recent = Date.now() - 5000;
    const result = timeAgo(recent);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('indicates past time with "ago"', () => {
    const past = Date.now() - 60_000;
    expect(timeAgo(past)).toContain('ago');
  });
});
