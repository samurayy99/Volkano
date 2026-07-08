/** Source-chamber conversation states (V2 signal layer). */
export type ConversationState =
  | "dormant"
  | "listening"
  | "processing"
  | "speaking"
  | "resolution";

export type PostEnterStage =
  | "none"
  | "impact"
  | "riftFlight"
  | "riftComplete"
  | "quiet"
  | "push_in"
  | "page_lock"
  | "hero";

/** Dev / tooling: full post-enter channel + truth snapshot (throttled in bridge). */
export type PostEnterDebugSnapshot = {
  stage: PostEnterStage;
  elapsedSec: number;
  run: boolean;
  gravity: number;
  solverLocked: boolean;
  postEnterArrestActive: boolean;
  postEnterArrestT: number;
  postEnterHoldT: number;
  postEnterFlightSec: number;
  postEnterFlightT: number;
  postEnterRiftFlightActive: boolean;
};

export interface FlowEngineApi {
  setInteractiveEnabled: (enabled: boolean) => void;
  setPointer: (x: number, y: number, isDown: boolean) => void;
  /** Release pointer capture for the sim (e.g. pointer leave); matches host usage. */
  clearPointer: () => void;
  /** Start post-enter sequence (idempotent if already active). */
  beginPostEnter: () => void;
  /**
   * Return from any post-enter stage to live source play (queued to the next
   * frame boundary). Emits stage "none"; a later `beginPostEnter()` runs the
   * full sequence again. No-op while no post-enter cycle is active.
   */
  resetCycle: () => void;
  /**
   * Drive the chamber's conversation profile (eased over ~0.5s). "dormant"
   * is byte-identical to plain source play. Ignored while post-enter runs.
   */
  setConversationState: (state: ConversationState) => void;
  /** 0–1 voice/typing energy; only visible in "speaking" (pulse gain). */
  setChamberEnergy: (level01: number) => void;
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
