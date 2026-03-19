import * as THREE from "three/webgpu";
import App from "./app.js";
import { conf } from "./conf.js";
import type {
  FlowEngineApi,
  FlowEngineBridgeOptions,
  FlowEngineDebugView,
  FlowEnginePhase,
} from "./types";
import type { FlowMode } from "./sequenceTimeline";

export class FlowEngineBridge implements FlowEngineApi {
  private readonly container: HTMLElement;
  private readonly options: FlowEngineBridgeOptions;
  private renderer: any | null = null;
  private app: any | null = null;
  private clock = new THREE.Clock();
  private rafId = 0;
  private phase: FlowEnginePhase = "play";
  private mode: FlowMode = "idle";
  private debugView: FlowEngineDebugView = "composite";
  private disposed = false;
  private interactiveEnabled = true;
  private hidden = false;
  private resizeObserver: ResizeObserver | null = null;
  private lastPointerLocalX = 0.5;
  private lastPointerLocalY = 0.5;
  private idleMaturationElapsed = 0;
  private idleBlendElapsed = 0;
  private idlePlayPresetApplied = false;

  private static readonly IDLE_TEASER_DURATION = 0.38;
  private static readonly IDLE_BLEND_DURATION = 0.48;

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

    this.applyStartupPreset();
    this.app.primeStartupSource?.();
    this.resetIdleMaturation();
    this.app.setMode?.(this.mode);
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

  setMode(mode: FlowMode): void {
    if (this.disposed) return;
    if (this.mode === mode) return;

    const previousMode = this.mode;
    this.mode = mode;

    if (mode === "idle" && previousMode !== "idle") {
      this.applyStartupPreset();
      this.app?.primeStartupSource?.();
      this.resetIdleMaturation();
    } else if (previousMode === "idle" && mode !== "idle") {
      this.stopIdleMaturation();
    }

    this.app?.setMode?.(mode);
  }

  setInteractiveEnabled(enabled: boolean): void {
    if (this.disposed) return;

    this.interactiveEnabled = enabled;
    this.app?.setPointerInfluence?.(enabled ? 1 : 0);

    if (!enabled) {
      this.app?.setPointer?.(
        this.lastPointerLocalX,
        this.lastPointerLocalY,
        false,
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
      this.advanceIdleMaturation(delta);
      await this.app.update(delta, elapsed);
    } catch (error) {
      this.options.onError?.(error);
    }

    this.rafId = requestAnimationFrame(this.animate);
  };

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
    this.idleMaturationElapsed = 0;
    this.idleBlendElapsed = 0;
    this.idlePlayPresetApplied = false;
  }

  private stopIdleMaturation(): void {
    this.idleMaturationElapsed = 0;
    this.idleBlendElapsed = 0;
    this.idlePlayPresetApplied = false;
  }

  private advanceIdleMaturation(delta: number): void {
    if (this.mode !== "idle") {
      return;
    }

    this.idleMaturationElapsed += delta;

    if (
      this.idlePlayPresetApplied === false &&
      this.idleMaturationElapsed >= FlowEngineBridge.IDLE_TEASER_DURATION
    ) {
      this.applyIdlePlayPreset();
      this.app?.promoteIdlePopulation?.();
      this.idlePlayPresetApplied = true;
      this.idleBlendElapsed = 0;
    }

    if (!this.idlePlayPresetApplied) {
      conf.startupStateMix = 1.0;
      return;
    }

    this.idleBlendElapsed += delta;

    const blendT = THREE.MathUtils.clamp(
      this.idleBlendElapsed / FlowEngineBridge.IDLE_BLEND_DURATION,
      0,
      1,
    );
    const easedBlend = THREE.MathUtils.smoothstep(blendT, 0, 1);

    conf.startupStateMix = THREE.MathUtils.lerp(1, 0, easedBlend);
  }
}
