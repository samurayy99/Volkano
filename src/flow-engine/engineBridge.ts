import * as THREE from "three/webgpu";
import { mapProgressToEngineSignals } from "../convergence/engine/convergence-progress-map";
import App from "./app.js";
import {
  IDLE_POST_ENTER_DERIVED,
  PostEnterDirector,
  type PostEnterContext,
  type PostEnterDerived,
  type PostEnterFrame,
} from "./post-enter/PostEnterDirector";
import type {
  FlowEngineApi,
  FlowEngineBridgeOptions,
  FlowEngineFrontRailMetrics,
} from "./types";

export class FlowEngineBridge implements FlowEngineApi {
  private readonly container: HTMLElement;
  private readonly options: FlowEngineBridgeOptions;
  private readonly postEnterDirector = new PostEnterDirector();
  private renderer: any | null = null;
  private app: any | null = null;
  private clock = new THREE.Clock();
  private rafId = 0;
  private disposed = false;
  private interactiveEnabled = true;
  private hidden = false;
  private resizeObserver: ResizeObserver | null = null;
  private convergenceProgress = 0;
  private currentPointerInfluence = 1;
  private postEnterContext: PostEnterContext | null = null;
  private rotationReadyEmitted = false;
  private lastFrontRailMetrics: FlowEngineFrontRailMetrics | null = null;

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
    await app.init(async () => {}, width, height);

    window.addEventListener("resize", this.onResize);
    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(this.container);
    this.onResize();

    this.app.primeStartupSource?.();
    this.app.promoteIdlePopulation?.();
    this.app.clearPointer?.();
    this.app.broadcastPostEnterFrame?.(IDLE_POST_ENTER_DERIVED);
    document.addEventListener("visibilitychange", this.onVisibilityChange);

