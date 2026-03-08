import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Box, Text, render, renderToString, useApp, useInput, useStdout } from 'ink';
import chalk from 'chalk';
import type { Task, TaskStatus, TaskPriority } from '../types.js';
import { STATUS_ICON } from './colors.js';
import { formatDate, formatTime, timeAgo, terminalWidth } from '../utils/format.js';

// ─── Colors ───────────────────────────────────────────────────────────────────

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

// ─── Tree building ────────────────────────────────────────────────────────────

type Section = 'in_progress' | 'middle' | 'done';

interface TreeItem {
  task:              Task;
  indent:            number;
  isLastSibling:     boolean;
  section:           Section;
  showSectionHeader: boolean;
  sectionCount:      number;
}

function buildTree(tasks: Task[]): TreeItem[] {
  const sorted        = [...tasks].sort((a, b) => a.id.localeCompare(b.id));
  const inProgressIds = new Set(sorted.filter(t => t.status === 'in_progress').map(t => t.id));
  const doneIds       = new Set(sorted.filter(t => t.status === 'done').map(t => t.id));
  const shownIds      = new Set<string>();
  const items: TreeItem[] = [];

  const ipCount   = sorted.filter(t => t.status === 'in_progress').length;
  const doneCount = sorted.filter(t => t.status === 'done').length;

  function push(task: Task, indent: number, isLastSibling: boolean, section: Section, showHeader: boolean) {
    items.push({
      task, indent, isLastSibling, section,
      showSectionHeader: showHeader,
      sectionCount: section === 'in_progress' ? ipCount : section === 'done' ? doneCount : 0,
    });
    shownIds.add(task.id);
  }

  // ── IN PROGRESS section ─────────────────────────────────────────
  let firstIp = true;
  // Root tasks that are in_progress, with their subtasks
  for (const task of sorted.filter(t => t.status === 'in_progress' && !t.parent_id)) {
    push(task, 0, false, 'in_progress', firstIp);
    firstIp = false;
    const subs = sorted.filter(t => t.parent_id === task.id);
    subs.forEach((sub, i) => push(sub, 1, i === subs.length - 1, 'in_progress', false));
  }
  // Orphaned subtasks whose parent isn't in_progress
  for (const task of sorted.filter(t => t.status === 'in_progress' && !!t.parent_id)) {
    if (!shownIds.has(task.id)) { push(task, 0, false, 'in_progress', firstIp); firstIp = false; }
  }

  // ── MIDDLE section (non-ip, non-done root tasks in ID order) ─────
  for (const task of sorted.filter(t => !t.parent_id && !inProgressIds.has(t.id) && !doneIds.has(t.id))) {
    if (shownIds.has(task.id)) continue;
    push(task, 0, false, 'middle', false);
    const subs = sorted.filter(t => t.parent_id === task.id && !inProgressIds.has(t.id) && !doneIds.has(t.id));
    subs.forEach((sub, i) => { if (!shownIds.has(sub.id)) push(sub, 1, i === subs.length - 1, 'middle', false); });
  }

  // ── DONE section ─────────────────────────────────────────────────
  let firstDone = true;
  for (const task of sorted.filter(t => t.status === 'done')) {
    if (shownIds.has(task.id)) continue;
    push(task, 0, false, 'done', firstDone);
    firstDone = false;
  }

  return items;
}

// ─── Left pane: tree row ──────────────────────────────────────────────────────

