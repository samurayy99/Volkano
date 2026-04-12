import type { Vector3 } from "three/webgpu";

/**
 * Wall-clock durations per phase. Optional `setAdvanceGate` may still block advance,
 * but gates must not sample GPU-owned flight buffers on the CPU (no reliable mirror).
 */
const POST_ENTER_PHASE_DURATIONS = Object.freeze({
  arrest: 0.36,
  /** Room for spatial stagger + claim; phase advance uses authored time + safe gates only. */
  extract: 3.85,
  /** Through-wall / vanish tail — must not feel like a snap cut. */
  clear_hold: 0.78,
  /** Earned quiet: chamber reads calm before `rotation_ready`. */
  quiet: 1.12,
});

export type PostEnterPhase =
  | "idle"
  | "arrest"
  | "extract"
  | "clear_hold"
  | "quiet"
  | "rotation_ready";

/** Optional gate before leaving `from` for `to` (must not use CPU mirrors of GPU flight buffers). */
export type PostEnterPhaseAdvanceContext = {
  from: PostEnterPhase;
  to: PostEnterPhase;
  /** Nominal authored duration of `from` (seconds). */
  nominalDurationSec: number;
  /** Seconds past nominal end already accumulated while held in `from`. */
  overshootPastNominalSec: number;
};

export type PostEnterPhaseAdvanceGate = (
  ctx: PostEnterPhaseAdvanceContext,
) => boolean;

export interface PostEnterContext {
  freezeSpaceSim: {
    center: Vector3;
    boundsMin: Vector3;
    boundsMax: Vector3;
  };
  chamberBoundsSim: {
    min: Vector3;
    max: Vector3;
  };
  /** Back-wall intake rectangle: opposite corners in sim space (claim / capture choreography). */
  riftSlitP0Sim: Vector3;
  riftSlitP1Sim: Vector3;
}

export interface PostEnterState {
  postEnterPhase: PostEnterPhase;
  phaseElapsed: number;
}

export interface PostEnterDerived {
  postEnterPhase: PostEnterPhase;
  phaseElapsed: number;
  phaseT: number;
  lockMix: number;
  extractMix: number;
  clearMix: number;
  /** 0..1 during `quiet` only; eases optional polish. */
  quietMix: number;
  solverLocked: boolean;
  rotationReady: boolean;
}

/** One RAF handoff: director derived state + spatial context (null when idle / pre-start). */
export type PostEnterFrame = {
  derived: PostEnterDerived;
  context: PostEnterContext | null;
};

