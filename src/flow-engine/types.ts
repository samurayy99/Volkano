/**
 * Lenox lifecycle. Canonical: dormant → engaged → armed → awakening →
 * present. Legacy aliases (idle/attract/waking/alive) are still accepted
 * by the drive and used by the proof harness.
 */
export type LenoxProofState =
  | "dormant"
  | "engaged"
  | "armed"
  | "awakening"
  | "present"
  | "idle"
  | "attract"
  | "waking"
  | "alive";

/**
 * The eight LENOX PRIME display states (alive). These are system states, not
 * human moods: the visor communicates what Lenox is doing, not how it feels.
 */
export type LenoxEmotion =
  | "neutral"
  | "curious"
  | "pleased"
  | "concerned"
  | "listening"
  | "thinking"
  | "speaking"
  | "acting";

/**
 * Transient reactions layered over a state. `confirm` is the only signal that
 * leaves cyan: an amber checkmark for a confirmed / completed result.
 */
export type LenoxReaction = "laugh" | "startle" | "tired" | "confirm";

/**
 * A discrete body instruction. The engine eases and layers it over the
 * authored vessel pose; React never owns bones or continuous body motion.
 */
export type LenoxIntent =
  | { kind: "rest" }
  | { kind: "observe" }
  | {
      kind: "guide";
      targetNdc: { x: number; y: number };
      arm: "left" | "right";
      reach?: number;
    }
  | { kind: "confirm" };

/** Canonical inner state shared by body material, GRAVITY and DOM tokens. */
export type LenoxSignals = {
  energy: number;
  attention: number;
  tension: number;
};

/**
 * How the stage is composed. "side" — he steps aside (desktop). "banded" — he
 * steps up (phone). Same gesture, different axis. Decided once, in
 * `src/app/stage/compositionMode.ts`, and pushed here.
 */
export type CompositionMode = "side" | "banded";

/**
 * The signature worlds (DER BEGLEITER). Lenox himself is never themed — a
 * signature is the room he stands in: backdrop, floor, his reflections, and
 * the DOM token set on the stage side.
 */
export type LenoxSignatureId = "obsidian" | "alabaster";

/**
 * Journey camera pose (DER BEGLEITER, Slice 2). Frustum-relative units:
 * zoom multiplies distance; shifts are in half-widths/-heights, so a pose
 * composes identically on every viewport. The engine eases; the scroll
 * director owns the values.
 */
export type LenoxJourneyPose = {
  zoom?: number;
  shiftX?: number;
  shiftY?: number;
};

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
  /** Lenox proof (bridge in lenoxMode only; no-ops otherwise). */
  setLenoxState: (state: LenoxProofState) => void;
  /** Gaze target in centered NDC (-0.5..0.5, +y up). Lenox mode only. */
  setLenoxGaze: (x: number, y: number) => void;
  /** Expressive emotion preset (Lenox mode, alive state). */
  setLenoxEmotion: (emotion: LenoxEmotion) => void;
  /** Temporary reaction (laugh/startle/tired). Lenox mode only. */
  setLenoxReaction: (reaction: LenoxReaction) => void;
  /** Discrete body intent; continuous easing remains engine-owned. */
  setLenoxIntent: (intent: LenoxIntent) => void;
  /** A/B the instrumental eye layer against the current display face. */
  setLenoxEyeRigEnhanced: (enabled: boolean) => void;
  /** Which way he makes room when the page is built. Lenox mode only. */
  setCompositionMode: (mode: CompositionMode) => void;

  /* ── Phase field (prototype mode) ──────────────────────────────────────
   * A neutral target surface over the existing settle machinery. The solver's
   * own vocabulary is the retired eye rig — its target `w` encodes role bands
   * (shell/aura/lid/focal), `settleOffset` is gaze and `settleSquashT` is
   * blink. Phase field writes w = 0 throughout, which makes that hierarchy
   * inert, and never touches the gaze/blink/float channels. Nothing above the
   * engine should inherit that vocabulary, hence these names.
   */

  /** Absolute sim-space target positions (xyz triples). Written with w = 0. */
  setParticleTargets: (positions: Float32Array, count?: number) => void;
  /** How hard matter is pulled to its targets. 0 = free fluid. */
  setTargetInfluence: (value: number) => void;
  /** Ambient anchoring — a weak pull that stabilises without freezing. */
  setReturnInfluence: (value: number) => void;
  /** Pointer in client pixels; the bridge derives smoothed, clamped speed. */
  setPointerSample: (clientX: number, clientY: number) => void;
  /** Smoothed pointer speed in px/s, for the lab HUD. */
  getPointerSpeed: () => number;
  /** Patch engine runtime (noise/speed/gravity/viscosity/particles/size...). */
  applyEngineRuntime: (patch: Record<string, unknown>) => void;
  /** Environment map source for the K4 A/B. */
  setEnvironment: (source: "procedural" | "studio" | "meadow") => void;
  /** Substance tint over the existing silver law. `strength` 0 = untouched. */
  setSubstance: (hexColor: number, strength: number) => void;
  /** Instant signature world (boot / reduced motion). Lenox mode only. */
  setSignature: (id: LenoxSignatureId) => void;
  /** Arm the world behind the reconstruction front. Lenox mode only. */
  setSignatureTarget: (id: LenoxSignatureId) => void;
  /** Drive the front, 0..1 — ONE clock outside owns the easing. */
  setSignatureScan: (t: number) => void;
  /** The target world becomes the world; front resets. */
  commitSignature: () => void;
  /** The one transform scalar: physics, front, flare and env derive from it. */
  setTransformProgress: (p: number) => void;
  /** GRAVITY creation + Arrival scalar. Exclusive GPU flight derives from it. */
  setGravityCreationProgress: (p: number, reduced?: boolean) => void;
  /** The one journey director forwards its scroll progression to the living field. */
  setGravityScrollProgress: (p: number) => void;
  dispose: () => void;
}

export interface FlowEngineBridgeOptions {
  onError?: (error: unknown) => void;
  /** Lenox proof: void visual (no vessel), LenoxEyesDrive owns the runtime. */
  lenoxMode?: boolean;
  /** Compresses the awakening timeline and calms all motion. */
  lenoxReducedMotion?: boolean;
  /**
   * Lenox mode only. The lacquer backdrop is an opaque plane and belongs to hosts
   * where the engine owns the whole picture. A host that composes its own world
   * behind the canvas passes false and receives particles and Lenox on
   * transparency. Default true.
   */
  lenoxBackdrop?: boolean;
  /**
   * Phase-field prototype: builds the void visual and the free-fluid seed like
   * lenoxMode, but constructs no LenoxEyesDrive — that drive owns the retired
   * wake sequence (dormant → awakening → present) including the vetoed robot
   * face and the authored-character handoff. The host owns runtime and pointer
   * influence instead.
   *
   * PROTOTYPE MECHANICS, NOT FINAL ARCHITECTURE. If phase field survives its
   * gate, this and `lenoxMode` should collapse into one explicit
   * `experienceMode: "legacy-lenox" | "phase-field"` rather than grow into
   * boolean soup.
   */
  phaseField?: boolean;
  /** Fires when the effective Lenox state changes (waking auto-advances). */
  onLenoxStateChange?: (state: LenoxProofState) => void;
  /** Throttled engine-owned state for inherited CSS tokens; never per-frame React state. */
  onLenoxSignals?: (signals: LenoxSignals) => void;
  /** WebGPU device was lost after a successful init. Host commits to a static end state. */
  onDeviceLost?: (info: unknown) => void;
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
