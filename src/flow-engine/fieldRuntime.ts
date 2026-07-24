import * as THREE from "three/webgpu";
import MlsMpmSimulator from "./mls-mpm/mlsMpmSimulator.js";
import ParticleRenderer from "./mls-mpm/particleRenderer.js";
import { RuntimeLifecycleGate } from "./runtimeLifecycle";
import type {
  CompositionMode,
  ConversationState,
  FlowEngineApi,
  FlowEngineBridgeOptions,
  LenoxEmotion,
  LenoxIntent,
  LenoxProofState,
  LenoxReaction,
  LenoxSignatureId,
  RuntimePauseReason,
  RuntimeState,
} from "./types";

type FieldRenderer = THREE.WebGPURenderer;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function createFieldState(width: number) {
  const portrait = width < 768;
  const particles = portrait ? 2048 : 3072;
  const size = portrait ? 0.52 : 0.48;
  const level = Math.max(particles / 8192, 1);
  return {
    particles,
    maxParticles: 4096,
    run: false,
    noise: 1.08,
    speed: 1.02,
    stiffness: 1.92,
    dynamicViscosity: 0.034,
    gravity: 1,
    apicBlend: 0.45,
    maxVelocity: 6,
    density: 1,
    size,
    actualSize: size,
    restDensity: 0.25 * level,
    sourceRadiusScale: { primary: 0.82, secondary: 0.88 },
    sourceFieldRadii: new THREE.Vector3(12.8, 10.2, 10.6),
    sourceFieldSecondaryRadii: new THREE.Vector3(7.8, 7.2, 8.1),
    sourceFieldCenter: new THREE.Vector3(24, 30.8, 18.8),
    sourceFieldSecondaryCenter: new THREE.Vector3(30.8, 31.6, 24.8),
    chamberFlowCenter: new THREE.Vector3(32, 31.8, 30.4),
    riftTargetMin: new THREE.Vector3(32, 5.5, 58),
    riftTargetMax: new THREE.Vector3(32, 58.5, 58),
    riftTargetCenter: new THREE.Vector3(32, 31.8, 58),
    simSubsteps: 1,
    postEnterActive: false,
    postEnterSourceRadiusMul: 1,
    convergenceSlowdown: 0,
    convergenceFreeze: 0,
    convergenceHeatRetention: 0,
    convergenceThermalExtinction: 0,
    postEnterHoverClamp: 1,
    postEnterThermalColorLock: 0,
    solverLocked: true,
    bodyScaleMul: 1,
    materialClaimT: 0,
    gravityCreationActive: false,
    gravityLivingActive: true,
    gravityCreationP: 1,
    gravityScrollP: 0,
    gravityPortrait: portrait ? 1 : 0,
    gravityReduced: false,
    gravityEnergy: 0.38,
    gravityAttention: 0.7,
    gravityTension: 0.12,
    returnBodyWeight: 0,
    recallLateralWeight: 0,
    recallVerticalWeight: 0,
    settleWeight: 0,
    compressT: 0,
    thinT: 0,
    opacityT: 0,
    massDimT: 0,
    lenoxTintT: 1,
    lenoxFocalBoost: 1,
    lenoxMetalness: 0.72,
    lenoxRoughness: 0.38,
    lenoxEnvIntensity: 0,
    lenoxSilverGain: 1,
    lenoxEnergyMul: 1,
    settleSquashT: 1,
    settleSquashCenter: 32,
  };
}

export class FieldRuntime implements FlowEngineApi {
  readonly readyAfterFirstFrame: Promise<void>;
  private readonly lifecycle = new RuntimeLifecycleGate();

  private readonly container: HTMLElement;
  private readonly options: FlowEngineBridgeOptions;
  private renderer: FieldRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private simulation: MlsMpmSimulator | null = null;
  private particles: ParticleRenderer | null = null;
  private runtime: ReturnType<typeof createFieldState> | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private rafId = 0;
  private lastFrameTime = 0;
  private initPromise: Promise<void> | null = null;
  private resolveReady!: () => void;
  private rejectReady!: (error: unknown) => void;

