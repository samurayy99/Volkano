import * as THREE from "three/webgpu";
import App from "./app.js";
import { SourceChamberDrive } from "./source-chamber/sourceChamberDrive.js";
import { LenoxEyesDrive } from "./lenox/lenoxEyesDrive.js";
import {
  HERO_FIELD_PRESET,
  LIVING_SURFACE_PRESET,
  isHostOwnedRuntimeMode,
  resolveExperienceMode,
  shouldStartLenoxDrive,
  type ResolvedExperienceMode,
} from "./experienceMode";
import {
  MATTER_CORRIDORS,
  buildAllotropFormation,
  getFormationGraphiteWeight,
  packFormationPair,
  type FormationBank,
} from "./formations/allotropFormations";
import {
  DESIGN01_FULL_VIEW_CORRIDOR,
  buildDesign01HeroFormation,
} from "./formations/design01HeroFormation";
import {
  DESIGN01_SCULPTURE_IDS,
  buildDesign01SculptureFormation,
  isDesign01SculptureId,
} from "./formations/design01SculptureFormations";
import {
  matchFormationTargetByGroup,
  spatiallyMatchFormationTarget,
} from "./formations/design01FormationTransport";
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
  EnvironmentCost,
  PostEnterDebugSnapshot,
  PostEnterStage,
  FormationDrive,
  FormationId,
  MatterCorridorId,
} from "./types";
import { advancePointerEnergy } from "./pointerEnergy";
import {
  resolveHeroFieldCompositionMode,
  resolveHeroFieldLayout,
} from "./mls-mpm/heroFieldSeed.js";

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

function livingSurfaceEngineRuntime(
  mode: CompositionMode = "side",
  reducedMotion = false,
) {
  return {
    ...sourcePlayEngineRuntime(),
    run: !reducedMotion,
    noise: reducedMotion ? 0 : LIVING_SURFACE_PRESET.noise,
    speed: reducedMotion ? 0 : LIVING_SURFACE_PRESET.speed,
    gravity: LIVING_SURFACE_PRESET.gravity,
    dynamicViscosity: LIVING_SURFACE_PRESET.dynamicViscosity,
    size: LIVING_SURFACE_PRESET.size,
    particles: mode === "banded"
      ? LIVING_SURFACE_PRESET.particlesBanded
      : LIVING_SURFACE_PRESET.particlesDesktop,
    settleWeight: LIVING_SURFACE_PRESET.targetInfluence,
    settleDampingShell: 3.84,
    settleDampingFocal: 3.84,
    lenoxEnvIntensity: 0.24,
    formationOpaque: false,
    design01HeroActive: true,
    design01FlowActive: true,
  };
}

const clamp01 = (value: number): number =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
const round2 = (value: number): number => Math.round(value * 100) / 100;
const DESIGN01_FORMATION_IDS: readonly FormationId[] = [
  "principle.fullerene",
  ...DESIGN01_SCULPTURE_IDS,
];

const formationBoundsCacheKey = (bounds: {
  min: [number, number, number];
  max: [number, number, number];
}): string => [...bounds.min, ...bounds.max]
  .map((value) => value.toFixed(3))
  .join(",");

