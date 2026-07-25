import * as THREE from "three/webgpu";
import App from "./app.js";
import { SourceChamberDrive } from "./source-chamber/sourceChamberDrive.js";
import { LenoxEyesDrive } from "./lenox/lenoxEyesDrive.js";
import type {
  CompositionMode,
  ConversationState,
  FlowEngineApi,
  FlowEngineBridgeOptions,
  LenoxEmotion,
  LenoxIntent,
  LenoxJourneyPose,
  LenoxProofState,
  LenoxReaction,
  LenoxSignals,
  LenoxSignatureId,
  PostEnterDebugSnapshot,
  PostEnterStage,
} from "./types";

const CONVERSATION_STATES: readonly ConversationState[] = [
  "dormant",
  "listening",
  "processing",
  "speaking",
  "resolution",
];

/** MLS runtime for perpetual source-chamber play (no Enter / convergence tail). */
function sourcePlayEngineRuntime() {
  return {
    gravity: 1,
    noise: 1.08,
    speed: 1.02,
    dynamicViscosity: 0.034,
    convergenceSlowdown: 0,
    convergenceFreeze: 0,
    convergenceHeatRetention: 0,
    convergenceThermalExtinction: 0,
  };
}

export class FlowEngineBridge implements FlowEngineApi {
  private readonly container: HTMLElement;
  private readonly options: FlowEngineBridgeOptions;
  private renderer: any | null = null;
  private app: any | null = null;
  private clock = new THREE.Clock();
  private rafId = 0;
  private disposed = false;
  private interactiveEnabled = true;
  private hidden = false;
  private resizeObserver: ResizeObserver | null = null;
  private postEnterActive = false;
  private postEnterElapsed = 0;
  private resetRequested = false;
  private conversationState: ConversationState = "dormant";
  private chamberEnergy = 0;
  private chamberDrive = new SourceChamberDrive();
  private lenoxDrive: LenoxEyesDrive | null = null;
  private lastLenoxState: LenoxProofState = "idle";
  /** React usually knows the composition before the GPU is up; hold it until then. */
  private pendingCompositionMode: CompositionMode = "side";
  /** Rolling engine tick time (ms), exposed as __LENOX_PERF__ in Lenox mode. */
  private engineMsAvg: number | null = null;
  private deviceLossArmed = false;
  private gravityQualityApplied = false;
  private lenoxSignalAccum = 0;
  /**
   * Phase field: smoothed pointer speed in px/s. `mouseForce` in the solver is
   * already the raw per-frame position delta, so direction and base magnitude
   * follow motion for free — what is missing is smoothing, a ceiling, and a
   * response curve that lets slow motion push at all. All of that is CPU-side;
   * the solver is not modified.
   */
  private pointerSpeed = 0;
  private lastPointerSample: { x: number; y: number; t: number } | null = null;
  private lastPostEnterStage: PostEnterStage = "none";
  private postEnterDebugAccum = 0;
  private static readonly POST_ENTER_DEBUG_INTERVAL_SEC = 1 / 12;

  constructor(container: HTMLElement, options: FlowEngineBridgeOptions = {}) {
    this.container = container;
    this.options = options;
  }

  async init(): Promise<void> {
    if (!navigator.gpu) {
      throw new Error("WebGPU is not available in this browser.");
    }

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const renderer = new THREE.WebGPURenderer({ alpha: true, antialias: true });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    await renderer.init();

    if (!(renderer.backend as any)?.isWebGPUBackend) {
      throw new Error("Could not initialize a WebGPU backend.");
    }

    this.renderer = renderer;
    const device = (renderer.backend as any)?.device as GPUDevice | undefined;
    if (device && !this.deviceLossArmed) {
      this.deviceLossArmed = true;
      void device.lost.then((info) => {
        if (!this.disposed && info.reason !== "destroyed") {
          this.options.onDeviceLost?.(info);
        }
      });
    }
    this.container.appendChild(renderer.domElement);

    const voidVisual = this.options.lenoxMode || this.options.phaseField;
    const app = new App(renderer, {
      visualMode: voidVisual ? "void" : "chamber",
      backdrop: this.options.lenoxBackdrop !== false,
    });
    this.app = app;
    await app.init(width, height);
    // Before the first frame: the engine must never compose from its own guess.
    app.setCompositionMode?.(this.pendingCompositionMode);
    if (this.options.lenoxMode && !this.options.phaseField) {
      this.lenoxDrive = new LenoxEyesDrive({
        reducedMotion: this.options.lenoxReducedMotion,
      });
    }

    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(this.container);
    this.onResize();

    this.app.promoteIdlePopulation();
    if (this.options.lenoxMode || this.options.phaseField) {
      // First contact: one compact central ignition bursts into the same
      // projected viewport box it later ricochets inside. No settle target,
      // reservoir or spring is introduced after the launch.
      this.app.mlsMpmSim?.seedLenoxDustPopulation?.({
        bounds: {
          min: this.app.runtime?.simBoundsMin,
          max: this.app.runtime?.simBoundsMax,
        },
        zBase: 30,
        spreadZ: 2.8,
      });
    }
    this.app.clearPointer();
    this.app.applyEngineRuntime(sourcePlayEngineRuntime());
    document.addEventListener("visibilitychange", this.onVisibilityChange);

    this.clock.start();
    this.rafId = requestAnimationFrame(this.animate);
  }