const IDLE_STATE: PostEnterState = Object.freeze({
  postEnterPhase: "idle",
  phaseElapsed: 0,
});

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function smoothstep01(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function getPhaseDuration(phase: PostEnterPhase): number {
  switch (phase) {
    case "arrest":
      return POST_ENTER_PHASE_DURATIONS.arrest;
    case "extract":
      return POST_ENTER_PHASE_DURATIONS.extract;
    case "clear_hold":
      return POST_ENTER_PHASE_DURATIONS.clear_hold;
    case "quiet":
      return POST_ENTER_PHASE_DURATIONS.quiet;
    default:
      return 0;
  }
}

function getNextPhase(phase: PostEnterPhase): PostEnterPhase {
  switch (phase) {
    case "arrest":
      return "extract";
    case "extract":
      return "clear_hold";
    case "clear_hold":
      return "quiet";
    case "quiet":
      return "rotation_ready";
    default:
      return phase;
  }
}

function hasFiniteVector(vector: Vector3): boolean {
  return (
    Number.isFinite(vector.x) &&
    Number.isFinite(vector.y) &&
    Number.isFinite(vector.z)
  );
}

const IDLE_DERIVED: PostEnterDerived = Object.freeze({
  postEnterPhase: "idle",
  phaseElapsed: 0,
  phaseT: 0,
  lockMix: 0,
  extractMix: 0,
  clearMix: 0,
  quietMix: 0,
  solverLocked: false,
  rotationReady: false,
});

export const IDLE_POST_ENTER_DERIVED = IDLE_DERIVED;

export class PostEnterDirector {
  private state: PostEnterState = { ...IDLE_STATE };

  /** Seconds spent past nominal phase end while advance was blocked (extract slack only for now). */
  private holdPastNominalSec = 0;

  private advanceGate: PostEnterPhaseAdvanceGate | null = null;

  reset(): void {
    this.state = { ...IDLE_STATE };
    this.holdPastNominalSec = 0;
    this.advanceGate = null;
  }

  /**
   * When set, `tick` may refuse to leave `from` for `to` until the gate returns true.
   * Must use only authored / uniform truth — not CPU mirrors of GPU flight buffers.
   */
  setAdvanceGate(gate: PostEnterPhaseAdvanceGate | null): void {
    this.advanceGate = gate;
  }

  isIdle(): boolean {
    return this.state.postEnterPhase === "idle";
  }

  canStart(context: PostEnterContext | null | undefined): context is PostEnterContext {
    if (!context) return false;
    if (!hasFiniteVector(context.freezeSpaceSim.center)) return false;
    if (!hasFiniteVector(context.freezeSpaceSim.boundsMin)) return false;
    if (!hasFiniteVector(context.freezeSpaceSim.boundsMax)) return false;
    if (!hasFiniteVector(context.chamberBoundsSim.min)) return false;
    if (!hasFiniteVector(context.chamberBoundsSim.max)) return false;
    if (!hasFiniteVector(context.riftSlitP0Sim)) return false;
    if (!hasFiniteVector(context.riftSlitP1Sim)) return false;
    return true;
  }

  start(context: PostEnterContext | null | undefined): boolean {
    if (!this.isIdle() || !this.canStart(context)) {
      return false;
    }

    this.state = {
      postEnterPhase: "arrest",
      phaseElapsed: 0,
    };

    return true;
  }

  /**
   * Phase clock with optional `setAdvanceGate` — otherwise same authored durations (Option A).
   */
  tick(delta: number): void {
    if (
      this.state.postEnterPhase === "idle" ||
      this.state.postEnterPhase === "rotation_ready"
    ) {
      return;
    }

    let phase: PostEnterPhase = this.state.postEnterPhase;
    let elapsed = this.state.phaseElapsed + Math.max(delta, 0);

    for (;;) {
      const duration = getPhaseDuration(phase);
      if (duration <= 0 || elapsed < duration) {
        break;
      }

      const nextPhase = getNextPhase(phase);
      const overflowSec = elapsed - duration;

      if (this.advanceGate) {
        const allow = this.advanceGate({
          from: phase,
          to: nextPhase,
          nominalDurationSec: duration,
          overshootPastNominalSec: this.holdPastNominalSec + overflowSec,
        });
        if (!allow) {
          this.holdPastNominalSec += overflowSec;
          elapsed = duration;
          break;
        }
      }

      this.holdPastNominalSec = 0;
      elapsed -= duration;
      phase = nextPhase;

      if (phase === "rotation_ready") {
        elapsed = 0;
        break;
      }
    }

    this.state = {
      postEnterPhase: phase,
      phaseElapsed: elapsed,
    };
  }

  getDerived(): PostEnterDerived {
    const { postEnterPhase, phaseElapsed } = this.state;

    if (postEnterPhase === "idle") {
      return IDLE_DERIVED;
    }

    const duration = getPhaseDuration(postEnterPhase);
    const phaseT =
      postEnterPhase === "rotation_ready"
        ? 1
        : smoothstep01(duration > 0 ? phaseElapsed / duration : 1);

    switch (postEnterPhase) {
      case "arrest":
        return {
          postEnterPhase,
          phaseElapsed,
          phaseT,
          lockMix: phaseT,
          extractMix: 0,
          clearMix: 0,
          quietMix: 0,
          solverLocked: true,
          rotationReady: false,
        };
      case "extract":
        return {
          postEnterPhase,
          phaseElapsed,
          phaseT,
          lockMix: 1,
          extractMix: phaseT,
          clearMix: 0,
          quietMix: 0,
          solverLocked: true,
          rotationReady: false,
        };
      case "clear_hold":
        return {
          postEnterPhase,
          phaseElapsed,
          phaseT,
          lockMix: 1,
          extractMix: 1,
          clearMix: phaseT,
          quietMix: 0,
          solverLocked: true,
          rotationReady: false,
        };
      case "quiet":
        return {
          postEnterPhase,
          phaseElapsed,
          phaseT,
          lockMix: 1,
          extractMix: 1,
          clearMix: 1,
          quietMix: phaseT,
          solverLocked: true,
          rotationReady: false,
        };
      case "rotation_ready":
        return {
          postEnterPhase,
          phaseElapsed,
          phaseT: 1,
          lockMix: 1,
          extractMix: 1,
          clearMix: 1,
          quietMix: 1,
          solverLocked: true,
          rotationReady: true,
        };
      default:
        return IDLE_DERIVED;
    }
  }
}