export class FlowEngineBridge implements FlowEngineApi {
  private readonly container: HTMLElement;
  private readonly options: FlowEngineBridgeOptions;
  private readonly experienceMode: ResolvedExperienceMode;
  /*
   * `App` and the WebGPU renderer backend are plain JS with no type surface, so
   * these stay `any` until the engine is typed — a real refactor, not something
   * to smuggle into a visual proof. The disables are narrow and named so the
   * rest of this file is genuinely linted rather than the whole file ignored,
   * which is how four unchecked errors survived here in the first place.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private renderer: any | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  private pendingJourneyPose: { pose: LenoxJourneyPose; tau: number } | null = null;
  /** Stable diagnostic object: updated in place, never allocated per frame. */
  private readonly perfSnapshot = {
    rafFps: 0,
    rafFrameMs: 0,
    rafFpsMedian: 0,
    rafFrameMsP95: 0,
    longFramePercent: 0,
    cpuSubmitMs: 0,
    particles: 0,
    pixelRatio: 0,
    drawCalls: 0,
    triangles: 0,
    viewportPixels: 0,
    gridCells: 0,
    computePasses: 0,
    formationBanks: 0,
    formationUploads: 0,
    formationPair: "",
    formationProgress: 0,
    compositionMode: "side" as CompositionMode,
    boundsKey: "",
    gpuTimestampQuery: false,
  };
  /**
   * Live tuning handle exposed as `window.__LENOX_FLOW__` in living surface.
   * Gate A uses `light(...)`; the Target Flow setters land here in step 3.
   */
  private readonly flowHandle = {
    light: (spec: Record<string, unknown> = {}) => {
      this.app?.lights?.setRig?.(spec);
      return this.app?.lights?.readRig?.() ?? null;
    },
    readLight: () => this.app?.lights?.readRig?.() ?? null,
    /*
     * Metalness, roughness and environment weight, live. Within the three.js PBR
     * approximation a high metalness removes the diffuse term, so with a near
     * black environment a metal shows mostly specular — which is one candidate
     * for the rig reading as thin edges, not a proven cause. Treat these as
     * visual parameters and judge them on the page.
     */
    material: (spec: { metalness?: number; roughness?: number; env?: number } = {}) => {
      const runtime = this.app?.runtime;
      if (!runtime) return null;
      if (Number.isFinite(spec.metalness)) runtime.lenoxMetalness = spec.metalness;
      if (Number.isFinite(spec.roughness)) runtime.lenoxRoughness = spec.roughness;
      if (Number.isFinite(spec.env)) runtime.lenoxEnvIntensity = spec.env;
      return {
        metalness: runtime.lenoxMetalness,
        roughness: runtime.lenoxRoughness,
        env: runtime.lenoxEnvIntensity,
      };
    },
    /**
     * Tone. Returns what the renderer and scene actually hold afterwards —
     * `setLook` may clamp or merge, so echoing the input back would lie.
     */
    look: (spec: Record<string, number> = {}) => {
      this.app?.setLook?.(spec);
      return {
        exposure: this.renderer?.toneMappingExposure ?? null,
        environmentIntensity: this.app?.scene?.environmentIntensity ?? null,
      };
    },
    hero: (spec: boolean | { render?: boolean; flow?: boolean } = true) => {
      const runtime = this.app?.runtime;
      if (!runtime) return null;
      if (typeof spec === "boolean") {
        runtime.design01HeroActive = spec;
        runtime.design01FlowActive = spec;
      } else {
        if (typeof spec.render === "boolean") runtime.design01HeroActive = spec.render;
        if (typeof spec.flow === "boolean") runtime.design01FlowActive = spec.flow;
      }
      return {
        render: runtime.design01HeroActive,
        flow: runtime.design01FlowActive,
      };
    },
    inspect: () => ({
      camera: this.app?.camera
        ? {
            position: this.app.camera.position.toArray(),
            target: this.app.cameraTarget?.toArray?.() ?? null,
            fov: this.app.camera.fov,
          }
        : null,
      object: this.app?.particleRenderer?.object
        ? {
            position: this.app.particleRenderer.object.position.toArray(),
            scale: this.app.particleRenderer.object.scale.toArray(),
          }
        : null,
      formationFromCenter:
        this.app?.mlsMpmSim?.uniforms?.formationFromCenter?.value?.toArray?.() ?? null,
      formationToCenter:
        this.app?.mlsMpmSim?.uniforms?.formationToCenter?.value?.toArray?.() ?? null,
    }),
  };
  private lastTotalDrawCalls = 0;
  private frameMsAvg: number | null = null;
  private readonly frameTimeWindow: number[] = [];
  private discardNextFrameSample = false;
  private cpuSubmitMsAvg: number | null = null;
  private perfPublishAccum = 0;
  private deviceLossArmed = false;
  private deviceLost = false;
  private gravityQualityApplied = false;
  private lenoxSignalAccum = 0;
  private formationRuntimeReady = false;
  private formationSeedCount = 0;
  private formationPairKey = "";
  private formationBoundsKey = "";
  private formationCache = new Map<string, FormationBank>();
  private formationPrewarmHandle: number | null = null;
  private formationPrewarmUsesIdle = false;
  private formationPrewarmGeneration = 0;
  private formationRefreshRaf = 0;
  private formationUploadCount = 0;
  private formationDrive: FormationDrive = {
    from: "principle.fullerene",
    to: "principle.fullerene",
    progress: 0,
    phase: "hold",
    corridor: "wide",
  };
  private pointerPresent = false;
  private livingOpening = {
    tension: 0,
    aperture: 0,
    tensionTarget: 0,
    apertureTarget: 0,
    tau: 0.22,
  };
  private livingSignals: LenoxSignals = {
    energy: 0,
    attention: 0,
    tension: 0,
  };
  /**
   * Phase field: smoothed pointer speed in px/s. `mouseForce` in the solver is
   * already the raw per-frame position delta, so direction and base magnitude
   * follow motion for free — what is missing is smoothing, a ceiling, and a
   * response curve that lets slow motion push at all. All of that is CPU-side;
   * the solver is not modified.
   */
  private pointerSpeed = 0;
  private lastPointerSample: { x: number; y: number; t: number } | null = null;
  /** Guards against a slow environment load overwriting a newer choice. */
  private environmentToken = 0;
  private lastPostEnterStage: PostEnterStage = "none";
  private postEnterDebugAccum = 0;
  private static readonly POST_ENTER_DEBUG_INTERVAL_SEC = 1 / 12;

  constructor(container: HTMLElement, options: FlowEngineBridgeOptions = {}) {
    this.container = container;
    this.options = options;
    this.experienceMode = resolveExperienceMode(options);
  }

  private get isLivingSurface(): boolean {
    return this.experienceMode === "living-surface";
  }

  private get isLegacyLenox(): boolean {
    return this.experienceMode === "legacy-lenox";
  }

  /** Hero Field prototype. Chamber physics, none of the chamber's visual stage. */
  private get isHeroField(): boolean {
    return this.experienceMode === "hero-field";
  }

  private get isPhaseField(): boolean {
    return this.experienceMode === "phase-field";
  }

