/**
 * PROOF A — the phase parameter table.
 *
 * Pure and testable on purpose: this is a table of values with response rates,
 * NOT a state machine. The engine keeps its own vocabulary; nothing here adds
 * to it. Three named parameter sets plus one reactive modulation (alertness)
 * are enough to produce AMBIENT · ATTENTION · LENOX from one solver.
 *
 * Each parameter carries its own response rate because a single global
 * interpolation reads as a parameter demo rather than as matter: the pointer
 * has to answer immediately while density has to settle slowly.
 */

export type PhaseName = "ambient" | "attention" | "lenox";

export type PhaseParams = {
  /** Pull toward the current target set. 0 = free fluid. */
  targetInfluence: number;
  /** Solver runtime. */
  noise: number;
  speed: number;
  gravity: number;
  dynamicViscosity: number;
  /** How far the ambient anchors are advected per second (sim units). */
  anchorDrift: number;
  /** Coherent-cohort lifecycle, in membership units per second. */
  coherenceRecruit: number;
  coherenceRelease: number;
};

/** Per-parameter response, in units of "fraction closed per second". */
export const RESPONSE: Record<keyof PhaseParams, number> = {
  // Target attraction is controlled: it must arrive, not snap.
  targetInfluence: 1.6,
  // Runtime settles slowly — this is the density and body of the material.
  noise: 0.9,
  speed: 0.9,
  gravity: 0.7,
  dynamicViscosity: 0.7,
  // Anchors drift on their own clock and never need to chase.
  anchorDrift: 0.5,
  coherenceRecruit: 1.8,
  coherenceRelease: 0.7,
};

/**
 * Values are starting points to be judged on video, not tuned constants.
 * `ambient` inherits the preserved source-play feel: free fluid, no settle.
 */
export const PHASES: Record<PhaseName, PhaseParams> = {
  ambient: {
    // The anchors hold the field, not gravity. Any downward pull and the
    // medium drains to the floor within a minute — measured, not assumed.
    targetInfluence: 0.075,
    noise: 1.08,
    speed: 1.02,
    gravity: 0,
    dynamicViscosity: 0.034,
    anchorDrift: 0.55,
    coherenceRecruit: 0.5,
    coherenceRelease: 0.42,
  },
  attention: {
    targetInfluence: 0.045,
    noise: 1.24,
    speed: 1.12,
    gravity: 0,
    dynamicViscosity: 0.026,
    anchorDrift: 0.85,
    coherenceRecruit: 0.9,
    coherenceRelease: 0.42,
  },
  lenox: {
    // An order of magnitude above ambient, enforced by phases.test.ts: the
    // concentration has to dominate the noise or the phase reads as "ambient,
    // slightly tidier" instead of as intent.
    targetInfluence: 0.9,
    noise: 0.72,
    speed: 0.96,
    gravity: 0,
    dynamicViscosity: 0.052,
    anchorDrift: 0.18,
    coherenceRecruit: 1.6,
    coherenceRelease: 0.42,
  },
};

/** Alertness rises fast on contact and decays at a slower, separate rate. */
export const ALERTNESS_RISE = 6.5;
export const ALERTNESS_DECAY = 0.9;

const KEYS = Object.keys(RESPONSE) as (keyof PhaseParams)[];

/** Frame-rate independent approach: same result at 60 and at 120 Hz. */
export function approach(
  current: number,
  target: number,
  rate: number,
  dt: number,
): number {
  if (rate <= 0) return target;
  return target + (current - target) * Math.exp(-rate * dt);
}

/**
 * Advance the live parameter set toward a phase. Each key moves at its own
 * rate, which is the whole point — see the file header.
 */
export function stepToward(
  current: PhaseParams,
  phase: PhaseName,
  dt: number,
): PhaseParams {
  const target = PHASES[phase];
  const next = {} as PhaseParams;
  for (const key of KEYS) {
    next[key] = approach(current[key], target[key], RESPONSE[key], dt);
  }
  return next;
}

export function initialParams(): PhaseParams {
  return { ...PHASES.ambient };
}

/** CPU mirror of the GPU lifecycle equation, kept here for invariant tests. */
export function stepCoherence(
  current: number,
  pull: number,
  recruit: number,
  release: number,
  dt: number,
): number {
  return Math.min(
    1,
    Math.max(0, current + (pull * recruit - release) * dt),
  );
}
