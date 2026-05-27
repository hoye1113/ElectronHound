import type { PoolTask, TaskPriority } from './types.js';

export class TaskQueue {
  private buckets: Record<TaskPriority, PoolTask[]> = {
    high: [],
    medium: [],
    low: [],
  };

  private indices: Record<TaskPriority, number> = {
    high: 0,
    medium: 0,
    low: 0,
  };

  enqueue(task: PoolTask): void {
    this.buckets[task.priority].push(task);
  }

  dequeue(): PoolTask | undefined {
    for (const priority of ['high', 'medium', 'low'] as TaskPriority[]) {
      if (this.indices[priority] < this.buckets[priority].length) {
        const task = this.buckets[priority][this.indices[priority]];
        this.indices[priority]++;
        // Reset bucket when fully consumed to free memory
        if (this.indices[priority] >= this.buckets[priority].length) {
          this.buckets[priority] = [];
          this.indices[priority] = 0;
        }
        return task;
      }
    }
    return undefined;
  }

  remove(taskId: string): boolean {
    for (const priority of ['high', 'medium', 'low'] as TaskPriority[]) {
      const bucket = this.buckets[priority];
      const idx = bucket.findIndex(t => t.id === taskId);
      if (idx >= 0) {
        bucket.splice(idx, 1);
        if (idx < this.indices[priority]) {
          this.indices[priority]--;
        }
        return true;
      }
    }
    return false;
  }

  peek(): PoolTask | undefined {
    for (const priority of ['high', 'medium', 'low'] as TaskPriority[]) {
      if (this.indices[priority] < this.buckets[priority].length) {
        return this.buckets[priority][this.indices[priority]];
      }
    }
    return undefined;
  }

  size(): number {
    return (
      (this.buckets.high.length - this.indices.high) +
      (this.buckets.medium.length - this.indices.medium) +
      (this.buckets.low.length - this.indices.low)
    );
  }

  isEmpty(): boolean {
    return this.size() === 0;
  }
}
