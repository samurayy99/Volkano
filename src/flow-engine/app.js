import * as THREE from "three/webgpu";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { Lights } from "./lights";

import { float, Fn, mrt, output, pass, vec4 } from "three/tsl";
import MlsMpmSimulator from "./mls-mpm/mlsMpmSimulator";
import ParticleRenderer from "./mls-mpm/particleRenderer";
import BackgroundGeometry from "./backgroundGeometry";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { PREENTER_VESSEL } from "./vesselDescriptors";
import { forensicHoldReadIsolation } from "./post-enter/forensicPostEnter.js";
import {
  ARREST_BLOOM_SPIKE,
  ARREST_EXPOSURE_DIP,
  ARREST_EXPOSURE_PEAK,
  ARREST_FLASH_DURATION,
  ARREST_RIFT_BOOST,
  AUTHORITY_EXPOSURE_LIFT,
  POST_ENTER_COOLED_LOOK,
  PUSH_IN_DISTANCE,
  runPostEnterDrive,
} from "./post-enter/postEnterDrive.js";

const HDRI_URL = "/flow-assets/autumn_field_puresky_1k.hdr";
const MOBILE_BREAKPOINT = 768;

const SOURCE_RADIUS_SCALE = Object.freeze({
  primary: 0.82,
  secondary: 0.88,
});

/** Single source for baseline scene look (tone + bloom + HDRI). Authority post-enter lerps exposure/bloom from here. */
const DEFAULT_LOOK = Object.freeze({
  environmentIntensity: 0.22,
  exposure: 0.56,
  bloomThreshold: 0.12,
  bloomStrength: 0.16,
  bloomRadius: 0.46,
});

const BASE_RUNTIME_DEFAULTS = Object.freeze({
  noise: 1.08,
  speed: 1.02,
  stiffness: 1.92,
  dynamicViscosity: 0.034,
  gravity: 1,
  apicBlend: 0.45,
  maxVelocity: 6.0,
  density: 1,
  run: true,
  particlesDesktop: 8192 * 4,
  particlesMobile: 4096,
  size: 0.68,
});

const INITIAL_SOURCE_RUNTIME = Object.freeze({
  ventCenter: [23.2, 30.6, 18.4],
  ventRadii: [4.2, 3.2, 2.8],
  ventAxis: [-0.16, 0.94, 0.3],
  sourceFieldCenter: [24.0, 30.8, 18.8],
  sourceFieldRadii: [12.8, 10.2, 10.6],
  sourceFieldSecondaryCenter: [30.8, 31.6, 24.8],
  sourceFieldSecondaryRadii: [7.8, 7.2, 8.1],
  chamberFlowCenter: [32.0, 31.8, 30.4],
});

const deriveParticleMetrics = ({ particles, size, density }) => {
  const level = Math.max(particles / 8192, 1);

  return {
    actualSize: (1.6 / Math.pow(level, 1 / 3)) * size,
    restDensity: 0.25 * level * density,
  };
};

const createRuntimeState = (width = window.innerWidth) => {
  const particles =
    width < MOBILE_BREAKPOINT
      ? BASE_RUNTIME_DEFAULTS.particlesMobile
      : BASE_RUNTIME_DEFAULTS.particlesDesktop;

  const derived = deriveParticleMetrics({
    particles,
    size: BASE_RUNTIME_DEFAULTS.size,
    density: BASE_RUNTIME_DEFAULTS.density,
  });

  return {
    particles,
    run: BASE_RUNTIME_DEFAULTS.run,
    noise: BASE_RUNTIME_DEFAULTS.noise,
    speed: BASE_RUNTIME_DEFAULTS.speed,
    stiffness: BASE_RUNTIME_DEFAULTS.stiffness,
    dynamicViscosity: BASE_RUNTIME_DEFAULTS.dynamicViscosity,
    gravity: BASE_RUNTIME_DEFAULTS.gravity,
    apicBlend: BASE_RUNTIME_DEFAULTS.apicBlend,
    maxVelocity: BASE_RUNTIME_DEFAULTS.maxVelocity,
    density: BASE_RUNTIME_DEFAULTS.density,
    size: BASE_RUNTIME_DEFAULTS.size,
    actualSize: derived.actualSize,
    restDensity: derived.restDensity,
    sourceRadiusScale: SOURCE_RADIUS_SCALE,
    ventCenter: new THREE.Vector3(...INITIAL_SOURCE_RUNTIME.ventCenter),
    ventRadii: new THREE.Vector3(...INITIAL_SOURCE_RUNTIME.ventRadii),
    ventAxis: new THREE.Vector3(...INITIAL_SOURCE_RUNTIME.ventAxis).normalize(),
    sourceFieldCenter: new THREE.Vector3(
      ...INITIAL_SOURCE_RUNTIME.sourceFieldCenter,
    ),
    sourceFieldRadii: new THREE.Vector3(
      ...INITIAL_SOURCE_RUNTIME.sourceFieldRadii,
    ),
    sourceFieldSecondaryCenter: new THREE.Vector3(
      ...INITIAL_SOURCE_RUNTIME.sourceFieldSecondaryCenter,
    ),
    sourceFieldSecondaryRadii: new THREE.Vector3(
      ...INITIAL_SOURCE_RUNTIME.sourceFieldSecondaryRadii,
    ),
    chamberFlowCenter: new THREE.Vector3(
      ...INITIAL_SOURCE_RUNTIME.chamberFlowCenter,
    ),
    riftTargetMin: new THREE.Vector3(32, 5.5, 58),
    riftTargetMax: new THREE.Vector3(32, 58.5, 58),
    riftTargetCenter: new THREE.Vector3(32, 31.8, 58),
    maxParticles: width < MOBILE_BREAKPOINT ? 8192 * 8 : 8192 * 16,
    simSubsteps: 1,
    postEnterActive: false,

    // Arrest runtime
    solverLocked: false,
    bodyScaleMul: 1,
    /** Effective MLS source radii multiplier (Field Dominance surrender tapers feed). */
    postEnterSourceRadiusMul: 1,
    convergenceSlowdown: 0,
    convergenceFreeze: 0,
    convergenceHeatRetention: 0,
    convergenceThermalExtinction: 0,
    materialClaimT: 0,
    postEnterHoverClamp: 1,
    postEnterArrestActive: false,
    postEnterArrestT: 0,
    postEnterHoldT: 0,
    postEnterRiftFlightActive: false,
    postEnterFlightSec: 0,
    postEnterFlightT: 0,
    /** 1 = MLS kernel keeps previous particle color/heat (settle/hold only); 0 = normal thermal write. */
    postEnterThermalColorLock: 0,

    // Source-chamber conversation channels (V2). All 0 = exact source-play
    // idle; only `sourceChamberDrive` raises them, only between post-enters.
    returnBodyWeight: 0,
    recallLateralWeight: 0,
    recallVerticalWeight: 0,
    settleWeight: 0,
    compressT: 0,
    thinT: 0,
    opacityT: 0,
    massDimT: 0,

    // Lenox void channels (V-eyes proof). 0 / zero-vector = chamber behavior.
    lenoxTintT: 0,
    lenoxFocalBoost: 1,
    // Lenox silver-material channel (Session 1). Only read where lenoxTintT
    // masks it, so chamber/post-enter rendering stays byte-identical.
    lenoxMetalness: 0.85,
    lenoxRoughness: 0.3,
    lenoxEnvIntensity: 1.35,
    lenoxSilverGain: 1,
    settleOffset: new THREE.Vector3(),
    settleBob: new THREE.Vector3(),
    settleSquashT: 1,
    settleSquashCenter: 32,
    /** Viewport-projected sim bounds (Lenox); null = grid walls (chamber). */
    simBoundsMin: null,
    simBoundsMax: null,
    wallRestitution: 0,

    // Future claim runtime
    authorityLightT: 0,
    pushInT: 0,
    pageLockT: 0,
    heroT: 0,
  };
};

