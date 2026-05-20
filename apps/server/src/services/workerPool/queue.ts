import type { PoolTask, TaskPriority } from './types.js';

export class TaskQueue {
  private buckets: Record<TaskPriority, PoolTask[]> = {
    high: [],
    medium: [],
    low: [],
  };

  enqueue(task: PoolTask): void {
    this.buckets[task.priority].push(task);
  }

  dequeue(): PoolTask | undefined {
    if (this.buckets.high.length > 0) return this.buckets.high.shift();
    if (this.buckets.medium.length > 0) return this.buckets.medium.shift();
    if (this.buckets.low.length > 0) return this.buckets.low.shift();
    return undefined;
  }

  remove(taskId: string): boolean {
    for (const priority of ['high', 'medium', 'low'] as TaskPriority[]) {
      const bucket = this.buckets[priority];
      const idx = bucket.findIndex(t => t.id === taskId);
      if (idx >= 0) {
        bucket.splice(idx, 1);
        return true;
      }
    }
    return false;
  }

  peek(): PoolTask | undefined {
    if (this.buckets.high.length > 0) return this.buckets.high[0];
    if (this.buckets.medium.length > 0) return this.buckets.medium[0];
    if (this.buckets.low.length > 0) return this.buckets.low[0];
    return undefined;
  }

  size(): number {
    return Object.values(this.buckets).reduce((acc, b) => acc + b.length, 0);
  }

  isEmpty(): boolean {
    return this.size() === 0;
  }
}
