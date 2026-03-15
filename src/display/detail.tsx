import React from 'react';
import { Box, Text, renderToString } from 'ink';
import type { Task, TaskEvent, TaskStatus, TaskPriority, TaskType } from '../types.js';
import { STATUS_ICON } from './colors.js';
import { timeAgo, formatDate, formatTime, terminalWidth, formatDuration } from '../utils/format.js';

const STATUS_COLORS: Record<TaskStatus, string> = {
  backlog:      'white',
  ready:        'blue',
  in_progress:  'yellow',
  blocked:      '#FF5C5C',
  review:       'magenta',
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

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <Box flexDirection="column" marginTop={1}>
    <Text bold dimColor>{title}</Text>
    <Text dimColor>{'─'.repeat(title.length + 2)}</Text>
  </Box>
);

const KV: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <Box>
    <Box width={14}><Text dimColor>{label}</Text></Box>
    {children}
  </Box>
);

const TaskDetailComponent: React.FC<{ task: Task; events?: TaskEvent[] }> = ({ task, events }) => {
  const checkedMap = new Map(task.test_results.map((r) => [r.index, r]));
  const statusColor = STATUS_COLORS[task.status];
  const priColor    = PRIORITY_COLORS[task.priority];
  const typeColor   = TYPE_COLORS[task.type];
  const icon        = STATUS_ICON[task.status];

  return (
    <Box flexDirection="column" paddingLeft={2} marginY={1}>

      {/* ── Header ── */}
      <Box>
        <Text bold color="white">{task.id}</Text>
        <Text>  </Text>
        <Text bold>{task.title}</Text>
      </Box>
      <Text dimColor>{'─'.repeat(60)}</Text>

      {/* ── Meta ── */}
      <Box flexDirection="column" marginTop={1}>
        <KV label="Status">
          <Text color={statusColor}>{icon} {task.status}</Text>
        </KV>
        <KV label="Priority">
          <Text color={priColor} bold={task.priority === 'critical'}>{task.priority}</Text>
        </KV>
        <KV label="Type">
          <Text color={typeColor}>{task.type}</Text>
        </KV>
        <KV label="Assigned">
          {task.assigned_to
            ? <Text color="cyan">{task.assigned_to}</Text>
            : <Text dimColor>—</Text>}
        </KV>
        {task.parent_id ? (
          <KV label="Parent">
            <Text bold color="white">{task.parent_id}</Text>
          </KV>
        ) : null}
        <KV label="Created">
          <Text dimColor>{formatDate(task.created_at)}</Text>
        </KV>
        {task.started_at ? (
          <KV label="Started">
            <Text dimColor>{formatDate(task.started_at)} ({timeAgo(task.started_at)})</Text>
          </KV>
        ) : null}
        {task.completed_at ? (
          <KV label="Completed">
            <Text color="green">{formatDate(task.completed_at)} ({timeAgo(task.completed_at)})</Text>
          </KV>
        ) : null}
        {task.started_at && (
          <KV label="Duration">
            {task.completed_at
              ? <Text color="cyan">{formatDuration(task.started_at, task.completed_at)}</Text>
              : <Text color="cyan">{formatDuration(task.started_at)} (ongoing)</Text>}
          </KV>
        )}
      </Box>

      {/* ── Description ── */}
      <SectionHeader title="Description" />
      <Box marginTop={1}>
        {task.description.trim()
          ? <Text>{task.description.trim()}</Text>
          : <Text dimColor>(no description)</Text>}
      </Box>

      {/* ── Acceptance Criteria ── */}
      <SectionHeader title={`Acceptance Criteria  (${task.test_results.length}/${task.acceptance_criteria.length} verified)`} />
      <Box flexDirection="column" marginTop={1}>
        {task.acceptance_criteria.length === 0 ? (
          <Text dimColor>(none defined)</Text>
        ) : (
          task.acceptance_criteria.map((criterion, i) => {
            const result = checkedMap.get(i);
            return (
              <Box key={i} flexDirection="column" marginBottom={result ? 1 : 0}>
                <Box>
                  {result
                    ? <Text color="green">✓</Text>
                    : <Text color="#FF5C5C">○</Text>}
                  <Text dimColor>  [{i}]  </Text>
                  <Text>{criterion}</Text>
                </Box>
                {result ? (
                  <Box marginLeft={6} flexDirection="column">
                    <Box>
                      <Text dimColor>Evidence:  </Text>
                      <Text dimColor italic>{result.evidence}</Text>
                    </Box>
                    <Box>
                      <Text dimColor>Verified:  </Text>
                      <Text dimColor>{result.agent} at {formatTime(result.checked_at)}</Text>
                    </Box>
                  </Box>
                ) : null}
              </Box>
            );
          })
        )}
      </Box>

      {/* ── Dependencies ── */}
      <SectionHeader title="Dependencies" />
      <Box flexDirection="column" marginTop={1}>
        <KV label="Blocked by">
          {task.blocked_by.length > 0
            ? <Text color="#FF5C5C">{task.blocked_by.join(', ')}</Text>
            : <Text dimColor>none</Text>}
        </KV>
        <KV label="Blocks">
          {task.blocks.length > 0
            ? <Text color="yellow">{task.blocks.join(', ')}</Text>
            : <Text dimColor>none</Text>}
        </KV>
      </Box>

      {/* ── Implementation Notes ── */}
      <SectionHeader title="Implementation Notes" />
      <Box flexDirection="column" marginTop={1}>
        {task.implementation_notes.length === 0 ? (
          <Text dimColor>(none yet)</Text>
        ) : (
          task.implementation_notes.map((note, i) => (
            <Box key={i} flexDirection="column" marginBottom={1}>
              <Box>
                <Text dimColor>[{formatTime(note.timestamp)}]  </Text>
                <Text color="cyan">{note.agent}</Text>
              </Box>
              <Box marginLeft={2}>
                <Text>{note.note}</Text>
              </Box>
            </Box>
          ))
        )}
      </Box>

      {/* ── Event Log ── */}
      {events && events.length > 0 ? (
        <>
          <SectionHeader title="Event Log" />
          <Box flexDirection="column" marginTop={1}>
            {events.map((ev, i) => (
              <Box key={i}>
                <Box width={10}><Text dimColor>{formatTime(ev.created_at)}</Text></Box>
                <Box width={22}><Text color="cyan">{ev.event_type}</Text></Box>
                <Text dimColor>{ev.agent_id ?? 'system'}</Text>
              </Box>
            ))}
          </Box>
        </>
      ) : null}

    </Box>
  );
};

export function renderTaskDetail(task: Task, events?: TaskEvent[]): string {
  const cols = Math.max(terminalWidth(), 100);
  return renderToString(<TaskDetailComponent task={task} events={events} />, { columns: cols });
}
