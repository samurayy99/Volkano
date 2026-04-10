import * as THREE from "three/webgpu";
import { mapProgressToEngineSignals } from "../convergence/engine/convergence-progress-map";
import App from "./app.js";
import { conf } from "./conf.js";
import type {
  FlowEngineApi,
  FlowEngineBridgeOptions,
  FlowEngineFrontRailMetrics,
} from "./types";

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
  private lastPointerLocalX = 0.5;
  private lastPointerLocalY = 0.5;
  private convergenceProgress = 0;
  private currentPointerInfluence = 1;
  private freezeSettled = false;
  private freezeSettledElapsed = 0;
  private externalFreezeSettled = false;
  private proofReadyEmitted = false;
  private proofReadyHoldFrames = 0;
  private postFreezeActive = false;
  private postFreezeElapsed = 0;
  private postFreezeClaimPending = false;
  private lastFrontRailMetrics: FlowEngineFrontRailMetrics | null = null;

  private static readonly FREEZE_SETTLE_DELAY = 0.15;
  // Shorter pre-claim pause, longer extraction window.
  private static readonly POST_FREEZE_HOLD = 0.45;
  private static readonly POST_FREEZE_CLEAR_DURATION = 1.9;

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

    this.applyIdlePlayPreset();
    this.app.primeStartupSource?.();
    this.app.promoteIdlePopulation?.();
    this.app.clearPointer?.(this.lastPointerLocalX, this.lastPointerLocalY);
    this.app.setConvergenceProgress?.(this.convergenceProgress);
    document.addEventListener("visibilitychange", this.onVisibilityChange);

    this.clock.start();
    this.rafId = requestAnimationFrame(this.animate);
  }

  setConvergenceProgress(progress: number): void {
    if (this.disposed) return;
    const clampedProgress = THREE.MathUtils.clamp(progress, 0, 100);
    if (this.convergenceProgress === clampedProgress) return;
    const previousProgress = this.convergenceProgress;

    this.convergenceProgress = clampedProgress;
    this.app?.setConvergenceProgress?.(clampedProgress);

    if (clampedProgress < 100) {
      this.freezeSettled = false;
      this.freezeSettledElapsed = 0;
      this.externalFreezeSettled = false;
      this.proofReadyEmitted = false;
      this.proofReadyHoldFrames = 0;
      this.postFreezeActive = false;
      this.postFreezeElapsed = 0;
      this.postFreezeClaimPending = false;
      this.app?.clearFreezeOwnership?.();
    }
    if (clampedProgress <= 0 || clampedProgress < previousProgress) {
    }
  }

  private setFreezeSettled(settled: boolean): void {
    if (this.disposed) return;

    this.externalFreezeSettled = settled;

    if (settled && this.convergenceProgress >= 100) {
      return;
    } else if (!settled) {
      this.proofReadyEmitted = false;
      this.proofReadyHoldFrames = 0;
      this.postFreezeActive = false;
      this.postFreezeElapsed = 0;
      this.postFreezeClaimPending = false;
      this.app?.clearFreezeOwnership?.();
    }
  }

  setConvergenceSettled(settled: boolean): void {
    this.setFreezeSettled(settled);
  }

  setInteractiveEnabled(enabled: boolean): void {
    if (this.disposed) return;

    this.interactiveEnabled = enabled;
    this.app?.setPointerInfluence?.(enabled ? this.currentPointerInfluence : 0);

    if (!enabled) {
      this.app?.clearPointer?.(
        this.lastPointerLocalX,
        this.lastPointerLocalY,
      );
    }
  }

  setPointer(x: number, y: number, isDown: boolean): void {
    if (this.disposed || !this.app) return;

    const rect = this.container.getBoundingClientRect();
    const width = Math.max(rect.width, 1);
    const height = Math.max(rect.height, 1);

    const localX = (x - rect.left) / width;
    const localY = (y - rect.top) / height;

    this.lastPointerLocalX = localX;
    this.lastPointerLocalY = localY;

    if (!this.interactiveEnabled) {
      return;
    }

    this.app.setPointer(localX, localY, isDown);
  }

  clearPointer(x: number, y: number): void {
    if (this.disposed || !this.app) return;

    const rect = this.container.getBoundingClientRect();
    const width = Math.max(rect.width, 1);
    const height = Math.max(rect.height, 1);

    const localX = (x - rect.left) / width;
    const localY = (y - rect.top) / height;

    this.lastPointerLocalX = localX;
    this.lastPointerLocalY = localY;
    this.app.clearPointer(localX, localY);
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
    const elapsed = this.clock.getElapsedTime();

    try {
      if (this.postFreezeActive) {
        this.postFreezeElapsed += delta;
      }
      this.applyConvergenceSignals();
      await this.app.update(delta, elapsed);
      await this.updateFreezeSettlement(delta);
      this.updateProofReady();
    } catch (error) {
      this.options.onError?.(error);
    }

    this.rafId = requestAnimationFrame(this.animate);
  };

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

  private applySharedPresetBase(): void {
    conf.particles = conf.isMobile ? 4096 : 8192 * 4;
    conf.size = 0.52;
    conf.updateParams();
    conf.run = true;
    conf.gravity = 2;
    conf.noise = 1.08;
    conf.speed = 1.02;
    conf.stiffness = 1.92;
    conf.dynamicViscosity = 0.034;
    conf.bloom = true;
    conf.ventCenter.set(23.2, 30.6, 18.4);
    conf.ventRadii.set(4.2, 3.2, 2.8);
    conf.ventAxis.set(-0.16, 0.94, 0.3).normalize();
    conf.sourceFieldCenter.set(24.0, 30.8, 18.8);
    conf.sourceFieldRadii.set(16.4, 12.8, 12.8);
    conf.sourceFieldSecondaryCenter.set(30.8, 31.6, 24.8);
    conf.sourceFieldSecondaryRadii.set(11.8, 10.6, 12.2);
    conf.chamberFlowCenter.set(32.0, 31.8, 30.4);
    conf.chamberFlowRadii.set(26.8, 23.4, 22.8);
  }

  private applyIdlePlayPreset(): void {
    this.applySharedPresetBase();

    conf.size = 0.68;
    conf.updateParams();
    conf.gravity = 1;
    conf.sourceFieldRadii.set(12.8, 10.2, 10.6);
    conf.sourceFieldSecondaryRadii.set(7.8, 7.2, 8.1);

    this.app?.setPointerInfluence?.(1);
    this.app?.setLook?.({
      environmentIntensity: 0.22,
      exposure: 0.58,
      bloomThreshold: 0.12,
      bloomStrength: 0.2,
      bloomRadius: 0.46,
    });
  }

  private clamp01(v: number): number {
    return Math.min(Math.max(v, 0), 1);
  }

  private ease01(v: number): number {
    return THREE.MathUtils.smoothstep(this.clamp01(v), 0, 1);
  }

  private applyConvergenceSignals(): void {
    const convergenceSignals = mapProgressToEngineSignals(this.convergenceProgress);
    const slowdownMix = convergenceSignals.slowdownMix;
    const densifyMix = convergenceSignals.densifyMix;
    const compressionMix = convergenceSignals.compressionMix;
    const freezeMix = convergenceSignals.freezeMix;
    const thermalExtinctionMix = convergenceSignals.thermalExtinctionMix;

    if (this.convergenceProgress <= 0) {
      conf.convergenceProgress = 0;
      conf.convergenceSlowdown = 0;
      conf.convergenceCompression = 0;
      conf.convergenceFreeze = 0;
      conf.convergenceHeatRetention = 0;
      conf.convergenceThermalExtinction = 0;
      conf.holdShapeMix = 0;
      conf.postFreezeSimLock = 0;
      conf.postFreezeHoldProgress = 0;
      conf.postFreezeClearProgress = 0;
      this.currentPointerInfluence = 1;
      this.app?.setPointerInfluence?.(this.interactiveEnabled ? this.currentPointerInfluence : 0);
      return;
    }

    const heatRetentionMix = THREE.MathUtils.lerp(
      convergenceSignals.heatRetentionMix,
      0,
      thermalExtinctionMix,
    );

    conf.convergenceProgress = this.convergenceProgress;
    conf.convergenceSlowdown = slowdownMix;
    conf.convergenceFreeze = freezeMix;
    conf.convergenceHeatRetention = heatRetentionMix;
    conf.convergenceThermalExtinction = thermalExtinctionMix;

    const postFreezeClearProgress = this.postFreezeActive
      ? this.clamp01(
          (this.postFreezeElapsed - FlowEngineBridge.POST_FREEZE_HOLD) /
            FlowEngineBridge.POST_FREEZE_CLEAR_DURATION,
        )
      : 0;
    const postFreezeHoldProgress = this.postFreezeActive
      ? this.clamp01(
          this.postFreezeElapsed / FlowEngineBridge.POST_FREEZE_HOLD,
        )
      : 0;

    conf.postFreezeSimLock = this.postFreezeActive ? 1 : 0;
    conf.postFreezeHoldProgress = postFreezeHoldProgress;
    conf.postFreezeClearProgress = postFreezeClearProgress;
    conf.holdShapeMix = this.ease01(
      Math.max(convergenceSignals.holdShapeMix, postFreezeHoldProgress),
    );

    // Direction D: no spatial convergence forces. Gravity stays play-state.
    conf.gravity = 2;

    // Motion kill leads the first visible arrest; compression only tightens the mass modestly.
    let noise = THREE.MathUtils.lerp(1.08, 0.2, slowdownMix);
    noise = THREE.MathUtils.lerp(noise, 0.06, freezeMix);
    const speed = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(1.02, 0.72, slowdownMix),
      0.12,
      freezeMix,
    );
    conf.convergenceCompression = compressionMix * 0.3;
    conf.dynamicViscosity = THREE.MathUtils.lerp(0.034, 0.052, densifyMix);

    conf.noise = noise;
    conf.speed = speed;

    this.currentPointerInfluence = THREE.MathUtils.lerp(1, 0.08, convergenceSignals.pointerInfluenceMix);
    this.app?.setPointerInfluence?.(this.interactiveEnabled ? this.currentPointerInfluence : 0);
  }

  private async updateFreezeSettlement(delta: number): Promise<void> {
    if (this.convergenceProgress < 100) {
      this.freezeSettled = false;
      this.freezeSettledElapsed = 0;
      return;
    }

    this.freezeSettledElapsed += delta;

    if (this.freezeSettled) {
      return;
    }

    if (this.freezeSettledElapsed < FlowEngineBridge.FREEZE_SETTLE_DELAY) {
      return;
    }

    if (this.postFreezeClaimPending) {
      return;
    }

    this.postFreezeClaimPending = true;
    try {
      await this.app?.captureFreezeOwnership?.();
    } finally {
      this.postFreezeClaimPending = false;
    }

    this.freezeSettled = true;
    this.postFreezeActive = true;
    this.postFreezeElapsed = 0;

    this.options.onPostEnterHoldStart?.();
  }

  private updateProofReady(): void {
    if (this.proofReadyEmitted || !this.externalFreezeSettled) return;
    if (!this.postFreezeActive) return;

    if ((conf.postFreezeClearProgress || 0) < 0.98) {
      this.proofReadyHoldFrames = 0;
      return;
    }

    this.proofReadyHoldFrames++;
    if (this.proofReadyHoldFrames < 2) return;

    this.proofReadyEmitted = true;
    this.options.onRiftReady?.();
  }
}
