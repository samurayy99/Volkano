import * as THREE from "three/webgpu";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { Lights } from "./lights";

import { float, Fn, mrt, output, pass, smoothstep, uniform, vec4 } from "three/tsl";
import MlsMpmSimulator from "./mls-mpm/mlsMpmSimulator";
import ParticleRenderer from "./mls-mpm/particleRenderer";
import BackgroundGeometry from "./backgroundGeometry";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { PREENTER_VESSEL } from "./vesselDescriptors";
import { loadLenoxVessel } from "./lenox/lenoxVessel.js";
import { LENOX_SIGNAL_FACE } from "./lenox/lenoxEyesDrive.js";
import { createLenoxBackdrop } from "./lenox/lenoxBackdrop.js";
import {
  createAlabasterEnvironment,
  createVoidEnvironment,
} from "./lenox/voidEnvironment.js";
import { ENGINE_SIGNATURES, isSignatureId } from "./lenox/signatures.js";
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

/**
 * A blur pyramid never returns exactly zero — a faint, near-uniform value
 * survives across the entire render region. Below this floor the bloom is
 * discarded outright, so no residue can tint or plate the canvas rectangle.
 */
const BLOOM_RESIDUE_FLOOR = 0.004;
const BLOOM_RESIDUE_KNEE = 0.03;
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

/**
 * Lenox vessel framing. The sphere is sized from the viewport, not from a
 * model constant: this fraction of the usable viewport height in `present`.
 */
const LENOX_VESSEL_FILL = 0.46;
const LENOX_VESSEL_FILL_PORTRAIT = 0.4;
/** Signal face fraction of the visor display (the whole face stays inside). */
const LENOX_FACE_FILL = 0.82;
/** Face center + display plane in sim space — mirrors PRESENCE_CENTER in the drive. */
const LENOX_FACE_CENTER = Object.freeze({ x: 32, y: 36.5 });
const LENOX_EYE_Z = 28.4;
/** Display sits this far behind the signal plane (sim units, +z = away from camera). */
const LENOX_SCREEN_CLEARANCE = 1.4;
/**
 * How far the head turns toward the cursor at full gaze. This is what makes
 * the following legible — the parallax of the signal plane inside the visor
 * does more for it than any amount of eye travel.
 */
const LENOX_HEAD_YAW = THREE.MathUtils.degToRad(13);
const LENOX_HEAD_PITCH = THREE.MathUtils.degToRad(8);

/**
 * How hard a signal drives the scene's selective bloom channel. The glow is
 * NOT geometry: the engine already runs a bloom pass over an MRT channel, and
 * every signal writes into it. That is a screen-space falloff — it has the
 * exact silhouette of whatever emitted it, it is perfectly smooth, and it
 * cannot produce the stepped rings or blown-out cores that stacked additive
 * copies of a shape always will.
 */
const LENOX_SIGNAL_BLOOM = 1.05;

/**
 * A true capsule: straight flanks with semicircular caps, half-width 1 and
 * half-height `aspect`. Scaling an ellipse instead would give the eye soft,
 * lens-like ends — the LED read depends on those flat sides.
 */
const makeCapsuleGeometry = (aspect) => {
  const straight = Math.max(aspect - 1, 0.001);
  const shape = new THREE.Shape();
  shape.moveTo(-1, -straight);
  shape.lineTo(-1, straight);
  shape.absarc(0, straight, 1, Math.PI, 0, true);
  shape.lineTo(1, -straight);
  shape.absarc(0, -straight, 1, 0, Math.PI, true);
  shape.closePath();
  return new THREE.ShapeGeometry(shape, 20);
};

/**
 * The speech slot: a horizontal rounded bar, normalized so scale = half-extent
 * on each axis. Closing it squashes the caps into a thin lens, which is what an
 * articulating mouth actually does — a circle that opens and shuts on a beat is
 * a fish, not a speaker.
 */
const makeSlotGeometry = (aspect = 3) => {
  const cap = Math.max(aspect - 1, 0.001);
  const shape = new THREE.Shape();
  shape.moveTo(-cap, -1);
  shape.lineTo(cap, -1);
  shape.absarc(cap, 0, 1, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(-cap, 1);
  shape.absarc(-cap, 0, 1, Math.PI / 2, (Math.PI * 3) / 2, false);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 20);
  geometry.scale(1 / aspect, 1, 1);
  return geometry;
};

/** Stroke arc in a unit box: a ring sector normalized so scale = half-extent. */
const makeStrokeArcGeometry = (inner, outer, start, length) => {
  const geometry = new THREE.RingGeometry(inner, outer, 48, 1, start, length);
  geometry.scale(1 / outer, 1 / outer, 1);
  return geometry;
};

