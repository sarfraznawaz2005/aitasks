import React from 'react';
import { Box, Text, renderToString } from 'ink';
import type { Task, TaskStatus, TaskPriority, TaskType } from '../types.js';
import { STATUS_ICON } from './colors.js';
import { timeAgo, shortTimeAgo, terminalWidth } from '../utils/format.js';

const STATUS_COLORS: Record<TaskStatus, string> = {
  backlog:      'white',
  ready:        'blue',
  in_progress:  'yellow',
  blocked:      '#FF5C5C',
  needs_review: 'magenta',
  done:         'green',
};

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  critical: '#FF5C5C',
  high:     '#FF5C5C',
  medium:   'yellow',
  low:      'gray',
};

const TYPE_COLORS: Record<TaskType, string> = {
  feature: 'cyan',
  bug:     '#FF5C5C',
  chore:   'gray',
  spike:   'magenta',
};

// Fixed column widths (each includes 1 char left-padding inside the cell)
const C_ID     = 11;  //  TASK-001  → 10 visible
const C_STATUS = 15;  //  ▶ in_progress → 14 visible
const C_PRI    = 10;  //  critical  → 9 visible
const C_TYPE   =  9;  //  feature  → 8 visible
const C_ASSIGN = 16;  //  agent-id… → 15 visible
const C_UPD    =  9;  //  34m ago → 8 visible
const FIXED    = C_ID + C_STATUS + C_PRI + C_TYPE + C_ASSIGN + C_UPD; // 70
const SEPS     = 8;   // │ chars per row (left + right + 6 between 7 cols)
const MARGIN   = 2;   // marginLeft on the outer container

function titleColWidth(cols: number): number {
  return Math.max(12, cols - MARGIN - FIXED - SEPS);
}

function makeBorder(l: string, sep: string, r: string, tw: number): string {
  return (
    l +
    [C_ID, tw, C_STATUS, C_PRI, C_TYPE, C_ASSIGN, C_UPD]
      .map((w) => '─'.repeat(w))
      .join(sep) +
    r
  );
}

function buildSuffix(task: Task): string {
  const parts: string[] = [];
  if (task.status === 'in_progress' && task.started_at) {
    parts.push(`started ${timeAgo(task.started_at)}`);
  }
  if (task.status === 'blocked' && task.blocked_by.length > 0) {
    parts.push(`waiting: ${task.blocked_by.join(', ')}`);
  }
  if (task.parent_id) {
    parts.push(`sub of ${task.parent_id}`);
  }
  return parts.join(' · ');
}

const Cell: React.FC<{ width: number; children?: React.ReactNode }> = ({ width, children }) => (
  <Box width={width} overflow="hidden" paddingLeft={1}>
    {children}
  </Box>
);

const Sep: React.FC = () => <Text dimColor>│</Text>;

interface RowProps { task: Task; tw: number }

const TaskRow: React.FC<RowProps> = ({ task, tw }) => {
  const suffix      = buildSuffix(task);
  const statusColor = STATUS_COLORS[task.status];
  const priColor    = PRIORITY_COLORS[task.priority];
  const typeColor   = TYPE_COLORS[task.type];
  const icon        = STATUS_ICON[task.status];

  return (
    <Box flexDirection="column">
      <Box>
        <Sep />
        <Cell width={C_ID}><Text bold color="white">{task.id}</Text></Cell>
        <Sep />
        <Cell width={tw}><Text wrap="truncate">{task.title}</Text></Cell>
        <Sep />
        <Cell width={C_STATUS}><Text color={statusColor}>{icon} {task.status}</Text></Cell>
        <Sep />
        <Cell width={C_PRI}>
          <Text color={priColor} bold={task.priority === 'critical'}>{task.priority}</Text>
        </Cell>
        <Sep />
        <Cell width={C_TYPE}><Text color={typeColor}>{task.type}</Text></Cell>
        <Sep />
        <Cell width={C_ASSIGN}>
          {task.assigned_to
            ? <Text color="cyan" wrap="truncate">{task.assigned_to}</Text>
            : <Text dimColor>—</Text>}
        </Cell>
        <Sep />
        <Cell width={C_UPD}><Text>{shortTimeAgo(task.updated_at)}</Text></Cell>
        <Sep />
      </Box>
      {suffix ? (
        <Box>
          <Sep />
          <Cell width={C_ID}></Cell>
          <Sep />
          <Cell width={tw}><Text dimColor wrap="truncate">↳ {suffix}</Text></Cell>
          <Sep />
          <Cell width={C_STATUS}></Cell>
          <Sep />
          <Cell width={C_PRI}></Cell>
          <Sep />
          <Cell width={C_TYPE}></Cell>
          <Sep />
          <Cell width={C_ASSIGN}></Cell>
          <Sep />
          <Cell width={C_UPD}></Cell>
          <Sep />
        </Box>
      ) : null}
    </Box>
  );
};

