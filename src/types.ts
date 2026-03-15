export type TaskStatus =
  | 'backlog'
  | 'ready'
  | 'in_progress'
  | 'blocked'
  | 'review'
  | 'done';

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type TaskType = 'feature' | 'bug' | 'chore' | 'spike';

export interface ImplementationNote {
  timestamp: number;
  agent: string;
  note: string;
}

export interface TestResult {
  index: number;
  criterion: string;
  passed: boolean;
  evidence: string;
  checked_at: number;
  agent: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  acceptance_criteria: string[];
  status: TaskStatus;
  priority: TaskPriority;
  type: TaskType;
  assigned_to: string | null;
  parent_id: string | null;
  blocks: string[];
  blocked_by: string[];
  implementation_notes: ImplementationNote[];
  test_results: TestResult[];
  created_at: number;
  updated_at: number;
  started_at: number | null;
  completed_at: number | null;
  metadata: Record<string, unknown>;
}

// Raw DB row (all JSON fields are strings)
export interface TaskRow {
  id: string;
  title: string;
  description: string;
  acceptance_criteria: string;
  status: string;
  priority: string;
  type: string;
  assigned_to: string | null;
  parent_id: string | null;
  blocks: string;
  blocked_by: string;
  implementation_notes: string;
  test_results: string;
  created_at: number;
  updated_at: number;
  started_at: number | null;
  completed_at: number | null;
  metadata: string;
}

export interface Agent {
  id: string;
  last_seen: number;
  current_task: string | null;
}

export interface TaskEvent {
  id: number;
  task_id: string;
  agent_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: number;
}

export interface TaskEventRow {
  id: number;
  task_id: string;
  agent_id: string | null;
  event_type: string;
  payload: string;
  created_at: number;
}

export interface JsonOutput<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
