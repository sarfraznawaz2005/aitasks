import chalk, { type ChalkInstance } from 'chalk';
import type { TaskStatus, TaskPriority, TaskType } from '../types.js';

export const STATUS_ICON: Record<TaskStatus, string> = {
  backlog:      '○',
  ready:        '◎',
  in_progress:  '▶',
  blocked:      '⊘',
  review: '◈',
  done:         '✓',
};

export function statusColor(status: TaskStatus): ChalkInstance {
  switch (status) {
    case 'backlog':      return chalk.white;
    case 'ready':        return chalk.blue;
    case 'in_progress':  return chalk.yellow;
    case 'blocked':      return chalk.hex('#FF5C5C');
    case 'review': return chalk.magenta;
    case 'done':         return chalk.green;
  }
}

export function priorityColor(priority: TaskPriority): ChalkInstance {
  switch (priority) {
    case 'critical': return chalk.hex('#FF5C5C').bold;
    case 'high':     return chalk.hex('#FF5C5C');
    case 'medium':   return chalk.yellow;
    case 'low':      return chalk.gray;
  }
}

export function typeColor(type: TaskType): ChalkInstance {
  switch (type) {
    case 'feature': return chalk.cyan;
    case 'bug':     return chalk.hex('#FF5C5C');
    case 'chore':   return chalk.gray;
    case 'spike':   return chalk.magenta;
  }
}

export function colorStatus(status: TaskStatus): string {
  return statusColor(status)(`${STATUS_ICON[status]} ${status}`);
}

export function colorPriority(priority: TaskPriority): string {
  return priorityColor(priority)(priority);
}

export function colorType(type: TaskType): string {
  return typeColor(type)(type);
}

export function colorId(id: string): string {
  return chalk.bold.white(id);
}

export function dim(s: string): string {
  return chalk.dim(s);
}

export function muted(s: string): string {
  return chalk.gray(s);
}

export function success(s: string): string {
  return chalk.green(s);
}

export function error(s: string): string {
  return chalk.hex('#FF5C5C')(s);
}

export function warn(s: string): string {
  return chalk.yellow(s);
}

export function info(s: string): string {
  return chalk.cyan(s);
}

export function bold(s: string): string {
  return chalk.bold(s);
}

export function header(s: string): string {
  return chalk.bold.white(s);
}
