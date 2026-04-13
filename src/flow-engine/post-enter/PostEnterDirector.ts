import type { Vector3 } from "three/webgpu";

/**
 * Post-enter v2: time-only director. `extractMix` / `clearMix` are timeline channels for the
 * renderer (resolve + ash depletion), not the old rift-flight semantics.
 */
const POST_ENTER_PHASE_DURATIONS = Object.freeze({
  arrest: 0.36,
  resolve: 2.4,
  hold: 0.35,
  ash: 1.35,
  quiet: 1.12,
});

export type PostEnterPhase =
  | "idle"
  | "arrest"
  | "resolve"
  | "hold"
  | "ash"
  | "quiet"
  | "rotation_ready";

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
  /** Back-wall plane + inward normal + relief budget for image apparition targets (sim space). */
  apparitionPlacementSim: {
    planeZ: number;
    normal: Vector3;
    reliefMax: number;
  };
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
  /** Resolve / coherence loss (timeline channel for host / future resolve system). */
  extractMix: number;
  /** Ash / depletion (timeline channel for host / future resolve system). */
  clearMix: number;
  quietMix: number;
  solverLocked: boolean;
  rotationReady: boolean;
}

export type PostEnterFrame = {
  derived: PostEnterDerived;
  context: PostEnterContext | null;
};

/** Max seconds advanced per tick so a long `await` in the host cannot skip the whole timeline. */
const POST_ENTER_TICK_DELTA_CAP = 1 / 24;

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
    case "resolve":
      return POST_ENTER_PHASE_DURATIONS.resolve;
    case "hold":
      return POST_ENTER_PHASE_DURATIONS.hold;
    case "ash":
      return POST_ENTER_PHASE_DURATIONS.ash;
    case "quiet":
      return POST_ENTER_PHASE_DURATIONS.quiet;
    default:
      return 0;
  }
}

function getNextPhase(phase: PostEnterPhase): PostEnterPhase {
  switch (phase) {
    case "arrest":
      return "resolve";
    case "resolve":
      return "hold";
    case "hold":
      return "ash";
    case "ash":
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

  reset(): void {
    this.state = { ...IDLE_STATE };
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
    if (!Number.isFinite(context.apparitionPlacementSim.planeZ)) return false;
    if (!Number.isFinite(context.apparitionPlacementSim.reliefMax)) return false;
    if (!hasFiniteVector(context.apparitionPlacementSim.normal)) return false;
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

  tick(delta: number): void {
    if (
      this.state.postEnterPhase === "idle" ||
      this.state.postEnterPhase === "rotation_ready"
    ) {
      return;
    }

    let phase: PostEnterPhase = this.state.postEnterPhase;
    const dt = Math.min(Math.max(delta, 0), POST_ENTER_TICK_DELTA_CAP);
    let elapsed = this.state.phaseElapsed + dt;

    for (;;) {
      const duration = getPhaseDuration(phase);
      if (duration <= 0 || elapsed < duration) {
        break;
      }

      const nextPhase = getNextPhase(phase);

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
      case "resolve":
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
      case "hold":
        return {
          postEnterPhase,
          phaseElapsed,
          phaseT,
          lockMix: 1,
          extractMix: 1,
          clearMix: 0,
          quietMix: 0,
          solverLocked: true,
          rotationReady: false,
        };
      case "ash":
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
