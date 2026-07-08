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

  constructor(renderer) {
    this.renderer = renderer;
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
    this.scene.add(this.backgroundGeometry.object);

    this.lights = new Lights();
    this.scene.add(this.lights.object);
    this.scene.add(this.particleRenderer.object);

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

    this.applyCameraFraming(width, height);
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

    await this.mlsMpmSim.update(delta);
    this.particleRenderer.update();
    await this.postProcessing.renderAsync();
  }

  dispose() {
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
