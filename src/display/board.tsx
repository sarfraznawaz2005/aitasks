import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Box, Text, render, renderToString, useApp, useInput, useStdout } from 'ink';
import chalk from 'chalk';
import type { Task, TaskStatus, TaskPriority } from '../types.js';
import { STATUS_ICON } from './colors.js';
import { formatDate, formatTime, terminalWidth } from '../utils/format.js';
import { updateTask, completeTask } from '../models/task.js';

// ─── Colors ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<TaskStatus, string> = {
  backlog:      'white',
  ready:        'blue',
  in_progress:  'yellow',
  blocked:      '#FF5C5C',
  review: 'magenta',
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
  const inProgressIds = new Set(sorted.filter(t => t.status === 'in_progress' || t.status === 'review').map(t => t.id));
  const doneIds       = new Set(sorted.filter(t => t.status === 'done').map(t => t.id));
  const shownIds      = new Set<string>();
  const items: TreeItem[] = [];

  const ipCount   = sorted.filter(t => t.status === 'in_progress' || t.status === 'review').length;
  const doneCount = sorted.filter(t => t.status === 'done').length;

  function push(task: Task, indent: number, isLastSibling: boolean, section: Section, showHeader: boolean) {
    items.push({
      task, indent, isLastSibling, section,
      showSectionHeader: showHeader,
      sectionCount: section === 'in_progress' ? ipCount : section === 'done' ? doneCount : 0,
    });
    shownIds.add(task.id);
  }

  // ── IN PROGRESS section (includes review tasks) ─────────────────
  let firstIp = true;
  for (const task of sorted.filter(t => (t.status === 'in_progress' || t.status === 'review') && !t.parent_id)) {
    push(task, 0, false, 'in_progress', firstIp);
    firstIp = false;
    const subs = sorted.filter(t => t.parent_id === task.id);
    subs.forEach((sub, i) => push(sub, 1, i === subs.length - 1, 'in_progress', false));
  }
  for (const task of sorted.filter(t => (t.status === 'in_progress' || t.status === 'review') && !!t.parent_id)) {
    if (!shownIds.has(task.id)) { push(task, 0, false, 'in_progress', firstIp); firstIp = false; }
  }

  // ── MIDDLE section (non-ip, non-review, non-done root tasks in ID order) ─────
  for (const task of sorted.filter(t => !t.parent_id && !inProgressIds.has(t.id) && !doneIds.has(t.id))) {
    if (shownIds.has(task.id)) continue;
    push(task, 0, false, 'middle', false);
    const subs = sorted.filter(t => t.parent_id === task.id && !inProgressIds.has(t.id) && !doneIds.has(t.id));
    subs.forEach((sub, i) => { if (!shownIds.has(sub.id)) push(sub, 1, i === subs.length - 1, 'middle', false); });
  }

  // ── DONE section ─────────────────────────────────────────────────
  const doneSorted = sorted
    .filter(t => t.status === 'done')
    .sort((a, b) => (b.completed_at ?? b.created_at) - (a.completed_at ?? a.created_at));
  let firstDone = true;
  for (const task of doneSorted) {
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

  const treeStr = indent === 0 ? '' : (isLastSibling ? '  └─ ' : '  ├─ ');
  const fixedW     = 2 + treeStr.length + 9 + 1 + 1 + 1 + 1 + 1;
  const titleWidth = Math.max(4, paneWidth - fixedW - 1);

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

// ─── Right pane ───────────────────────────────────────────────────────────────

const c = (color: string, text: string): string => {
  if (color.startsWith('#')) return chalk.hex(color)(text);
  const chalkAny = chalk as unknown as Record<string, (t: string) => string>;
  if (typeof chalkAny[color] === 'function') return chalkAny[color](text);
  return text;
};

const visibleLen = (s: string): number => s.replace(/\x1b\[[0-9;]*m/g, '').length;

const wrapAnsiLine = (line: string, maxW: number): string[] => {
  const visible = line.replace(/\x1b\[[0-9;]*m/g, '');
  if (visible.length <= maxW) return [line];
  const result: string[] = [];
  let current = '';
  let visCount = 0;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (char === '\x1b') {
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

const RightPane: React.FC<{
  task: Task | undefined;
  width: number;
  height: number;
  scrollOffset: number;
  metricsRef?: React.MutableRefObject<{ maxOffset: number; visibleH: number }>;
}> = ({ task, width, height, scrollOffset, metricsRef }) => {
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

  const totalLines   = lines.length;
  const visibleH     = Math.max(3, height - 2);
  const maxOffset    = Math.max(0, totalLines - visibleH);
  const offset       = Math.min(scrollOffset, maxOffset);
  if (metricsRef) metricsRef.current = { maxOffset, visibleH };
  const visibleLines = lines.slice(offset, offset + visibleH);

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

  if (!task) {
    return (
      <Box paddingLeft={2} paddingTop={2}>
        <Text dimColor>Select a task with ↑↓</Text>
      </Box>
    );
  }

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

// ─── Status picker (right pane overlay for `m`) ───────────────────────────────

const PICKER_STATUSES: TaskStatus[] = ['backlog', 'ready', 'in_progress', 'blocked', 'review', 'done'];

const StatusPicker: React.FC<{ task: Task }> = ({ task }) => (
  <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
    <Text>Change status for <Text bold color="cyan">{task.id}</Text></Text>
    <Text dimColor>{'─'.repeat(36)}</Text>
    <Box marginTop={1} flexDirection="column">
      {PICKER_STATUSES.map((status, i) => {
        const isCurrent = task.status === status;
        const sc = STATUS_COLORS[status];
        return (
          <Box key={status}>
            <Text color={isCurrent ? 'cyan' : 'gray'}>{i + 1}  </Text>
            <Text color={sc}>{STATUS_ICON[status]}  </Text>
            <Text color={isCurrent ? 'cyan' : undefined} bold={isCurrent}>{status}</Text>
            {isCurrent && <Text dimColor>  ← current</Text>}
          </Box>
        );
      })}
    </Box>
    <Box marginTop={1}>
      <Text dimColor>1–6 select  ·  Esc cancel</Text>
    </Box>
  </Box>
);

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Simple date key (calendar day) from unix milliseconds
function getDateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatDateLabel(ts: number): string {
  const d = new Date(ts);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

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

type Mode = 'normal' | 'move' | 'search';

type LeftRow =
  | { kind: 'spacer' }
  | { kind: 'section'; section: 'in_progress' | 'done'; count: number; total?: number }
  | { kind: 'date-sep'; label: string }
  | { kind: 'item'; item: TreeItem; itemIdx: number };

const TreeBoardComponent: React.FC<{ getTasks: () => Task[] }> = ({ getTasks }) => {
  const [tasks,            setTasks]            = useState<Task[]>(() => getTasks());
  const [selectedIdx,      setSelectedIdx]      = useState(0);
  const [scrollOffset,     setScrollOffset]     = useState(0);
  const [leftScrollOffset, setLeftScrollOffset] = useState(0);
  const [mode,             setMode]             = useState<Mode>('normal');
  const [moveError,        setMoveError]        = useState<string | null>(null);
  const [searchQuery,      setSearchQuery]      = useState('');
  const { exit }   = useApp();
  const { stdout } = useStdout();

  useEffect(() => {
    const id = setInterval(() => { setTasks(getTasks()); }, 1500);
    return () => clearInterval(id);
  }, [getTasks]);

  // Filter tasks by search query before building the tree
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return tasks;
    const q = searchQuery.toLowerCase();
    return tasks.filter(t =>
      t.id.toLowerCase().includes(q) ||
      t.title.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.acceptance_criteria.some(ac => ac.toLowerCase().includes(q)) ||
      t.implementation_notes.some(n => n.note.toLowerCase().includes(q))
    );
  }, [tasks, searchQuery]);

  const items    = useMemo(() => buildTree(filteredTasks), [filteredTasks]);
  const clampIdx = Math.min(selectedIdx, Math.max(0, items.length - 1));

  // Reset selection to top when filter changes
  useEffect(() => { setSelectedIdx(0); }, [searchQuery]);

  const leftRows = useMemo((): LeftRow[] => {
    const ipCnt   = items.filter(i => i.section === 'in_progress').length;
    const ipTotal = items.filter(i => i.section === 'in_progress' || i.section === 'middle').length;
    const doneCnt = items.filter(i => i.section === 'done').length;
    const result: LeftRow[] = [];
    let firstSection = true;
    let prevDateKey: string | null = null;
    let prevSection: Section | null = null;
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx]!;
      if (item.showSectionHeader && item.section !== 'middle') {
        if (!firstSection) result.push({ kind: 'spacer' });
        result.push({
          kind: 'section',
          section: item.section as 'in_progress' | 'done',
          count: item.section === 'in_progress' ? ipCnt : doneCnt,
          total: item.section === 'in_progress' ? ipTotal : undefined,
        });
        firstSection = false;
        prevDateKey = null;
      } else if (item.section !== prevSection) {
        prevDateKey = null;
      }
      // Insert a thin separator between root-level tasks on different calendar days
      if (item.indent === 0) {
        const ts = item.section === 'done'
          ? (item.task.completed_at ?? item.task.created_at)
          : item.task.created_at;
        const dateKey = getDateKey(ts);
        if (prevDateKey !== null && prevDateKey !== dateKey) {
          result.push({ kind: 'date-sep', label: formatDateLabel(ts) });
        }
        prevDateKey = dateKey;
      }
      prevSection = item.section;
      result.push({ kind: 'item', item, itemIdx: idx });
    }
    return result;
  }, [items]);

  const selectedRowIdx = leftRows.findIndex(r => r.kind === 'item' && r.itemIdx === clampIdx);

  useEffect(() => { setScrollOffset(0); }, [clampIdx]);

  useEffect(() => {
    if (selectedRowIdx < 0) return;
    const visH = Math.max(1, (stdout.rows ?? 30) - 4);
    setLeftScrollOffset(o => {
      if (selectedRowIdx < o) return selectedRowIdx;
      if (selectedRowIdx >= o + visH) return selectedRowIdx - visH + 1;
      return o;
    });
  }, [selectedRowIdx, stdout]);

  const selectedTask = items[clampIdx]?.task;

  useInput((input, key) => {
    // ── Search mode ──────────────────────────────────────────────────
    if (mode === 'search') {
      if (key.escape) { setSearchQuery(''); setMode('normal'); return; }
      if (key.return) { setMode('normal'); return; }
      if (key.upArrow)   { setSelectedIdx(i => Math.max(0, i - 1)); return; }
      if (key.downArrow) { setSelectedIdx(i => Math.min(items.length - 1, i + 1)); return; }
      if (key.backspace || key.delete) { setSearchQuery(q => q.slice(0, -1)); return; }
      if (input && !key.ctrl && !key.meta) {
        if (Date.now() < suppressUntilRef.current) return;
        setSearchQuery(q => q + input);
        return;
      }
      return;
    }

    // ── Move mode (status picker) ────────────────────────────────────
    if (mode === 'move') {
      if (key.escape || input === 'q') { setMode('normal'); return; }
      const statusMap: Record<string, TaskStatus> = {
        '1': 'backlog', '2': 'ready', '3': 'in_progress',
        '4': 'blocked', '5': 'review', '6': 'done',
      };
      const newStatus = statusMap[input];
      if (newStatus && selectedTask) {
        if (newStatus === 'done') {
          const { error } = completeTask(selectedTask.id);
          if (error) {
            setMoveError(error.split('\n')[0] ?? error);
            setMode('normal');
          } else {
            setMoveError(null);
            setTasks(getTasks());
            setMode('normal');
          }
        } else {
          setMoveError(null);
          updateTask(selectedTask.id, { status: newStatus });
          setTasks(getTasks());
          setMode('normal');
        }
      }
      return;
    }

    // ── Normal mode ──────────────────────────────────────────────────
    if (input === 'q') exit();
    if (key.escape) { searchQuery ? setSearchQuery('') : exit(); return; }
    if (key.upArrow)   { setMoveError(null); setSelectedIdx(i => Math.max(0, i - 1)); }
    if (key.downArrow) { setMoveError(null); setSelectedIdx(i => Math.min(items.length - 1, i + 1)); }
    if (input === 's') setMode('search');
    if (input === 'm' && selectedTask) setMode('move');
  });

  const cols        = stdout.columns ?? 120;
  const rows        = stdout.rows ?? 30;
  const leftWidth   = Math.max(44, Math.floor(cols * 0.37));
  const rightWidth  = cols - leftWidth - 2;
  const rightHeight = rows - 2;

  const itemsLenRef = useRef(items.length);
  itemsLenRef.current = items.length;
  const leftWidthRef = useRef(leftWidth);
  leftWidthRef.current = leftWidth;
  const scrollOffsetRef = useRef(scrollOffset);
  scrollOffsetRef.current = scrollOffset;
  const colsRef              = useRef(cols);
  colsRef.current            = cols;
  const rowsRef              = useRef(rows);
  rowsRef.current            = rows;
  const leftScrollOffsetRef  = useRef(leftScrollOffset);
  leftScrollOffsetRef.current = leftScrollOffset;
  const leftMaxOffsetRef     = useRef(0);
  const rightMetricsRef      = useRef({ maxOffset: 0, visibleH: 0 });
  const dragRef              = useRef<'left' | 'right' | null>(null);
  const visibleLeftRowsRef   = useRef<LeftRow[]>([]);
  const suppressUntilRef     = useRef(0);
  const searchActiveRef      = useRef(false);

  useEffect(() => {
    // 1002h = button-event + drag motion; 1006h = SGR extended coords
    process.stdout.write('\x1b[?1002h\x1b[?1006h');

    const jumpToRow = (row: number, pane: 'left' | 'right') => {
      // row is 0-indexed terminal row; content starts after border+header+divider (row 3)
      const contentStart = 4;
      const visH = Math.max(1, rowsRef.current - 4);
      const relRow = Math.max(0, Math.min(row - contentStart, visH - 1));
      const ratio  = visH > 1 ? relRow / (visH - 1) : 0;
      if (pane === 'left') {
        setLeftScrollOffset(Math.round(ratio * leftMaxOffsetRef.current));
      } else {
        setScrollOffset(Math.round(ratio * rightMetricsRef.current.maxOffset));
      }
    };

    const onData = (buf: Buffer) => {
      const str = buf.toString('latin1');

      const sgr = str.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
      if (sgr) {
        const btn       = parseInt(sgr[1]!, 10);
        const col       = parseInt(sgr[2]!, 10) - 1;
        const row       = parseInt(sgr[3]!, 10) - 1;
        const isRelease = sgr[4] === 'm';

        // Always suppress Ink's useInput from seeing leaked SGR bytes
        suppressUntilRef.current = Date.now() + 150;

        // Scroll wheel
        if (btn === 64 || btn === 65) {
          if (col < leftWidthRef.current) {
            if (btn === 64) setSelectedIdx(i => Math.max(0, i - 1));
            if (btn === 65) setSelectedIdx(i => Math.min(itemsLenRef.current - 1, i + 1));
          } else {
            if (btn === 64) setScrollOffset(o => Math.max(0, o - 8));
            if (btn === 65) setScrollOffset(o => o + 8);
          }
          return;
        }

        // Mouse release — end drag
        if (isRelease) { dragRef.current = null; return; }

        // Left-button press (btn=0) or drag-motion (btn=32)
        if (btn === 0 || btn === 32) {
          const leftSbCol  = leftWidthRef.current - 2;
          const rightSbCol = colsRef.current - 3;

          if (btn === 0) {
            // Decide which scrollbar was clicked to start drag tracking
            if (col === leftSbCol)  dragRef.current = 'left';
            else if (col >= rightSbCol) dragRef.current = 'right';
            else {
              dragRef.current = null;
              // Click inside left pane content → select that task row
              if (col < leftWidthRef.current - 1) {
                const visRowIdx = row - (searchActiveRef.current ? 4 : 3);
                const clicked = visibleLeftRowsRef.current[visRowIdx];
                if (clicked?.kind === 'item') setSelectedIdx(clicked.itemIdx);
              }
            }
          }

          if (dragRef.current === 'left')  jumpToRow(row, 'left');
          if (dragRef.current === 'right') jumpToRow(row, 'right');
        }
        return;
      }

      // X10 legacy fallback — scroll wheel only
      if (buf[0] === 0x1b && buf[1] === 0x5b && buf[2] === 0x4d) {
        const btn = (buf[3] ?? 32) - 32;
        const col = (buf[4] ?? 33) - 33;
        if (btn === 64 || btn === 65) {
          if (col < leftWidthRef.current) {
            if (btn === 64) setSelectedIdx(i => Math.max(0, i - 1));
            if (btn === 65) setSelectedIdx(i => Math.min(itemsLenRef.current - 1, i + 1));
          } else {
            if (btn === 64) setScrollOffset(o => Math.max(0, o - 8));
            if (btn === 65) setScrollOffset(o => o + 8);
          }
        }
      }
    };

    process.stdin.prependListener('data', onData);
    return () => {
      process.stdout.write('\x1b[?1006l\x1b[?1002l');
      process.stdin.off('data', onData);
    };
  }, []);

  const leftInner  = leftWidth - 2;
  const rightInner = rightWidth - 2;

  const leftVisibleH    = Math.max(1, rows - 4);
  const leftTotalRows   = leftRows.length;
  const leftMaxOffset   = Math.max(0, leftTotalRows - leftVisibleH);
  leftMaxOffsetRef.current    = leftMaxOffset;
  searchActiveRef.current     = mode === 'search' || !!searchQuery;
  const leftOffset      = Math.min(leftScrollOffset, leftMaxOffset);
  const rawLeftRows     = leftRows.slice(leftOffset, leftOffset + leftVisibleH);
  const visibleLeftRows = rawLeftRows[0]?.kind === 'date-sep' ? rawLeftRows.slice(1) : rawLeftRows;
  visibleLeftRowsRef.current = visibleLeftRows;
  const leftScrollbar   = (() => {
    const bar = Array<string>(leftVisibleH).fill(' ');
    if (leftTotalRows > leftVisibleH) {
      const thumbH   = Math.max(1, Math.floor((leftVisibleH / leftTotalRows) * leftVisibleH));
      const thumbPos = leftMaxOffset > 0 ? Math.floor((leftOffset / leftMaxOffset) * (leftVisibleH - thumbH)) : 0;
      for (let i = 0; i < leftVisibleH; i++) {
        bar[i] = i >= thumbPos && i < thumbPos + thumbH ? '█' : '░';
      }
    }
    return bar;
  })();

  const taskCountLabel = searchQuery
    ? `${filteredTasks.length} of ${tasks.length}`
    : `${tasks.length}`;

  // Rendered inline — see HeaderHint below
  const searchMode = mode === 'search';

  return (
    <Box flexDirection="column" width={cols}>
      <Box width={cols} height={rows}>

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
            <Text color="#AAAAAA">({taskCountLabel})</Text>
            <Text dimColor>    </Text>
            {searchMode ? (
              <>
                <Text dimColor>type to filter  ·  </Text>
                <Text color="cyan">Enter</Text>
                <Text dimColor> done  ·  </Text>
                <Text color="cyan">Esc</Text>
                <Text dimColor> clear</Text>
              </>
            ) : (
              <>
                <Text color="cyan">s</Text>
                <Text dimColor> search  ·  </Text>
                <Text color="cyan">m</Text>
                <Text dimColor> status  ·  </Text>
                <Text color="cyan">q</Text>
                <Text dimColor> quit</Text>
              </>
            )}
          </Box>

          {/* Search bar or divider */}
          {(mode === 'search' || searchQuery) ? (
            <Box paddingLeft={1}>
              <Text color="cyan">/ </Text>
              <Text color="white">{searchQuery}</Text>
              {mode === 'search' && <Text color="cyan" bold>█</Text>}
            </Box>
          ) : (
            <Text dimColor>{'─'.repeat(leftInner)}</Text>
          )}

          {/* Tree items */}
          {visibleLeftRows.map((row, i) => {
            const sb = <Box width={1}><Text dimColor>{leftScrollbar[i]}</Text></Box>;
            if (row.kind === 'spacer') {
              return <Box key={`sp-${leftOffset + i}`}><Box flexGrow={1}><Text> </Text></Box>{sb}</Box>;
            }
            if (row.kind === 'date-sep') {
              const dashW = Math.max(0, Math.floor((leftInner - 2 - row.label.length - 2) / 2));
              const dashes = '╌'.repeat(dashW);
              return (
                <Box key={`ds-${leftOffset + i}`}>
                  <Box flexGrow={1} paddingLeft={1}>
                    <Text dimColor>{dashes}</Text>
                    <Text dimColor> {row.label} </Text>
                    <Text dimColor>{dashes}</Text>
                  </Box>
                  {sb}
                </Box>
              );
            }
            if (row.kind === 'section') {
              const color = row.section === 'in_progress' ? 'yellow' : 'green';
              const label = row.section === 'in_progress' ? 'IN PROGRESS' : 'DONE';
              const cnt   = row.total !== undefined && row.total !== row.count
                ? `${row.count} of ${row.total}` : `${row.count}`;
              return (
                <Box key={`sec-${row.section}`}>
                  <Box flexGrow={1} paddingLeft={1}>
                    <Text color={color} bold>{label}</Text>
                    <Text color="#AAAAAA">  ({cnt})</Text>
                  </Box>
                  {sb}
                </Box>
              );
            }
            return (
              <Box key={row.item.task.id}>
                <Box flexGrow={1}>
                  <TreeRow item={row.item} isSelected={row.itemIdx === clampIdx} paneWidth={leftInner - 1} />
                </Box>
                {sb}
              </Box>
            );
          })}
        </Box>

        {/* ── Right pane ── */}
        <Box
          width={rightWidth}
          flexDirection="column"
          borderStyle="round"
          borderColor="gray"
        >
          {mode === 'move' && selectedTask
            ? <StatusPicker task={selectedTask} />
            : <>
                {moveError && (
                  <Box paddingX={1} paddingTop={1}>
                    <Text color="red">✗ {moveError}</Text>
                  </Box>
                )}
                <RightPane task={selectedTask} width={rightInner} height={rightHeight} scrollOffset={scrollOffset} metricsRef={rightMetricsRef} />
              </>
          }
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
  blocked: 'BLOCKED', review: 'REVIEW', done: 'DONE',
};

const ALL_STATUSES: TaskStatus[] = ['in_progress', 'review', 'ready', 'blocked', 'backlog', 'done'];

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
  const getTaskDateKey = (t: Task) =>
    getDateKey(status === 'done' ? (t.completed_at ?? t.created_at) : t.created_at);
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={color} marginBottom={1}>
      <Box paddingLeft={1}>
        <Text color={color} bold>{STATUS_ICON[status]}  {STATUS_LABELS[status]}</Text>
        <Text color="#AAAAAA">  ({tasks.length})</Text>
      </Box>
      {tasks.length === 0
        ? <Box paddingLeft={3}><Text dimColor>empty</Text></Box>
        : tasks.map((t, i) => {
            const prev = tasks[i - 1];
            const showSep = prev != null && getTaskDateKey(prev) !== getTaskDateKey(t);
            return (
              <React.Fragment key={t.id}>
                {showSep && (
                  <Box paddingLeft={2} paddingRight={1}>
                    <Text dimColor>{'╌'.repeat(4)} </Text>
                    <Text dimColor>{formatDateLabel(status === 'done' ? (t.completed_at ?? t.created_at) : t.created_at)} </Text>
                    <Text dimColor>{'╌'.repeat(4)}</Text>
                  </Box>
                )}
                <StaticCard task={t} />
              </React.Fragment>
            );
          })}
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
