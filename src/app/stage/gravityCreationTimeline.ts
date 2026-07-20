import gsap from "gsap";
import type { CompositionMode, LenoxEmotion } from "../../flow-engine/types";

export const GRAVITY_BEATS = Object.freeze({
  decision: 1.5 / 10.5,
  fall: 4 / 10.5,
  accretion: 6.5 / 10.5,
  precipitation: 9 / 10.5,
  arrival: 1,
});

export type GravityCreationOps = {
  setProgress: (progress: number) => void;
  setOperator: (target: number) => void;
  setGaze: (x: number, y: number) => void;
  setEmotion: (emotion: LenoxEmotion) => void;
  onDone: () => void;
};

function segment(progress: number, start: number, end: number): number {
  return Math.max(0, Math.min((progress - start) / Math.max(end - start, 0.001), 1));
}

function writeProgress(scope: HTMLElement, progress: number): void {
  const p = Math.max(0, Math.min(progress, 1));
  scope.style.setProperty("--creation-p", p.toFixed(4));
  scope.style.setProperty("--gravity-fall", segment(p, GRAVITY_BEATS.decision, GRAVITY_BEATS.fall).toFixed(4));
  scope.style.setProperty("--gravity-accretion", segment(p, GRAVITY_BEATS.fall, GRAVITY_BEATS.accretion).toFixed(4));
  scope.style.setProperty("--gravity-precipitation", segment(p, GRAVITY_BEATS.accretion, GRAVITY_BEATS.precipitation).toFixed(4));
  scope.style.setProperty("--gravity-arrival", segment(p, GRAVITY_BEATS.precipitation, 1).toFixed(4));
}

/**
 * The inert DOM is mounted before this runs. Priming is deliberately CSS-only:
 * no transforms are written to content that the scroll director later owns.
 */
export function primeGravityCreation(scope: HTMLElement): void {
  writeProgress(scope, 0);
  scope.dataset.creation = "decision";
  scope.querySelectorAll<HTMLElement>("[data-gravity-line]").forEach((line) => {
    line.getBoundingClientRect();
  });
}

/**
 * THE COLLAPSE has one clock and one scalar. Engine choreography, camera
 * staging, particle-announced lines and readable DOM all derive from `p`.
 */
export function gravityCreationTimeline(
  scope: HTMLElement,
  mode: CompositionMode,
  ops: GravityCreationOps,
  reduced: boolean,
): gsap.core.Timeline {
  const state = { p: 0 };
  let operatorStarted = false;
  let arrivalStarted = false;
  const duration = mode === "banded" ? 6.5 : 10.5;

  const apply = (p: number) => {
    state.p = p;
    writeProgress(scope, p);
    ops.setProgress(p);

    if (p < GRAVITY_BEATS.decision) scope.dataset.creation = "decision";
    else if (p < GRAVITY_BEATS.fall) scope.dataset.creation = "fall";
    else if (p < GRAVITY_BEATS.accretion) scope.dataset.creation = "accretion";
    else if (p < GRAVITY_BEATS.precipitation) scope.dataset.creation = "precipitation";
    else scope.dataset.creation = "arrival";

    if (!operatorStarted && p >= GRAVITY_BEATS.decision) {
      operatorStarted = true;
      ops.setOperator(1);
    }
    if (!arrivalStarted && p >= GRAVITY_BEATS.precipitation) {
      arrivalStarted = true;
      ops.setGaze(0, 0);
      ops.setEmotion("neutral");
    }
  };

  const tl = gsap.timeline({
    onComplete: () => {
      apply(1);
      scope.dataset.creation = "complete";
      ops.onDone();
    },
  });

  tl.call(() => {
    ops.setEmotion("neutral");
    ops.setGaze(0, 0);
    apply(0);
  });

  if (reduced) {
    // Same end state, without Fall/Accretion/Precipitation travel.
    tl.to(state, {
      p: GRAVITY_BEATS.decision,
      duration: 0.2,
      ease: "none",
      onUpdate: () => apply(state.p),
    });
    tl.to({}, { duration: 0.28 });
    tl.call(() => {
      operatorStarted = true;
      arrivalStarted = true;
      ops.setOperator(1);
      ops.setGaze(0, 0);
      apply(1);
    });
    tl.to({}, { duration: 0.22 });
    return tl;
  }

  tl.to(state, {
    p: 1,
    duration,
    ease: "none",
    onUpdate: () => apply(state.p),
  });

  return tl;
}
