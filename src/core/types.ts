export type Category = "编程开发" | "语言学习" | "阅读写作" | "通识学习";
export interface Task {
  id: string;
  title: string;
  category: Category;
  date: string;
  time: string | null;
  minutes: number;
  priority: "重要" | "普通" | "低优先";
  notes: string;
  completed: boolean;
}
export interface RunSegment {
  id: string;
  startedAt: number;
  endedAt: number | null;
  confirmedMs: number;
  checkpointAt: number;
  timeZone: string;
  kind: "measured" | "recovered";
}
export interface RecoveryGap {
  from: number;
  to: number;
  reason: string;
}
export interface StudySession {
  id: string;
  taskId: string;
  taskSnapshot: Task;
  status: "running" | "paused" | "ended" | "recovering";
  startedAt: number;
  endedAt: number | null;
  segments: RunSegment[];
  pendingGap: RecoveryGap | null;
  revision: number;
}
export interface TimerSnapshot {
  ready: boolean;
  tasks: Task[];
  sessions: StudySession[];
  activeSessionId: string | null;
  revision: number;
  pendingWrite: boolean;
  error: string | null;
  isController: boolean;
}
export interface DailyStats {
  actualMs: number;
  plannedMs: number;
  timedTaskCount: number;
}
export interface Clock {
  wall(): number;
  mono(): number;
}
export interface TimerService {
  init(): Promise<void>;
  subscribe(listener: () => void): () => void;
  getSnapshot(): TimerSnapshot;
  start(
    taskId: string,
    options?: { switchExisting?: boolean },
  ): Promise<string>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  end(): Promise<void>;
  recover(includeGap: boolean): Promise<void>;
  setCompleted(taskId: string, value: boolean): Promise<void>;
  saveTask(task: Task): Promise<void>;
  elapsed(session: StudySession, at?: number): number;
  daily(date: string, at?: number): DailyStats;
  exportRecords(): Promise<unknown>;
  refresh(): Promise<void>;
  dispose(): void;
}
export interface TimerOptions {
  clock?: Clock;
  dbName?: string;
  tabId?: string;
  heartbeatMs?: number;
}