  constructor(container: HTMLElement, options: FlowEngineBridgeOptions = {}) {
    this.container = container;
    this.options = options;
    this.readyAfterFirstFrame = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
  }

  get runtimeState(): RuntimeState {
    return this.lifecycle.state;
  }

  init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    if (this.runtimeState === "disposed") {
      return Promise.reject(new Error("FieldRuntime is disposed."));
    }
    this.initPromise = this.initialize();
    return this.initPromise;
  }

  private isDisposed(): boolean {
    return this.runtimeState === "disposed";
  }

  private async initialize(): Promise<void> {
    this.lifecycle.beginInitializing();
    if (!navigator.gpu) {
      const error = new Error("WebGPU is not available in this browser.");
      this.lifecycle.fail();
      this.rejectReady(error);
      this.options.onError?.(error);
      throw error;
    }
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const renderer = new THREE.WebGPURenderer({ alpha: true, antialias: true });
    try {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, width < 768 ? 1.5 : 2));
      renderer.setSize(width, height);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      await renderer.init();
      if (!(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend) {
        throw new Error("Could not initialize a WebGPU backend.");
      }
      if (this.isDisposed()) {
        renderer.dispose();
        return;
      }

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, width / height, 0.01, 8);
      camera.position.set(0, 0.42, -1.85);
      camera.lookAt(0, 0.42, 0.42);
      scene.add(camera);
      scene.add(new THREE.HemisphereLight(0xd9f6ff, 0x101414, 1.65));
      const key = new THREE.DirectionalLight(0xe9fbff, 2.2);
      key.position.set(-1.4, 1.2, -1.6);
      scene.add(key);

      const runtime = createFieldState(width);
      const simulation = new MlsMpmSimulator(renderer);
      await simulation.init(runtime.maxParticles);
      simulation.applyRuntime(runtime);
      const particles = new ParticleRenderer(simulation);
      particles.applyRuntime(runtime);
      if (particles.object) scene.add(particles.object);

      this.renderer = renderer;
      this.scene = scene;
      this.camera = camera;
      this.runtime = runtime;
      this.simulation = simulation;
      this.particles = particles;
      this.container.appendChild(renderer.domElement);

      const device = (renderer.backend as { device?: GPUDevice }).device;
      void device?.lost.then((info) => {
        if (this.runtimeState !== "disposed" && info.reason !== "destroyed") {
          this.fail(info);
        }
      });

      this.resizeObserver = new ResizeObserver(this.onResize);
      this.resizeObserver.observe(this.container);
      document.addEventListener("visibilitychange", this.onVisibilityChange);

      await this.renderFrame(1 / 60);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (this.isDisposed()) return;
      this.resolveReady();
      if (this.lifecycle.markReady() === "start") this.startLoop();
    } catch (error) {
      this.lifecycle.fail();
      if (this.renderer) this.releaseResources();
      else renderer.dispose();
      this.rejectReady(error);
      this.options.onError?.(error);
      throw error;
    }
  }

  private startLoop(): void {
    if (this.runtimeState !== "running" || this.rafId !== 0) return;
    this.lastFrameTime = performance.now();
    this.rafId = requestAnimationFrame(this.animate);
  }

  private stopLoop(): void {
    if (this.rafId === 0) return;
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  private animate = async (now: number): Promise<void> => {
    this.rafId = 0;
    if (this.runtimeState !== "running") return;
    const delta = Math.min(Math.max((now - this.lastFrameTime) / 1000, 1 / 240), 1 / 30);
    this.lastFrameTime = now;
    try {
      await this.renderFrame(delta);
    } catch (error) {
      this.fail(error);
      return;
    }
    this.startLoop();
  };

  private async renderFrame(delta: number): Promise<void> {
    if (!this.renderer || !this.scene || !this.camera || !this.runtime || !this.simulation || !this.particles) return;
    this.simulation.applyRuntime(this.runtime);
    this.particles.applyRuntime(this.runtime);
    await this.simulation.update(delta);
    this.particles.update();
    await this.renderer.renderAsync(this.scene, this.camera);
  }

  private fail(error: unknown): void {
    if (this.runtimeState === "failed" || this.runtimeState === "disposed") return;
    if (this.lifecycle.fail() === "stop") this.stopLoop();
    this.releaseResources();
    this.options.onDeviceLost?.(error);
    this.options.onError?.(error);
  }

  private releaseResources(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.particles?.dispose();
    this.simulation?.dispose();
    if (this.renderer) {
      const canvas = this.renderer.domElement;
      if (canvas.parentElement === this.container) this.container.removeChild(canvas);
      this.renderer.dispose();
    }
    this.particles = null;
    this.simulation = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.runtime = null;
  }

  private onResize = (): void => {
    if (!this.renderer || !this.camera) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    if (this.runtimeState === "suspended") return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, width < 768 ? 1.5 : 2));
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.runtime) this.runtime.gravityPortrait = width < 768 ? 1 : 0;
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) this.suspend("document-hidden");
    else this.resume("document-hidden");
  };

  suspend(reason: RuntimePauseReason = "reality"): void {
    if (this.lifecycle.suspend(reason) === "stop") {
      this.stopLoop();
      this.clearPointer();
    }
  }

  resume(reason: RuntimePauseReason = "reality"): void {
    if (this.lifecycle.resume(reason) !== "start") return;
    this.onResize();
    this.startLoop();
  }

  setInteractiveEnabled(enabled: boolean): void {
    if (!enabled) this.clearPointer();
  }

  setPointer(x: number, y: number, isDown: boolean): void {
    if (this.runtimeState !== "running" || !this.runtime) return;
    const rect = this.container.getBoundingClientRect();
    const localX = clamp01((x - rect.left) / Math.max(rect.width, 1));
    const localY = clamp01((y - rect.top) / Math.max(rect.height, 1));
    this.runtime.gravityAttention = 0.48 + localX * 0.48;
    this.runtime.gravityEnergy = (isDown ? 0.82 : 0.42) + (1 - localY) * 0.12;
    this.runtime.gravityTension = Math.abs(localX - 0.5) * 0.26;
  }

  clearPointer(): void {
    if (!this.runtime) return;
    this.runtime.gravityAttention = 0.7;
    this.runtime.gravityEnergy = 0.38;
    this.runtime.gravityTension = 0.12;
  }

  setGravityScrollProgress(p: number): void {
    if (this.runtime) this.runtime.gravityScrollP = clamp01(p);
  }

  dispose(): void {
    if (this.runtimeState === "disposed") return;
    if (this.lifecycle.dispose() === "stop") this.stopLoop();
    this.releaseResources();
  }

  beginPostEnter(): void {}
  resetCycle(): void {}
  setConversationState(_state: ConversationState): void {}
  setChamberEnergy(_level01: number): void {}
  setLenoxState(_state: LenoxProofState): void {}
  setLenoxGaze(_x: number, _y: number): void {}
  setLenoxEmotion(_emotion: LenoxEmotion): void {}
  setLenoxReaction(_reaction: LenoxReaction): void {}
  setLenoxIntent(_intent: LenoxIntent): void {}
  setLenoxEyeRigEnhanced(_enabled: boolean): void {}
  setCompositionMode(_mode: CompositionMode): void {}
  setLenoxBackdropOpacity(_opacity: number): void {}
  setSignature(_id: LenoxSignatureId): void {}
  setSignatureTarget(_id: LenoxSignatureId): void {}
  setSignatureScan(_t: number): void {}
  commitSignature(): void {}
  setTransformProgress(_p: number): void {}
  setGravityCreationProgress(_p: number, _reduced?: boolean): void {}
}
