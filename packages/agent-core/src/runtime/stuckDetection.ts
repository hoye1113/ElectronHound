/**
 * Stuck Detection — standalone detector for repeated identical observations.
 *
 * Detects when N consecutive observations are functionally identical
 * (same fingerprint via djb2 hash), signalling the agent is stuck in a loop.
 *
 * Usage:
 *   const detector = new StuckDetector({ threshold: 3 });
 *   detector.add(observation1);
 *   detector.add(observation2);
 *   detector.isStuck();   // false
 *   detector.add(observation3);  // same as obs1 & obs2
 *   detector.isStuck();   // true — 3 consecutive identical
 *   detector.reset();
 *   detector.isStuck();   // false
 */

import type { Observation } from './types.js';

/**
 * Configuration for StuckDetector.
 */
export interface StuckDetectorConfig {
  /**
   * Number of consecutive identical observations before declaring stuck.
   * @default 3
   */
  threshold?: number;
}

/**
 * Compact fingerprint of an Observation used for equality comparison.
 * Uses djb2 hashing for stable, fast string-based comparison.
 */
export function fingerprintObservation(obs: Observation): string {
  const raw = `${obs.summary}::${JSON.stringify(obs.details)}`;
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) & 0xffffffff;
  }
  return (hash >>> 0).toString(36);
}

/**
 * Standalone stuck detector.
 *
 * Tracks observation fingerprints in a rolling window.
 * When all fingerprints in the window are identical → stuck.
 */
export class StuckDetector {
  private readonly threshold: number;
  private readonly fpWindow: string[] = [];

  constructor(config: StuckDetectorConfig = {}) {
    this.threshold = config.threshold ?? 3;
  }

  /**
   * Add an observation to the detection window.
   * Automatically evicts the oldest entry when the window exceeds the threshold.
   */
  add(obs: Observation): void {
    this.fpWindow.push(fingerprintObservation(obs));
    if (this.fpWindow.length > this.threshold) {
      this.fpWindow.shift();
    }
  }

  /**
   * Returns true when the last N observations (where N = threshold) are identical.
   * Returns false if fewer than threshold observations have been added.
   */
  isStuck(): boolean {
    if (this.fpWindow.length < this.threshold) {
      return false;
    }
    return this.fpWindow.every((fp) => fp === this.fpWindow[0]);
  }

  /**
   * Returns the current consecutive identical-observation count.
   * Useful for debugging or logging.
   */
  get stuckCount(): number {
    if (this.fpWindow.length === 0) return 0;
    let count = 1;
    for (let i = this.fpWindow.length - 1; i > 0; i--) {
      if (this.fpWindow[i] === this.fpWindow[i - 1]) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  /** Clear the detection window and reset all counters. */
  reset(): void {
    this.fpWindow.length = 0;
  }
}