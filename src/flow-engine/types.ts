export type PostEnterStage =
  | "none"
  | "impact"
  | "compress"
  | "hold"
  | "withdraw"
  | "quiet"
  | "push_in"
  | "page_lock"
  | "hero";

/** Dev / tooling: full post-enter channel + truth snapshot (throttled in bridge). */
export type PostEnterDebugSnapshot = {
  stage: PostEnterStage;
  elapsedSec: number;
  /** MLS thermal/freeze channel (solver). */
  convergenceFreeze: number;
  heroBodyWeight: number;
  /** Canonical slit-carved return-body spring for early compress/hold. */
  returnBodyWeight: number;
  /** MLS recall spring weights (solver): xz vs y for sink-before-dissolve read. */
  recallLateralWeight: number;
  recallVerticalWeight: number;
  settleWeight: number;
  settleDissolveUnlocked: number;
  compressT: number;
  coolT: number;
  thinT: number;
  /**
   * App-only smoothed withdraw phase in [0, 1] (not passed to the particle shader as a uniform).
   * Used for timeline truth / completion gating; renderer-side dissolve still keys off `opacityT`.
   */
  withdrawT: number;
  opacityT: number;
  backBiasT: number;
  authorityLightT: number;
  pushInT: number;
  pageLockT: number;
  heroT: number;
  solverLocked: boolean;
  freezeSnapshotReady: boolean;
  withdrawalDone: boolean;
  quietLocked: boolean;
  cameraArrived: boolean;
  pageLocked: boolean;
  heroAllowed: boolean;
};

export interface FlowEngineApi {
  setInteractiveEnabled: (enabled: boolean) => void;
  setPointer: (x: number, y: number, isDown: boolean) => void;
  /** Release pointer capture for the sim (e.g. pointer leave); matches host usage. */
  clearPointer: () => void;
  /** Start post-enter sequence (idempotent if already active). */
  beginPostEnter: () => void;
  dispose: () => void;
}

export interface FlowEngineBridgeOptions {
  onError?: (error: unknown) => void;
  onPostEnterStageChange?: (stage: PostEnterStage) => void;
  /**
   * Dev-only: throttled (~12 Hz) while post-enter runs. Do not rely on this in production UI.
   */
  onPostEnterDebugSnapshot?: (snapshot: PostEnterDebugSnapshot) => void;
}

export interface FlowEngineHostProps {
  onReady?: (api: FlowEngineApi) => void;
  onError?: (error: unknown) => void;
  className?: string;
  /** Fires only when `PostEnterStage` enum changes (not every frame). */
  onPostEnterStageChange?: (stage: PostEnterStage) => void;
  /** Dev-only: throttled post-enter telemetry (see `PostEnterDebugSnapshot`). */
  onPostEnterDebugSnapshot?: (snapshot: PostEnterDebugSnapshot) => void;
  /**
   * Called once immediately after WebGPU init succeeds, before `onReady`.
   * Supplies pointer gating for the live chamber (e.g. reduced motion).
   */
  syncInteractiveFromHost?: () => { interactiveEnabled: boolean };
}
