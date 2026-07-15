import gsap from "gsap";
import type { ResolvedBeat } from "./cases";

/**
 * The case clock, with no React in it. ONE timeline per run — the transcript,
 * the process rail, the dossier and HIM are beats on the same clock, exactly
 * like the build. The hook (`useCaseRunner`) owns state and choreography
 * release; this owns time, so that "a killed run reports whether he was still
 * on the clock" is a testable fact rather than a hope.
 */
export type CaseClockRun = {
  beats: readonly ResolvedBeat[];
  onBeat: (beat: ResolvedBeat) => void;
  onComplete: () => void;
  /** Reduced motion compresses the same causal chain; it never skips it. */
  timeScale?: number;
};

export type CaseClock = {
  /** Starts a run, killing any previous one first. */
  start: (run: CaseClockRun) => void;
  /**
   * Kill the clock. Returns true if a run was still active — the caller must
   * then hand him back to the visitor (neutral, released gaze), or he is left
   * frozen mid-`acting` on a region that no longer exists.
   */
  stop: () => boolean;
};

export function createCaseClock(): CaseClock {
  let tl: gsap.core.Timeline | null = null;

  return {
    start(run: CaseClockRun): void {
      tl?.kill();
      const timeline = gsap.timeline({ onComplete: run.onComplete });
      for (const beat of run.beats) {
        timeline.call(() => run.onBeat(beat), undefined, beat.at);
      }
      // A short tail so the last beat is not also the completion frame.
      timeline.to({}, { duration: 0.4 }, ">");
      if (run.timeScale) timeline.timeScale(run.timeScale);
      tl = timeline;
    },

    stop(): boolean {
      const active = tl?.isActive() ?? false;
      tl?.kill();
      tl = null;
      return active;
    },
  };
}