/** Post-enter sequencing and freeze-space math live in `./post-enter/postEnterDrive.js`. */

const loadHdrTexture = async (file) => {
  const texture = await new Promise((resolve) => {
    new RGBELoader().load(file, (result) => {
      result.mapping = THREE.EquirectangularReflectionMapping;
      resolve(result);
    });
  });

  return texture;
};

class App {
  renderer = null;

  camera = null;
  scene = null;
  environmentTexture = null;

  lights = null;
  backgroundGeometry = null;
  mlsMpmSim = null;
  particleRenderer = null;
  postProcessing = null;
  bloomPass = null;

  raycaster = null;
  plane = null;

  pointerNdc = new THREE.Vector2();
  pointerIntersect = new THREE.Vector3();

  sourceFieldAnchorOffsets = null;
  startupSourceFieldAnchorOffsets = null;

  sourceAnchorScales = {
    idlePrimary: new THREE.Vector3(0.78, 0.82, 0.7),
    idleSecondary: new THREE.Vector3(0.38, 0.62, 0.4),
  };

  sourceAnchorScratch = {
    ventCenter: new THREE.Vector3(),
    ventAxis: new THREE.Vector3(),
    rightPoint: new THREE.Vector3(),
    upPoint: new THREE.Vector3(),
    axisPoint: new THREE.Vector3(),
    worldOffsetPoint: new THREE.Vector3(),
  };

  runtime = null;

  /** Lenox gaze rig (void mode): stable sockets + clamped focal anchors. */
  lenoxRig = null;
  /** Lenox lifecycle camera framing (void mode). */
  lenoxFramings = null;
  lenoxFrame = null;

  postEnterDriveActive = false;

  quietElapsed = 0;
  cameraBaselineZ = null;
  cameraBaselineFov = null;
  cameraBaselinePosition = null;
  cameraBaselineTarget = null;
  cameraTarget = new THREE.Vector3();

  pushInStartTime = null;
  pageLockStartTime = null;
  heroStartTime = null;
  postEnterSolverLockTime = null;

  _lastPostEnterStageReturned = "none";
  _lastDrivePostEnterElapsed = 0;
  _arrestFlashApplied = false;
  _postEnterRiftFlightInitScheduled = false;

  /**
   * @param {"chamber"|"void"} [options.visualMode] "void" keeps the vessel
   * geometry out of the scene (Lenox proof) while anchors/seeding still work.
   */
  constructor(renderer, options = {}) {
    this.renderer = renderer;
    this.visualMode = options.visualMode === "void" ? "void" : "chamber";
  }

  resetPostEnterRuntimeChannels() {
    if (!this.runtime) return;

    this.mlsMpmSim?.resetPostEnterRiftFlightState?.();

    this.runtime.postEnterActive = false;
    this.runtime.run = BASE_RUNTIME_DEFAULTS.run;

    // Arrest runtime
    this.runtime.solverLocked = false;
    this.runtime.bodyScaleMul = 1;
    this.runtime.postEnterSourceRadiusMul = 1;
    this.runtime.convergenceFreeze = 0;
    this.runtime.convergenceSlowdown = 0;
    this.runtime.convergenceHeatRetention = 0;
    this.runtime.convergenceThermalExtinction = 0;
    this.runtime.materialClaimT = 0;
    this.runtime.postEnterHoverClamp = 1;
    this.runtime.postEnterArrestActive = false;
    this.runtime.postEnterArrestT = 0;
    this.runtime.postEnterHoldT = 0;
    this.runtime.postEnterRiftFlightActive = false;
    this.runtime.postEnterFlightSec = 0;
    this.runtime.postEnterFlightT = 0;
    this.runtime.postEnterThermalColorLock = 0;

    // Conversation channels must be silent through any post-enter cycle.
    this.runtime.returnBodyWeight = 0;
    this.runtime.recallLateralWeight = 0;
    this.runtime.recallVerticalWeight = 0;
    this.runtime.settleWeight = 0;
    this.runtime.compressT = 0;
    this.runtime.thinT = 0;
    this.runtime.opacityT = 0;
    this.runtime.massDimT = 0;

    // Future handoff runtime
    this.runtime.authorityLightT = 0;
    this.runtime.pushInT = 0;
    this.runtime.pageLockT = 0;
    this.runtime.heroT = 0;
  }