  setInteractiveEnabled(enabled: boolean): void {
    if (this.disposed) return;

    this.interactiveEnabled = enabled;
    if (!this.app) return;

    if (this.postEnterActive) {
      this.app.setPointerInfluence(0);
      if (!enabled) {
        this.app.clearPointer();
      }
      return;
    }

    this.app.applyEngineRuntime(sourcePlayEngineRuntime());
    this.app.setPointerInfluence(enabled ? 1 : 0);

    if (!enabled) {
      this.app.clearPointer();
    }
  }

  setPointer(x: number, y: number, isDown: boolean): void {
    if (this.disposed || !this.app) return;

    const rect = this.container.getBoundingClientRect();
    const width = Math.max(rect.width, 1);
    const height = Math.max(rect.height, 1);

    const localX = (x - rect.left) / width;
    const localY = (y - rect.top) / height;

    if (!this.interactiveEnabled || this.postEnterActive) {
      return;
    }

    this.app.setPointer(localX, localY, isDown);
  }

  clearPointer(): void {
    if (this.disposed || !this.app) return;
    this.app.clearPointer();
  }

  setConversationState(state: ConversationState): void {
    if (this.disposed || !CONVERSATION_STATES.includes(state)) return;
    this.conversationState = state;
  }

  setLenoxState(state: LenoxProofState): void {
    if (this.disposed) return;
    this.lenoxDrive?.setState(state);
  }

  setLenoxGaze(x: number, y: number): void {
    if (this.disposed) return;
    this.lenoxDrive?.setGazeTarget(x, y);
  }

  setLenoxEmotion(emotion: LenoxEmotion): void {
    if (this.disposed) return;
    this.lenoxDrive?.setEmotion(emotion);
  }

  setLenoxReaction(reaction: LenoxReaction): void {
    if (this.disposed) return;
    this.lenoxDrive?.triggerReaction(reaction);
    if (reaction === "confirm") this.app?.setLenoxIntent?.({ kind: "confirm" });
  }

  setLenoxIntent(intent: LenoxIntent): void {
    if (this.disposed) return;
    this.app?.setLenoxIntent?.(intent);
  }

  setLenoxEyeRigEnhanced(enabled: boolean): void {
    if (this.disposed) return;
    this.app?.setLenoxEyeRigEnhanced?.(enabled);
  }

  /** Dev (lenox proof): hide particles to verify the gaze rig on its own. */
  setLenoxParticlesVisible(visible: boolean): void {
    if (this.disposed || !this.lenoxDrive) return;
    this.app?.setParticlesVisible?.(visible);
  }

  /** 0 = centred, 1 = out of the way. WHICH way is the composition's business. */
  setLenoxOperator(target: number, tau?: number): void {
    if (this.disposed) return;
    this.app?.setLenoxOperator?.(target, tau);
  }

  /** Journey camera pose (scroll director → engine; engine eases). */
  setJourneyPose(pose: LenoxJourneyPose, tau?: number): void {
    if (this.disposed) return;
    this.app?.setLenoxJourneyPose?.(pose, tau);
  }

  /**
   * Which way he makes room. React is the single source of this (there is no
   * second opinion in the engine any more) and pushes it here on mount and on
   * every resize that is allowed to change it.
   */
  setCompositionMode(mode: CompositionMode): void {
    if (this.disposed) return;
    this.pendingCompositionMode = mode;
    this.app?.setCompositionMode?.(mode);
  }

