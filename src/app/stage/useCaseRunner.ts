"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LenoxEmotion } from "../../flow-engine/types";
import { createCaseClock, type CaseClock } from "./caseClock";
import type { ResolvedBeat, ResolvedCase } from "./cases";

/**
 * React face of the case clock (`caseClock.ts` owns time). This hook owns the
 * accumulated artifacts and the choreography release: whenever a run is
 * killed while still on the clock, he is handed back to the visitor.
 *
 * Reduced motion does not skip the causal chain, it compresses it: the same
 * beats at 3.4x, and the decode churn is already gone (useDecode snaps). The
 * visitor who asked for less motion must not be the one who waits longest.
 */
const REDUCED_TIME_SCALE = 3.4;

export type CaseRun = {
  caseId: string | null;
  requests: string[];
  /** Index of the latest activated step; -1 before the first. */
  activeStep: number;
  fields: { label: string; value: string }[];
  outcome: boolean;
  running: boolean;
  done: boolean;
};

const IDLE_RUN: CaseRun = {
  caseId: null,
  requests: [],
  activeStep: -1,
  fields: [],
  outcome: false,
  running: false,
  done: false,
};

export type CaseRunnerHooks = {
  onEmotion: (emotion: LenoxEmotion) => void;
  /** Screen-space gaze, -0.5..0.5; (0,0) releases his eyes to the visitor. */
  onGaze: (x: number, y: number) => void;
  /** Where "the work" is on this composition (side: beside him; banded: below). */
  workGaze: readonly [number, number];
};

export function useCaseRunner(hooks: CaseRunnerHooks) {
  const [run, setRun] = useState<CaseRun>(IDLE_RUN);
  const clockRef = useRef<CaseClock | null>(null);
  const clock = () => (clockRef.current ??= createCaseClock());

  // The hooks change identity on parent renders; the running timeline must not
  // care. Same law as the build timeline.
  const hooksRef = useRef(hooks);
  useEffect(() => {
    hooksRef.current = hooks;
  }, [hooks]);

  const applyBeat = useCallback((beat: ResolvedBeat) => {
    const { onEmotion, onGaze, workGaze } = hooksRef.current;
    if (beat.emotion) onEmotion(beat.emotion);
    if (beat.gaze === "work") onGaze(workGaze[0], workGaze[1]);
    if (beat.gaze === "visitor") onGaze(0, 0);

    if (
      beat.request !== undefined ||
      beat.step !== undefined ||
      beat.field !== undefined ||
      beat.outcome
    ) {
      setRun((prev) => ({
        ...prev,
        requests:
          beat.request !== undefined
            ? [...prev.requests, beat.request]
            : prev.requests,
        activeStep: beat.step !== undefined ? beat.step : prev.activeStep,
        fields: beat.field ? [...prev.fields, beat.field] : prev.fields,
        outcome: beat.outcome ? true : prev.outcome,
      }));
    }
  }, []);

  const start = useCallback(
    (c: ResolvedCase) => {
      setRun({ ...IDLE_RUN, caseId: c.id, running: true });
      clock().start({
        beats: c.beats,
        onBeat: applyBeat,
        onComplete: () =>
          setRun((prev) => ({ ...prev, running: false, done: true })),
        timeScale: window.matchMedia("(prefers-reduced-motion: reduce)")
          .matches
          ? REDUCED_TIME_SCALE
          : undefined,
      });
    },
    [applyBeat],
  );

  /**
   * Abort or clear. If a run was still on the clock he must not be left frozen
   * mid-`acting` with scripted eyes — hand him back to the visitor.
   */
  const stop = useCallback(() => {
    if (clock().stop()) {
      hooksRef.current.onEmotion("neutral");
      hooksRef.current.onGaze(0, 0);
    }
    setRun(IDLE_RUN);
  }, []);

  // Unmount (region change, page teardown) counts as an abort.
  useEffect(() => stop, [stop]);

  return { run, start, stop };
}