  beginPostEnterDrive() {
    this.postEnterDriveActive = true;

    this.quietElapsed = 0;
    this.cameraBaselineZ = null;
    this.cameraBaselineFov = null;
    this.cameraBaselinePosition = null;
    this.cameraBaselineTarget = null;

    this.pushInStartTime = null;
    this.pageLockStartTime = null;
    this.heroStartTime = null;
    this.postEnterSolverLockTime = null;

    this._lastPostEnterStageReturned = "none";
    this._lastDrivePostEnterElapsed = 0;
    this._forensicPostEnterLogBucket = undefined;
    this._postEnterRiftFlightInitScheduled = false;

    this.resetPostEnterRuntimeChannels();
    this.runtime.postEnterActive = true;

    // Start the isolated post-enter path; late claim and handoff channels stay reset.
    this.syncRiftFlightDescriptor();

    this.backgroundGeometry?.backPlateMaterial?.color?.setRGB?.(1, 1, 1);
    this._arrestFlashApplied = false;
  }

  /**
   * Return from any post-enter stage to live source play. CPU-only writes;
   * the bridge queues this to a frame boundary so no GPU pass is in flight.
   */
  resetToSourcePlay(width, height) {
    if (!this.runtime) return;

    this.postEnterDriveActive = false;
    this.resetPostEnterRuntimeChannels();

    this.quietElapsed = 0;
    this.pushInStartTime = null;
    this.pageLockStartTime = null;
    this.heroStartTime = null;
    this.postEnterSolverLockTime = null;
    this._lastPostEnterStageReturned = "none";
    this._lastDrivePostEnterElapsed = 0;
    this._forensicPostEnterLogBucket = undefined;
    this._postEnterRiftFlightInitScheduled = false;
    this._arrestFlashApplied = false;

    // Drop cached push-in camera baselines before re-framing from the vessel.
    this.cameraBaselineZ = null;
    this.cameraBaselineFov = null;
    this.cameraBaselinePosition = null;
    this.cameraBaselineTarget = null;
    this.applyCameraFraming(width, height);
    this.setLook(DEFAULT_LOOK);
    this.backgroundGeometry?.backPlateMaterial?.color?.setRGB?.(1, 1, 1);

    // Re-seed the canonical idle body; the dirty particle buffer uploads on
    // the next sim update, while the chamber is still visually empty.
    this.promoteIdlePopulation();
  }