  /* ── Phase field ─────────────────────────────────────────────────────────
   * Neutral surface over the existing settle machinery. Targets are written
   * with w = 0 so the solver's role bands (shell/aura/lid/focal) and the gaze
   * offset they gate stay provably inert; gaze, blink and float channels are
   * never touched from here.
   */

  setParticleTargets(positions: Float32Array, count?: number): void {
    if (this.disposed) return;
    const n = count ?? Math.floor(positions.length / 3);
    this.app?.mlsMpmSim?.buildLenoxShellTargets?.(positions, n);
  }

  setTargetInfluence(value: number): void {
    if (this.disposed) return;
    const sim = this.app?.mlsMpmSim;
    if (!sim?.uniforms) return;
    sim.uniforms.settleWeight.value = Math.max(0, value);
    // Uniform damping: with w = 0 everywhere only the shell rate is ever read,
    // but both are set so a stale focal value can never leak in.
    const damp = value > 0.0005 ? 12 : 0;
    sim.uniforms.settleDampingShell.value = damp;
    sim.uniforms.settleDampingFocal.value = damp;
  }

  setReturnInfluence(value: number): void {
    this.setTargetInfluence(value);
  }

  /**
   * Pointer speed shapes the response curve. Slow motion produces a tiny
   * `mouseForce` on its own and would barely displace anything, so influence is
   * raised at low speed (push) and tapered at high speed (tear without
   * exploding). The first sample after idle, and any jump larger than a touch
   * could plausibly travel, produces no impulse at all.
   */
  setPointerSample(clientX: number, clientY: number): void {
    if (this.disposed) return;
    const now = performance.now();
    const prev = this.lastPointerSample;
    this.lastPointerSample = { x: clientX, y: clientY, t: now };

    if (!prev) {
      this.pointerSpeed = 0;
      this.app?.setPointerInfluence?.(0);
      return;
    }
    const dt = (now - prev.t) / 1000;
    if (dt <= 0 || dt > 0.25) {
      // Resume after idle, or a tab that was hidden: re-seed without an impulse.
      this.pointerSpeed = 0;
      this.app?.setPointerInfluence?.(0);
      return;
    }
    const dx = clientX - prev.x;
    const dy = clientY - prev.y;
    const raw = Math.sqrt(dx * dx + dy * dy) / dt;
    const jump = Math.sqrt(dx * dx + dy * dy) > 400;
    const capped = Math.min(jump ? 0 : raw, 4000);
    // Short EMA — enough to kill jitter, short enough to stay responsive.
    this.pointerSpeed = this.pointerSpeed * 0.7 + capped * 0.3;

    const s = this.pointerSpeed;
    const slowPush = 2.4 / (1 + s / 220);
    const fastTear = Math.min(s / 900, 1.35);
    this.app?.setPointerInfluence?.(
      jump ? 0 : Math.min(slowPush + fastTear, 3.2),
    );
  }

  getPointerSpeed(): number {
    return this.pointerSpeed;
  }

  /**
   * The engine's own projection-safe box — the region that actually lands in
   * the viewport. Guessing this instead of asking put the camera inside the
   * medium, where a concentration is present but unreadable.
   */
  getSimBounds(): { min: [number, number, number]; max: [number, number, number] } | null {
    const rt = this.app?.runtime;
    if (!rt?.simBoundsMin || !rt?.simBoundsMax) return null;
    return {
      min: [rt.simBoundsMin.x, rt.simBoundsMin.y, rt.simBoundsMin.z],
      max: [rt.simBoundsMax.x, rt.simBoundsMax.y, rt.simBoundsMax.z],
    };
  }

  applyEngineRuntime(patch: Record<string, unknown>): void {
    if (this.disposed) return;
    this.app?.applyEngineRuntime?.(patch);
  }

  setSubstance(hexColor: number, strength: number): void {
    if (this.disposed) return;
    this.app?.particleRenderer?.setSubstance?.(hexColor, strength);
  }

  /** Returns the real byte cost of the chosen source (0 for procedural). */
  async setEnvironment(
    source: "procedural" | "studio" | "meadow",
  ): Promise<number> {
    if (this.disposed || !this.app) return 0;
    return (await this.app.setEnvironmentSource(source)) as number;
  }

  /** A/B what he reflects: the void studio (true) or the legacy meadow HDRI. */
  setLenoxEnvironment(useVoid: boolean): void {
    if (this.disposed) return;
    this.app?.setLenoxEnvironment?.(useVoid);
  }

