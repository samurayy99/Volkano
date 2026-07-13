import * as THREE from "three/webgpu";
import App from "./app.js";
import { SourceChamberDrive } from "./source-chamber/sourceChamberDrive.js";
import { LenoxEyesDrive } from "./lenox/lenoxEyesDrive.js";
import type {
  ConversationState,
  FlowEngineApi,
  FlowEngineBridgeOptions,
  LenoxEmotion,
  LenoxProofState,
  LenoxReaction,
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
  /** Rolling engine tick time (ms), exposed as __LENOX_PERF__ in Lenox mode. */
  private engineMsAvg: number | null = null;
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
    this.container.appendChild(renderer.domElement);

    const app = new App(renderer, {
      visualMode: this.options.lenoxMode ? "void" : "chamber",
    });
    this.app = app;
    await app.init(width, height);
    if (this.options.lenoxMode) {
      this.lenoxDrive = new LenoxEyesDrive({
        reducedMotion: this.options.lenoxReducedMotion,
      });
    }

    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(this.container);
    this.onResize();

    this.app.promoteIdlePopulation();
    if (this.options.lenoxMode) {
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
  }

  /** Dev (lenox proof): hide particles to verify the gaze rig on its own. */
  setLenoxParticlesVisible(visible: boolean): void {
    if (this.disposed || !this.lenoxDrive) return;
    this.app?.setParticlesVisible?.(visible);
  }

  /** 0 = centred, 1 = left third with room for the console. */
  setLenoxOperator(target: number, tau?: number): void {
    if (this.disposed) return;
    this.app?.setLenoxOperator?.(target, tau);
  }

  /** A/B what he reflects: the void studio (true) or the legacy meadow HDRI. */
  setLenoxEnvironment(useVoid: boolean): void {
    if (this.disposed) return;
    this.app?.setLenoxEnvironment?.(useVoid);
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

      if (this.lenoxDrive) {
        // Lenox owns runtime + pointer influence in proof mode.
        const state = this.lenoxDrive.update(
          this.app,
          delta,
        ) as LenoxProofState;
        if (state !== this.lastLenoxState) {
          this.lastLenoxState = state;
          this.options.onLenoxStateChange?.(state);
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
      if (this.lenoxDrive) {
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