const TreeRow: React.FC<{ item: TreeItem; isSelected: boolean; paneWidth: number }> = ({ item, isSelected, paneWidth }) => {
  const { task, indent, isLastSibling } = item;
  const sc      = STATUS_COLORS[task.status];
  const pc      = PRIORITY_COLORS[task.priority];
  const icon    = STATUS_ICON[task.status];
  const priChar = task.priority[0]!.toUpperCase();

  // Subtasks get 2 leading spaces before the connector → clear visual indent
  const treeStr = indent === 0 ? '' : (isLastSibling ? '  └─ ' : '  ├─ ');
  // sel(2) + tree(0 or 5) + id(9) + sp(1) + pri(1) + sp(1) + icon(1) + sp(1) = 16 or 21
  const fixedW     = 2 + treeStr.length + 9 + 1 + 1 + 1 + 1 + 1;
  const titleWidth = Math.max(4, paneWidth - fixedW);

  return (
    <Box>
      {isSelected ? <Text color="cyan" bold>▶ </Text> : <Text>  </Text>}
      {treeStr ? <Text dimColor>{treeStr}</Text> : null}
      <Box width={9}>
        <Text bold color={isSelected ? 'cyan' : 'white'}>{task.id}</Text>
      </Box>
      <Text> </Text>
      <Text color={pc} bold={task.priority === 'critical'}>{priChar}</Text>
      <Text> </Text>
      <Text color={sc}>{icon}</Text>
      <Text> </Text>
      <Box width={titleWidth} overflow="hidden">
        <Text wrap="truncate" color={isSelected ? 'cyan' : undefined}>{task.title}</Text>
      </Box>
    </Box>
  );
};

// ─── Left pane: section header ────────────────────────────────────────────────

const SectionDivider: React.FC<{ section: 'in_progress' | 'done'; count: number; isFirst: boolean }> = ({ section, count, isFirst }) => {
  const color = section === 'in_progress' ? 'yellow' : 'green';
  const label = section === 'in_progress' ? 'IN PROGRESS' : 'DONE';
  return (
    <Box marginTop={isFirst ? 0 : 1} paddingLeft={1}>
      <Text color={color} bold>{label}</Text>
      <Text color="#AAAAAA">  ({count})</Text>
    </Box>
  );
};

// ─── Right pane ───────────────────────────────────────────────────────────────

// Helper to apply chalk color (handles both named colors and hex codes)
const c = (color: string, text: string): string => {
  if (color.startsWith('#')) return chalk.hex(color)(text);
  const chalkAny = chalk as unknown as Record<string, (t: string) => string>;
  if (typeof chalkAny[color] === 'function') return chalkAny[color](text);
  return text;
};

