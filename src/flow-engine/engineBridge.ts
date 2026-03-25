import * as THREE from "three/webgpu";
import { mapProgressToEngineSignals } from "../convergence/engine/convergence-progress-map";
import App from "./app.js";
import { conf } from "./conf.js";
import type {
  FlowEngineApi,
  FlowEngineBridgeOptions,
  FlowEngineDebugView,
  FlowEngineFrontRailMetrics,
  FlowEnginePhase,
} from "./types";

export class FlowEngineBridge implements FlowEngineApi {
  private readonly container: HTMLElement;
  private readonly options: FlowEngineBridgeOptions;
  private renderer: any | null = null;
  private app: any | null = null;
  private clock = new THREE.Clock();
  private rafId = 0;
  private phase: FlowEnginePhase = "play";
  private debugView: FlowEngineDebugView = "composite";
  private disposed = false;
  private interactiveEnabled = true;
  private hidden = false;
  private resizeObserver: ResizeObserver | null = null;
  private lastPointerLocalX = 0.5;
  private lastPointerLocalY = 0.5;
  private idlePlayPresetApplied = false;
  private convergenceProgress = 0;
  private currentPointerInfluence = 1;
  private freezeSettled = false;
  private freezeSettledElapsed = 0;
  private externalFreezeSettled = false;
  private proofReadyEmitted = false;
  private proofReadyHoldFrames = 0;
  private postFreezeActive = false;
  private postFreezeElapsed = 0;
  private quietChamberStarted = false;
  private quietChamberElapsed = 0;
  private authoredTakeoverStarted = false;
  private authoredTakeoverElapsed = 0;
  private lastFrontRailMetrics: FlowEngineFrontRailMetrics | null = null;

  private static readonly FREEZE_SETTLE_DELAY = 0.15;
  private static readonly POST_FREEZE_PROOF_HOLD = 5.0; // must exceed full collapse+quiet chain
  private static readonly RENDERER_SEAM_DURATION = 0.35;
  // Pacing: Hold (monument) → Collapse (implosion) → Quiet (verdict space)
  private static readonly COLLAPSE_HOLD = 0.4;       // brief frozen monument — just enough to register stillness
  private static readonly COLLAPSE_DURATION = 2.4;    // three phases: compact (1s) → core (0.8s) → extinction (0.6s)
  private static readonly QUIET_CHAMBER_DELAY = 0.08;
  private static readonly QUIET_CHAMBER_DURATION = 0.5;
  private static readonly QUIET_CHAMBER_PROOF_HOLD = 0.8; // silence before proof

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

    this.debugView = this.options.debugView ?? "composite";

    window.addEventListener("resize", this.onResize);
    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(this.container);
    this.onResize();

    this.applyIdlePlayPreset();
    this.app.primeStartupSource?.();
    this.app.promoteIdlePopulation?.();
    this.app.clearPointer?.(this.lastPointerLocalX, this.lastPointerLocalY);
    this.resetIdleMaturation();
    this.app.setConvergenceProgress?.(this.convergenceProgress);
    this.app.setDebugView?.(this.debugView);

    this.options.onPhaseChange?.("play");
    document.addEventListener("visibilitychange", this.onVisibilityChange);

