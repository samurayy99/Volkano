/**
 * Lenox eyes proof driver (dev route only).
 *
 * Third runtime author next to postEnterDrive / sourceChamberDrive; the
 * bridge runs exactly one per frame. States:
 *
 *   idle    — drifting silver/cyan cloud, pointer magnetism at normal gain
 *   attract — pointer magnetism boosted (the "play with me" feel)
 *   waking  — one-shot gather: mass converges into a single organic sphere
 *   alive   — one-shot eye targets: two eye density fields, gaze follows
 *             pointer via `settleOffset`, weight breathes so the eyes never
 *             read as static emoji
 *
 * All shape authoring is a CPU one-shot (`buildLenoxClusterTargets`), never
 * per frame; gaze is a rigid uniform offset, so zero per-frame uploads.
 */

const SOURCE_PLAY_BASE = Object.freeze({
  gravity: 1,
  noise: 1.08,
  speed: 1.02,
  dynamicViscosity: 0.034,
});

const EASE_TAU_SEC = 0.45;
const WAKE_DURATION_SEC = 2.4;

/** Sim-space layout (64³ grid, chamberFlowCenter ≈ (32, 31.8, 30.4)). */
const GATHER_CLUSTER = [
  { center: [32, 34, 30], radii: [6.5, 6.0, 4.5] },
];
// Fluid pressure inflates clusters well past their authored radii (32k
// particles vs. rest density), so author tighter/rounder than the target
// read and keep a wide gap between the eyes.
const EYE_CLUSTERS = [
  { center: [18.5, 37, 30], radii: [3.2, 3.6, 2.2] },
  { center: [45.5, 37, 30], radii: [3.2, 3.6, 2.2] },
];

/** Max rigid eye shift from gaze, in grid units. */
const GAZE_RANGE = Object.freeze({ x: 2.4, y: 1.6 });
const GAZE_EASE = 0.085;

const BREATHE_RATE_HZ = 0.22;
const BREATHE_DEPTH = 0.07;

const PROFILES = Object.freeze({
  idle: {
    noiseMul: 1.05,
    speedMul: 0.95,
    viscosityMul: 1.4,
    gravityMul: 0.1,
    settleWeight: 0,
    pointerInfluence: 1,
  },
  attract: {
    noiseMul: 0.75,
    speedMul: 1.0,
    viscosityMul: 1.6,
    gravityMul: 0.06,
    settleWeight: 0.05,
    pointerInfluence: 2.4,
  },
  waking: {
    noiseMul: 0.35,
    speedMul: 1.2,
    viscosityMul: 3.2,
    gravityMul: 0,
    settleWeight: 0.85,
    pointerInfluence: 0.4,
  },
  alive: {
    noiseMul: 0.16,
    speedMul: 0.8,
    viscosityMul: 4.5,
    gravityMul: 0,
    settleWeight: 0.95,
    pointerInfluence: 0.6,
  },
});

export class LenoxEyesDrive {
  constructor() {
    this.current = { ...PROFILES.idle };
    this.requestedState = "idle";
    this.activeState = "idle";
    this.stateElapsed = 0;
    this.breathePhase = 0;
    this.gazeX = 0;
    this.gazeY = 0;
    this.gazeTargetX = 0;
    this.gazeTargetY = 0;
    this.authoredShape = null; // "gather" | "eyes" | null
  }

  /** @param {"idle"|"attract"|"waking"|"alive"} state */
  setState(state) {
    if (!PROFILES[state] || state === this.requestedState) return;
    this.requestedState = state;
  }

  /** Pointer in NDC-ish (-0.5..0.5, +y = up). */
  setGazeTarget(x, y) {
    this.gazeTargetX = Math.max(-0.5, Math.min(0.5, x));
    this.gazeTargetY = Math.max(-0.5, Math.min(0.5, y));
  }

  /**
   * Author runtime for this frame. Returns the effective state so the bridge
   * can emit changes (waking auto-advances to alive).
   */
  update(app, dt) {
    const rt = app?.runtime;
    if (!rt) return this.activeState;

    // Enter-state one-shots.
    if (this.requestedState !== this.activeState) {
      this.activeState = this.requestedState;
      this.stateElapsed = 0;
      if (this.activeState === "waking" && this.authoredShape !== "gather") {
        app.mlsMpmSim?.buildLenoxClusterTargets?.(GATHER_CLUSTER);
        this.authoredShape = "gather";
      }
      if (this.activeState === "alive" && this.authoredShape !== "eyes") {
        app.mlsMpmSim?.buildLenoxClusterTargets?.(EYE_CLUSTERS);
        this.authoredShape = "eyes";
      }
    }

    this.stateElapsed += Math.max(dt, 0);

    // Waking auto-advance: after the gather beat, form the eyes.
    if (this.activeState === "waking" && this.stateElapsed >= WAKE_DURATION_SEC) {
      this.requestedState = "alive";
    }

    // Ease channel values toward the state profile.
    const target = PROFILES[this.activeState];
    const k = 1 - Math.exp(-Math.max(dt, 0) / EASE_TAU_SEC);
    const cur = this.current;
    for (const key of Object.keys(cur)) {
      cur[key] += (target[key] - cur[key]) * k;
    }

    // Breathing on the settle weight so the alive shape stays organic.
    this.breathePhase += dt * BREATHE_RATE_HZ * Math.PI * 2;
    const breathe =
      this.activeState === "alive"
        ? 1 + Math.sin(this.breathePhase) * BREATHE_DEPTH
        : 1;

    // Gaze: eased rigid offset of the settle targets.
    this.gazeX += (this.gazeTargetX - this.gazeX) * GAZE_EASE;
    this.gazeY += (this.gazeTargetY - this.gazeY) * GAZE_EASE;
    const gazeOn = this.activeState === "alive" ? 1 : 0;

    rt.noise = SOURCE_PLAY_BASE.noise * cur.noiseMul;
    rt.speed = SOURCE_PLAY_BASE.speed * cur.speedMul;
    rt.dynamicViscosity = SOURCE_PLAY_BASE.dynamicViscosity * cur.viscosityMul;
    rt.gravity = SOURCE_PLAY_BASE.gravity * cur.gravityMul;

    rt.settleWeight = cur.settleWeight * breathe;
    rt.settleOffset.set(
      this.gazeX * 2 * GAZE_RANGE.x * gazeOn,
      this.gazeY * 2 * GAZE_RANGE.y * gazeOn,
      0,
    );

    // Silence every other authored channel; Lenox owns the frame.
    rt.returnBodyWeight = 0;
    rt.recallLateralWeight = 0;
    rt.recallVerticalWeight = 0;
    rt.convergenceSlowdown = 0;
    rt.convergenceFreeze = 0;
    rt.convergenceHeatRetention = 0;
    rt.convergenceThermalExtinction = 0;
    rt.compressT = 0;
    rt.thinT = 0;
    rt.massDimT = 0;
    rt.opacityT = 0;
    rt.materialClaimT = 0;

    rt.lenoxTintT = 1;

    app.setPointerInfluence(cur.pointerInfluence);

    return this.activeState;
  }
}
