export type TaskPriority = 'high' | 'medium' | 'low';
export type PoolTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface PoolTask {
  id: string;
  goal: string;
  targetAppPath: string;
  llmModel: string;
  maxSteps?: number;
  contextInjection?: string;
  providerId?: string;
  priority: TaskPriority;
  /** Base directory for saving reports, screenshots, etc. */
  dataDir?: string;
}

export interface PoolTaskHandle {
  taskId: string;
  status: PoolTaskStatus;
  priority: TaskPriority;
  submittedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface PoolConfig {
  maxConcurrency: number;
}

export interface TaskExecutor {
  execute(task: PoolTask, onComplete: (taskId: string, result: 'completed' | 'failed', error?: string) => void): void;
  cancel(taskId: string): void;
}

export interface PoolEvent {
  taskId: string;
  type: 'started' | 'completed' | 'failed' | 'cancelled';
  error?: string;
}