// Strip ANSI codes to get visible length
const visibleLen = (s: string): number => s.replace(/\x1b\[[0-9;]*m/g, '').length;

// Wrap a string that may contain ANSI codes, preserving codes in output
const wrapAnsiLine = (line: string, maxW: number): string[] => {
  const visible = line.replace(/\x1b\[[0-9;]*m/g, '');
  if (visible.length <= maxW) return [line];
  // Simple approach: just split by visible chars and re-add ANSI
  const result: string[] = [];
  let current = '';
  let visCount = 0;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (char === '\x1b') {
      // ANSI sequence - add without counting
      const end = line.indexOf('m', i);
      if (end !== -1) {
        current += line.slice(i, end + 1);
        i = end;
        continue;
      }
    }
    if (visCount >= maxW) {
      result.push(current);
      current = char;
      visCount = 1;
    } else {
      current += char;
      visCount++;
    }
  }
  if (current) result.push(current);
  return result;
};

const RightPane: React.FC<{ task: Task | undefined; width: number; height: number; scrollOffset: number }> = ({ task, width, height, scrollOffset }) => {
  // Memoize all the heavy line-building work - only recompute when task or width changes
  const { lines, contentW } = useMemo(() => {
    if (!task) return { lines: [], contentW: 20 };

    const sc          = STATUS_COLORS[task.status];
    const pc          = PRIORITY_COLORS[task.priority];
    const checkedMap  = new Map(task.test_results.map(r => [r.index, r]));
    const cw          = Math.max(20, width - 4);

    const lbl = chalk.hex('#AAAAAA');
    const lblB = chalk.hex('#AAAAAA').bold;

    const rawLines: string[] = [];
    const add = (text: string) => rawLines.push(text);
    const addEmpty = () => rawLines.push('');

    add(chalk.white.bold(task.id) + '  ' + chalk.bold(task.title));
    add(chalk.dim('─'.repeat(Math.min(cw, 60))));
    addEmpty();

    add(lbl('Status    ') + c(sc, STATUS_ICON[task.status] + ' ' + task.status));
    add(lbl('Priority  ') + c(pc, task.priority));
    add(lbl('Type      ') + task.type);
    if (task.assigned_to) add(lbl('Agent     ') + chalk.cyan(task.assigned_to));
    if (task.parent_id)   add(lbl('Parent    ') + chalk.white.bold(task.parent_id));
    add(lbl('Created   ') + chalk.dim(formatDate(task.created_at)));
    if (task.started_at)  add(lbl('Started   ') + chalk.dim(formatDate(task.started_at)));
    if (task.completed_at) add(lbl('Completed ') + chalk.green(formatDate(task.completed_at)));

    if (task.description.trim()) {
      addEmpty();
      add(lblB('Description'));
      wrapText(task.description.trim(), cw - 2).forEach(l => add('  ' + l));
    }

    if (task.acceptance_criteria.length > 0) {
      addEmpty();
      add(lblB('Acceptance Criteria') + ' ' + lbl(`(${task.test_results.length}/${task.acceptance_criteria.length} verified)`));
      task.acceptance_criteria.forEach((cItem, i) => {
        const result = checkedMap.get(i);
        const check = result ? chalk.green('✓') : chalk.hex('#FF5C5C')('○');
        add('  ' + check + chalk.dim(' [' + i + '] ') + cItem);
        if (result) add('      ' + chalk.dim('↳ ' + result.evidence));
      });
    }

    if (task.blocked_by.length > 0 || task.blocks.length > 0) {
      addEmpty();
      add(lblB('Dependencies'));
      if (task.blocked_by.length > 0) add('  ' + lbl('Blocked by: ') + chalk.hex('#FF5C5C')(task.blocked_by.join(', ')));
      if (task.blocks.length > 0) add('  ' + lbl('Blocks: ') + chalk.yellow(task.blocks.join(', ')));
    }

    if (task.implementation_notes.length > 0) {
      addEmpty();
      add(lblB('Implementation Notes'));
      task.implementation_notes.forEach(note => {
        add('  ' + chalk.dim('[' + formatTime(note.timestamp) + '] ') + chalk.cyan(note.agent));
        wrapText(note.note, cw - 4).forEach(l => add('    ' + l));
      });
    }

    const lines: string[] = [];
    for (const raw of rawLines) {
      lines.push(...wrapAnsiLine(raw, cw));
    }

    return { lines, contentW: cw };
  }, [task, width]);

  if (!task) {
    return (
      <Box paddingLeft={2} paddingTop={2}>
        <Text dimColor>Select a task with ↑↓</Text>
      </Box>
    );
  }

  // Fast path: just slice the memoized lines
  const totalLines   = lines.length;
  const visibleH     = Math.max(3, height - 2);
  const maxOffset    = Math.max(0, totalLines - visibleH);
  const offset       = Math.min(scrollOffset, maxOffset);
  const visibleLines = lines.slice(offset, offset + visibleH);

  // Build scrollbar
  const scrollbar = useMemo(() => {
    if (totalLines <= visibleH) return Array(visibleH).fill(' ');
    const ratio    = visibleH / totalLines;
    const thumbH   = Math.max(1, Math.floor(ratio * visibleH));
    const thumbPos = maxOffset > 0 ? Math.floor((offset / maxOffset) * (visibleH - thumbH)) : 0;
    const bar: string[] = [];
    for (let i = 0; i < visibleH; i++) {
      bar.push(i >= thumbPos && i < thumbPos + thumbH ? '█' : '░');
    }
    return bar;
  }, [totalLines, visibleH, offset, maxOffset]);

  return (
    <Box flexDirection="column" paddingTop={1}>
      {visibleLines.map((line, i) => (
        <Box key={i} width="100%">
          <Box flexGrow={1} paddingLeft={2} paddingRight={1}>
            <Text>{line}</Text>
          </Box>
          <Box width={1}>
            <Text dimColor>{scrollbar[i]}</Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
};

// Simple text wrapper
function wrapText(text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const result: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length + 1 + word.length <= maxW) {
      current = current ? `${current} ${word}` : word;
    } else {
      if (current) result.push(current);
      current = word;
    }
  }
  if (current) result.push(current);
  return result;
}

// ─── Main live tree board ─────────────────────────────────────────────────────

const TreeBoardComponent: React.FC<{ getTasks: () => Task[] }> = ({ getTasks }) => {
  const [tasks,        setTasks]        = useState<Task[]>(() => getTasks());
  const [selectedIdx,  setSelectedIdx]  = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const { exit }   = useApp();
  const { stdout } = useStdout();

  useEffect(() => {
    const id = setInterval(() => { setTasks(getTasks()); }, 1500);
    return () => clearInterval(id);
  }, [getTasks]);

  const items     = useMemo(() => buildTree(tasks), [tasks]);
  const clampIdx  = Math.min(selectedIdx, Math.max(0, items.length - 1));

  // Reset scroll when task changes
  useEffect(() => { setScrollOffset(0); }, [clampIdx]);

  useInput((input, key) => {
    if (input === 'q' || key.escape) exit();
    if (key.upArrow)   setSelectedIdx(i => Math.max(0, i - 1));
    if (key.downArrow) setSelectedIdx(i => Math.min(items.length - 1, i + 1));
  });

  const cols       = stdout.columns ?? 120;
  const rows       = stdout.rows ?? 30;
  const leftWidth  = Math.max(44, Math.floor(cols * 0.37));
  const rightWidth = cols - leftWidth - 2; // -2 for 1-char gap between panes
  const rightHeight = rows - 2; // -2 for borders
  const selectedTask = items[clampIdx]?.task;

  // Keep refs for closure stability
  const itemsLenRef = useRef(items.length);
  itemsLenRef.current = items.length;
  const leftWidthRef = useRef(leftWidth);
  leftWidthRef.current = leftWidth;
  const scrollOffsetRef = useRef(scrollOffset);
  scrollOffsetRef.current = scrollOffset;

  // Enable mouse wheel scrolling (mount/unmount only — no dep churn)
  useEffect(() => {
    // Enable X10 + SGR extended mouse (SGR is required by Windows Terminal for wheel)
    process.stdout.write('\x1b[?1000h\x1b[?1006h');

    const onData = (buf: Buffer) => {
      const str = buf.toString('latin1');

      // SGR format: ESC [ < Pb ; Px ; Py M  (Pb=64 up, 65 down)
      const sgr = str.match(/\x1b\[<(\d+);(\d+);(\d+)M/);
      if (sgr) {
        const btn = parseInt(sgr[1]!, 10);
        const col = parseInt(sgr[2]!, 10) - 1; // SGR cols are 1-indexed
        if (btn === 64 || btn === 65) {
          if (col < leftWidthRef.current) {
            // Left pane: navigate tasks
            if (btn === 64) setSelectedIdx(i => Math.max(0, i - 1));
            if (btn === 65) setSelectedIdx(i => Math.min(itemsLenRef.current - 1, i + 1));
          } else {
            // Right pane: scroll content (8 lines per tick)
            if (btn === 64) setScrollOffset(o => Math.max(0, o - 8));
            if (btn === 65) setScrollOffset(o => o + 8);
          }
        }
        return;
      }

      // X10 format: ESC [ M <btn+32> <col+33> <row+33>  (fallback)
      if (buf[0] === 0x1b && buf[1] === 0x5b && buf[2] === 0x4d) {
        const btn = (buf[3] ?? 32) - 32;
        const col = (buf[4] ?? 33) - 33;
        if (btn === 64 || btn === 65) {
          if (col < leftWidthRef.current) {
            if (btn === 64) setSelectedIdx(i => Math.max(0, i - 1));
            if (btn === 65) setSelectedIdx(i => Math.min(itemsLenRef.current - 1, i + 1));
          } else {
            // Right pane: scroll content (8 lines per tick)
            if (btn === 64) setScrollOffset(o => Math.max(0, o - 8));
            if (btn === 65) setScrollOffset(o => o + 8);
          }
        }
      }
    };

    process.stdin.on('data', onData);
    return () => {
      process.stdout.write('\x1b[?1006l\x1b[?1000l');
      process.stdin.off('data', onData);
    };
  }, []); // empty deps — mount/unmount only

  const ipCount   = items.filter(i => i.section === 'in_progress').length;
  const doneCount = items.filter(i => i.section === 'done').length;

  // Inner widths (border consumes 2 chars each side)
  const leftInner  = leftWidth - 2;
  const rightInner = rightWidth - 2;

  return (
    <Box flexDirection="column" width={cols}>
      <Box width={cols}>

        {/* ── Left pane ── */}
        <Box
          width={leftWidth}
          flexDirection="column"
          borderStyle="round"
          borderColor="gray"
          marginRight={1}
        >
          {/* Pane header */}
          <Box paddingLeft={1}>
            <Text bold color="white">Tasks  </Text>
            <Text color="#AAAAAA">({tasks.length})</Text>
            <Text dimColor>    ↑↓ navigate  ·  q quit</Text>
          </Box>
          <Text dimColor>{'─'.repeat(leftInner)}</Text>

          {/* Tree items */}
          {items.map((item, idx) => (
            <React.Fragment key={item.task.id}>
              {item.showSectionHeader && item.section !== 'middle' && (
                <SectionDivider
                  section={item.section}
                  count={item.section === 'in_progress' ? ipCount : doneCount}
                  isFirst={idx === 0}
                />
              )}
              <TreeRow item={item} isSelected={idx === clampIdx} paneWidth={leftInner} />
            </React.Fragment>
          ))}
        </Box>

        {/* ── Right pane ── */}
        <Box
          width={rightWidth}
          flexDirection="column"
          borderStyle="round"
          borderColor="gray"
        >
          <RightPane task={selectedTask} width={rightInner} height={rightHeight} scrollOffset={scrollOffset} />
        </Box>

      </Box>

    </Box>
  );
};

export async function startTreeBoard(getTasks: () => Task[]): Promise<void> {
  const { waitUntilExit } = render(<TreeBoardComponent getTasks={getTasks} />);
  await waitUntilExit();
}

// ─── Static board (board --all) ───────────────────────────────────────────────

const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'BACKLOG', ready: 'READY', in_progress: 'IN PROGRESS',
  blocked: 'BLOCKED', needs_review: 'NEEDS REVIEW', done: 'DONE',
};

const ALL_STATUSES: TaskStatus[] = ['in_progress', 'needs_review', 'ready', 'blocked', 'backlog', 'done'];

const StaticCard: React.FC<{ task: Task }> = ({ task }) => {
  const priColor = PRIORITY_COLORS[task.priority] ?? 'gray';
  return (
    <Box paddingLeft={2}>
      <Box width={10}><Text bold color="white">{task.id}</Text></Box>
      <Box width={3}><Text color={priColor} bold={task.priority === 'critical'}>{task.priority[0]!.toUpperCase()}</Text></Box>
      <Box flexGrow={1} overflow="hidden"><Text wrap="truncate">{task.title}</Text></Box>
      {task.assigned_to ? <Box marginLeft={1}><Text dimColor> → {task.assigned_to}</Text></Box> : null}
      {task.blocked_by.length > 0 ? <Box marginLeft={1}><Text color="#FF5C5C"> ⊘ {task.blocked_by.join(', ')}</Text></Box> : null}
    </Box>
  );
};

const StaticSection: React.FC<{ status: TaskStatus; tasks: Task[] }> = ({ status, tasks }) => {
  const color = STATUS_COLORS[status];
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={color} marginBottom={1}>
      <Box paddingLeft={1}>
        <Text color={color} bold>{STATUS_ICON[status]}  {STATUS_LABELS[status]}</Text>
        <Text color="#AAAAAA">  ({tasks.length})</Text>
      </Box>
      {tasks.length === 0
        ? <Box paddingLeft={3}><Text dimColor>empty</Text></Box>
        : tasks.map(t => <StaticCard key={t.id} task={t} />)}
    </Box>
  );
};

const StaticBoardComponent: React.FC<{ tasks: Task[] }> = ({ tasks }) => {
  const visible = ALL_STATUSES.filter(s => tasks.some(t => t.status === s));
  if (visible.length === 0) {
    return <Box marginY={1} marginLeft={2}><Text dimColor>No tasks found.</Text></Box>;
  }
  return (
    <Box flexDirection="column" marginY={1} marginLeft={1}>
      {visible.map(s => <StaticSection key={s} status={s} tasks={tasks.filter(t => t.status === s)} />)}
    </Box>
  );
};

export function renderBoard(tasks: Task[]): string {
  const cols = Math.max(terminalWidth(), 100);
  return renderToString(<StaticBoardComponent tasks={tasks} />, { columns: cols });
}
