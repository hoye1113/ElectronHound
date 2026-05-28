import { describe, it, expect, beforeEach } from 'vitest';
import { StuckDetector, fingerprintObservation } from '../stuckDetection.js';
import type { Observation } from '../types.js';

function makeObs(summary: string, extra: Record<string, unknown> = {}): Observation {
  return {
    summary,
    details: { ...extra },
    timestamp: new Date().toISOString(),
  };
}

// Shared distinct observations
const o1 = makeObs('button visible');
const o2 = makeObs('modal open');
const o3 = makeObs('loading spinner');

describe('fingerprintObservation', () => {
  it('returns a deterministic string for the same Observation', () => {
    const a = makeObs('hello', { x: 1 });
    const b = makeObs('hello', { x: 1 });
    expect(fingerprintObservation(a)).toBe(fingerprintObservation(b));
  });

  it('returns different strings for different Observations', () => {
    const a = makeObs('hello', { x: 1 });
    const b = makeObs('world', { x: 1 });
    expect(fingerprintObservation(a)).not.toBe(fingerprintObservation(b));
  });

  it('sensitive to details changes', () => {
    const a = makeObs('test', { x: 1 });
    const b = makeObs('test', { x: 2 });
    expect(fingerprintObservation(a)).not.toBe(fingerprintObservation(b));
  });
});

describe('StuckDetector', () => {
  let detector: StuckDetector;

  beforeEach(() => {
    detector = new StuckDetector();
  });

  // ── Identical observations → stuck ──────────────────────────────────────

  describe('identical observations (default threshold=3)', () => {
    it('returns not stuck when fewer than 3 observations', () => {
      detector.add(o1);
      expect(detector.isStuck()).toBe(false);

      detector.add(o1);
      expect(detector.isStuck()).toBe(false);
    });

    it('returns stuck when 3 consecutive identical observations', () => {
      detector.add(o1);
      detector.add(o1);
      detector.add(o1);
      expect(detector.isStuck()).toBe(true);
    });

    it('returns stuck when 4+ consecutive identical observations', () => {
      detector.add(o1);
      detector.add(o1);
      detector.add(o1);
      detector.add(o1);
      expect(detector.isStuck()).toBe(true);
    });

    it('returns not stuck when observations differ', () => {
      detector.add(o1);
      detector.add(o2);
      detector.add(o3);
      expect(detector.isStuck()).toBe(false);
    });

    it('sliding window: only last N matter (N=threshold)', () => {
      // Push 4 alternating — window = [o1, o2, o3, o1] → last 3 = [o2, o3, o1] → not stuck
      detector.add(o1);
      detector.add(o2);
      detector.add(o3);
      detector.add(o1);
      expect(detector.isStuck()).toBe(false);

      // Now 3 identical in window → stuck
      detector.add(o1);
      detector.add(o1);
      expect(detector.isStuck()).toBe(true);
    });
  });

  // ── Different observations → not stuck ──────────────────────────────────

  describe('different observations', () => {
    it('remains not stuck with alternating pattern', () => {
      for (let i = 0; i < 10; i++) {
        detector.add(i % 2 === 0 ? o1 : o2);
      }
      expect(detector.isStuck()).toBe(false);
    });

    it('breaks stuck streak when a different observation arrives', () => {
      detector.add(o1);
      detector.add(o1);
      detector.add(o1); // stuck
      expect(detector.isStuck()).toBe(true);

      detector.add(o2); // breaks the streak
      expect(detector.isStuck()).toBe(false);
    });
  });

  // ── reset ───────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('clears the stuck state', () => {
      detector.add(o1);
      detector.add(o1);
      detector.add(o1);
      expect(detector.isStuck()).toBe(true);

      detector.reset();
      expect(detector.isStuck()).toBe(false);
    });

    it('allows fresh detection after reset', () => {
      detector.add(o1);
      detector.add(o1);
      detector.add(o1);
      detector.reset();

      detector.add(o2);
      detector.add(o2);
      expect(detector.isStuck()).toBe(false);

      detector.add(o2);
      expect(detector.isStuck()).toBe(true);
    });
  });

  // ── stuckCount property ─────────────────────────────────────────────────

  describe('stuckCount', () => {
    it('returns 0 when no observations added', () => {
      expect(detector.stuckCount).toBe(0);
    });

    it('returns 1 for a single observation', () => {
      detector.add(o1);
      expect(detector.stuckCount).toBe(1);
    });

    it('increments with identical observations', () => {
      detector.add(o1);
      expect(detector.stuckCount).toBe(1);

      detector.add(o1);
      expect(detector.stuckCount).toBe(2);

      detector.add(o1);
      expect(detector.stuckCount).toBe(3);
    });

    it('resets to 1 when a different observation arrives', () => {
      detector.add(o1);
      detector.add(o1);
      expect(detector.stuckCount).toBe(2);

      detector.add(o2);
      expect(detector.stuckCount).toBe(1);
    });

    it('returns 0 after reset', () => {
      detector.add(o1);
      detector.add(o1);
      detector.add(o1);
      detector.reset();
      expect(detector.stuckCount).toBe(0);
    });
  });

  // ── Custom threshold ────────────────────────────────────────────────────

  describe('custom threshold', () => {
    it('uses threshold=2 → stuck after 2 identical', () => {
      const d2 = new StuckDetector({ threshold: 2 });
      d2.add(o1);
      expect(d2.isStuck()).toBe(false);

      d2.add(o1);
      expect(d2.isStuck()).toBe(true);
    });

    it('uses threshold=4 → stuck after 4 identical', () => {
      const d4 = new StuckDetector({ threshold: 4 });
      d4.add(o1);
      d4.add(o1);
      d4.add(o1);
      expect(d4.isStuck()).toBe(false);

      d4.add(o1);
      expect(d4.isStuck()).toBe(true);
    });

    it('sliding window respects custom threshold', () => {
      const d2 = new StuckDetector({ threshold: 2 });
      d2.add(o1);
      d2.add(o2); // window = [o1, o2]
      expect(d2.isStuck()).toBe(false);

      d2.add(o2); // window = [o2, o2]
      expect(d2.isStuck()).toBe(true);
    });
  });

  // ── Edge: fewer observations than threshold ─────────────────────────────

  describe('edge: fewer than threshold observations', () => {
    it('empty detector is not stuck', () => {
      expect(detector.isStuck()).toBe(false);
    });

    it('threshold=1 => stuck immediately on first observation', () => {
      const d1 = new StuckDetector({ threshold: 1 });
      expect(d1.isStuck()).toBe(false);

      d1.add(o1);
      expect(d1.isStuck()).toBe(true);
    });
  });
});