const TaskTableComponent: React.FC<{ tasks: Task[]; cols: number }> = ({ tasks, cols }) => {
  if (tasks.length === 0) {
    return <Text dimColor>  No tasks found.</Text>;
  }

  const tw = titleColWidth(cols);

  return (
    <Box flexDirection="column" marginLeft={MARGIN}>
      <Text dimColor>{makeBorder('┌', '┬', '┐', tw)}</Text>
      <Box>
        <Sep />
        <Cell width={C_ID}><Text bold color="white">ID</Text></Cell>
        <Sep />
        <Cell width={tw}><Text bold color="white">Title</Text></Cell>
        <Sep />
        <Cell width={C_STATUS}><Text bold color="white">Status</Text></Cell>
        <Sep />
        <Cell width={C_PRI}><Text bold color="white">Priority</Text></Cell>
        <Sep />
        <Cell width={C_TYPE}><Text bold color="white">Type</Text></Cell>
        <Sep />
        <Cell width={C_ASSIGN}><Text bold color="white">Assigned</Text></Cell>
        <Sep />
        <Cell width={C_UPD}><Text bold color="white">Updated</Text></Cell>
        <Sep />
      </Box>
      <Text dimColor>{makeBorder('├', '┼', '┤', tw)}</Text>
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} tw={tw} />
      ))}
      <Text dimColor>{makeBorder('└', '┴', '┘', tw)}</Text>
    </Box>
  );
};

const CompactListComponent: React.FC<{ tasks: Task[] }> = ({ tasks }) => {
  if (tasks.length === 0) {
    return <Text dimColor>  No tasks.</Text>;
  }

  return (
    <Box flexDirection="column" marginLeft={2}>
      {tasks.map((task) => (
        <Box key={task.id}>
          <Box width={12}><Text bold color="white">{task.id}</Text></Box>
          <Box width={15}>
            <Text color={STATUS_COLORS[task.status]}>
              {STATUS_ICON[task.status]} {task.status}
            </Text>
          </Box>
          <Box width={9}>
            <Text color={PRIORITY_COLORS[task.priority]}>{task.priority}</Text>
          </Box>
          <Box flexGrow={1} overflow="hidden">
            <Text wrap="truncate">{task.title}</Text>
          </Box>
          {task.assigned_to ? (
            <Box marginLeft={1}>
              <Text dimColor>→ {task.assigned_to}</Text>
            </Box>
          ) : null}
        </Box>
      ))}
    </Box>
  );
};

export function renderTaskTable(tasks: Task[]): string {
  const cols = Math.max(terminalWidth(), 100);
  return renderToString(<TaskTableComponent tasks={tasks} cols={cols} />, { columns: cols });
}

export function renderCompactList(tasks: Task[]): string {
  const cols = Math.max(terminalWidth(), 100);
  return renderToString(<CompactListComponent tasks={tasks} />, { columns: cols });
}
