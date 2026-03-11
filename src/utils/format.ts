import { formatDistanceToNowStrict, format } from 'date-fns';

export function timeAgo(timestamp: number): string {
  return formatDistanceToNowStrict(new Date(timestamp), { addSuffix: true });
}

/** Compact version: "31m ago", "2h ago", "1d ago", "3mo ago", "1y ago" */
export function shortTimeAgo(timestamp: number): string {
  const s = formatDistanceToNowStrict(new Date(timestamp));
  return s
    .replace(/(\d+) seconds?/, '$1s')
    .replace(/(\d+) minutes?/, '$1m')
    .replace(/(\d+) hours?/, '$1h')
    .replace(/(\d+) days?/, '$1d')
    .replace(/(\d+) months?/, '$1mo')
    .replace(/(\d+) years?/, '$1y') + ' ago';
}

export function formatDate(timestamp: number): string {
  return format(new Date(timestamp), 'yyyy-MM-dd HH:mm');
}

export function formatTime(timestamp: number): string {
  return format(new Date(timestamp), 'HH:mm');
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

export function padEnd(str: string, len: number): string {
  return str.padEnd(len, ' ');
}

export function wrapText(text: string, width: number, indent = ''): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = indent;

  for (const word of words) {
    if (current.length + word.length + 1 > width && current.trim().length > 0) {
      lines.push(current);
      current = indent + word;
    } else {
      current = current.length === indent.length ? indent + word : current + ' ' + word;
    }
  }

  if (current.trim().length > 0) lines.push(current);
  return lines.join('\n');
}

export function terminalWidth(): number {
  return process.stdout.columns ?? 100;
}

/**
 * Format duration between two timestamps in human-readable format
 * e.g., "2h 34m", "1d 5h", "45m", "3d"
 */
export function formatDuration(start: number, end?: number): string {
  const endMs = end ?? Date.now();
  const diffMs = endMs - start;

  if (diffMs <= 0) return '0m';

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
    const remainingHours = hours % 24;
    if (remainingHours > 0) parts.push(`${remainingHours}h`);
  } else if (hours > 0) {
    parts.push(`${hours}h`);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes > 0) parts.push(`${remainingMinutes}m`);
  } else if (minutes > 0) {
    parts.push(`${minutes}m`);
    const remainingSeconds = seconds % 60;
    if (remainingSeconds > 0 && parts.length === 0) parts.push(`${remainingSeconds}s`);
  } else {
    parts.push(`${seconds}s`);
  }

  return parts.join(' ');
}