  /* ── DER BEGLEITER: signature worlds (lenox mode only) ─────────────── */

  setSignature(id: LenoxSignatureId): void {
    if (this.disposed) return;
    this.app?.setLenoxSignature?.(id);
  }

  setSignatureTarget(id: LenoxSignatureId): void {
    if (this.disposed) return;
    this.app?.setLenoxSignatureTarget?.(id);
  }

  setSignatureScan(t: number): void {
    if (this.disposed || !Number.isFinite(t)) return;
    this.app?.setLenoxSignatureScan?.(t);
  }

  commitSignature(): void {
    if (this.disposed) return;
    this.app?.commitLenoxSignature?.();
  }

  /**
   * THE transform scalar (0..1, linear). One GSAP clock pushes it; the
   * engine derives physics beats, front radius, particle flare and the
   * environment blend from it — one clock, cannot drift.
   */
  setTransformProgress(p: number): void {
    if (this.disposed || !Number.isFinite(p)) return;
    this.app?.setLenoxTransformProgress?.(p);
  }

  /** GRAVITY owns a separate contract; no legacy signature scan is touched. */
  setGravityCreationProgress(p: number, reduced = false): void {
    if (this.disposed || !Number.isFinite(p)) return;
    if (!this.gravityQualityApplied && p <= 0.001) {
      this.gravityQualityApplied = true;
      if (this.renderer && window.innerWidth < 768) {
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        const width = this.container.clientWidth || window.innerWidth;
        const height = this.container.clientHeight || window.innerHeight;
        this.renderer.setSize(width, height);
      }
    }
    this.app?.setGravityCreationProgress?.(p, reduced);
  }

  setGravityScrollProgress(p: number): void {
    if (this.disposed || !Number.isFinite(p)) return;
    this.app?.setGravityScrollProgress?.(p);
  }

  setChamberEnergy(level01: number): void {
    if (this.disposed || !Number.isFinite(level01)) return;
    this.chamberEnergy = Math.min(1, Math.max(0, level01));
  }

  beginPostEnter(): void {
    if (this.disposed || !this.app || this.postEnterActive) return;
    // Post-enter owns the runtime exclusively; conversation layer re-arms at dormant.
    this.conversationState = "dormant";
    this.chamberEnergy = 0;
    this.chamberDrive.reset();
    this.postEnterActive = true;
    this.postEnterElapsed = 0;
    this.app.beginPostEnterDrive();
    this.app.clearPointer();
    this.app.setPointerInfluence(0);
    const stage = this.app.drivePostEnter(0) as PostEnterStage;
    this.emitPostEnterStageIfChanged(stage);
    this.postEnterDebugAccum = 0;
    const snap0 = this.app.getPostEnterDebugSnapshot?.() as
      | PostEnterDebugSnapshot
      | null
      | undefined;
    if (snap0 && this.options.onPostEnterDebugSnapshot) {
      this.options.onPostEnterDebugSnapshot(snap0);
    }
  }

  resetCycle(): void {
    if (this.disposed || !this.app) return;
    // Conversation layer always returns to dormant (eased by the drive)...
    this.conversationState = "dormant";
    this.chamberEnergy = 0;
    if (!this.postEnterActive) return;
    // ...and a running post-enter cycle is torn down at the next frame
    // boundary so no CPU buffer write can interleave with an in-flight
    // `app.update()` await.
    this.resetRequested = true;
  }

  private performReset(): void {
    if (!this.app) return;

    this.postEnterActive = false;
    this.postEnterElapsed = 0;
    this.postEnterDebugAccum = 0;

    // Resize was gated during post-enter; re-apply the real container size
    // before the app re-frames the camera from it.
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.renderer?.setSize(width, height);

    this.app.resetToSourcePlay(width, height);
    this.app.applyEngineRuntime(sourcePlayEngineRuntime());
    this.chamberDrive.reset();
    this.app.clearPointer();
    this.app.setPointerInfluence(this.interactiveEnabled ? 1 : 0);

    this.emitPostEnterStageIfChanged("none");
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resetRequested = false;

    cancelAnimationFrame(this.rafId);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    if (this.app) {
      this.app.dispose();
    }
    this.app = null;

    if (this.renderer) {
      const canvas = this.renderer.domElement as HTMLCanvasElement;
      if (canvas.parentElement === this.container) {
        this.container.removeChild(canvas);
      }
      this.renderer.dispose?.();
    }

    this.renderer = null;
    this.postEnterActive = false;
    this.postEnterElapsed = 0;
    this.lastPostEnterStage = "none";
    this.postEnterDebugAccum = 0;
  }

