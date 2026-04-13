import * as THREE from "three/webgpu";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { Lights } from "./lights";

import { float, Fn, mrt, output, pass, vec4 } from "three/tsl";
import MlsMpmSimulator from "./mls-mpm/mlsMpmSimulator";
import ParticleRenderer from "./mls-mpm/particleRenderer";
import { IDLE_POST_ENTER_DERIVED } from "./post-enter/PostEnterDirector";
import {
  buildPostEnterSpatialBasis,
  POST_ENTER_FREEZE_SPACE_FRAC,
} from "./post-enter/postEnterChamberBasis";
import BackgroundGeometry from "./backgroundGeometry";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { PREENTER_VESSEL } from "./vesselDescriptors";

const HDRI_URL = "/flow-assets/autumn_field_puresky_1k.hdr";
const MOBILE_BREAKPOINT = 768;
const SOURCE_RADIUS_SCALE = Object.freeze({
  primary: 0.82,
  secondary: 0.88,
});
const DEFAULT_LOOK = Object.freeze({
  environmentIntensity: 0.22,
  exposure: 0.58,
  bloomThreshold: 0.12,
  bloomStrength: 0.2,
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
    convergenceSlowdown: 0,
    convergenceFreeze: 0,
    convergenceHeatRetention: 0,
    convergenceThermalExtinction: 0,
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
    maxParticles: width < MOBILE_BREAKPOINT ? 8192 * 8 : 8192 * 16,
    simSubsteps: 1,
  };
};

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

  /** @type {number} */
  _viewportWidth = 0;
  /** @type {number} */
  _viewportHeight = 0;

  scene = null;
  environmentTexture = null;

  lights = null;
  backgroundGeometry = null;
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
    worldProjectPoint: new THREE.Vector3(),
  };
  runtime = null;

  constructor(renderer) {
    this.renderer = renderer;
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

  async init(
    progressCallback,
    width = window.innerWidth,
    height = window.innerHeight,
  ) {
    this.runtime = createRuntimeState(width);
    this.camera = new THREE.PerspectiveCamera(47, width / height, 0.01, 7.5);
    this.applyCameraFraming(width, height);

    this.scene = new THREE.Scene();
    this.scene.add(this.camera);

    await progressCallback(0.1);

    const hdriTexture = await loadHdrTexture(HDRI_URL);
    this.environmentTexture = hdriTexture;

    // No scene background — canvas is transparent, CSS room shows through
    this.scene.background = null;
    this.scene.environment = hdriTexture;
    this.scene.environmentRotation = new THREE.Euler(0, -2.15, 0);
    // Exposure + env intensity: single owner is createPostProcessingPipeline → setLook(DEFAULT_LOOK)

    await progressCallback(0.5);

    this.mlsMpmSim = new MlsMpmSimulator(this.renderer);
    await this.mlsMpmSim.init(this.runtime.maxParticles);
    this.particleRenderer = new ParticleRenderer(this.mlsMpmSim);
    this.mlsMpmSim.applyRuntime?.(this.runtime);
    this.particleRenderer.applyRuntime?.(this.runtime);
    this.backgroundGeometry = new BackgroundGeometry();
    await this.backgroundGeometry.init();
    this.scene.add(this.backgroundGeometry.object);

    this.lights = new Lights();
    this.scene.add(this.lights.object);
    this.scene.add(this.particleRenderer.object);

    this.createPostProcessingPipeline();

    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.2);

    this._viewportWidth = width;
    this._viewportHeight = height;

    await progressCallback(1.0, 100);
  }

  resize(width, height) {
    this._viewportWidth = width;
    this._viewportHeight = height;
    this.camera.aspect = width / height;
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
    if (intersect) {
      this.mlsMpmSim.setMouseRay(
        this.raycaster.ray.origin,
        this.raycaster.ray.direction,
        intersect,
      );
      this.mlsMpmSim.setMouseActive(true);
      if (isDown) {
        this.backgroundGeometry?.addImpulse?.(0.12);
      }
    }
  }

  primeStartupSource() {
    if (this.startupSourceFieldAnchorOffsets) {
      this.sourceFieldAnchorOffsets = {
        primary: this.startupSourceFieldAnchorOffsets.primary.clone(),
        secondary: this.startupSourceFieldAnchorOffsets.secondary.clone(),
      };
    }
    this.backgroundGeometry?.update?.(0);
    this.syncSourceAnchors();
  }

  promoteIdlePopulation() {
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
    this.backgroundGeometry?.update?.(0);
    this.syncSourceAnchors();
    this.mlsMpmSim?.seedMatureIdlePopulation?.();
  }

  ensureSourceAnchorOffsets() {
    const runtime = this.runtime;
    if (!runtime) {
      return;
    }
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
    const primaryOffset = this.sourceFieldAnchorOffsets.primary;
    const secondaryOffset = this.sourceFieldAnchorOffsets.secondary;
    const runtime = this.runtime;
    if (!runtime) {
      return;
    }

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
    if (!sourceDescriptor) {
      return;
    }

    this.applySourceAnchorDescriptor(sourceDescriptor);
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
    this.mlsMpmSim?.setMouseInfluence?.(value);
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
    this.mlsMpmSim?.setMouseActive?.(false);
  }

  buildPostEnterContext() {
    if (!this.mlsMpmSim || !this.particleRenderer) {
      return null;
    }

    this.syncSourceAnchors();

    const rendererBasis = buildPostEnterSpatialBasis(
      this.particleRenderer.object,
      PREENTER_VESSEL,
    );
    if (!rendererBasis) {
      return null;
    }

    const cmin = rendererBasis.chamberBoundsSim.min;
    const cmax = rendererBasis.chamberBoundsSim.max;
    const freezeCenter = new THREE.Vector3()
      .addVectors(cmin, cmax)
      .multiplyScalar(0.5);
    const freezeHalf = new THREE.Vector3()
      .subVectors(cmax, cmin)
      .multiplyScalar(0.5 * POST_ENTER_FREEZE_SPACE_FRAC);
    const freezeBoundsMin = new THREE.Vector3()
      .copy(freezeCenter)
      .sub(freezeHalf);
    const freezeBoundsMax = new THREE.Vector3()
      .copy(freezeCenter)
      .add(freezeHalf);

    return {
      freezeSpaceSim: {
        center: freezeCenter,
        boundsMin: freezeBoundsMin,
        boundsMax: freezeBoundsMax,
      },
      chamberBoundsSim: rendererBasis.chamberBoundsSim,
      riftSlitP0Sim: rendererBasis.riftSlitP0Sim,
      riftSlitP1Sim: rendererBasis.riftSlitP1Sim,
    };
  }

  /**
   * Body alpha: single director channel (`clearMix` / ash timeline) until a resolve system owns display.
   * @param {import("./post-enter/PostEnterDirector").PostEnterDerived | null | undefined} derived
   */
  particleBodyOpacityMulFromDerived(derived) {
    if (!derived || derived.postEnterPhase === "idle") {
      return 1;
    }
    const clr = derived.clearMix ?? 0;
    return Math.max(0.02, 1 - clr * 0.98);
  }

  /**
   * Stateless post-enter broadcast: runs before the sim/render pass in `update`.
   * @param {import("./post-enter/PostEnterDirector").PostEnterDerived | null | undefined} derived
   */
  broadcastPostEnterFrame(derived) {
    const bodyOpacityMul = this.particleBodyOpacityMulFromDerived(derived);
    this.mlsMpmSim?.applyPostEnterFrame?.(derived);
    this.particleRenderer?.applyPostEnterFrame?.(bodyOpacityMul);
  }

  resetPostEnterState() {
    this.broadcastPostEnterFrame(IDLE_POST_ENTER_DERIVED);
  }

  getFrontRailMetrics() {
    if (!this.camera || !this.backgroundGeometry?.object) return null;

    const { apertureWidth, apertureHeight, frameSide, frameTop, frameDepth } =
      PREENTER_VESSEL;

    const outerWidth = apertureWidth + frameSide * 2;
    const outerHeight = apertureHeight + frameTop * 2;
    const frameFrontZ = frameDepth * 0.5;
    const bandCenterY = -outerHeight * 0.5 + frameTop * 0.5;
    const railObject = this.backgroundGeometry.object;
    const projectScratch = this.sourceAnchorScratch.worldProjectPoint;

    railObject.updateWorldMatrix(true, false);
    this.camera.updateMatrixWorld();

    const projectPoint = (x, y, z) => {
      const projectedPoint = railObject
        .localToWorld(projectScratch.set(x, y, z))
        .project(this.camera);

      return {
        x: (projectedPoint.x + 1) * 0.5,
        y: (1 - projectedPoint.y) * 0.5,
      };
    };

    const corners = [
      projectPoint(
        -outerWidth * 0.5,
        bandCenterY - frameTop * 0.5,
        frameFrontZ,
      ),
      projectPoint(
        -outerWidth * 0.5,
        bandCenterY + frameTop * 0.5,
        frameFrontZ,
      ),
      projectPoint(outerWidth * 0.5, bandCenterY - frameTop * 0.5, frameFrontZ),
      projectPoint(outerWidth * 0.5, bandCenterY + frameTop * 0.5, frameFrontZ),
    ];
    const center = projectPoint(0, bandCenterY, frameFrontZ);
    const xs = corners.map((point) => point.x);
    const ys = corners.map((point) => point.y);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);

    return {
      left,
      top,
      width: right - left,
      height: bottom - top,
      centerX: center.x,
      centerY: center.y,
    };
  }

  /**
   * @param {number} delta
   * @param {import("./post-enter/PostEnterDirector").PostEnterFrame} [postEnterFrame]
   */
  async update(delta, postEnterFrame) {
    const derived = postEnterFrame?.derived ?? IDLE_POST_ENTER_DERIVED;
    this.broadcastPostEnterFrame(derived);

    this.backgroundGeometry?.update?.(delta);

    this.syncSourceAnchors();
    this.mlsMpmSim?.applyRuntime?.(this.runtime);
    this.particleRenderer?.applyRuntime?.(this.runtime);
    await this.mlsMpmSim.update(delta);
    this.particleRenderer?.update();
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

    this.camera.fov = fov;
    this.camera.position.set(lookAtX + 0.008, cameraY, lookAtZ - distance);
    this.camera.lookAt(lookAtX, lookAtY, lookAtZ);
    this.camera.updateProjectionMatrix();
  }
}
export default App;