  async init(): Promise<void> {
    if (!navigator.gpu) {
      throw new Error("WebGPU is not available in this browser.");
    }

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    if (this.isHeroField) {
      this.pendingCompositionMode = resolveHeroFieldCompositionMode(width, height);
    }
    const renderer = new THREE.WebGPURenderer({ alpha: true, antialias: true });

    // Hero Field keeps linear HDR values until the final output transform.
    // Neutral tone mapping preserves black/silver without ACES colour bias.
    if (this.isHeroField) renderer.toneMapping = THREE.NeutralToneMapping;

    const dprCap = this.isLivingSurface ? 1.5 : 2;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    await renderer.init();
    if (this.disposed) {
      renderer.dispose?.();
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(renderer.backend as any)?.isWebGPUBackend) {
      throw new Error("Could not initialize a WebGPU backend.");
    }

    this.renderer = renderer;
    (globalThis as Record<string, unknown>).__LENOX_PERF__ = this.perfSnapshot;
    /*
     * Console handle, not a UI. Finding a light rig by rebuilding once per guess
     * costs ten seconds a try; this costs none. Same pattern and lifetime as
     * __LENOX_PERF__ above, and it is removed again in dispose().
     */
    if (this.isLivingSurface) {
      (globalThis as Record<string, unknown>).__LENOX_FLOW__ = this.flowHandle;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const device = (renderer.backend as any)?.device as GPUDevice | undefined;
    if (device && !this.deviceLossArmed) {
      this.perfSnapshot.gpuTimestampQuery = device.features.has("timestamp-query");
      this.deviceLossArmed = true;
      void device.lost.then((info) => {
        if (!this.disposed && info.reason !== "destroyed") {
          this.deviceLost = true;
          cancelAnimationFrame(this.rafId);
          this.options.onDeviceLost?.(info);
        }
      });
    }
    this.container.appendChild(renderer.domElement);

    const voidVisual =
      this.isLivingSurface ||
      this.isLegacyLenox ||
      this.isPhaseField ||
      this.isHeroField;
    // Hero Field is matter only: it shares Living Surface's "no stage" flags but
    // never its preset, so re-tuning one cannot move the other.
    const matterOnly = this.isLivingSurface || this.isHeroField;
    const app = new App(renderer, {
      visualMode: voidVisual ? "void" : "chamber",
      backdrop: matterOnly ? false : this.options.lenoxBackdrop !== false,
      character: !matterOnly,
      maxParticles: this.isHeroField
        ? HERO_FIELD_PRESET.maxParticles
        : this.isLivingSurface
          ? LIVING_SURFACE_PRESET.maxParticles
          : undefined,
      particles: this.isHeroField
        ? (this.pendingCompositionMode === "banded"
          ? HERO_FIELD_PRESET.particlesPortrait
          : HERO_FIELD_PRESET.particlesDesktop)
        : this.isLivingSurface
          ? (this.pendingCompositionMode === "banded"
            ? LIVING_SURFACE_PRESET.particlesBanded
            : LIVING_SURFACE_PRESET.particlesDesktop)
          : undefined,
      particleSize: this.isHeroField ? HERO_FIELD_PRESET.size : undefined,
      screenBoundsRadiusScale: this.isHeroField
        ? HERO_FIELD_PRESET.screenBoundsRadiusScale
        : undefined,
      screenBoundsFill: this.isHeroField
        ? HERO_FIELD_PRESET.screenBoundsFill
        : undefined,
      particleShadows: !matterOnly,
      computedMatterOnly: matterOnly,
      preserveHdrOutput: this.isHeroField,
    });
    await app.init(width, height);
    if (this.disposed) {
      app.dispose();
      const canvas = renderer.domElement as HTMLCanvasElement;
      if (canvas.parentElement === this.container) {
        this.container.removeChild(canvas);
      }
      renderer.dispose?.();
      return;
    }
    this.app = app;
    if (this.isHeroField) {
      app.setLook?.({
        exposure: HERO_FIELD_PRESET.exposure,
        bloomStrength: HERO_FIELD_PRESET.bloomStrength,
      });
    }
    // Before the first frame: the engine must never compose from its own guess.
    app.setCompositionMode?.(this.pendingCompositionMode);
    if (this.pendingJourneyPose) {
      app.setLenoxJourneyPose?.(
        this.pendingJourneyPose.pose,
        this.pendingJourneyPose.tau,
      );
    }
    if (shouldStartLenoxDrive(this.experienceMode)) {
      this.lenoxDrive = new LenoxEyesDrive({
        reducedMotion: this.options.lenoxReducedMotion,
      });
    }

    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(this.container);
    this.onResize();

    if (this.isHeroField) {
      // Hero Field owns its starting world: authored "Suspended Rift Mass"
      // seed instead of the inherited Chamber idle path. Landscape/portrait
      // are separate authored distributions, resolved from composition mode.
      this.app.seedHeroFieldPopulation?.(
        resolveHeroFieldLayout(this.pendingCompositionMode),
      );
    } else if (!this.isLivingSurface) {
      this.app.promoteIdlePopulation();
    }
    if (this.isLegacyLenox || this.isPhaseField) {
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
    if (this.isLivingSurface) {
      this.app.applyEngineRuntime({
        ...livingSurfaceEngineRuntime(
          this.pendingCompositionMode,
          Boolean(this.options.lenoxReducedMotion),
        ),
        lenoxTintT: 1,
        lenoxMetalness: LIVING_SURFACE_PRESET.metalness,
        lenoxRoughness: LIVING_SURFACE_PRESET.roughness,
        lenoxSilverGain: 1,
      });
      this.setParticlePrimitive(LIVING_SURFACE_PRESET.primitive);
      this.setCoherenceMaterial(LIVING_SURFACE_PRESET.coherenceMaterial);
      this.setCoherenceDebug(LIVING_SURFACE_PRESET.coherenceDebug);
      this.setCoherenceField({
        inner: LIVING_SURFACE_PRESET.coherenceInner,
        outer: LIVING_SURFACE_PRESET.coherenceOuter,
        recruit: LIVING_SURFACE_PRESET.coherenceRecruit,
        release: LIVING_SURFACE_PRESET.coherenceRelease,
        motion: !this.options.lenoxReducedMotion,
        curl: !this.options.lenoxReducedMotion,
      });
      this.app.mlsMpmSim?.setLivingSurfaceCoherence?.({
        enabled: !this.options.lenoxReducedMotion,
        attention: 0,
      });
      this.app.mlsMpmSim?.setLivingSurfaceOpening?.({
        tension: 0,
        aperture: 0,
        banded: this.pendingCompositionMode === "banded",
      });
      this.setSubstance(0xffffff, 0);
      this.setTargetInfluence(LIVING_SURFACE_PRESET.targetInfluence);
      this.formationRuntimeReady = true;
      this.setFormationDrive(this.formationDrive);
      if (this.options.lenoxReducedMotion) {
        this.app.mlsMpmSim?.requestDesign01Bootstrap?.(
          LIVING_SURFACE_PRESET.speed,
        );
      }
      this.scheduleFormationPrewarm();
      await this.setEnvironment(
        LIVING_SURFACE_PRESET.environment,
        LIVING_SURFACE_PRESET.environmentRotation,
        LIVING_SURFACE_PRESET.environmentIntensity,
      );
      this.app?.lights?.setRig?.({
        warmColor: 0xe9f1f6,
        warmIntensity: 1.15,
        warmDirection: [-0.9, 0.62, 0.86],
        coolColor: 0x72bfd6,
        coolIntensity: 0.68,
        coolDirection: [0.9, -0.18, 0.64],
        hemiIntensity: 0.26,
        keyIntensity: 0.9,
      });
    } else {
      this.app.applyEngineRuntime(sourcePlayEngineRuntime());
    }
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

    if (!isHostOwnedRuntimeMode(this.experienceMode)) {
      this.app.applyEngineRuntime(
        this.isLivingSurface
          ? livingSurfaceEngineRuntime(
              this.pendingCompositionMode,
              Boolean(this.options.lenoxReducedMotion),
            )
          : sourcePlayEngineRuntime(),
      );
    }
    this.app.setPointerInfluence(enabled ? (this.isLivingSurface ? 0.55 : 1) : 0);

    if (!enabled) {
      this.clearPointer();
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

    if (this.isLivingSurface) {
      this.pointerPresent = true;
      this.trackPointerSample(x, y);
    }
    this.app.setPointer(localX, localY, isDown);
  }

  clearPointer(): void {
    if (this.disposed || !this.app) return;
    this.pointerPresent = false;
    this.lastPointerSample = null;
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
    const resolvedTau = Number.isFinite(tau) ? (tau as number) : 0.3;
    this.pendingJourneyPose = { pose, tau: resolvedTau };
    this.app?.setLenoxJourneyPose?.(pose, resolvedTau);
    if (this.options.lenoxReducedMotion && resolvedTau <= 0) {
      this.app?.updateLenoxCamera?.(0);
    }
  }

  /**
   * Which way he makes room. React is the single source of this (there is no
   * second opinion in the engine any more) and pushes it here on mount and on
   * every resize that is allowed to change it.
   */
  setCompositionMode(mode: CompositionMode): void {
    if (this.disposed) return;
    const changed = mode !== this.pendingCompositionMode;
    this.pendingCompositionMode = mode;
    this.app?.setCompositionMode?.(mode);
    this.app?.mlsMpmSim?.setLivingSurfaceOpening?.({
      tension: 0,
      aperture: 0,
      banded: mode === "banded",
    });
    if (changed && this.isLivingSurface) {
      this.app?.applyEngineRuntime?.(
        livingSurfaceEngineRuntime(
          mode,
          Boolean(this.options.lenoxReducedMotion),
        ),
      );
      this.formationPairKey = "";
      this.setFormationDrive(this.formationDrive);
      if (this.options.lenoxReducedMotion) {
        this.app?.mlsMpmSim?.requestDesign01Bootstrap?.(
          LIVING_SURFACE_PRESET.speed,
        );
      }
      this.scheduleFormationPrewarm();
    }
  }

  setFormationDrive(drive: FormationDrive): void {
    if (this.disposed || !this.isLivingSurface) return;
    const progress = clamp01(drive?.progress);
    this.formationDrive = {
      from: drive.from,
      to: drive.to,
      progress,
      phase: drive.phase === "hold" ? "hold" : "morph",
      corridor: drive.corridor ?? "wide",
    };
    const sim = this.app?.mlsMpmSim;
    const runtime = this.app?.runtime;
    if (!sim || !runtime) return;

    const count = Math.min(
      runtime.particles ?? 0,
      sim.formationBuffer?.length ?? 0,
    );
    const bounds = this.getSimBounds();
    if (!bounds || count <= 0) return;
    const boundsKey = formationBoundsCacheKey(bounds);
    this.formationBoundsKey = boundsKey;

    const corridor = drive.corridor ?? "wide";
    const pairKey = [
      this.pendingCompositionMode,
      count,
      boundsKey,
      corridor,
      drive.from,
      drive.to,
    ].join(":");
    if (pairKey !== this.formationPairKey) {
      const from = this.getFormationBank(drive.from, count, bounds, corridor);
      const rawTo = this.getFormationBank(drive.to, count, bounds, corridor);
      const groupedTransport = (
        drive.from === "principle.continuum" && drive.to === "capability.triaxis"
      ) || (
        drive.from === "capability.triaxis" && drive.to === "lenox.vectorLoom"
      ) || (
        drive.from === "lenox.vectorLoom" && drive.to === "contact.forwardVector"
      );
      const to = drive.from === "principle.fullerene" && drive.to === "principle.continuum"
        ? spatiallyMatchFormationTarget(from, rawTo)
        : groupedTransport
          ? matchFormationTargetByGroup(from, rawTo)
          : rawTo;
      const pair = packFormationPair(drive.from, drive.to, from, to, bounds);
      if (!sim.uploadFormationPair?.(pair.packed, pair.count)) return;
      if (!sim.setFormationPairCenters?.(pair.fromCenter, pair.toCenter)) return;
      if (pair.count > this.formationSeedCount) {
        const seeded = Boolean(
          sim.seedPopulationFromTargets?.(
            from.positions,
            pair.count,
            this.formationSeedCount,
          ),
        );
        if (!seeded) return;
      }
      this.formationSeedCount = pair.count;
      this.formationUploadCount += 1;
      this.formationPairKey = pairKey;
    }
    const graphiteT = getFormationGraphiteWeight(drive.from)
      + (getFormationGraphiteWeight(drive.to)
        - getFormationGraphiteWeight(drive.from)) * progress;
    sim.setFormationDrive?.(progress, graphiteT);
  }

  private getFormationBank(
    id: FormationId,
    count: number,
    bounds: { min: [number, number, number]; max: [number, number, number] },
    corridor: MatterCorridorId,
  ): FormationBank {
    const key = [
      this.pendingCompositionMode,
      count,
      formationBoundsCacheKey(bounds),
      corridor,
      id,
    ].join(":");
    const cached = this.formationCache.get(key);
    if (cached) return cached;
    const bank = id === "principle.fullerene"
      ? buildDesign01HeroFormation(
          buildAllotropFormation(
            id,
            bounds,
            count,
            this.pendingCompositionMode,
            DESIGN01_FULL_VIEW_CORRIDOR,
          ),
          bounds,
          this.pendingCompositionMode,
        )
      : isDesign01SculptureId(id)
        ? buildDesign01SculptureFormation(
            id,
            bounds,
            count,
            this.pendingCompositionMode,
          )
        : buildAllotropFormation(
            id,
            bounds,
            count,
            this.pendingCompositionMode,
            MATTER_CORRIDORS[corridor],
          );
    this.formationCache.set(key, bank);
    return bank;
  }

  private cancelFormationPrewarm(): void {
    this.formationPrewarmGeneration += 1;
    if (this.formationPrewarmHandle === null) return;
    if (this.formationPrewarmUsesIdle) {
      window.cancelIdleCallback(this.formationPrewarmHandle);
    } else {
      window.clearTimeout(this.formationPrewarmHandle);
    }
    this.formationPrewarmHandle = null;
  }

  /** Warm one or more deterministic banks only when the main thread is idle. */
  private scheduleFormationPrewarm(): void {
    this.cancelFormationPrewarm();
    if (!this.formationRuntimeReady || this.disposed) return;
    const sim = this.app?.mlsMpmSim;
    const runtime = this.app?.runtime;
    const bounds = this.getSimBounds();
    const count = Math.min(
      runtime?.particles ?? 0,
      sim?.formationBuffer?.length ?? 0,
    );
    if (!bounds || count <= 0) return;
    const generation = this.formationPrewarmGeneration;
    let index = 0;

    const scheduleNext = () => {
      if (this.disposed || generation !== this.formationPrewarmGeneration) return;
      if (typeof window.requestIdleCallback === "function") {
        this.formationPrewarmUsesIdle = true;
        this.formationPrewarmHandle = window.requestIdleCallback(run, {
          timeout: 300,
        });
      } else {
        this.formationPrewarmUsesIdle = false;
        this.formationPrewarmHandle = window.setTimeout(() => run(), 16);
      }
    };

    const run = (deadline?: IdleDeadline) => {
      this.formationPrewarmHandle = null;
      if (this.disposed || generation !== this.formationPrewarmGeneration) return;
      let generated = 0;
      while (index < DESIGN01_FORMATION_IDS.length) {
        this.getFormationBank(
          DESIGN01_FORMATION_IDS[index],
          count,
          bounds,
          this.formationDrive.corridor,
        );
        index += 1;
        generated += 1;
        if (!deadline || (generated > 0 && deadline.timeRemaining() < 3)) break;
      }
      if (index < DESIGN01_FORMATION_IDS.length) scheduleNext();
    };

    scheduleNext();
  }

  setLivingSurfaceOpening(
    intent: { tension: number; aperture: number },
    tau = 0.22,
  ): void {
    if (this.disposed || !this.isLivingSurface) return;
    const opening = this.livingOpening;
    opening.tensionTarget = clamp01(intent?.tension);
    opening.apertureTarget = clamp01(intent?.aperture);
    if (this.options.lenoxReducedMotion) {
      opening.tension = opening.tensionTarget;
      opening.aperture = opening.apertureTarget;
      this.app?.mlsMpmSim?.setLivingSurfaceOpening?.({
        tension: 0,
        aperture: 0,
        banded: this.pendingCompositionMode === "banded",
      });
      return;
    }
    opening.tau = Number.isFinite(tau)
      ? Math.max(0.05, tau)
      : 0.22;
  }

  /* ── Phase field ─────────────────────────────────────────────────────────
   * Neutral surface over the existing settle machinery. Targets are written
   * with w = 0 so the solver's role bands (shell/aura/lid/focal) and the gaze
   * offset they gate stay provably inert; gaze, blink and float channels are
   * never touched from here.
   */

  setParticleTargets(positions: Float32Array, count?: number): number {
    if (this.disposed) return 0;
    const sim = this.app?.mlsMpmSim;
    const capacity = sim?.settleTargetBuffer?.length ?? 0;
    if (!capacity) return 0;

    const requested = Math.floor(count ?? positions.length / 3);
    const n = Math.max(
      0,
      Math.min(requested, capacity, Math.floor(positions.length / 3)),
    );
    if (n === 0) return 0;

    // A single NaN reaching the solver poisons the whole grid on the next
    // step, and it is silent — the field simply stops existing.
    for (let i = 0; i < n * 3; i++) {
      if (!Number.isFinite(positions[i])) return 0;
    }
    return sim.buildLenoxShellTargets(positions, n) ? n : 0;
  }

  /**
   * How hard matter is pulled to whatever target bank is loaded. Damping is
   * ramped with the pull rather than switched on at a threshold: a binary jump
   * from 0 to 12 lands a discontinuity in the middle of a phase transition.
   */
  setTargetInfluence(value: number): void {
    if (this.disposed) return;
    const sim = this.app?.mlsMpmSim;
    if (!sim?.uniforms) return;
    const v = Math.min(2, Math.max(0, Number.isFinite(value) ? value : 0));
    sim.uniforms.settleWeight.value = v;
    // With w = 0 everywhere only the shell rate is ever read, but both are set
    // so a stale focal value from another host can never leak in.
    const damp = Math.min(12, v * 24);
    sim.uniforms.settleDampingShell.value = damp;
    sim.uniforms.settleDampingFocal.value = damp;
    this.app?.applyEngineRuntime?.({
      settleWeight: v,
      settleDampingShell: damp,
      settleDampingFocal: damp,
    });
  }

  /**
   * Pointer speed MODULATES the existing displacement response. It is not yet
   * two separate mechanics: the solver applies one force derived from the
   * position delta, so fast motion already pushes harder on its own and what
   * this adds is a curve that keeps slow motion from doing nothing, a ceiling
   * so a flick cannot explode the field, and guards for idle resume and touch
   * jumps. Distinct push-versus-tear behaviour would need radius, shear or
   * viscosity to move as well, which means solver uniforms this proof does not
   * touch. Do not describe this as "slow pushes, fast tears" — it is one
   * response, shaped.
   */
  setPointerSample(clientX: number, clientY: number): void {
    if (this.disposed) return;
    this.trackPointerSample(clientX, clientY);
  }

  private trackPointerSample(clientX: number, clientY: number): void {
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
    const influence = Math.min(slowPush + fastTear, 3.2);
    this.app?.setPointerInfluence?.(
      jump ? 0 : Math.min(influence, this.isLivingSurface ? 0.85 : 3.2),
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

  setCoherenceField(field: {
    inner?: number;
    outer?: number;
    recruit?: number;
    release?: number;
    motion?: boolean;
    curl?: boolean;
  }): void {
    if (this.disposed) return;
    this.app?.mlsMpmSim?.setCoherenceField?.(field);
  }

  /** Diagnostic: is the recruitment centre actually inside the matter? */
  getCoherenceCenter(): [number, number, number] | null {
    const c = this.app?.mlsMpmSim?.uniforms?.coherenceCenter?.value;
    return c ? [c.x, c.y, c.z] : null;
  }

  setCoherenceDebug(enabled: boolean): void {
    if (this.disposed) return;
    this.app?.particleRenderer?.setCoherenceDebug?.(enabled);
  }

  setCoherenceMaterial(enabled: boolean): void {
    if (this.disposed) return;
    this.app?.particleRenderer?.setCoherenceMaterial?.(enabled);
  }

  /**
   * Hero Field only: couples per-particle coherence to metalness so order reads
   * as metal and disorder as matte. Gated separately from `coherenceMaterialT`
   * so enabling it here cannot change any other experience.
   */
  setHeroFieldMaterial(enabled: boolean): void {
    if (this.disposed) return;
    this.app?.particleRenderer?.setHeroFieldMaterial?.(enabled);
  }

  /** Per-instance light rig override. The global default is left untouched. */
  applyLightRig(spec: Record<string, unknown>): void {
    if (this.disposed) return;
    (this.app as unknown as { lights?: { setRig?: (s: unknown) => void } })
      ?.lights?.setRig?.(spec);
  }

  setParticlePrimitive(primitive: "shard" | "billboard"): void {
    if (this.disposed) return;
    this.app?.particleRenderer?.setPrimitive?.(primitive);
  }

  /**
   * Switching is async because an HDRI has to be fetched. A fast A/B can land
   * out of order — pick studio, pick procedural, studio finishes last and
   * silently overwrites the choice. Each request carries a token; a superseded
   * one reports `applied: false` and applies nothing.
   */
  async setEnvironment(
    source: "procedural" | "studio" | "meadow",
    rotationY = 0,
    intensity = 1,
  ): Promise<EnvironmentCost> {
    const miss: EnvironmentCost = {
      source,
      sourceFileBytes: 0,
      decodedBytes: 0,
      gpuEstimateBytes: 0,
      applied: false,
    };
    if (this.disposed || !this.app) return miss;

    const token = ++this.environmentToken;
    try {
      const cost = (await this.app.setEnvironmentSource(
        source,
        rotationY,
        intensity,
      )) as EnvironmentCost;
      if (token !== this.environmentToken || this.disposed) {
        // Superseded mid-flight. The scene may have been written by the newer
        // request already; re-assert it so the last choice wins.
        return miss;
      }
      return cost;
    } catch (error) {
      this.options.onError?.(error);
      return miss;
    }
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
    cancelAnimationFrame(this.formationRefreshRaf);
    this.formationRefreshRaf = 0;
    this.cancelFormationPrewarm();
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
    const globals = globalThis as Record<string, unknown>;
    if (globals.__LENOX_PERF__ === this.perfSnapshot) {
      delete globals.__LENOX_PERF__;
    }
    if (globals.__LENOX_FLOW__ === this.flowHandle) {
      delete globals.__LENOX_FLOW__;
    }
    this.formationCache.clear();
    this.formationPairKey = "";
    this.formationBoundsKey = "";
    this.formationSeedCount = 0;
    this.formationRuntimeReady = false;
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

  private updateLivingSurface(delta: number): void {
    const dt = Math.min(Math.max(delta, 0), 1 / 20);
    const opening = this.livingOpening;
    const openingK = 1 - Math.exp(-dt / opening.tau);
    opening.tension += (opening.tensionTarget - opening.tension) * openingK;
    opening.aperture += (opening.apertureTarget - opening.aperture) * openingK;

    const sampleAge = this.lastPointerSample
      ? performance.now() - this.lastPointerSample.t
      : Infinity;
    if (!this.pointerPresent || sampleAge > 80) {
      this.pointerSpeed *= Math.exp(-dt / 0.18);
    }

    const energyTarget = this.pointerPresent && sampleAge <= 80
      ? clamp01(this.pointerSpeed / 680)
      : 0;
    const attentionTarget = this.pointerPresent ? 1 : 0;
    const attentionK = 1 - Math.exp(-dt / (attentionTarget > this.livingSignals.attention ? 0.12 : 0.7));
    this.livingSignals.energy = advancePointerEnergy(
      this.livingSignals.energy,
      energyTarget,
      dt,
    );
    this.livingSignals.attention +=
      (attentionTarget - this.livingSignals.attention) * attentionK;
    this.livingSignals.tension = opening.tension;

    this.app?.mlsMpmSim?.setLivingSurfaceCoherence?.({
      enabled: !this.options.lenoxReducedMotion,
      attention: this.livingSignals.attention,
    });
    const pointerEnergy = this.options.lenoxReducedMotion
      ? 0
      : this.livingSignals.energy;
    this.app?.mlsMpmSim?.setFormationPointerEnergy?.(0);
    this.app?.mlsMpmSim?.setDesign01PointerEnergy?.(pointerEnergy);

    const state: LenoxProofState =
      opening.aperture > 0.15
        ? "alive"
        : this.livingSignals.attention > 0.12
          ? "attract"
          : "idle";
    if (state !== this.lastLenoxState) {
      this.lastLenoxState = state;
      this.options.onLenoxStateChange?.(state);
    }

    if (this.options.onLenoxSignals) {
      this.lenoxSignalAccum += dt;
      if (this.lenoxSignalAccum >= 1 / 12) {
        this.lenoxSignalAccum = 0;
        this.options.onLenoxSignals({ ...this.livingSignals });
      }
    }
  }

  private onResize = (): void => {
    if (!this.renderer || !this.app) return;
    if (this.postEnterActive) return;

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const heroMode = this.isHeroField
      ? resolveHeroFieldCompositionMode(width, height)
      : this.pendingCompositionMode;
    const heroLayoutChanged = this.isHeroField && heroMode !== this.pendingCompositionMode;

    if (heroLayoutChanged) {
      this.pendingCompositionMode = heroMode;
      this.app.setCompositionMode?.(heroMode);
      this.app.applyEngineRuntime?.({
        particles: heroMode === "banded"
          ? HERO_FIELD_PRESET.particlesPortrait
          : HERO_FIELD_PRESET.particlesDesktop,
      });
    }

    if (this.isLivingSurface) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    }
    this.renderer.setSize(width, height);
    this.app.resize(width, height);
    if (heroLayoutChanged) {
      this.app.seedHeroFieldPopulation?.(resolveHeroFieldLayout(heroMode));
    }

    if (this.isLivingSurface && this.formationRuntimeReady) {
      const bounds = this.getSimBounds();
      const nextBoundsKey = bounds ? formationBoundsCacheKey(bounds) : "";
      if (nextBoundsKey && nextBoundsKey !== this.formationBoundsKey) {
        this.formationBoundsKey = nextBoundsKey;
        this.formationCache.clear();
        this.formationPairKey = "";
        cancelAnimationFrame(this.formationRefreshRaf);
        this.formationRefreshRaf = requestAnimationFrame(() => {
          this.formationRefreshRaf = 0;
          if (this.disposed) return;
          this.setFormationDrive(this.formationDrive);
          this.scheduleFormationPrewarm();
        });
      }
    }
  };

  private onVisibilityChange = (): void => {
    this.hidden = document.hidden;

    // After a hidden tab, discard accumulated clock delta so the next frame is not a spike.
    if (!this.hidden && this.disposed === false) {
      this.clock.getDelta();
      this.discardNextFrameSample = true;
    }
  };

  private animate = async (): Promise<void> => {
    if (this.disposed || this.deviceLost || !this.app) return;

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
    const frameMs = rawDelta * 1000;
    if (this.discardNextFrameSample) {
      this.discardNextFrameSample = false;
    } else if (frameMs > 0 && frameMs < 500) {
      this.frameTimeWindow.push(frameMs);
      if (this.frameTimeWindow.length > 120) this.frameTimeWindow.shift();
      this.frameMsAvg = this.frameMsAvg === null
        ? frameMs
        : this.frameMsAvg * 0.92 + frameMs * 0.08;
    }
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

      if (this.isLivingSurface) {
        this.updateLivingSurface(delta);
      } else if (isHostOwnedRuntimeMode(this.experienceMode)) {
        // Isolated hosts own runtime, targets and pointer influence. No drive
        // runs here — otherwise its per-frame writes overwrite the host preset.
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
      if (
        this.lenoxDrive ||
        isHostOwnedRuntimeMode(this.experienceMode) ||
        this.isLivingSurface
      ) {
        // This measures CPU orchestration and command submission only. Actual
        // delivered frame rate comes from rAF interval above; neither is
        // mislabeled as GPU time without a timestamp query.
        const cpuT0 = performance.now();
        await this.app.update(delta);
        const cpuSubmitMs = performance.now() - cpuT0;
        this.cpuSubmitMsAvg = this.cpuSubmitMsAvg === null
          ? cpuSubmitMs
          : this.cpuSubmitMsAvg * 0.92 + cpuSubmitMs * 0.08;
        this.perfPublishAccum += rawDelta;
        if (this.perfPublishAccum >= 0.25) {
          this.perfPublishAccum = 0;
          const renderInfo = this.renderer?.info?.render;
          this.perfSnapshot.rafFrameMs = round2(this.frameMsAvg ?? 0);
          this.perfSnapshot.rafFps = round2(
            this.frameMsAvg && this.frameMsAvg > 0 ? 1000 / this.frameMsAvg : 0,
          );
          if (this.frameTimeWindow.length > 0) {
            const sorted = [...this.frameTimeWindow].sort((a, b) => a - b);
            const medianIndex = Math.floor((sorted.length - 1) * 0.5);
            const p95Index = Math.ceil(sorted.length * 0.95) - 1;
            const medianMs = sorted[medianIndex];
            this.perfSnapshot.rafFpsMedian = round2(
              medianMs > 0 ? 1000 / medianMs : 0,
            );
            this.perfSnapshot.rafFrameMsP95 = round2(sorted[p95Index]);
            this.perfSnapshot.longFramePercent = round2(
              this.frameTimeWindow.filter((value) => value > 40).length
                / this.frameTimeWindow.length
                * 100,
            );
          }
          this.perfSnapshot.cpuSubmitMs = round2(this.cpuSubmitMsAvg ?? 0);
          this.perfSnapshot.particles = this.app.runtime?.particles ?? 0;
          this.perfSnapshot.pixelRatio = this.renderer?.getPixelRatio?.() ?? 0;
          // `renderInfo.calls` accumulates across frames in this backend, so
          // reporting it raw grew to six figures and read like a catastrophe
          // that was not happening. Report the per-frame delta instead — the
          // number anyone looking at this actually means.
          const totalCalls = renderInfo?.calls ?? 0;
          this.perfSnapshot.drawCalls = Math.max(
            0,
            totalCalls - this.lastTotalDrawCalls,
          );
          this.lastTotalDrawCalls = totalCalls;
          this.perfSnapshot.triangles = renderInfo?.triangles ?? 0;
          const canvas = this.renderer?.domElement as HTMLCanvasElement | undefined;
          this.perfSnapshot.viewportPixels = canvas
            ? canvas.width * canvas.height
            : 0;
          const grid = this.app.mlsMpmSim?.gridSize;
          this.perfSnapshot.gridCells = grid
            ? grid.x * grid.y * grid.z
            : 0;
          this.perfSnapshot.computePasses =
            this.app.mlsMpmSim?.lastDispatchPasses ?? 0;
          this.perfSnapshot.formationBanks = this.formationCache.size;
          this.perfSnapshot.formationUploads = this.formationUploadCount;
          this.perfSnapshot.formationPair =
            `${this.formationDrive.from} -> ${this.formationDrive.to}`;
          this.perfSnapshot.formationProgress = round2(this.formationDrive.progress);
          this.perfSnapshot.compositionMode = this.pendingCompositionMode;
          this.perfSnapshot.boundsKey = this.formationBoundsKey;
        }
      } else {
        await this.app.update(delta);
      }
    } catch (error) {
      this.options.onError?.(error);
    }

    this.rafId = requestAnimationFrame(this.animate);
  };
}