  private emitPostEnterStageIfChanged(stage: PostEnterStage): void {
    if (stage !== this.lastPostEnterStage) {
      this.lastPostEnterStage = stage;
      this.options.onPostEnterStageChange?.(stage);
    }
  }

  private onResize = (): void => {
    if (!this.renderer || !this.app) return;
    if (this.postEnterActive) return;

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.renderer.setSize(width, height);
    this.app.resize(width, height);
  };

  private onVisibilityChange = (): void => {
    this.hidden = document.hidden;

    // After a hidden tab, discard accumulated clock delta so the next frame is not a spike.
    if (!this.hidden && this.disposed === false) {
      this.clock.getDelta();
    }
  };

  private animate = async (): Promise<void> => {
    if (this.disposed || !this.app) return;

    if (this.hidden) {
      this.clock.getDelta();
      this.rafId = requestAnimationFrame(this.animate);
      return;
    }

    if (this.resetRequested) {
      this.resetRequested = false;
      this.performReset();
    }

    const rawDelta = this.clock.getDelta();
    const delta = this.postEnterActive ? Math.min(rawDelta, 1 / 60) : rawDelta;
    try {
      if (this.postEnterActive) {
        this.postEnterElapsed += delta;
        const stage = this.app.drivePostEnter(
          this.postEnterElapsed,
        ) as PostEnterStage;
        this.emitPostEnterStageIfChanged(stage);

        const onDbg = this.options.onPostEnterDebugSnapshot;
        if (onDbg) {
          this.postEnterDebugAccum += delta;
          if (
            this.postEnterDebugAccum >=
            FlowEngineBridge.POST_ENTER_DEBUG_INTERVAL_SEC
          ) {
            this.postEnterDebugAccum = 0;
            const snap = this.app.getPostEnterDebugSnapshot?.() as
              | PostEnterDebugSnapshot
              | null
              | undefined;
            if (snap) {
              onDbg(snap);
            }
          }
        }
      }

      if (this.options.phaseField) {
        // The phase-field host owns runtime, targets and pointer influence.
        // No drive runs here — that is the whole point of the mode.
      } else if (this.lenoxDrive) {
        // Lenox owns runtime + pointer influence in proof mode.
        const state = this.lenoxDrive.update(
          this.app,
          delta,
        ) as LenoxProofState;
        if (state !== this.lastLenoxState) {
          this.lastLenoxState = state;
          this.options.onLenoxStateChange?.(state);
        }
        // The drive still owns LENOX, but GRAVITY exclusively owns the field
        // after First Contact. Reassert its tier after the drive's present pass.
        this.app.maintainGravityRuntime?.();
        if (this.options.onLenoxSignals) {
          this.lenoxSignalAccum += delta;
          if (this.lenoxSignalAccum >= 1 / 12) {
            this.lenoxSignalAccum = 0;
            this.options.onLenoxSignals(
              this.app.lenoxSignals as LenoxSignals,
            );
          }
        }
      } else {
        if (!this.postEnterActive) {
          this.chamberDrive.update(
            this.app,
            delta,
            this.conversationState,
            this.chamberEnergy,
          );
        }

        const pointerInfluence =
          this.interactiveEnabled && !this.postEnterActive ? 1 : 0;
        this.app.setPointerInfluence(pointerInfluence);
      }
      if (this.lenoxDrive || this.options.phaseField) {
        // Real engine frame time (CPU-side tick incl. GPU submit) — the
        // React FPS HUD runs its own rAF and does not measure the engine.
        const engineT0 = performance.now();
        await this.app.update(delta);
        const engineMs = performance.now() - engineT0;
        this.engineMsAvg =
          this.engineMsAvg === null
            ? engineMs
            : this.engineMsAvg * 0.95 + engineMs * 0.05;
        (globalThis as Record<string, unknown>).__LENOX_PERF__ = {
          engineMs: Math.round(engineMs * 100) / 100,
          avgMs: Math.round(this.engineMsAvg * 100) / 100,
          particles: this.app.runtime?.particles ?? 0,
        };
      } else {
        await this.app.update(delta);
      }
    } catch (error) {
      this.options.onError?.(error);
    }

    this.rafId = requestAnimationFrame(this.animate);
  };
}
