'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConvergenceController } from '../core/convergence-controller';

const TIMELINE_DURATION_MS = 3600;
const TIMELINE_TIME_SPLIT = 0.56;
const TIMELINE_PROGRESS_SPLIT = 0.88;

function easeOutCubic(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - Math.pow(1 - t, 3);
}

function smoothstep(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

function easedProgress(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  // Front-load the authored run so the matter starts converging much earlier,
  // but keep a long, controlled tail for the late freeze band.
  if (t < TIMELINE_TIME_SPLIT) {
    const localT = t / TIMELINE_TIME_SPLIT;
    return TIMELINE_PROGRESS_SPLIT * easeOutCubic(localT);
  }

  const localT = (t - TIMELINE_TIME_SPLIT) / (1 - TIMELINE_TIME_SPLIT);
  return TIMELINE_PROGRESS_SPLIT + (1 - TIMELINE_PROGRESS_SPLIT) * smoothstep(localT);
}

export interface UseConvergenceTimelineResult {
  hasTriggered: boolean;
  start(): void;
}

export function useConvergenceTimeline(
  controller: ConvergenceController,
): UseConvergenceTimelineResult {
  const hasTriggeredRef = useRef(false);
  const [hasTriggered, setHasTriggered] = useState(false);
  const frameRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);

  const tick = useCallback(
    (now: number) => {
      const elapsed = now - startTimeRef.current;
      const t = Math.min(elapsed / TIMELINE_DURATION_MS, 1);
      const progress = easedProgress(t) * 100;

      controller.setProgress(progress, 'enter');

      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        frameRef.current = null;
      }
    },
    [controller],
  );

  const start = useCallback(() => {
    if (hasTriggeredRef.current) return;

    const snapshot = controller.getSnapshot();
    if (snapshot.rotationActive || snapshot.rotationComplete) return;

    hasTriggeredRef.current = true;
    setHasTriggered(true);
    startTimeRef.current = performance.now();
    frameRef.current = requestAnimationFrame(tick);
  }, [controller, tick]);

  useEffect(() => {
    return () => {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, []);

  return { hasTriggered, start };
}