    this.clock.start();
    this.rafId = requestAnimationFrame(this.animate);
  }

  setPhase(phase: FlowEnginePhase): void {
    if (this.disposed) return;
    this.phase = phase;
    this.options.onPhaseChange?.(phase);
  }

  setConvergenceProgress(progress: number): void {
    if (this.disposed) return;
    const clampedProgress = THREE.MathUtils.clamp(progress, 0, 100);
    if (this.convergenceProgress === clampedProgress) return;
    const previousProgress = this.convergenceProgress;

    this.convergenceProgress = clampedProgress;
    this.app?.setConvergenceProgress?.(clampedProgress);

    if (clampedProgress > 0) {
      this.ensureActiveSourcePreset();
      conf.startupStateMix = 0;
    }

    if (clampedProgress < 100) {
      this.freezeSettled = false;
      this.freezeSettledElapsed = 0;
      this.externalFreezeSettled = false;
      this.proofReadyEmitted = false;
      this.proofReadyHoldFrames = 0;
      this.postFreezeActive = false;
      this.postFreezeElapsed = 0;
    }
    if (clampedProgress <= 0 || clampedProgress < previousProgress) {
      this.quietChamberStarted = false;
      this.quietChamberElapsed = 0;
      conf.quietChamberMix = 0;
      this.authoredTakeoverStarted = false;
      this.authoredTakeoverElapsed = 0;
      conf.authoredTakeoverMix = 0;
      conf.authoredTakeoverTriggered = false;
    }
  }

  setFreezeSettled(settled: boolean): void {
    if (this.disposed) return;

    this.externalFreezeSettled = settled;

    if (settled && this.convergenceProgress >= 100) {
      return;
    } else if (!settled) {
      this.proofReadyEmitted = false;
      this.proofReadyHoldFrames = 0;
      this.postFreezeActive = false;
      this.postFreezeElapsed = 0;
    }
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

  setDebugView(view: FlowEngineDebugView): void {
    this.debugView = view;
    this.app?.setDebugView?.(view);
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
      this.advanceIdleMaturation();
      if (this.postFreezeActive) {
        this.postFreezeElapsed += delta;
      }
      if (this.quietChamberStarted) {
        this.quietChamberElapsed += delta;
      }
      if (this.authoredTakeoverStarted) {
        this.authoredTakeoverElapsed += delta;
      }
      this.applyConvergenceSignals();
      await this.app.update(delta, elapsed);
      this.updateFreezeSettlement(delta);
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
    conf.colorSaturation = 0.9;
    conf.particleDebugMode = "off";
    conf.craterUV.set(0.488, 0.714);
    conf.ventDepthOffset = 0.042;
    conf.ventRadiiLocal.set(0.042, 0.066, 0.024);
    conf.ventAxisLocal.set(0.012, 0.978, -0.208).normalize();
    conf.ventCenter.set(23.2, 30.6, 18.4);
    conf.ventRadii.set(4.2, 3.2, 2.8);
    conf.ventAxis.set(-0.16, 0.94, 0.3).normalize();
    conf.ventSpawnJitter = 0.18;
    conf.sourceBindStrength = 0.56;
    conf.sourceLiftStrength = 0.76;
    conf.mouthRadiusScale = 0.56;
    conf.mouthBindStrength = 1.42;
    conf.mouthLiftStrength = 0.34;
    conf.throatHeight = 8.2;
    conf.throatSpread = 1.12;
    conf.throatLiftStrength = 0.92;
    conf.startupDelay = 0.08;
    conf.startupDuration = 0.86;
    conf.startupLatentVisibility = 0.05;
    conf.freshnessDecayRate = 0.044;
    conf.freshnessRespawnThreshold = 0.02;
    conf.spotlightIntensity = 0.18;
    conf.sourceFieldCenter.set(24.0, 30.8, 18.8);
    conf.sourceFieldRadii.set(16.4, 12.8, 12.8);
    conf.sourceFieldSecondaryCenter.set(30.8, 31.6, 24.8);
    conf.sourceFieldSecondaryRadii.set(11.8, 10.6, 12.2);
    conf.chamberFlowCenter.set(32.0, 31.8, 30.4);
    conf.chamberFlowRadii.set(26.8, 23.4, 22.8);
  }

  private applyStartupPreset(): void {
    this.applySharedPresetBase();

    conf.startupProgress = 0.0;
    conf.startupStateMix = 1.0;
    conf.size = 0.52;
    conf.updateParams();
    conf.auraOpacityCap = 0.62;
    conf.auraEmissiveCap = 0.74;
    conf.auraSizeScale = 0.88;
    conf.edgeOrganicBreakup = 0.036;
    conf.trailStretch = 0.16;
    conf.pointerWake = 0.02;
    conf.wallGlideStrength = 0.0;
    conf.startupDuration = 1.18;
    conf.freshnessReleaseStart = 0.82;
    conf.freshnessReleaseEnd = 0.42;
    conf.sourceConfinementStrength = 0.0;
    conf.chamberFlowStrength = 0.0;
    conf.chamberReturnStrength = 0.0;
    conf.wallBounceStrength = 0.0;
    conf.wallSplashStrength = 0.0;
    conf.emissiveIntensity = 0.88;
    conf.gridVelocityScale = 0.68;
    conf.sourceDepthScale = 1.82;

    this.app?.setPointerInfluence?.(0.08);
    this.app?.setLook?.({
      environmentIntensity: 0.18,
      exposure: 0.52,
      bloomThreshold: 0.14,
      bloomStrength: 0.14,
      bloomRadius: 0.38,
    });
  }

  private applyIdlePlayPreset(): void {
    this.applySharedPresetBase();

    conf.size = 0.68;
    conf.updateParams();
    conf.gravity = 1;
    conf.auraOpacityCap = 0.9;
    conf.auraEmissiveCap = 0.92;
    conf.auraSizeScale = 0.98;
    conf.edgeOrganicBreakup = 0.068;
    conf.trailStretch = 0.28;
    conf.pointerWake = 0.76;
    conf.wallGlideStrength = 0.2;
    conf.freshnessReleaseStart = 0.72;
    conf.freshnessReleaseEnd = 0.28;
    conf.sourceConfinementStrength = 0.62;
    conf.chamberFlowStrength = 0.14;
    conf.chamberReturnStrength = 0.2;
    conf.wallBounceStrength = 0.03;
    conf.wallSplashStrength = 0.02;
    conf.emissiveIntensity = 1.08;
    conf.gridVelocityScale = 0.92;
    conf.sourceDepthScale = 1.18;
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

  private resetIdleMaturation(): void {
    this.idlePlayPresetApplied = true;
    conf.startupStateMix = 0;
  }

  private advanceIdleMaturation(): void {
    conf.startupStateMix = 0;
  }

  private ensureActiveSourcePreset(): void {
    if (this.idlePlayPresetApplied) {
      return;
    }

    this.applyIdlePlayPreset();
    this.app?.promoteIdlePopulation?.();
    this.idlePlayPresetApplied = true;
    conf.startupStateMix = 0;
  }

  private clamp01(v: number): number {
    return Math.min(Math.max(v, 0), 1);
  }

  private ease01(v: number): number {
    return THREE.MathUtils.smoothstep(this.clamp01(v), 0, 1);
  }

  /** Ease-out: strong start, decelerating finish. Collapse reads immediately. */
  private easeOut01(v: number): number {
    const t = this.clamp01(v);
    return 1 - (1 - t) * (1 - t); // quadratic ease-out — 75% of motion in first 50%
  }

  private applyConvergenceSignals(): void {
    const convergenceSignals = mapProgressToEngineSignals(this.convergenceProgress);
    const slowdownMix = convergenceSignals.slowdownMix;
    const densifyMix = convergenceSignals.densifyMix;
    const compressionMix = convergenceSignals.compressionMix;
    const freezeMix = convergenceSignals.freezeMix;
    const settleMix = convergenceSignals.settleMix;
    const thermalExtinctionMix = convergenceSignals.thermalExtinctionMix;

    if (this.convergenceProgress <= 0) {
      conf.convergenceProgress = 0;
      conf.convergenceSlowdown = 0;
      conf.convergenceCompression = 0;
      conf.convergenceFreeze = 0;
      conf.convergenceHeatRetention = 0;
      conf.convergenceThermalExtinction = 0;
      conf.proofLockMix = 0;
      conf.postFreezeSettleMix = 0;
      conf.condensationMix = 0;
      conf.seamSettleMix = 0;
      conf.seamAbsorption = 0;
      conf.collapseMix = 0;
      conf.quietChamberMix = 0;
      conf.authoredTakeoverMix = 0;
      conf.authoredTakeoverTriggered = false;
      conf.freshnessDecayRate = 0.044;
      this.currentPointerInfluence = 1;
      this.app?.setPointerInfluence?.(this.interactiveEnabled ? this.currentPointerInfluence : 0);
      this.quietChamberStarted = false;
      this.quietChamberElapsed = 0;
      this.authoredTakeoverStarted = false;
      this.authoredTakeoverElapsed = 0;
      return;
    }

    const heatRetentionMix = THREE.MathUtils.lerp(
      convergenceSignals.heatRetentionMix,
      0,
      thermalExtinctionMix,
    );

    conf.convergenceProgress = this.convergenceProgress;
    conf.convergenceSlowdown = slowdownMix;
    conf.convergenceCompression = compressionMix;
    conf.convergenceFreeze = freezeMix;
    conf.convergenceHeatRetention = heatRetentionMix;
    conf.convergenceThermalExtinction = thermalExtinctionMix;
    conf.freshnessDecayRate = THREE.MathUtils.lerp(0.044, 0.004, heatRetentionMix);

    // === COLLAPSE ARCHITECTURE (replaces Floor Reclaim) ===
    // Post-freeze: mass stays suspended in space. No settle, no carpet, no reclaim.
    // Collapse force will be added in Pass 2. For now, mass just hangs.
    const collapseElapsed = this.postFreezeActive
      ? Math.max(0, this.postFreezeElapsed - FlowEngineBridge.COLLAPSE_HOLD)
      : 0;
    const collapseMix = this.easeOut01(
      collapseElapsed / FlowEngineBridge.COLLAPSE_DURATION,
    );

    // Quiet chamber triggers when collapse nears completion
    if (!this.quietChamberStarted && collapseMix >= 0.95) {
      this.quietChamberStarted = true;
      this.quietChamberElapsed = 0;
    }
    const quietActiveElapsed = Math.max(
      0,
      this.quietChamberElapsed - FlowEngineBridge.QUIET_CHAMBER_DELAY,
    );
    const quietChamberMix = this.quietChamberStarted
      ? this.ease01(
          quietActiveElapsed / FlowEngineBridge.QUIET_CHAMBER_DURATION,
        )
      : 0;

    // Debug: log collapse progress at 10% intervals
    if (collapseMix > 0 && Math.floor(collapseMix * 10) > Math.floor(((this as any)._lastLoggedCollapse || 0) * 10)) {
      console.log(`[COLLAPSE] mix=${collapseMix.toFixed(2)} elapsed=${collapseElapsed.toFixed(2)}s`);
      (this as any)._lastLoggedCollapse = collapseMix;
    }

    // Settle is dead. Mass stays where convergence left it — suspended in space.
    conf.postFreezeSettleMix = 0;
    conf.seamSettleMix = 0;
    conf.seamAbsorption = 0;
    conf.condensationMix = 0;
    conf.proofLockMix = 0;
    conf.collapseMix = collapseMix;

    // Gravity: always centered attractor. No downward pull post-freeze.
    conf.gravity = 2;

    // Noise calms during convergence
    let noise = THREE.MathUtils.lerp(1.08, 0.62, settleMix * 0.4);
    noise = THREE.MathUtils.lerp(noise, 0.42, slowdownMix);
    let speed = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(1.02, 0.82, slowdownMix),
      0.12,
      freezeMix,
    );
    conf.convergenceCompression = compressionMix * 0.2;
    conf.dynamicViscosity = THREE.MathUtils.lerp(0.034, 0.058, densifyMix);
    conf.sourceConfinementStrength = THREE.MathUtils.lerp(0.62, 0.98, compressionMix);
    conf.chamberFlowStrength = THREE.MathUtils.lerp(0.14, 0.08, slowdownMix);
    conf.chamberReturnStrength = THREE.MathUtils.lerp(0.2, 0.32, compressionMix);
    conf.wallBounceStrength = THREE.MathUtils.lerp(0.03, 0.0, freezeMix);
    conf.wallSplashStrength = THREE.MathUtils.lerp(0.02, 0.0, freezeMix);
    conf.trailStretch = THREE.MathUtils.lerp(0.28, 0.18, slowdownMix);
    conf.pointerWake = THREE.MathUtils.lerp(0.76, 0.18, slowdownMix);
    conf.gridVelocityScale = THREE.MathUtils.lerp(0.92, 0.76, densifyMix);

    // Simulation stays FROZEN during collapse. The renderer owns the entire visual.
    // Unfreezing reactivates grid momentum which pushes particles into the wall.
    conf.convergenceFreeze = freezeMix; // stays at 1.0 — sim is still
    // speed stays at frozen level — no sim motion
    // noise stays at frozen level

    conf.quietChamberMix = quietChamberMix;
    this.authoredTakeoverStarted = false;
    this.authoredTakeoverElapsed = 0;
    conf.authoredTakeoverTriggered = false;
    conf.authoredTakeoverMix = 0;

    conf.noise = noise;
    conf.speed = speed;

    this.currentPointerInfluence = THREE.MathUtils.lerp(1, 0.08, convergenceSignals.pointerInfluenceMix);
    this.app?.setPointerInfluence?.(this.interactiveEnabled ? this.currentPointerInfluence : 0);
  }

  private updateFreezeSettlement(delta: number): void {
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

    this.freezeSettled = true;
    this.postFreezeActive = true;
    this.postFreezeElapsed = 0;

    // Pass 1 verification: log where convergenceCenter sits vs. ventCenter
    // Remove after confirming collapse center is visually correct.
    const cc = conf.sourceFieldCenter.clone()
      .lerp(conf.sourceFieldSecondaryCenter, 0.42);
    console.log(
      `[COLLAPSE] Freeze handoff. convergenceCenter=(${cc.x.toFixed(1)}, ${cc.y.toFixed(1)}, ${cc.z.toFixed(1)}) ventCenter=(${conf.ventCenter.x.toFixed(1)}, ${conf.ventCenter.y.toFixed(1)}, ${conf.ventCenter.z.toFixed(1)})`,
    );

    this.options.onConvergenceFreeze?.();
  }

  private updateProofReady(): void {
    if (this.proofReadyEmitted || !this.externalFreezeSettled) return;
    if (!this.postFreezeActive) return;

    if (
      this.quietChamberStarted &&
      this.quietChamberElapsed <
        FlowEngineBridge.QUIET_CHAMBER_DELAY +
          FlowEngineBridge.QUIET_CHAMBER_DURATION +
          FlowEngineBridge.QUIET_CHAMBER_PROOF_HOLD
    ) {
      this.proofReadyHoldFrames = 0;
      return;
    }

    if (this.postFreezeElapsed < FlowEngineBridge.POST_FREEZE_PROOF_HOLD) {
      this.proofReadyHoldFrames = 0;
      return;
    }

    this.proofReadyHoldFrames++;
    if (this.proofReadyHoldFrames < 2) return;

    this.proofReadyEmitted = true;
    this.options.onProofReady?.();
  }
}
