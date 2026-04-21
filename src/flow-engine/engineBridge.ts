import * as THREE from "three/webgpu";
import App from "./app.js";
import type {
  FlowEngineApi,
  FlowEngineBridgeOptions,
  PostEnterDebugSnapshot,
  PostEnterStage,
} from "./types";

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
  private lastPostEnterStage: PostEnterStage = "none";
  private postEnterDebugAccum = 0;
  /** After final `hero` snapshot, stop dev telemetry (otherwise logs forever). */
  private postEnterDebugMuted = false;
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

    const app = new App(renderer);
    this.app = app;
    await app.init(width, height);

    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(this.container);
    this.onResize();

    this.app.promoteIdlePopulation();
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

  beginPostEnter(): void {
    if (this.disposed || !this.app || this.postEnterActive) return;
    this.postEnterActive = true;
    this.postEnterElapsed = 0;
    this.postEnterDebugMuted = false;
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
      if (snap0.stage === "hero") {
        this.postEnterDebugMuted = true;
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

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
    this.postEnterDebugMuted = false;
  }

  private emitPostEnterStageIfChanged(stage: PostEnterStage): void {
    if (stage !== this.lastPostEnterStage) {
      this.lastPostEnterStage = stage;
      this.options.onPostEnterStageChange?.(stage);
    }
  }

  private onResize = (): void => {
    if (!this.renderer || !this.app) return;

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
        if (onDbg && !this.postEnterDebugMuted) {
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
              if (snap.stage === "hero") {
                this.postEnterDebugMuted = true;
              }
            }
          }
        }
      }

      const pointerInfluence =
        this.interactiveEnabled && !this.postEnterActive ? 1 : 0;
      this.app.setPointerInfluence(pointerInfluence);
      await this.app.update(delta);
    } catch (error) {
      this.options.onError?.(error);
    }

    this.rafId = requestAnimationFrame(this.animate);
  };
}