    this.clock.start();
    this.rafId = requestAnimationFrame(this.animate);
  }

  setConvergenceProgress(progress: number): void {
    if (this.disposed) return;
    const clampedProgress = THREE.MathUtils.clamp(progress, 0, 100);
    if (this.convergenceProgress === clampedProgress) return;

    this.convergenceProgress = clampedProgress;

    if (clampedProgress < 100) {
      this.resetPostEnter();
    }
  }

  setInteractiveEnabled(enabled: boolean): void {
    if (this.disposed) return;

    this.interactiveEnabled = enabled;
    this.app?.setPointerInfluence?.(enabled ? this.currentPointerInfluence : 0);

    if (!enabled) {
      this.app?.clearPointer?.();
    }
  }

  setPointer(x: number, y: number, isDown: boolean): void {
    if (this.disposed || !this.app) return;

    const rect = this.container.getBoundingClientRect();
    const width = Math.max(rect.width, 1);
    const height = Math.max(rect.height, 1);

    const localX = (x - rect.left) / width;
    const localY = (y - rect.top) / height;

    if (!this.interactiveEnabled) {
      return;
    }

    this.app.setPointer(localX, localY, isDown);
  }

  clearPointer(): void {
    if (this.disposed || !this.app) return;
    this.app.clearPointer();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    cancelAnimationFrame(this.rafId);
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    if (this.app?.dispose) {
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
  }

  private onResize = (): void => {
    if (!this.renderer || !this.app) return;

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.renderer.setSize(width, height);
    this.app.resize(width, height);
    this.emitFrontRailMetrics();
  };

  private onVisibilityChange = (): void => {
    this.hidden = document.hidden;

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

    const delta = this.clock.getDelta();
    try {
      this.applyConvergenceSignals();
      const postEnterFrame = this.stepPostEnter(delta);
      await this.app.update(delta, postEnterFrame);
      this.emitRotationReady(postEnterFrame.derived);
    } catch (error) {
      this.options.onError?.(error);
    }

    this.rafId = requestAnimationFrame(this.animate);
  };

  private stepPostEnter(delta: number): PostEnterFrame {
    if (this.convergenceProgress < 100) {
      this.resetPostEnter();
      return {
        derived: IDLE_POST_ENTER_DERIVED,
        context: null,
      };
    }

    let startedThisFrame = false;
    if (this.postEnterDirector.isIdle()) {
      const context = this.app?.buildPostEnterContext?.() ?? null;
      if (this.postEnterDirector.start(context)) {
        this.postEnterContext = context;
        startedThisFrame = true;
      }
    }

    if (!startedThisFrame && this.postEnterContext) {
      this.postEnterDirector.tick(delta);
    }

    return {
      derived: this.postEnterDirector.getDerived(),
      context: this.postEnterContext,
    };
  }

  private emitRotationReady(derived: PostEnterDerived): void {
    if (!derived.rotationReady || this.rotationReadyEmitted) {
      return;
    }

    this.rotationReadyEmitted = true;
    this.options.onRotationReady?.();
  }

  private emitFrontRailMetrics(): void {
    const normalizedMetrics = this.app?.getFrontRailMetrics?.();
    if (!normalizedMetrics) {
      return;
    }

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    const nextMetrics = {
      left: normalizedMetrics.left * width,
      top: normalizedMetrics.top * height,
      width: normalizedMetrics.width * width,
      height: normalizedMetrics.height * height,
      centerX: normalizedMetrics.centerX * width,
      centerY: normalizedMetrics.centerY * height,
    };

    const previousMetrics = this.lastFrontRailMetrics;
    if (
      previousMetrics &&
      Math.abs(previousMetrics.left - nextMetrics.left) < 0.25 &&
      Math.abs(previousMetrics.top - nextMetrics.top) < 0.25 &&
      Math.abs(previousMetrics.width - nextMetrics.width) < 0.25 &&
      Math.abs(previousMetrics.height - nextMetrics.height) < 0.25 &&
      Math.abs(previousMetrics.centerX - nextMetrics.centerX) < 0.25 &&
      Math.abs(previousMetrics.centerY - nextMetrics.centerY) < 0.25
    ) {
      return;
    }

    this.lastFrontRailMetrics = nextMetrics;
    this.options.onFrontRailMetricsChange?.(nextMetrics);
  }

  private resetPostEnter(): void {
    this.postEnterDirector.reset();
    this.postEnterContext = null;
    this.rotationReadyEmitted = false;
    this.app?.resetPostEnterState?.();
  }

  private applyConvergenceSignals(): void {
    const convergenceSignals = mapProgressToEngineSignals(
      this.convergenceProgress,
    );
    const slowdownMix = convergenceSignals.slowdownMix;
    const viscosityMix = convergenceSignals.viscosityMix;
    const freezeMix = convergenceSignals.freezeMix;
    const thermalExtinctionMix = convergenceSignals.thermalExtinctionMix;

    if (this.convergenceProgress <= 0) {
      this.app?.applyEngineRuntime?.({
        gravity: 1,
        noise: 1.08,
        speed: 1.02,
        dynamicViscosity: 0.034,
        convergenceSlowdown: 0,
        convergenceFreeze: 0,
        convergenceHeatRetention: 0,
        convergenceThermalExtinction: 0,
      });
      this.currentPointerInfluence = 1;
      this.app?.setPointerInfluence?.(
        this.interactiveEnabled ? this.currentPointerInfluence : 0,
      );
      return;
    }

    const heatRetentionMix = THREE.MathUtils.lerp(
      convergenceSignals.heatRetentionMix,
      0,
      thermalExtinctionMix,
    );

    let noise = THREE.MathUtils.lerp(1.08, 0.2, slowdownMix);
    noise = THREE.MathUtils.lerp(noise, 0.06, freezeMix);
    const speed = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(1.02, 0.72, slowdownMix),
      0.12,
      freezeMix,
    );
    const dynamicViscosity = THREE.MathUtils.lerp(0.034, 0.052, viscosityMix);
    this.app?.applyEngineRuntime?.({
      gravity: 0,
      noise,
      speed,
      dynamicViscosity,
      convergenceSlowdown: slowdownMix,
      convergenceFreeze: freezeMix,
      convergenceHeatRetention: heatRetentionMix,
      convergenceThermalExtinction: thermalExtinctionMix,
    });

    this.currentPointerInfluence = THREE.MathUtils.lerp(
      1,
      0.08,
      convergenceSignals.pointerInfluenceMix,
    );
    this.app?.setPointerInfluence?.(
      this.interactiveEnabled ? this.currentPointerInfluence : 0,
    );
  }
}