  /**
   * Lenox gaze rig — the deterministic identity layer (works with particles
   * disabled). Per eye, in sim space (children of the particle group):
   *   socket — stable dark almond aperture plate (barely above void, never
   *            white, never a cutout hole)
   *   anchor — small restrained cyan focal disc; travel is clamped inside
   *            the socket, per-eye vector (CodePen-2 architecture)
   * Particles wrap around this rig; they do not define it.
   */
  initLenoxGazeRig() {
    if (!this.particleRenderer?.object || this.lenoxRig) return;

    // Rig root: head tilt / squash / bounce apply to every part at once.
    const root = new THREE.Group();
    this.particleRenderer.object.add(root);

    const eyeShape = new THREE.Shape();
    eyeShape.moveTo(-1, 0);
    eyeShape.quadraticCurveTo(0, 1.35, 1, 0);
    eyeShape.quadraticCurveTo(0, -1.35, -1, 0);
    const eyeGeometry = new THREE.ShapeGeometry(eyeShape, 24);
    const eyeMaterial = new THREE.MeshBasicMaterial({
      color: 0x122530,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    const anchorGeometry = new THREE.CircleGeometry(1, 24);
    const accentMaterial = new THREE.MeshBasicMaterial({
      color: 0x46d4ee,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    // Brow: thin rounded bar (energy field, not hair).
    const browShape = new THREE.Shape();
    browShape.moveTo(-1, -0.14);
    browShape.quadraticCurveTo(-1.06, 0, -1, 0.14);
    browShape.lineTo(1, 0.14);
    browShape.quadraticCurveTo(1.06, 0, 1, -0.14);
    browShape.lineTo(-1, -0.14);
    const browGeometry = new THREE.ShapeGeometry(browShape, 8);

    // Mouth: parametric ring sector (bottom arc). curve via rotation/scale,
    // "open" swaps to the full ring.
    const arcGeometry = new THREE.RingGeometry(0.78, 1, 32, 1, Math.PI * 1.15, Math.PI * 0.7);
    const ringGeometry = new THREE.RingGeometry(0.66, 1, 32);

    const make = (geometry, material, renderOrder) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      mesh.renderOrder = renderOrder;
      root.add(mesh);
      return mesh;
    };

    this.lenoxRig = {
      root,
      eyes: [make(eyeGeometry, eyeMaterial, 2), make(eyeGeometry, eyeMaterial, 2)],
      anchors: [make(anchorGeometry, accentMaterial, 3), make(anchorGeometry, accentMaterial, 3)],
      brows: [make(browGeometry, accentMaterial, 3), make(browGeometry, accentMaterial, 3)],
      mouthArc: make(arcGeometry, accentMaterial, 3),
      mouthRing: make(ringGeometry, accentMaterial, 3),
      accentMaterial,
      eyeMaterial,
      geometries: [eyeGeometry, anchorGeometry, browGeometry, arcGeometry, ringGeometry],
      materials: [eyeMaterial, accentMaterial],
      accentColor: new THREE.Color(0x46d4ee),
    };
  }

  /**
   * Per-frame expressive pose from the Lenox drive (sim-space coordinates).
   * The drive owns all emotion math; this just applies transforms.
   */
  setLenoxRig(pose) {
    if (!this.lenoxRig || !pose) return;
    const r = this.lenoxRig;
    const p = Math.max(0, Math.min(pose.presence ?? 0, 1));
    const on = p > 0.02;

    r.root.position.set(pose.head.x, pose.head.y, 0);
    r.root.rotation.z = pose.head.tilt;
    r.root.scale.set(pose.head.scaleX, pose.head.scaleY, 1);

    r.accentColor.set(pose.accentColor);
    r.accentMaterial.color.lerp(r.accentColor, 0.12);

    for (let i = 0; i < 2; i++) {
      const eye = r.eyes[i];
      const anchor = r.anchors[i];
      const brow = r.brows[i];
      const e = pose.eyes[i];
      eye.visible = on;
      eye.position.set(e.x, e.y, e.z);
      eye.rotation.z = e.rot;
      eye.scale.set(e.scaleX * p, Math.max(e.scaleY, 0.02) * p, 1);

      const a = pose.anchors[i];
      anchor.visible = on;
      anchor.position.set(a.x, a.y, e.z - 0.6);
      anchor.scale.set(a.r * p, a.r * Math.max(Math.min(e.scaleY / e.baseScaleY, 1), 0.05) * p, 1);

      const b = pose.brows[i];
      brow.visible = on && b.visible;
      brow.position.set(b.x, b.y, e.z - 0.4);
      brow.rotation.z = b.rot;
      brow.scale.set(b.len * p, p, 1);
    }

    const m = pose.mouth;
    r.mouthArc.visible = on && m.visible && m.open < 0.5;
    r.mouthRing.visible = on && m.visible && m.open >= 0.5;
    for (const mesh of [r.mouthArc, r.mouthRing]) {
      mesh.position.set(m.x, m.y, pose.eyes[0].z - 0.4);
      mesh.rotation.z = m.curve >= 0 ? 0 : Math.PI;
      mesh.scale.set(
        m.width * p,
        Math.max(Math.abs(m.curve), 0.12) * m.width * 0.8 * p,
        1,
      );
    }
    r.mouthRing.scale.set(m.width * 0.5 * p, m.width * 0.55 * p, 1);
  }

  /** Dev: hide/show the particle body (rig must read on its own). */
  setParticlesVisible(visible) {
    if (this.particleRenderer) {
      this.particleRenderer.forceHidden = !visible;
    }
  }

  /**
   * @param {number} elapsedSec
   * @returns {"none"|"impact"}
   */
  drivePostEnter(elapsedSec) {
    return runPostEnterDrive(this, elapsedSec, {
      noise: BASE_RUNTIME_DEFAULTS.noise,
      speed: BASE_RUNTIME_DEFAULTS.speed,
      gravity: BASE_RUNTIME_DEFAULTS.gravity,
      stiffness: BASE_RUNTIME_DEFAULTS.stiffness,
      dynamicViscosity: BASE_RUNTIME_DEFAULTS.dynamicViscosity,
      apicBlend: BASE_RUNTIME_DEFAULTS.apicBlend,
      maxVelocity: BASE_RUNTIME_DEFAULTS.maxVelocity,
    });
  }

  getPostEnterDebugSnapshot() {
    if (!this.postEnterDriveActive || !this.runtime) {
      return null;
    }

    const rt = this.runtime;

    return {
      stage: this._lastPostEnterStageReturned,
      elapsedSec: this._lastDrivePostEnterElapsed,
      run: rt.run !== false,
      gravity: rt.gravity ?? 0,
      solverLocked: !!rt.solverLocked,
      postEnterArrestActive: !!rt.postEnterArrestActive,
      postEnterArrestT: rt.postEnterArrestT ?? 0,
      postEnterHoldT: rt.postEnterHoldT ?? 0,
      postEnterFlightSec: rt.postEnterFlightSec ?? 0,
      postEnterFlightT: rt.postEnterFlightT ?? 0,
      postEnterRiftFlightActive: !!rt.postEnterRiftFlightActive,
    };
  }

  updateCamera(pushInT, options = {}) {
    if (!this.camera) return;

    if (
      this.cameraBaselineZ === null ||
      this.cameraBaselinePosition === null ||
      this.cameraBaselineTarget === null
    ) {
      this.cameraBaselineZ = this.camera.position.z;
      this.cameraBaselineFov = this.camera.fov;
      this.cameraBaselinePosition = this.camera.position.clone();
      this.cameraBaselineTarget = this.cameraTarget.clone();
    }

    const t = Math.max(0, pushInT);
    const distanceMul = options.distanceMul ?? PUSH_IN_DISTANCE;
    const fovMul = options.fovMul ?? 0.28;

    const remainingDistance = Math.max(0.08, 1 - t * distanceMul);
    const viewOffset = this.cameraBaselinePosition
      .clone()
      .sub(this.cameraBaselineTarget);

    this.camera.position
      .copy(this.cameraBaselineTarget)
      .addScaledVector(viewOffset, remainingDistance);
    this.camera.lookAt(this.cameraBaselineTarget);
    if (this.cameraBaselineFov) {
      this.camera.fov = this.cameraBaselineFov * (1 - t * fovMul);
    }
    this.camera.updateProjectionMatrix();
  }

  updateAuthorityLight(authorityLightT, heroT) {
    const exposure =
      THREE.MathUtils.lerp(
        DEFAULT_LOOK.exposure,
        POST_ENTER_COOLED_LOOK.exposure,
        authorityLightT,
      ) +
      AUTHORITY_EXPOSURE_LIFT * heroT;

    const bloomStrength = THREE.MathUtils.lerp(
      DEFAULT_LOOK.bloomStrength,
      POST_ENTER_COOLED_LOOK.bloomStrength,
      authorityLightT,
    );

    this.setLook({ exposure, bloomStrength });
  }

  /**
   * Impact-window exposure/bloom/plate bump (first ~200ms wall-clock after Enter).
   * Layered on top of setLook(); authority light remains the steady owner afterward.
   */
  updateRiftBackplatePulse(luminance) {
    const plate = this.backgroundGeometry?.backPlateMaterial;
    if (!plate?.color) return;
    const v = Math.max(1, Math.min(luminance, 1.08));
    plate.color.setRGB(v, v, v);
  }

  updateArrestFlash(elapsedSec) {
    if (elapsedSec >= ARREST_FLASH_DURATION) {
      if (this._arrestFlashApplied) {
        this.backgroundGeometry?.backPlateMaterial?.color?.setRGB?.(1, 1, 1);
        this._arrestFlashApplied = false;
      }
      return;
    }

    this._arrestFlashApplied = true;
    const t = elapsedSec / ARREST_FLASH_DURATION;

    const gauss = (center, width) =>
      Math.exp(-Math.pow((t - center) / width, 2));

    const exposurePulse =
      ARREST_EXPOSURE_PEAK * gauss(0.2, 0.12) +
      ARREST_EXPOSURE_DIP * gauss(0.6, 0.18);
    const bloomMult = 1 + ARREST_BLOOM_SPIKE * gauss(0.2, 0.25);
    const riftBoost = ARREST_RIFT_BOOST * gauss(0.3, 0.1);

    if (this.renderer && Number.isFinite(this.renderer.toneMappingExposure)) {
      this.renderer.toneMappingExposure += exposurePulse;
    }
    if (this.bloomPass?.strength) {
      this.bloomPass.strength.value *= bloomMult;
    }

    const plate = this.backgroundGeometry?.backPlateMaterial;
    if (plate?.color) {
      plate.color.setRGB(
        1 + riftBoost,
        1 + riftBoost * 0.85,
        1 + riftBoost * 0.55,
      );
    }
  }

  createPostProcessingPipeline() {
    const scenePass = pass(this.scene, this.camera);

    scenePass.setMRT(
      mrt({
        output,
        bloomIntensity: float(0),
      }),
    );

    const outputPass = scenePass.getTextureNode();
    const bloomIntensityPass = scenePass.getTextureNode("bloomIntensity");
    const bloomPass = bloom(bloomIntensityPass);

    const postProcessing = new THREE.PostProcessing(this.renderer);
    postProcessing.outputColorTransform = false;
    postProcessing.outputNode = Fn(() => {
      const sceneColor = outputPass.rgb;
      const sceneAlpha = outputPass.a;
      const bloomColor = bloomPass.rgb;
      const combinedColor = sceneColor.add(bloomColor).clamp(0, 1);
      const bloomLuma = bloomColor.r.max(bloomColor.g).max(bloomColor.b);
      const finalAlpha = sceneAlpha.max(bloomLuma.mul(1.5)).clamp(0, 1);

      return vec4(combinedColor, finalAlpha);
    })().renderOutput();

    this.postProcessing = postProcessing;
    this.bloomPass = bloomPass;
    this.setLook(DEFAULT_LOOK);
  }

  async init(width = window.innerWidth, height = window.innerHeight) {
    this.runtime = createRuntimeState(width);

    this.camera = new THREE.PerspectiveCamera(47, width / height, 0.01, 7.5);
    this.applyCameraFraming(width, height);

    this.scene = new THREE.Scene();
    this.scene.add(this.camera);

    const hdriTexture = await loadHdrTexture(HDRI_URL);
    this.environmentTexture = hdriTexture;

    this.scene.background = null;
    this.scene.environment = hdriTexture;
    this.scene.environmentRotation = new THREE.Euler(0, -2.15, 0);

    this.mlsMpmSim = new MlsMpmSimulator(this.renderer);
    await this.mlsMpmSim.init(this.runtime.maxParticles);

    this.particleRenderer = new ParticleRenderer(this.mlsMpmSim);

    this.mlsMpmSim.applyRuntime(this.runtime);
    this.particleRenderer.applyRuntime(this.runtime);

    this.backgroundGeometry = new BackgroundGeometry();
    await this.backgroundGeometry.init();
    // Void mode still constructs the vessel (source anchors, rift descriptors
    // and seeding derive from it) but never shows it.
    if (this.visualMode !== "void") {
      this.scene.add(this.backgroundGeometry.object);
    }

    this.lights = new Lights();
    this.scene.add(this.lights.object);
    this.scene.add(this.particleRenderer.object);

    if (this.visualMode === "void") {
      this.initLenoxGazeRig();
      this.computeLenoxFramings(width, height);
      this.updateLenoxCamera(0);
    }

    this.createPostProcessingPipeline();

    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.2);
  }

  resize(width, height) {
    if (!this.camera) return;

    this.camera.aspect = width / height;
    if (this.postEnterDriveActive) {
      this.camera.updateProjectionMatrix();
      return;
    }

    if (this.visualMode === "void") {
      this.computeLenoxFramings(width, height);
      this.updateLenoxCamera(0);
      return;
    }

    this.applyCameraFraming(width, height);
  }

  /**
   * Lenox lifecycle framing (void mode). Two authored compositions:
   *   wide    (t=0) — airy dust field, lots of negative space
   *   present (t=1) — the entity at ~50% desktop width / upper-third portrait
   * The drive sets the target t per lifecycle; the camera eases between.
   */
  computeLenoxFramings(width = window.innerWidth, height = window.innerHeight) {
    if (!this.camera || !this.particleRenderer?.object) return;

    const aspect = width / Math.max(height, 1);
    const portrait = aspect < 0.85;
    const fov = 42;
    const fovRad = THREE.MathUtils.degToRad(fov);

    this.particleRenderer.object.updateWorldMatrix(true, false);
    const center = this.particleRenderer.object.localToWorld(
      new THREE.Vector3(32, 36.5, 30),
    );
    const edgePresence = this.particleRenderer.object.localToWorld(
      new THREE.Vector3(32 + 14.5, 36.5, 30),
    );
    const edgeDust = this.particleRenderer.object.localToWorld(
      new THREE.Vector3(32 + 27, 36.5, 30),
    );
    const presenceHalf = Math.abs(edgePresence.x - center.x);
    const dustHalf = Math.abs(edgeDust.x - center.x);

    const frameFor = (halfWidth, fraction, targetYShiftFrac) => {
      const visibleWidth = (halfWidth * 2) / fraction;
      const distance = visibleWidth / (2 * Math.tan(fovRad / 2) * aspect);
      const visibleHeight = 2 * distance * Math.tan(fovRad / 2);
      return {
        distance,
        targetY: center.y - targetYShiftFrac * visibleHeight,
      };
    };

    this.lenoxFramings = {
      center,
      fov,
      wide: frameFor(dustHalf, portrait ? 0.98 : 0.86, 0),
      present: frameFor(
        presenceHalf,
        portrait ? 0.78 : 0.52,
        portrait ? 0.16 : 0,
      ),
    };
    if (!this.lenoxFrame) this.lenoxFrame = { t: 0, target: 0 };
  }

  /** Drive → target composition t (0 wide … 1 present). */
  setLenoxComposition(target) {
    if (!this.lenoxFrame) this.lenoxFrame = { t: 0, target: 0 };
    this.lenoxFrame.target = Math.max(0, Math.min(target ?? 0, 1));
  }

  /**
   * Lenox side-key rig: one dominant key sculpts a light flank and a shadow
   * flank on the silver mass. Only the Lenox drive calls this — the chamber
   * keeps the Lights constructor values untouched.
   * Camera sits at -z looking toward +z, so world +x is screen LEFT.
   */
  setLenoxLightRig(spec = {}) {
    const key = this.lights?.keyLight;
    if (!key) return;
    key.position.set(spec.keyX ?? 1.35, spec.keyY ?? 0.62, spec.keyZ ?? -0.35);
    key.intensity = spec.keyIntensity ?? 2.4;
    key.angle = Math.PI * 0.42;
    key.penumbra = 1;
    key.color.setHex(0xf4efe6);
    if (this.lights.hemi) {
      this.lights.hemi.intensity = spec.hemiIntensity ?? 0.3;
    }
  }

  updateLenoxCamera(dt) {
    if (!this.camera || !this.lenoxFramings) return;
    const frame = this.lenoxFrame ?? (this.lenoxFrame = { t: 0, target: 0 });
    const k = dt > 0 ? 1 - Math.exp(-dt / 0.8) : 1;
    frame.t += (frame.target - frame.t) * k;

    const { center, fov, wide, present } = this.lenoxFramings;
    const t = THREE.MathUtils.smootherstep(frame.t, 0, 1);
    const distance = THREE.MathUtils.lerp(wide.distance, present.distance, t);
    const targetY = THREE.MathUtils.lerp(wide.targetY, present.targetY, t);

    this.cameraTarget.set(center.x, targetY, center.z);
    this.camera.fov = fov;
    this.camera.position.set(center.x, targetY, center.z - distance);
    this.camera.lookAt(this.cameraTarget);
    this.camera.updateProjectionMatrix();

    this.updateLenoxScreenBounds(distance, targetY);
  }

  /**
   * Project the visible viewport edges (at the particle plane) into sim
   * space so the fluid ricochets off the ACTUAL screen edges on any device
   * and any lifecycle framing. Clamped to the grid's safe interior.
   */
  updateLenoxScreenBounds(distance, targetYWorld) {
    if (!this.runtime || !this.camera || !this.particleRenderer) return;

    const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const halfH = Math.tan(fovRad / 2) * distance;
    const halfW = halfH * this.camera.aspect;
    const center = this.lenoxFramings.center;

    if (!this.runtime.simBoundsMin) {
      this.runtime.simBoundsMin = new THREE.Vector3();
      this.runtime.simBoundsMax = new THREE.Vector3();
    }
    const minV = this.runtime.simBoundsMin;
    const maxV = this.runtime.simBoundsMax;

    this._lenoxBoundsScratch ??= new THREE.Vector3();
    const corner = this._lenoxBoundsScratch;

    this.particleRenderer.worldPointToSimulation(
      corner.set(center.x - halfW, targetYWorld - halfH, center.z),
      minV,
    );
    this.particleRenderer.worldPointToSimulation(
      corner.set(center.x + halfW, targetYWorld + halfH, center.z),
      maxV,
    );

    // Sim +x renders screen-left → the projected x pair may be swapped.
    if (minV.x > maxV.x) {
      const tmp = minV.x;
      minV.x = maxV.x;
      maxV.x = tmp;
    }

    // Clamp to the grid's safe interior; z stays at the grid walls.
    minV.x = Math.max(3, Math.min(minV.x, 61));
    maxV.x = Math.max(3, Math.min(maxV.x, 61));
    minV.y = Math.max(3, Math.min(minV.y, 61));
    maxV.y = Math.max(3, Math.min(maxV.y, 61));
    minV.z = 3;
    maxV.z = 61;
  }

  setPointer(clientX, clientY, isDown = false) {
    if (!this.raycaster || !this.camera || !this.plane || !this.mlsMpmSim) {
      return;
    }

    this.pointerNdc.x = clientX * 2 - 1;
    this.pointerNdc.y = -(clientY * 2) + 1;

    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    const intersect = this.raycaster.ray.intersectPlane(
      this.plane,
      this.pointerIntersect,
    );

    if (!intersect) return;

    this.mlsMpmSim.setMouseRay(
      this.raycaster.ray.origin,
      this.raycaster.ray.direction,
      intersect,
    );
    this.mlsMpmSim.setMouseActive(true);

    if (isDown) {
      this.backgroundGeometry.addImpulse(0.12);
    }
  }

  promoteIdlePopulation() {
    this.backgroundGeometry.update(0);
    this.syncSourceAnchors();

    if (this.startupSourceFieldAnchorOffsets) {
      this.sourceFieldAnchorOffsets = {
        primary: this.startupSourceFieldAnchorOffsets.primary
          .clone()
          .multiply(this.sourceAnchorScales.idlePrimary),
        secondary: this.startupSourceFieldAnchorOffsets.secondary
          .clone()
          .multiply(this.sourceAnchorScales.idleSecondary),
      };
    }

    this.syncSourceAnchors();
    this.mlsMpmSim.seedMatureIdlePopulation();
  }

  ensureSourceAnchorOffsets() {
    const runtime = this.runtime;
    if (!runtime) return;

    if (!this.sourceFieldAnchorOffsets) {
      const primary = runtime.sourceFieldCenter.clone().sub(runtime.ventCenter);
      const secondary = runtime.sourceFieldSecondaryCenter
        .clone()
        .sub(runtime.ventCenter);

      this.startupSourceFieldAnchorOffsets = {
        primary: primary.clone(),
        secondary: secondary.clone(),
      };

      this.sourceFieldAnchorOffsets = {
        primary,
        secondary,
      };
    }
  }

  getSourceDescriptor() {
    if (
      !this.backgroundGeometry?.getSourceAnchorDescriptorWorld ||
      !this.particleRenderer?.worldPointToSimulation
    ) {
      return null;
    }

    this.ensureSourceAnchorOffsets();

    const source = this.backgroundGeometry.getSourceAnchorDescriptorWorld();
    if (!source) {
      return null;
    }

    const {
      ventCenter,
      ventAxis,
      rightPoint,
      upPoint,
      axisPoint,
      worldOffsetPoint,
    } = this.sourceAnchorScratch;

    const ventCenterSim = this.particleRenderer.worldPointToSimulation(
      source.originWorld,
      ventCenter,
    );

    const ventAxisSim = this.particleRenderer.worldDirectionToSimulation(
      source.axisWorld,
      ventAxis,
    );

    const simRightPoint = this.particleRenderer.worldPointToSimulation(
      worldOffsetPoint
        .copy(source.originWorld)
        .addScaledVector(source.rightWorld, source.radiiLocal.x),
      rightPoint,
    );

    const simUpPoint = this.particleRenderer.worldPointToSimulation(
      worldOffsetPoint
        .copy(source.originWorld)
        .addScaledVector(source.upWorld, source.radiiLocal.z),
      upPoint,
    );

    const simAxisPoint = this.particleRenderer.worldPointToSimulation(
      worldOffsetPoint
        .copy(source.originWorld)
        .addScaledVector(source.axisWorld, source.radiiLocal.y),
      axisPoint,
    );

    return {
      ventCenterSim,
      ventAxisSim,
      simRightPoint,
      simUpPoint,
      simAxisPoint,
    };
  }

  applySourceAnchorDescriptor({
    ventCenterSim,
    ventAxisSim,
    simRightPoint,
    simUpPoint,
    simAxisPoint,
  }) {
    const runtime = this.runtime;
    if (!runtime) return;

    const primaryOffset = this.sourceFieldAnchorOffsets.primary;
    const secondaryOffset = this.sourceFieldAnchorOffsets.secondary;

    runtime.ventCenter.copy(ventCenterSim);
    runtime.ventAxis.copy(ventAxisSim);

    runtime.ventRadii.set(
      Math.max(1.25, simRightPoint.distanceTo(ventCenterSim)),
      Math.max(1.4, simAxisPoint.distanceTo(ventCenterSim)),
      Math.max(1.0, simUpPoint.distanceTo(ventCenterSim)),
    );

    runtime.sourceFieldCenter.copy(ventCenterSim).add(primaryOffset);
    runtime.sourceFieldSecondaryCenter.copy(ventCenterSim).add(secondaryOffset);
  }

  syncSourceAnchors() {
    const sourceDescriptor = this.getSourceDescriptor();
    if (!sourceDescriptor) return;
    this.applySourceAnchorDescriptor(sourceDescriptor);
  }

  syncRiftFlightDescriptor() {
    const runtime = this.runtime;
    if (
      !runtime ||
      !this.backgroundGeometry?.getRiftFlightDescriptorWorld ||
      !this.particleRenderer?.worldPointToSimulation
    ) {
      return;
    }

    const descriptor = this.backgroundGeometry.getRiftFlightDescriptorWorld();
    if (!descriptor) return;

    this.particleRenderer.worldPointToSimulation(
      descriptor.minWorld,
      runtime.riftTargetMin,
    );
    this.particleRenderer.worldPointToSimulation(
      descriptor.maxWorld,
      runtime.riftTargetMax,
    );
    this.particleRenderer.worldPointToSimulation(
      descriptor.centerWorld,
      runtime.riftTargetCenter,
    );
  }

  setLook(values = {}) {
    const {
      environmentIntensity,
      exposure,
      bloomThreshold,
      bloomStrength,
      bloomRadius,
    } = values;

    if (this.scene && Number.isFinite(environmentIntensity)) {
      this.scene.environmentIntensity = environmentIntensity;
    }

    if (this.renderer && Number.isFinite(exposure)) {
      this.renderer.toneMappingExposure = exposure;
    }

    if (!this.bloomPass) return;

    if (Number.isFinite(bloomThreshold)) {
      this.bloomPass.threshold.value = bloomThreshold;
    }
    if (Number.isFinite(bloomStrength)) {
      this.bloomPass.strength.value = bloomStrength;
    }
    if (Number.isFinite(bloomRadius)) {
      this.bloomPass.radius.value = bloomRadius;
    }
  }

  setPointerInfluence(value = 1) {
    this.mlsMpmSim.setMouseInfluence(value);
  }

  applyEngineRuntime(patch = {}) {
    if (!this.runtime) {
      this.runtime = createRuntimeState();
    }

    Object.assign(this.runtime, patch);

    const derived = deriveParticleMetrics({
      particles: this.runtime.particles,
      size: this.runtime.size,
      density: this.runtime.density,
    });

    this.runtime.actualSize = derived.actualSize;
    this.runtime.restDensity = derived.restDensity;
  }

  clearPointer() {
    this.mlsMpmSim.setMouseActive(false);
  }

  async update(delta) {
    if (!this.runtime) return;
    this._lastDt = delta;

    this.backgroundGeometry.update(delta);
    this.syncSourceAnchors();
    this.syncRiftFlightDescriptor();

    if (this.lights?.keyLight) {
      const nextCastShadow = true;

      if (this.lights.keyLight.castShadow !== nextCastShadow) {
        this.lights.keyLight.castShadow = nextCastShadow;
        if (this.lights.keyLight.shadow) {
          this.lights.keyLight.shadow.needsUpdate = true;
        }
      }
    }

    this.backgroundGeometry.setForensicPostEnterIsolation?.(
      this.postEnterDriveActive ? forensicHoldReadIsolation() : null,
    );

    this.mlsMpmSim.applyRuntime(this.runtime);
    this.particleRenderer.applyRuntime(this.runtime);

    if (this.visualMode === "void") {
      this.updateLenoxCamera(delta);
    }

    await this.mlsMpmSim.update(delta);
    this.particleRenderer.update();
    await this.postProcessing.renderAsync();
  }

  dispose() {
    if (this.lenoxRig) {
      for (const g of this.lenoxRig.geometries) g?.dispose?.();
      for (const m of this.lenoxRig.materials) m?.dispose?.();
      this.lenoxRig = null;
    }
    this.particleRenderer?.dispose?.();
    this.backgroundGeometry?.dispose?.();
    this.lights?.dispose?.();
    this.mlsMpmSim?.dispose?.();
    this.postProcessing?.dispose?.();
    this.environmentTexture?.dispose?.();

    this.scene = null;
    this.camera = null;
    this.environmentTexture = null;

    this.particleRenderer = null;
    this.backgroundGeometry = null;
    this.lights = null;
    this.mlsMpmSim = null;
    this.postProcessing = null;
    this.bloomPass = null;

    this.sourceFieldAnchorOffsets = null;
    this.startupSourceFieldAnchorOffsets = null;
    this.runtime = null;

    this.postEnterDriveActive = false;

    this.quietElapsed = 0;
    this.cameraBaselineZ = null;
    this.cameraBaselineFov = null;
    this.cameraBaselinePosition = null;
    this.cameraBaselineTarget = null;
    this.postEnterSolverLockTime = null;

    this.pushInStartTime = null;
    this.pageLockStartTime = null;
    this.heroStartTime = null;

    this._lastPostEnterStageReturned = "none";
    this._lastDrivePostEnterElapsed = 0;
  }

  applyCameraFraming(width = window.innerWidth, height = window.innerHeight) {
    if (!this.camera) return;

    const aspect = width / Math.max(height, 1);
    const tallBlend = THREE.MathUtils.smoothstep(aspect, 0.8, 0.96);
    const midBlend = THREE.MathUtils.smoothstep(aspect, 1.08, 1.28);
    const wideBlend = THREE.MathUtils.smoothstep(aspect, 1.42, 1.62);

    const {
      apertureWidth,
      apertureHeight,
      frameSide,
      frameTop,
      lookAtX,
      lookAtY,
      lookAtZ,
    } = PREENTER_VESSEL;

    const outerWidth = apertureWidth + frameSide * 2;
    const outerHeight = apertureHeight + frameTop * 2;

    const fov = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(51, 48, tallBlend),
      46,
      midBlend,
    );

    const fillHeight = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(0.72, 0.76, midBlend),
      0.8,
      wideBlend,
    );

    const fillWidth = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(0.9, 0.88, midBlend),
      0.86,
      wideBlend,
    );

    const fovRadians = THREE.MathUtils.degToRad(fov);

    const distanceForHeight =
      outerHeight / (2 * Math.tan(fovRadians * 0.5) * fillHeight);

    const distanceForWidth =
      outerWidth / (2 * Math.tan(fovRadians * 0.5) * aspect * fillWidth);

    const distance = Math.max(distanceForHeight, distanceForWidth);
    const cameraY = lookAtY + THREE.MathUtils.lerp(0.074, 0.04, tallBlend);

    this.cameraTarget.set(lookAtX, lookAtY, lookAtZ);
    this.camera.fov = fov;
    this.camera.position.set(lookAtX + 0.008, cameraY, lookAtZ - distance);
    this.camera.lookAt(this.cameraTarget);
    this.camera.updateProjectionMatrix();
  }
}

export default App;