/** The Lenox mark: a thick checkmark in a unit box. Amber, confirm only. */
const makeCheckGeometry = () => {
  const shape = new THREE.Shape();
  shape.moveTo(-0.88, 0.12);
  shape.lineTo(-0.3, -0.5);
  shape.lineTo(0.86, 0.76);
  shape.lineTo(0.86, 0.38);
  shape.lineTo(-0.28, -0.86);
  shape.lineTo(-0.88, -0.24);
  shape.closePath();
  return new THREE.ShapeGeometry(shape, 1);
};

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
    lenoxEnergyMul: 1,
    settleOffset: new THREE.Vector3(),
    settleBob: new THREE.Vector3(),
    settleSquashT: 1,
    settleSquashCenter: 32,
    /** Critical-settle damping rates (Lenox); 0 = chamber spring untouched. */
    settleDampingShell: 0,
    settleDampingFocal: 0,
    /** Birth swirl (Lenox); wraps the collapsing field instead of folding it. */
    settleSwirl: 0,
    settleSwirlCenter: new THREE.Vector3(32, 36.5, 30),
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
  voidEnvironmentTexture = null;

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

  /** Lenox PRIME signal rig (void mode): capsule eyes, arcs, mouth, mark. */
  lenoxRig = null;
  /** World size of one face unit, expressed per sim axis (see fitLenoxVessel). */
  lenoxFaceUnit = new THREE.Vector3(1, 1, 1);
  /** Lenox vessel (sphere-robot body); the signal face renders in its visor. */
  lenoxVessel = null;
  lenoxVesselPromise = null;
  /** The lacquer panel behind him. A surface that catches light, not a glow. */
  lenoxBackdrop = null;
  _backdropLight = new THREE.Vector3(0.35, 0.4, 1);
  /** DER BEGLEITER: which world he stands in, and the one behind the front. */
  lenoxSignatureId = "obsidian";
  lenoxSignatureTargetId = null;
  lenoxSignatureEnvs = null;
  lenoxScanMaxR = 8;
  lenoxScanEnvSwapped = false;
  /** Lenox lifecycle camera framing (void mode). */
  lenoxFramings = null;
  lenoxFrame = null;
  lenoxOperator = null;
  /** "side" (he steps aside) or "banded" (he steps up). React decides; see setCompositionMode. */
  compositionMode = "side";

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
   * LENOX PRIME rig — the display signal layer.
   *
   * The visor is a screen, not an eye socket. Everything is drawn from four
   * primitives in soft cyan: a vertical capsule, an arc, a mouth and (for a
   * confirmed result only) an amber checkmark. There is deliberately no iris,
   * ring stack, pupil, lid, glint or brow — that vocabulary reads as a
   * pseudo-eyeball behind glass and is what made Lenox look tired.
   *
   * Coordinates are FACE UNITS: an isotropic 2D space centered on the display
   * with +x = screen right. `face` carries the sim→face mapping, so the
   * anisotropic sim grid (x 1.6 / y 0.88) can never squash a signal again.
   * The glow is not geometry. Every signal writes into the engine's selective
   * bloom channel (`mrtNode`), so its light comes back from the post pass as a
   * true screen-space falloff around the exact silhouette that emitted it.
   */
  initLenoxGazeRig() {
    if (!this.particleRenderer?.object || this.lenoxRig) return;

    const root = new THREE.Group(); // sim space: bob + tilt
    const head = new THREE.Group(); // pivots on the SPHERE center: yaw + pitch
    const face = new THREE.Group(); // face units: isotropic, on the display plane
    head.add(face);
    root.add(head);
    this.particleRenderer.object.add(root);

    // --- geometry (unit-normalized; the per-frame scale carries the size) ---
    const capsuleGeometry = makeCapsuleGeometry(LENOX_SIGNAL_FACE.eyeAspect);
    const arcGeometry = makeStrokeArcGeometry(0.82, 1, Math.PI * 0.06, Math.PI * 0.88);
    const mouthArcGeometry = makeStrokeArcGeometry(0.72, 1, Math.PI * 1.16, Math.PI * 0.68);
    const mouthSlotGeometry = makeSlotGeometry(3);
    const waveGeometry = makeStrokeArcGeometry(0.84, 1, -Math.PI * 0.3, Math.PI * 0.6);
    const checkGeometry = makeCheckGeometry();

    const CYAN = 0x7deeff;
    const AMBER = 0xffb457;

    /**
     * A signal: a crisp core that also feeds the scene bloom. `mrtNode` is the
     * whole trick — it writes the shape into the engine's selective bloom
     * channel, so the light comes back as a real screen-space falloff around
     * the exact silhouette. No halo meshes, no fog sprites, nothing to tune.
     */
    const bloomGain = uniform(LENOX_SIGNAL_BLOOM);
    const signal = (color, opacity) => {
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      });
      const c = new THREE.Color(color);
      // The bloom attachment carries its OWN alpha, and blending reads it per
      // target. Without this uniform a faded-out signal would keep glowing at
      // full strength, so the bloom alpha is driven from the same opacity.
      const bloomAlpha = uniform(opacity);
      material.userData.bloomAlpha = bloomAlpha;
      material.mrtNode = mrt({
        bloomIntensity: vec4(
          float(c.r).mul(bloomGain),
          float(c.g).mul(bloomGain),
          float(c.b).mul(bloomGain),
          bloomAlpha,
        ),
      });
      return material;
    };

    const make = (geometry, material, renderOrder) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = renderOrder;
      mesh.frustumCulled = false;
      mesh.visible = false;
      face.add(mesh);
      return mesh;
    };

    const eyeMaterials = [signal(CYAN, 1), signal(CYAN, 1)];
    const arcMaterials = [signal(CYAN, 1), signal(CYAN, 1)];
    const mouthMaterial = signal(CYAN, 1);
    const waveMaterial = signal(CYAN, 0.5);
    const checkMaterial = signal(AMBER, 1);

    this.lenoxRig = {
      root,
      head,
      face,
      eyes: [
        make(capsuleGeometry, eyeMaterials[0], 12),
        make(capsuleGeometry, eyeMaterials[1], 12),
      ],
      arcs: [
        make(arcGeometry, arcMaterials[0], 12),
        make(arcGeometry, arcMaterials[1], 12),
      ],
      mouthArc: make(mouthArcGeometry, mouthMaterial, 12),
      mouthSlot: make(mouthSlotGeometry, mouthMaterial, 12),
      // Two brackets per side: the outer one lags, so LISTENING breathes.
      waves: [
        make(waveGeometry, waveMaterial, 11),
        make(waveGeometry, waveMaterial, 11),
        make(waveGeometry, waveMaterial, 11),
        make(waveGeometry, waveMaterial, 11),
      ],
      check: make(checkGeometry, checkMaterial, 14),

      bloomGain,
      eyeMaterials,
      arcMaterials,
      mouthMaterial,
      waveMaterial,
      checkMaterial,
      accentColor: new THREE.Color(CYAN),

      geometries: [
        capsuleGeometry,
        arcGeometry,
        mouthArcGeometry,
        mouthSlotGeometry,
        waveGeometry,
        checkGeometry,
      ],
      materials: [
        ...eyeMaterials,
        ...arcMaterials,
        mouthMaterial,
        waveMaterial,
        checkMaterial,
      ],
    };
  }

  /**
   * Lenox vessel — async body load. The rig keeps working stand-alone until
   * the robot arrives, then docks inside the visor (same parent → same bob,
   * tilt and squash as the ocular planes).
   */
  initLenoxVessel() {
    if (this.lenoxVesselPromise || !this.lenoxRig) return;
    this.lenoxVesselPromise = loadLenoxVessel({
      parentScale: this.particleRenderer?.object?.scale,
    })
      .then((vessel) => {
        if (!this.lenoxRig) return;
        this.lenoxVessel = vessel;
        vessel.root.visible = false;
        // Under the head pivot: body and face yaw together, as one head.
        this.lenoxRig.head.add(vessel.root);
        this.fitLenoxVessel();
      })
      .catch((error) => {
        console.warn("[lenox] vessel load failed — rig runs bodyless", error);
      });
  }

  /**
   * Two fits, one chain, both derived from the viewport — never hand-tuned:
   *
   *   viewport height → vessel height (LENOX_VESSEL_FILL) → display bounds
   *   display bounds  → face unit     (LENOX_FACE_FILL)
   *
   * The face unit is the world size of one face unit, expressed per sim axis.
   * Because the sim parent scales x and y differently, the face group must
   * counter-scale per axis — otherwise every signal renders vertically
   * squashed, which is exactly what made the old eyes read as tired slits.
   */
  fitLenoxVessel() {
    if (!this.lenoxFramings || !this.lenoxRig) return;

    const { fov, present } = this.lenoxFramings;
    const fovRad = THREE.MathUtils.degToRad(fov);
    const visibleHeight = 2 * present.distance * Math.tan(fovRad / 2);
    const portrait = (this.camera?.aspect ?? 1.78) < 0.85;
    const vesselHeight =
      visibleHeight * (portrait ? LENOX_VESSEL_FILL_PORTRAIT : LENOX_VESSEL_FILL);

    // Sim-space anchors. The head pivot sits at the SPHERE center, so a look
    // reads as a head TURN; the display and the signal plane hang off it.
    const displayZ = LENOX_EYE_Z + LENOX_SCREEN_CLEARANCE;
    const vessel = this.lenoxVessel;
    this._lenoxPivot ??= new THREE.Vector3();
    const pivot = this._lenoxPivot.set(0, 0, 0);

    if (vessel) {
      vessel.fitToWorldHeight(vesselHeight);
      vessel.centerOffsetSim(pivot);
      // The vessel's origin IS the display center, so in head space it hangs
      // exactly one pivot offset in front of the sphere center.
      vessel.root.position.set(-pivot.x, -pivot.y, -pivot.z);
    }

    this.lenoxRig.head.position.set(
      LENOX_FACE_CENTER.x + pivot.x,
      LENOX_FACE_CENTER.y + pivot.y,
      displayZ + pivot.z,
    );

    // The display bounds are the frame the face must live in. Without a body
    // (async load, or a load failure) the face falls back to a display-sized
    // share of the same vessel height, so the rig is never left oversized.
    const display = vessel
      ? vessel.displayWorldSize()
      : { width: vesselHeight * 0.68, height: vesselHeight * 0.54 };

    // The narrower constraint wins, so the face is always fully on screen.
    const unitWorld = Math.min(
      (display.width * LENOX_FACE_FILL) / LENOX_SIGNAL_FACE.width,
      (display.height * LENOX_FACE_FILL) / LENOX_SIGNAL_FACE.height,
    );

    const parent = this.particleRenderer?.object?.scale;
    this.lenoxFaceUnit.set(
      unitWorld / (parent?.x ?? 1),
      unitWorld / (parent?.y ?? 1),
      1,
    );
    // The signal plane floats in front of the display, inside head space.
    this.lenoxRig.face.position.set(
      -pivot.x,
      -pivot.y,
      LENOX_EYE_Z - (displayZ + pivot.z),
    );
  }

  /** Signal opacity: the core fade AND the bloom it feeds move together. */
  setSignalOpacity(material, value) {
    const v = Math.max(0, Math.min(value, 1));
    material.opacity = v;
    if (material.userData.bloomAlpha) material.userData.bloomAlpha.value = v;
  }

  /**
   * BIRTH: author the solver's settle targets from Lenox' real outer surfaces.
   * The mass then collapses into his silhouette — top cap, side modules, the
   * curve around the visor — instead of into a bounding sphere or the legacy
   * particle face. Called once, at the wake.
   */
  buildLenoxShellTargets(count) {
    const vessel = this.lenoxVessel;
    const simObject = this.particleRenderer?.object;
    if (!vessel || !simObject || !this.mlsMpmSim) return false;

    this._lenoxShellPoints = vessel.sampleSurfaceSim(
      count,
      simObject,
      this._lenoxShellPoints,
    );
    if (!this._lenoxShellPoints) return false;

    return !!this.mlsMpmSim.buildLenoxShellTargets(this._lenoxShellPoints, count);
  }

  /**
   * Per-frame signal pose from the Lenox drive (face units).
   * The drive owns all state math; this only draws the grammar.
   */
  setLenoxRig(pose) {
    if (!this.lenoxRig || !pose) return;
    this.updateLenoxBackdrop(pose.dt ?? 0);
    const r = this.lenoxRig;
    const p = Math.max(0, Math.min(pose.presence ?? 0, 1));
    const on = p > 0.02;
    const t = pose.time ?? 0;
    const confirm = Math.max(0, Math.min(pose.confirm ?? 0, 1));
    // The amber mark and the cyan face never share the display.
    const cyanFade = (1 - confirm) * p;

    // Head motion lives in sim space so the vessel inherits the same bob and
    // tilt. The squash goes on the face and the body, never on the sim root:
    // scaling the root would drag every absolute sim position with it.
    r.root.position.set(pose.head.x, pose.head.y, 0);
    r.root.rotation.z = pose.head.tilt;
    r.root.scale.set(1, 1, 1);

    const squash = pose.head.squash ?? 1;

    // THE LOOK. A signal sliding a few pixels inside a bar is barely legible as
    // a gaze — there is no reference frame to read it against. A head that
    // TURNS is unmistakable, so the whole head yaws and pitches toward the
    // cursor around the sphere center, and the eyes only add the last bit of
    // travel on top. Sim +x renders screen-left, so a positive yaw turns the
    // face toward screen right.
    const look = pose.look ?? { x: 0, y: 0 };
    r.head.rotation.y = look.x * LENOX_HEAD_YAW;
    // The nod is a single answer to a stressed syllable, added on top of the
    // gaze pitch. Nodding continuously while speaking reads as a bobblehead.
    r.head.rotation.x = look.y * LENOX_HEAD_PITCH - (pose.head.nod ?? 0);

    // The body. Presence breathes it in around the display center; the scale
    // stays uniform in sim space (the vessel counter-scales the anisotropic
    // parent internally), so the sphere always renders round.
    // The BODY has its own envelope, separate from the face. During the birth
    // the shell fades up out of the particle mass while the visor is still
    // dark — matter first, then identity. `body` is 1 whenever Lenox is awake.
    const body = Math.max(0, Math.min(pose.body ?? p, 1));
    const vessel = this.lenoxVessel;
    if (vessel?.root) {
      vessel.root.visible = body > 0.002;
      vessel.setReveal(body);
      // Breathing lives in the BODY, not the face: the shell swells by under a
      // percent. It is barely a measurement and entirely a difference — a body
      // that holds perfectly still is the thing that reads as dead.
      const breath = 1 + (pose.breath ?? 0) * 0.009;
      // The shell arrives at full size — it condenses out of matter that is
      // already there, so it must not also inflate.
      const grow = (0.97 + 0.03 * body) * breath;
      vessel.root.scale.set(grow, grow * squash, grow);
    }

    // Sim +x renders screen-LEFT. The face group is mirrored so the signal
    // grammar can be authored in plain screen space (+x = right); child
    // rotations are negated below to survive that mirror.
    r.face.visible = on;
    r.face.scale.set(
      -this.lenoxFaceUnit.x,
      this.lenoxFaceUnit.y * squash,
      1,
    );

    r.accentColor.set(pose.accentColor);
    for (const mat of r.eyeMaterials) mat.color.lerp(r.accentColor, 0.06);
    for (const mat of r.arcMaterials) mat.color.lerp(r.accentColor, 0.06);

    if (!on) return;

    for (let i = 0; i < 2; i++) {
      const e = pose.eyes[i];
      const arc = Math.max(0, Math.min(e.arc ?? 0, 1));
      const halfH = e.ry * LENOX_SIGNAL_FACE.eyeAspect;
      // Mirrored face group → a child rotation renders inverted.
      const rot = -e.rot;
      const capsuleAlpha = (1 - arc) * cyanFade;
      const arcAlpha = arc * cyanFade;
      const arcY = e.y - halfH * 0.1;
      const arcSx = e.rx * 1.95;
      const arcSy = halfH * 0.62;

      // Capsule and arc cross-fade rather than swap: CURIOUS is one eye
      // caught mid-morph, and that in-between has to be a real frame.
      const capsule = r.eyes[i];
      capsule.visible = arc < 0.995;
      capsule.position.set(e.x, e.y, 0);
      capsule.rotation.z = rot;
      capsule.scale.set(e.rx, e.ry, 1);
      this.setSignalOpacity(r.eyeMaterials[i], capsuleAlpha);

      const arcMesh = r.arcs[i];
      arcMesh.visible = arc > 0.005;
      arcMesh.position.set(e.x, arcY, 0);
      arcMesh.rotation.z = rot;
      arcMesh.scale.set(arcSx, arcSy, 1);
      this.setSignalOpacity(r.arcMaterials[i], arcAlpha);

    }

    // Mouth. Two forms cross-fade: a tone arc (curve = the whole message) and
    // an articulation slot while speaking. Both share one material, so the
    // mouth is always exactly one signal — never a shape stacked on a shape.
    const m = pose.mouth;
    const speak = Math.max(0, Math.min(m.speak ?? 0, 1));
    const mouthOn = on && m.visible;
    const mouthAlpha = mouthOn ? (m.alpha ?? 1) * cyanFade : 0;
    const curveMag = Math.max(Math.abs(m.curve), 0.06);
    const mouthRot = m.curve >= 0 ? 0 : Math.PI;

    r.mouthArc.visible = mouthOn && speak < 0.985;
    r.mouthArc.position.set(m.x, m.y, 0);
    // The arc flips around its own chord, so a frown never drifts off-center.
    r.mouthArc.rotation.z = mouthRot;
    r.mouthArc.scale.set(m.width, m.width * curveMag * 1.15, 1);

    // The slot's height IS the speech envelope: irregular, with real pauses.
    r.mouthSlot.visible = mouthOn && speak > 0.015;
    r.mouthSlot.position.set(m.x, m.y - m.width * 0.05, 0.001);
    r.mouthSlot.scale.set(m.width * 0.86, m.slotOpen ?? 0.012, 1);

    this.setSignalOpacity(r.mouthMaterial, mouthAlpha);

    // LISTENING: bracket waves flank the eyes and breathe outward.
    const waves = Math.max(0, Math.min(pose.waves ?? 0, 1));
    this.setSignalOpacity(r.waveMaterial, waves * cyanFade * 0.55);
    for (let i = 0; i < 4; i++) {
      const mesh = r.waves[i];
      mesh.visible = waves > 0.01;
      if (!mesh.visible) continue;
      const rightSide = i >= 2;
      const rank = i % 2;
      const eye = pose.eyes[rightSide ? 1 : 0];
      const pulse = 1 + Math.sin(t * 3.4 - rank * 0.9) * 0.08;
      const spread = (0.075 + rank * 0.055) * pulse;
      mesh.position.set(eye.x + (rightSide ? spread : -spread), eye.y, 0);
      // The geometry opens toward -x; mirroring it gives the left bracket.
      mesh.scale.set(
        (rightSide ? 1 : -1) * (0.05 + rank * 0.022),
        eye.ry * LENOX_SIGNAL_FACE.eyeAspect * (0.85 + rank * 0.2),
        1,
      );
    }

    // CONFIRMED: the mark that is also the Lenox sigil. Amber, transient,
    // never a resting face. This one moment is allowed to bloom.
    const checkOn = confirm > 0.01;
    const scale = (pose.checkScale ?? 0.42) * (0.82 + 0.18 * confirm);
    r.check.visible = checkOn;
    r.check.position.set(0, 0.02, 0);
    // Negative x: the mirrored face group would otherwise draw a reversed mark.
    r.check.scale.set(-scale, scale, 1);
    this.setSignalOpacity(r.checkMaterial, confirm * p);

  }

  /**
   * The pointer tilts the panel's light. It changes the ANGLE only — never the
   * intensity — so a highlight sweeps across the facets exactly as it would on
   * a lacquered surface turned under a lamp. Nothing brightens under the mouse.
   */
  updateLenoxBackdrop(dt) {
    const backdrop = this.lenoxBackdrop;
    if (!backdrop) return;

    // The light source sits on the same side as the cursor and well in front of
    // the panel, so the highlight tracks it without ever pointing AT it.
    const goalX = this.pointerNdc.x * 1.25;
    const goalY = this.pointerNdc.y * 1.05;
    const k = dt > 0 ? 1 - Math.exp(-dt / 0.35) : 1;
    this._backdropLight.x += (goalX - this._backdropLight.x) * k;
    this._backdropLight.y += (goalY - this._backdropLight.y) * k;
    this._backdropLight.z = 1.15;
    backdrop.uniforms.light.value.copy(this._backdropLight);
  }

  /**
   * A/B the reflected world (E). The bars in the void environment are authored
   * at fixed azimuths, so it must not inherit the meadow's rotation offset.
   */
  setLenoxEnvironment(useVoid) {
    if (!this.scene) return;
    const voidEnv = useVoid ? this.getLenoxSignatureEnv(this.lenoxSignatureId) : null;
    this.scene.environment = voidEnv ?? this.environmentTexture;
    this.scene.environmentRotation.set(0, voidEnv ? 0 : -2.15, 0);
  }

  /* ── DER BEGLEITER: signature worlds ─────────────────────────────────── */

  /** Reflection world per signature, generated once, kept for re-calibration. */
  getLenoxSignatureEnv(id) {
    if (!this.lenoxSignatureEnvs) this.lenoxSignatureEnvs = {};
    if (!this.lenoxSignatureEnvs[id]) {
      this.lenoxSignatureEnvs[id] =
        id === "alabaster"
          ? createAlabasterEnvironment()
          : this.voidEnvironmentTexture;
    }
    return this.lenoxSignatureEnvs[id];
  }

  /** Instant world (boot default / reduced motion): no front, no ceremony. */
  setLenoxSignature(id) {
    if (this.visualMode !== "void" || !isSignatureId(id)) return;
    this.lenoxSignatureId = id;
    this.lenoxSignatureTargetId = null;
    this.lenoxScanEnvSwapped = false;
    this.lenoxBackdrop?.setSignature?.(ENGINE_SIGNATURES[id]);
    const env = this.getLenoxSignatureEnv(id);
    if (env && this.scene) {
      this.scene.environment = env;
      this.scene.environmentRotation.set(0, 0, 0);
    }
  }

  /** Arm the world behind the front (also pre-builds its env texture). */
  setLenoxSignatureTarget(id) {
    if (this.visualMode !== "void" || !isSignatureId(id)) return;
    this.lenoxSignatureTargetId = id;
    this.lenoxScanEnvSwapped = false;
    this.lenoxBackdrop?.setSignatureTarget?.(ENGINE_SIGNATURES[id]);
    this.getLenoxSignatureEnv(id);
  }

  /**
   * Drive the reconstruction front, 0..1. The front radiates from him, so his
   * reflections flip early (t ≈ 0.1): the new world reaches HIM first.
   */
  setLenoxSignatureScan(t) {
    if (this.visualMode !== "void" || !this.lenoxBackdrop) return;
    const clamped = Math.max(0, Math.min(t ?? 0, 1));
    const rim = Math.sin(Math.min(clamped * 1.12, 1) * Math.PI);
    this.lenoxBackdrop.setScan?.(clamped * this.lenoxScanMaxR, rim);
    if (
      !this.lenoxScanEnvSwapped &&
      clamped > 0.1 &&
      this.lenoxSignatureTargetId &&
      this.scene
    ) {
      this.scene.environment = this.getLenoxSignatureEnv(
        this.lenoxSignatureTargetId,
      );
      this.scene.environmentRotation.set(0, 0, 0);
      this.lenoxScanEnvSwapped = true;
    }
  }

  /** The target world becomes the world. */
  commitLenoxSignature() {
    if (this.visualMode !== "void" || !this.lenoxBackdrop) return;
    this.lenoxBackdrop.commitSignature?.();
    if (this.lenoxSignatureTargetId) {
      this.lenoxSignatureId = this.lenoxSignatureTargetId;
      this.lenoxSignatureTargetId = null;
    }
    this.lenoxScanEnvSwapped = false;
    this.lenoxTransformP = 0;
    if (this.scene) this.scene.environmentIntensity = 1;
  }

  /**
   * DIE VERWANDLUNG, EIN SKALAR (Rescue, peer-review trap #2). Die GSAP-Uhr
   * schiebt genau EINEN Fortschritt p (0..1, linear) hierher; die Engine
   * leitet ALLES daraus ab — Gather-/Zündungs-Physik (der Drive liest
   * `lenoxTransformP` pro Frame), Front-Radius (geshaped), Partikel-Flare
   * und die Environment-Blende. Zwei Uhren für einen synchronen Moment
   * können driften; ein Skalar kann es nicht.
   *
   * Phasen auf p: 0–0.26 GATHER · 0.26–0.38 ZÜNDUNG · 0.30–0.95 FRONT ·
   * Env-Wechsel, wenn die Front IHN passiert (~0.34) — mit Intensitäts-
   * Blende statt hartem Pop (trap #1).
   */
  setLenoxTransformProgress(p) {
    if (this.visualMode !== "void") return;
    const clamped = Math.max(0, Math.min(p ?? 0, 1));
    this.lenoxTransformP = clamped;

    // Front: shaped in-engine (die Uhr liefert linear). smootherstep hält
    // Anfang UND Ende weich; die Anisotropie liegt im Shader.
    const frontLin = Math.max(0, Math.min((clamped - 0.3) / 0.62, 1));
    const front = THREE.MathUtils.smootherstep(frontLin, 0, 1);
    const rim = Math.sin(Math.min(frontLin * 1.08, 1) * Math.PI);
    const radius = front * this.lenoxScanMaxR;
    this.lenoxBackdrop?.setScan?.(radius, rim);
    this.particleRenderer?.setScanFront?.(radius, rim);

    // Reflexionswelt: Wechsel wenn die Front seinen Körper verlässt, mit
    // einer Helligkeits-Blende (Glocke um den Wechselpunkt) — Metall darf
    // nicht eine ganze Sekunde lang die falsche Welt spiegeln, aber der
    // Umschlag darf auch nicht knallen.
    const swapAt = 0.34;
    if (!this.lenoxScanEnvSwapped && clamped > swapAt && this.lenoxSignatureTargetId && this.scene) {
      this.scene.environment = this.getLenoxSignatureEnv(this.lenoxSignatureTargetId);
      this.scene.environmentRotation.set(0, 0, 0);
      this.lenoxScanEnvSwapped = true;
    }
    if (this.scene) {
      const bell = Math.exp(-(((clamped - swapAt) / 0.07) ** 2));
      this.scene.environmentIntensity = 1 - 0.55 * bell;
    }
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

      // Gate the pyramid residue to zero before it can touch alpha at all.
      const bloomRaw = bloomPass.rgb;
      const rawLuma = bloomRaw.r
        .mul(0.2126)
        .add(bloomRaw.g.mul(0.7152))
        .add(bloomRaw.b.mul(0.0722));
      const bloomColor = bloomRaw.mul(
        smoothstep(float(BLOOM_RESIDUE_FLOOR), float(BLOOM_RESIDUE_KNEE), rawLuma),
      );

      // The WebGPU canvas composites PREMULTIPLIED:
      //   page = src.rgb + (1 - src.a) · page
      // So alpha is a coverage budget: every unit of alpha SUBTRACTS a unit of
      // page, and the rgb has to pay it back. The old `max(sceneAlpha,
      // bloomLuma · 1.5)` raised alpha to 1.5× the light the bloom actually
      // contributed — the glow bought 1.5 units of page occlusion and paid
      // back 1, and the shortfall is the dark rectangle. It only looked fixed
      // against a black page because there was no page left to darken.
      //
      // Here alpha is the bloom's own luminance: exactly the light it adds, so
      // the premultiplied invariant holds and the glow composites correctly
      // over black, graphite or mid-grey. Where the bloom is gated to zero,
      // alpha stays the model's own coverage — transparent stays transparent.
      const bloomLuma = bloomColor.r
        .mul(0.2126)
        .add(bloomColor.g.mul(0.7152))
        .add(bloomColor.b.mul(0.0722));
      const combinedColor = sceneColor.add(bloomColor).clamp(0, 1);
      const finalAlpha = sceneAlpha.max(bloomLuma).clamp(0, 1);

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
    // Lenox lives in a black room, so he reflects a black room. The chamber keeps
    // the meadow HDRI it was built against. Toggle with E to compare.
    this.voidEnvironmentTexture =
      this.visualMode === "void" ? createVoidEnvironment() : null;

    this.scene.background = null;
    this.scene.environmentRotation = new THREE.Euler(0, -2.15, 0);
    this.setLenoxEnvironment(true);

    this.mlsMpmSim = new MlsMpmSimulator(this.renderer);
    await this.mlsMpmSim.init(this.runtime.maxParticles);

    this.particleRenderer = new ParticleRenderer(this.mlsMpmSim);

    this.mlsMpmSim.applyRuntime(this.runtime);
    this.particleRenderer.applyRuntime(this.runtime);

    this.backgroundGeometry = new BackgroundGeometry();
    // Void mode still constructs the vessel (source anchors, rift descriptors
    // and seeding derive from it) but never shows it — so it does not need the
    // rift back plate either. That image belongs to the chamber era.
    await this.backgroundGeometry.init({
      backPlate: this.visualMode !== "void",
    });
    if (this.visualMode !== "void") {
      this.scene.add(this.backgroundGeometry.object);
    }

    this.lights = new Lights();
    this.scene.add(this.lights.object);
    this.scene.add(this.particleRenderer.object);

    if (this.visualMode === "void") {
      this.initLenoxGazeRig();
      this.initLenoxVessel();
      this.lenoxBackdrop = createLenoxBackdrop();
      this.scene.add(this.lenoxBackdrop.object ?? this.lenoxBackdrop.mesh);
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

    const present = frameFor(
      presenceHalf,
      portrait ? 0.78 : 0.64,
      portrait ? 0.16 : 0,
    );

    // OPERATOR (side) — he leaves the centre and makes room for what he built.
    // The camera looks toward +z, so world +x is screen LEFT: pushing the camera
    // to -x is what slides HIM left. He shrinks, but he does not retreat — the
    // distance is chosen so he still owns a quarter of the frame.
    const operator = frameFor(presenceHalf, 0.26, 0);
    const operatorHalfW = Math.tan(fovRad / 2) * operator.distance * aspect;
    operator.targetY = present.targetY;
    operator.shiftX = -0.5 * operatorHalfW;

    // OPERATOR (banded) — the same gesture on the only axis a phone actually has.
    // He rises into a band at the top and the page is built underneath him.
    //
    // The old code shifted him sideways in portrait too, on an axis that does not
    // exist there: he ended up squeezed behind the navigation instead of above it.
    // shiftX is zero here, and the room is made by lowering the camera target —
    // dropping the target raises the SUBJECT in frame.
    //
    // 0.52: he may shrink, he may not vanish. The old portrait value (0.46) was
    // sized against a side column; in a full-width band he can afford to stay
    // larger.
    // 0.22: lowering the camera target raises him on screen by that fraction of
    // the viewport. 0.30 lifted him so far that his crown pushed up out of the
    // band and behind the system bar — measured, not guessed. This centres his
    // head in the band instead.
    const operatorBanded = frameFor(presenceHalf, 0.52, 0.22);
    operatorBanded.shiftX = 0;

    this.lenoxFramings = {
      center,
      fov,
      wide: frameFor(dustHalf, portrait ? 0.98 : 0.86, 0),
      present,
      operator,
      operatorBanded,
    };
    if (!this.lenoxFrame) this.lenoxFrame = { t: 0, target: 0, tau: 0.8 };
    // The body is framed from the viewport, so every reframe refits it.
    this.fitLenoxVessel();

    // The panel sits well behind the whole simulation volume — particles must
    // never end up on the wrong side of it — and is sized against the WIDE
    // framing, where the camera is farthest and its frustum widest.
    if (this.lenoxBackdrop) {
      const panelZ = center.z + 1.5;
      const reach = this.lenoxFramings.wide.distance + 1.5;
      const halfH = Math.tan(fovRad / 2) * reach * 1.45;
      /**
       * 1.9, not 1.08: the OPERATOR composition shifts the camera half a
       * frustum sideways, so the visible world reaches ~1.5x the centred
       * half-width. Undersized, the panel ended mid-frame — invisible while
       * both sides were black, an abrupt world-edge the moment a bright
       * signature existed. The panel is one quad; oversizing costs nothing.
       */
      const halfW = halfH * aspect * 1.9;
      this.lenoxBackdrop.configure?.({
        center,
        panelZ,
        halfW,
        halfH,
        aspect,
      });
      // The front must be able to leave the frame completely.
      this.lenoxScanMaxR = Math.hypot(halfW, halfH) * 1.25;
      // Partikel prüfen denselben Welt-Radius wie das Panel: ein Ursprung.
      this.particleRenderer?.setScanFront?.(0, 0, center);
      if (!this.lenoxBackdrop.configure) {
        const mesh = this.lenoxBackdrop.mesh;
        mesh.position.set(center.x, center.y, panelZ);
        mesh.scale.set(halfW, halfH, 1);
        this.lenoxBackdrop.uniforms.extent.value.set(halfW, halfH);
      }
    }

  }

  /**
   * Drive → target composition t (0 wide … 1 present), with the time constant
   * it should ease on. The birth needs a tighter one: at the default 0.8s the
   * camera was still travelling while Lenox booted, so he arrived small.
   */
  setLenoxComposition(target, tau = 0.8) {
    if (!this.lenoxFrame) this.lenoxFrame = { t: 0, target: 0, tau: 0.8 };
    this.lenoxFrame.target = Math.max(0, Math.min(target ?? 0, 1));
    this.lenoxFrame.tau = Math.max(0.05, tau);
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
    const frame =
      this.lenoxFrame ?? (this.lenoxFrame = { t: 0, target: 0, tau: 0.8 });
    const k = dt > 0 ? 1 - Math.exp(-dt / (frame.tau ?? 0.8)) : 1;
    frame.t += (frame.target - frame.t) * k;

    const op =
      this.lenoxOperator ??
      (this.lenoxOperator = { t: 0, target: 0, tau: 1.1 });
    const ko = dt > 0 ? 1 - Math.exp(-dt / (op.tau ?? 1.1)) : 1;
    op.t += (op.target - op.t) * ko;

    const { center, fov, wide, present, operator, operatorBanded } =
      this.lenoxFramings;
    const t = THREE.MathUtils.smootherstep(frame.t, 0, 1);
    let distance = THREE.MathUtils.lerp(wide.distance, present.distance, t);
    let targetY = THREE.MathUtils.lerp(wide.targetY, present.targetY, t);
    let shiftX = 0;

    // Which way he makes room is the composition's business, not the timeline's.
    // The timeline only ever says "make room" (onOperator(1)); the axis is decided
    // here, from the mode React handed us.
    const framing =
      this.compositionMode === "banded" ? operatorBanded : operator;

    // The operator move is layered on top of the lifecycle framing, so it eases
    // out of wherever the camera actually is. It only ever travels one way —
    // reversing direction mid-move is what reads as a stutter.
    if (framing && op.t > 1e-4) {
      const o = THREE.MathUtils.smootherstep(op.t, 0, 1);
      distance = THREE.MathUtils.lerp(distance, framing.distance, o);
      targetY = THREE.MathUtils.lerp(targetY, framing.targetY, o);
      shiftX = framing.shiftX * o;
    }

    /**
     * JOURNEY LAYER (DER BEGLEITER, Slice 2) — the scroll director's camera,
     * layered on top of whatever the lifecycle framing decided. One scalar
     * per axis, eased engine-side so scroll jitter never reaches the lens:
     *   zoom   — multiplies the distance (0.55 = close, 1.6 = receded)
     *   shiftX — in HALF-WIDTHS of the current frustum (+ pushes him left)
     *   shiftY — in half-heights (+ pushes him down)
     * Frustum-relative units keep a pose meaning the same thing at every
     * viewport and every zoom.
     */
    const j =
      this.lenoxJourney ??
      (this.lenoxJourney = {
        zoom: 1, shiftX: 0, shiftY: 0,
        zoomT: 1, shiftXT: 0, shiftYT: 0,
        tau: 0.3,
      });
    const kj = dt > 0 ? 1 - Math.exp(-dt / (j.tau ?? 0.3)) : 1;
    j.zoom += (j.zoomT - j.zoom) * kj;
    j.shiftX += (j.shiftXT - j.shiftX) * kj;
    j.shiftY += (j.shiftYT - j.shiftY) * kj;

    distance *= j.zoom;
    const jFovRad = THREE.MathUtils.degToRad(fov);
    const jHalfH = Math.tan(jFovRad / 2) * distance;
    const jHalfW = jHalfH * this.camera.aspect;
    shiftX += j.shiftX * jHalfW;
    targetY += j.shiftY * jHalfH;

    this.cameraTarget.set(center.x + shiftX, targetY, center.z);
    this.camera.fov = fov;
    this.camera.position.set(center.x + shiftX, targetY, center.z - distance);
    this.camera.lookAt(this.cameraTarget);
    this.camera.updateProjectionMatrix();

    this.updateLenoxScreenBounds(distance, targetY, shiftX);
  }

  /**
   * Which way he makes room. React owns this decision (one source, see
   * `compositionMode.ts`); the engine no longer guesses it from the aspect ratio.
   * @param {"side"|"banded"} mode
   */
  setCompositionMode(mode) {
    this.compositionMode = mode === "banded" ? "banded" : "side";
  }

  /**
   * Scroll director → journey camera pose. The director owns WHERE the
   * camera is per station; the engine owns HOW it gets there (eased above).
   * @param {{zoom?: number, shiftX?: number, shiftY?: number}} pose
   * @param {number} [tau] easing time constant (s); small = tight scrub
   */
  setLenoxJourneyPose(pose, tau = 0.3) {
    const j =
      this.lenoxJourney ??
      (this.lenoxJourney = {
        zoom: 1, shiftX: 0, shiftY: 0,
        zoomT: 1, shiftXT: 0, shiftYT: 0,
        tau: 0.3,
      });
    if (Number.isFinite(pose?.zoom)) {
      j.zoomT = Math.max(0.4, Math.min(pose.zoom, 2.4));
    }
    if (Number.isFinite(pose?.shiftX)) {
      j.shiftXT = Math.max(-1.2, Math.min(pose.shiftX, 1.2));
    }
    if (Number.isFinite(pose?.shiftY)) {
      j.shiftYT = Math.max(-1.2, Math.min(pose.shiftY, 1.2));
    }
    j.tau = Math.max(0.05, tau);
  }

  /** Drive → operator composition (0 centred … 1 out of the way). */
  setLenoxOperator(target, tau = 1.1) {
    if (!this.lenoxOperator) {
      this.lenoxOperator = { t: 0, target: 0, tau: 1.1 };
    }
    this.lenoxOperator.target = Math.max(0, Math.min(target ?? 0, 1));
    this.lenoxOperator.tau = Math.max(0.05, tau);
  }

  /**
   * Project the visible viewport edges (at the particle plane) into sim
   * space so the fluid ricochets off the ACTUAL screen edges on any device
   * and any lifecycle framing. Clamped to the grid's safe interior.
   */
  updateLenoxScreenBounds(distance, targetYWorld, shiftX = 0) {
    if (!this.runtime || !this.camera || !this.particleRenderer) return;

    const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const halfH = Math.tan(fovRad / 2) * distance;
    const halfW = halfH * this.camera.aspect;
    // The operator move slides the camera off Lenox' axis, so the visible edges
    // slide with it — otherwise the fluid ricochets off edges that moved.
    const center = { x: this.lenoxFramings.center.x + shiftX, z: this.lenoxFramings.center.z };

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
    if (this.lenoxVessel) {
      this.lenoxVessel.root.traverse((child) => {
        if (!child.isMesh) return;
        child.geometry?.dispose?.();
        const mats = Array.isArray(child.material)
          ? child.material
          : [child.material];
        for (const m of mats) m?.dispose?.();
      });
      this.lenoxVessel = null;
    }
    if (this.lenoxBackdrop) {
      const backdropObject = this.lenoxBackdrop.object ?? this.lenoxBackdrop.mesh;
      backdropObject.parent?.remove(backdropObject);
      this.lenoxBackdrop.dispose();
      this.lenoxBackdrop = null;
    }
    this.lenoxVesselPromise = null;
    this.particleRenderer?.dispose?.();
    this.backgroundGeometry?.dispose?.();
    this.lights?.dispose?.();
    this.mlsMpmSim?.dispose?.();
    this.postProcessing?.dispose?.();
    this.environmentTexture?.dispose?.();
    this.voidEnvironmentTexture?.dispose?.();

    this.scene = null;
    this.camera = null;
    this.environmentTexture = null;
    this.voidEnvironmentTexture = null;

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
