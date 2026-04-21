import * as THREE from "three/webgpu";
import {
  array,
  Fn,
  If,
  instancedArray,
  instanceIndex,
  Return,
  uniform,
  int,
  float,
  Loop,
  vec2,
  vec3,
  vec4,
  atomicAdd,
  uint,
  max,
  pow,
  mat3,
  clamp,
  fract,
  sin,
  time,
  cross,
  mix,
  ivec3,
  smoothstep,
} from "three/tsl";
import { triNoise3Dvec } from "../common/noise";
import { StructuredArray } from "./structuredArray.js";
import { forensicEnabled } from "../post-enter/forensicPostEnter.js";

/** Upper bound for particle buffer allocation (must match App runtime.maxParticles policy). */
const DEFAULT_MAX_PARTICLE_CAPACITY = 8192 * 16;

const GRID_POINTER_OFFSET = new THREE.Vector3();
const ZERO_VECTOR = new THREE.Vector3(0, 0, 0);
const GRID_CLAMP_MARGIN = 2;
const GRID_WALL_MARGIN = 3;
const TAU = Math.PI * 2;

const PARTICLE_FORCE_TUNING = Object.freeze({
  noise: {
    positionScale: 0.015,
    speed: 0.11,
    bias: 0.285,
    strength: 0.28,
  },
  pointer: {
    distanceScale: 0.1,
    power: 2,
    historyScale: 0.8,
  },
});

/** Same parameters as `seedMatureIdlePopulation` / `carvePopulationSlit` (canonical bilobal around rift). */
export const IDLE_SLIT_PARAMS = Object.freeze({
  splitPush: 0.8,
  gapWidth: 2.45,
});

/**
 * Z compression toward `chamberFlowCenter.z` for recall targets.
 * 0.4 keeps the bilobal in the front half of the vessel (world Z ≈ 0.20–0.61)
 * so it doesn't bleed into the deep chamber and appear back-wall-plastered.
 * Settle applies a further 0.64 factor on top (effective ≈ 0.26 from sphere).
 */
const RECALL_Z_COMPRESS = 0.4;

/**
 * Y compression toward `chamberFlowCenter.y` for recall targets.
 * Sphere seeds span Y ≈ 1.6–62.4 sim (world Y 0.01–0.85); without compression the
 * bilobal extends floor-to-ceiling with thin density at the extremes → flat-disc read.
 * 0.5 concentrates the bilobal into sim Y ≈ 16.7–47.1 (world Y ≈ 0.22–0.64):
 * elevated, compact, not touching the floor, visually rounded rather than pancake.
 */
const RECALL_Y_COMPRESS = 0.5;

/**
 * Max X displacement from `chamberFlowCenter.x` for recall targets (grid units).
 * Prevents extreme sphere-edge particles (carve X ≈ 62) from being spring-pinned
 * against the grid wall (soft-wall at 61, clamp at 62). Gives 7-unit clearance
 * on each side relative to the default 64-wide grid.
 */
const RECALL_X_HALF_MAX = 22;

/**
 * Explicit arrest volume for the A2 proof path.
 * This generator authors the committed `V` hold only: curved arms, open slit,
 * forward belly, and a deterministic silhouette from any idle start.
 */
export const HERO_POINT_CLOUD = Object.freeze({
  safetyMargin: 6,

  // Geometric center offset from chamberFlowCenter
  // Pulled down slightly to absorb the massive upward scale, and pushed significantly FORWARD into the chamber
  centerX: 0,
  centerY: -1.0,
  centerZ: 3.35,

  /** Uniform XY scale of the six Bézier control points around `innerFoot` (tip); keeps apex fixed. */
  contourScale: 1.28,

  // Outer contour (Uniformly scaled 1.4x from vertex Y=-8.5)
  outerShoulder: [8.68, 17.12],
  outerMid: [4.9, 4.1],
  outerFoot: [0.14, -8.5],

  // Inner contour (Uniformly scaled 1.4x from vertex Y=-8.5)
  innerShoulder: [4.76, 16.28],
  innerMid: [2.52, 3.4],
  innerFoot: [0.0, -8.5],

  // 2.5D Layering Configuration
  frontalPercentage: 0.68,
  frontalApexPercentage: 0.9,
  frontalBulge: 1.05,            // Legacy field; front Z uses depth rails + taper (not sin-bulge).
  frontalThickness: 0.16,       // Micro jitter on front Z (scaled by taper)
  frontDepthTaperPower: 1.55,
  rearDepthTaperPower: 2.05,

  rearDepthShoulder: -1.85,     // Support only; magnitude below front outer rail
  rearDepthFoot: -0.05,
  rearInset: 0.2,

  // Slit safety
  minSlitHalf: 0.4,

  // Direction

  directionForwardBias: 0.1,
  directionRearBias: 0.05,

  // Cohort (renderer still uses these)
  roleHeroMin: 0.85,
  roleSupportMin: 0.62,

  /** Dissolve anchor radii (sim units); `_syncDissolveAnchors` / rift jitter. */
  radiusX: 12,
  radiusY: 14,
  radiusZ: 5,

  seeds: Object.freeze({
    u0: 12.9898,
    u1: 78.233,
    u2: 43.7143,
    role: 91.4271,
  }),
});

/**
 * Authored settle banks (second shape, not recall): lateral pull to left/right attractors,
 * slit stay-out, heavy floor y, z squeeze.
 */
const SETTLE_VOLUME = Object.freeze({
  /** Stronger depth gather than prior 0.86. */
  zCompress: 0.64,
  /** Distance from chamber midline (mx) to each bank centroid in sim X. */
  bankPeakX: 6.05,
  /** How strongly X moves from recall positions toward `bankPeakX` on each side (0–1). */
  xBankPull: 0.9,
  /** Same role as old slit edge parking when |rx−mx| < gap. */
  slitEdgeScale: 1.02,
  /** Small heap lift away from the rift (uses final x). */
  outerBankLift: 0.95,
  bankHeapSigma: 4.2,
  /** Slight extra drop in the rift read (Gaussian in |x−mx|). */
  riftYDrop: 0.42,
  riftYSigma: 2.1,
  /** Off — would blend back to recall height and soften the heavy-bank read. */
  recallYBlend: 0,
});

/**
 * Spring gain toward `recallTarget` (× lateral/vertical weights × `dt` in g2p).
 */
const RECALL_STIFFNESS = 18;
const SETTLE_STIFFNESS = 5.75;
/**
 * Apply X-axis slit push used for idle bilobal separation (matches `carvePopulationSlit`).
 * @param {THREE.Vector3} particlePosition
 * @param {THREE.Vector3} splitMidpoint
 * @param {THREE.Vector3} splitAxis normalized
 */
function applySlitDisplacement(
  particlePosition,
  splitMidpoint,
  splitAxis,
  gapWidth,
  splitPush,
) {
  const signedMidDistance = particlePosition
    .clone()
    .sub(splitMidpoint)
    .dot(splitAxis);
  const signedSide = signedMidDistance < 0 ? -1 : 1;
  if (Math.abs(signedMidDistance) < gapWidth) {
    particlePosition.addScaledVector(
      splitAxis,
      signedSide * (gapWidth - Math.abs(signedMidDistance) + splitPush),
    );
  }
}

function hash01(index, seed) {
  const x = Math.sin((index + 1) * seed) * 43758.5453123;
  return x - Math.floor(x);
}

/**
 * `convergenceSlowdown` / `convergenceFreeze` / `convergenceHeatRetention` /
 * `convergenceThermalExtinction`: default source play keeps these near 0; the bridge (or a
 * future director) can raise them for a directed beat without re-plumbing the grid.
 */
const CONVERGENCE_TUNING = Object.freeze({
  xsph: {
    slowdownBand: [0.36, 0.9],
    slowdownWeight: 0.44,
    minStrength: 0.0005,
    maxStrength: 0.085,
  },
  slowdownDamping: {
    scale: 0.006,
    floor: 0.994,
  },
});

const WALL_RESPONSE = Object.freeze({
  stiffness: 0.3,
  predictionScale: 3.0,
});

const buildQuadraticKernelState = (particlePosition) => {
  const cellIndex = ivec3(particlePosition).sub(1).toConst("cellIndex");
  const cellDiff = particlePosition.fract().sub(0.5).toConst("cellDiff");
  const w0 = float(0.5)
    .mul(float(0.5).sub(cellDiff))
    .mul(float(0.5).sub(cellDiff));
  const w1 = float(0.75).sub(cellDiff.mul(cellDiff));
  const w2 = float(0.5)
    .mul(float(0.5).add(cellDiff))
    .mul(float(0.5).add(cellDiff));

  return {
    cellIndex,
    cellDiff,
    weights: array([w0, w1, w2]).toConst("weights"),
  };
};

const forEachNeighbor3x3x3 = (
  { cellIndex, weights },
  particlePosition,
  callback,
  /** Unique TSL name per call site in the same `Fn()` to avoid THREE.TSL rename warnings. */
  neighborDistName = "cellDist",
) => {
  Loop(
    { start: 0, end: 3, type: "int", name: "gx", condition: "<" },
    ({ gx }) => {
      Loop(
        { start: 0, end: 3, type: "int", name: "gy", condition: "<" },
        ({ gy }) => {
          Loop(
            { start: 0, end: 3, type: "int", name: "gz", condition: "<" },
            ({ gz }) => {
              const weight = weights
                .element(gx)
                .x.mul(weights.element(gy).y)
                .mul(weights.element(gz).z);
              const cellX = cellIndex.add(ivec3(gx, gy, gz)).toConst();
              const cellDist = vec3(cellX)
                .add(0.5)
                .sub(particlePosition)
                .toConst(neighborDistName);

              callback({ cellX, weight, cellDist });
            },
          );
        },
      );
    },
  );
};

const applyGridEdgeClamp = (axisVelocity, axisIndex, axisLimit) => {
  const clampMargin = int(GRID_CLAMP_MARGIN);
  If(
    axisIndex
      .lessThan(clampMargin)
      .or(axisIndex.greaterThan(axisLimit.sub(clampMargin))),
    () => {
      axisVelocity.assign(0);
    },
  );
};

const applyWallResponse = (
  axisVelocity,
  predictedAxis,
  wallMinAxis,
  wallMaxAxis,
) => {
  If(predictedAxis.lessThan(wallMinAxis), () => {
    axisVelocity.addAssign(
      wallMinAxis.sub(predictedAxis).mul(WALL_RESPONSE.stiffness),
    );
  });
  If(predictedAxis.greaterThan(wallMaxAxis), () => {
    axisVelocity.addAssign(
      wallMaxAxis.sub(predictedAxis).mul(WALL_RESPONSE.stiffness),
    );
  });
};

/** VOLKANO thermal ramp: drives both `heat` (ignition memory) and visible `color` for the renderer. */
const buildThermalState = ({
  uniforms,
  particleVelocity,
  particlePosition,
  particleDensity,
  previousHeat,
  previousColor,
  dist,
}) => {
  const coal = vec3(0.005, 0.003, 0.003);
  const deepRed = vec3(0.2, 0.01, 0.01);
  const ember = vec3(0.36, 0.026, 0.014);
  const flareRed = vec3(0.78, 0.05, 0.022);
  const fireGold = vec3(0.98, 0.6, 0.055);
  const hotWhite = vec3(1.0, 0.8, 0.12);

  const densityRatio = smoothstep(
    float(0.22),
    float(1.18),
    particleDensity.div(uniforms.restDensity),
  );
  const velocityFactor = smoothstep(
    float(0.12),
    float(0.92),
    particleVelocity.length().mul(0.26),
  );

  const signedNoise = triNoise3Dvec(
    particlePosition.mul(0.12),
    float(0.3),
    time,
  ).x.sub(0.285);

  const primarySourceProximity = particlePosition
    .sub(uniforms.sourceFieldCenter)
    .length()
    .div(uniforms.sourceFieldRadius)
    .oneMinus()
    .clamp(0, 1)
    .pow(1.6);
  const secondarySourceProximity = particlePosition
    .sub(uniforms.sourceFieldSecondaryCenter)
    .length()
    .div(uniforms.sourceFieldSecondaryRadius)
    .oneMinus()
    .clamp(0, 1)
    .pow(1.45);
  const sourceHeat = max(primarySourceProximity, secondarySourceProximity);

  const laneSignal = triNoise3Dvec(
    particlePosition.mul(0.17).add(particleVelocity.mul(0.12)),
    float(0.08),
    time,
  ).x;
  const emberLane = smoothstep(float(0.25), float(0.37), laneSignal);
  const ignitionLane = smoothstep(float(0.38), float(0.5), laneSignal);
  const neighborhoodWarmth = smoothstep(float(-0.02), float(0.1), signedNoise);

  const bodyHeat = densityRatio
    .mul(0.18)
    .add(sourceHeat.mul(0.16))
    .add(velocityFactor.mul(0.08))
    .add(signedNoise.mul(0.06))
    .sub(0.14)
    .clamp(0, 1);
  const crimsonLift = emberLane.mul(
    velocityFactor
      .mul(0.14)
      .add(sourceHeat.mul(0.08))
      .add(neighborhoodWarmth.mul(0.06)),
  );
  const bodyThermal = bodyHeat.add(crimsonLift).clamp(0, 1);

  const hoverIgnition = dist
    .mul(0.12)
    .oneMinus()
    .max(0.0)
    .pow(4)
    .mul(uniforms.mouseActive)
    .clamp(0, 1);
  const heatMemory = mix(
    float(0.955),
    float(0.994),
    uniforms.convergenceHeatRetention,
  ).toConst("heatMemory");
  const thermalExtinction = uniforms.convergenceThermalExtinction
    .clamp(0, 0.98)
    .toConst("thermalExtinction");
  const ignitionHeat = previousHeat
    .mul(heatMemory)
    .add(sourceHeat.mul(0.045))
    .add(velocityFactor.mul(0.028))
    .add(ignitionLane.mul(sourceHeat.mul(0.008).add(velocityFactor.mul(0.006))))
    .add(hoverIgnition.mul(0.14))
    .clamp(0, 1);
  const collapseCooling = uniforms.convergenceThermalExtinction
    .clamp(0, 0.985)
    .toConst("collapseCooling");
  const cooledIgnitionHeat = ignitionHeat
    .mul(float(1).sub(collapseCooling).max(float(0.03)))
    .toConst("cooledIgnitionHeat");
  const colorIgnition = cooledIgnitionHeat
    .add(
      emberLane.mul(
        sourceHeat
          .mul(0.1)
          .add(velocityFactor.mul(0.07))
          .add(neighborhoodWarmth.mul(0.05))
          .mul(float(1).sub(thermalExtinction.mul(0.82))),
      ),
    )
    .clamp(0, 1);
  const collapseFlareTame = uniforms.convergenceThermalExtinction
    .clamp(0, 0.985)
    .toConst("collapseFlareTame");
  const collapseColorIgnition = colorIgnition
    .mul(float(1).sub(collapseFlareTame.mul(0.86)))
    .clamp(0, 1)
    .toConst("collapseColorIgnition");
  const collapsePeakHeat = cooledIgnitionHeat
    .mul(float(1).sub(collapseFlareTame.mul(0.985)))
    .toConst("collapsePeakHeat");

  const bodyT1 = smoothstep(float(0.0), float(0.22), bodyThermal);
  const bodyT2 = smoothstep(float(0.24), float(0.54), bodyThermal);
  const redIgnition = smoothstep(
    mix(float(0.12), float(0.16), thermalExtinction),
    mix(float(0.38), float(0.32), thermalExtinction),
    collapseColorIgnition,
  );
  const fireIgnition = smoothstep(
    mix(float(0.54), float(0.9), thermalExtinction),
    mix(float(0.8), float(0.985), thermalExtinction),
    collapseColorIgnition,
  );
  const hotIgnition = smoothstep(
    mix(float(0.94), float(0.9992), thermalExtinction),
    mix(float(0.992), float(0.99985), thermalExtinction),
    collapsePeakHeat,
  );

  const c1 = mix(coal, deepRed, bodyT1);
  const c2 = mix(c1, ember, bodyT2);
  const c3 = mix(c2, flareRed, redIgnition);
  const fireLayer = fireIgnition
    .mul(float(1).sub(thermalExtinction.mul(0.96)))
    .toConst("fireLayer");
  const hotLayer = hotIgnition
    .mul(float(1).sub(thermalExtinction.mul(0.995)))
    .toConst("hotLayer");
  const c4 = mix(c3, fireGold, fireLayer);
  const color = mix(c4, hotWhite, hotLayer);
  const collapseDarken = uniforms.convergenceThermalExtinction
    .mul(0.18)
    .toConst("collapseDarken");
  const cooledColor = mix(color, coal, collapseDarken);
  const freezeColorMemoryT = smoothstep(
    float(0.02),
    float(0.42),
    uniforms.convergenceFreeze,
  )
    .mul(0.35)
    .toConst("freezeColorMemoryT");
  const freezeRetainedColor = mix(
    cooledColor,
    previousColor,
    freezeColorMemoryT,
  ).toConst("freezeRetainedColor");

  return {
    color: freezeRetainedColor,
    heat: cooledIgnitionHeat,
  };
};

class mlsMpmSimulator {
  renderer = null;
  numParticles = 0;
  gridSize = new THREE.Vector3(0, 0, 0);
  uniforms = {};
  kernels = {};
  fixedPointMultiplier = 1e7;
  mousePos = new THREE.Vector3();
  mousePosArray = [];
  initialParticlePositions = null;
  /** Filled by App.applyRuntime immediately after init; null only before first apply. */
  runtime = null;

  constructor(renderer) {
    this.renderer = renderer;
  }

  /**
   * @param {number} [maxParticleCapacity] Buffer capacity; defaults match desktop cap.
   */
  async init(maxParticleCapacity = DEFAULT_MAX_PARTICLE_CAPACITY) {
    const maxParticles = maxParticleCapacity;
    this.gridSize.set(64, 64, 64);

    const particleStruct = {
      position: { type: "vec3" },
      density: { type: "float" },
      velocity: { type: "vec3" },
      mass: { type: "float" },
      C: { type: "mat3" },
      direction: { type: "vec3" },
      color: { type: "vec3" },
      heat: { type: "float" },
      dissolveState: { type: "vec2" },
    };
    this.particleBuffer = new StructuredArray(
      particleStruct,
      maxParticles,
      "particleData",
    );

    const vec = new THREE.Vector3();
    for (let i = 0; i < maxParticles; i++) {
      let dist = 2;
      while (dist > 1) {
        vec
          .set(Math.random(), Math.random(), Math.random())
          .multiplyScalar(2.0)
          .subScalar(1.0);
        dist = vec.length();
        vec
          .multiplyScalar(0.95)
          .addScalar(1.0)
          .divideScalar(2.0)
          .multiply(this.gridSize);
      }
      const mass = 1.0 - Math.random() * 0.002;
      this.particleBuffer.set(i, "position", vec);
      this.particleBuffer.set(i, "mass", mass);
      this.particleBuffer.set(i, "heat", 0);
    }
    this.captureInitialParticlePositions();

    this.recallTargetBuffer = new StructuredArray(
      { recallTarget: { type: "vec4" } },
      maxParticles,
      "recallTargetData",
    );
    // Authored arrest owners: target positions and rod directions for the committed hold.
    this.heroBodyTargetBuffer = new StructuredArray(
      { heroBodyTarget: { type: "vec4" } },
      maxParticles,
      "heroBodyTargetData",
    );
    this.heroBodyDirectionBuffer = new StructuredArray(
      { heroBodyDirection: { type: "vec4" } },
      maxParticles,
      "heroBodyDirectionData",
    );
    this.returnBodyTargetBuffer = new StructuredArray(
      { returnBodyTarget: { type: "vec4" } },
      maxParticles,
      "returnBodyTargetData",
    );
    this.settleTargetBuffer = new StructuredArray(
      { settleTarget: { type: "vec4" } },
      maxParticles,
      "settleTargetData",
    );

    const cellCount = this.gridSize.x * this.gridSize.y * this.gridSize.z;
    const cellStruct = {
      x: { type: "int", atomic: true },
      y: { type: "int", atomic: true },
      z: { type: "int", atomic: true },
      mass: { type: "int", atomic: true },
    };
    this.cellBuffer = new StructuredArray(cellStruct, cellCount, "cellData");
    this.cellBufferF = instancedArray(cellCount, "vec4").label("cellDataF");

    this.uniforms.gravity = uniform(new THREE.Vector3());
    this.uniforms.stiffness = uniform(0);
    this.uniforms.restDensity = uniform(0);
    this.uniforms.dynamicViscosity = uniform(0);
    this.uniforms.noise = uniform(0);
    this.uniforms.apicBlend = uniform(0);
    this.uniforms.maxVelocity = uniform(0);

    this.uniforms.gridSize = uniform(this.gridSize, "ivec3");
    this.uniforms.dt = uniform(0.1);
    this.uniforms.numParticles = uniform(0, "uint");

    this.uniforms.mouseRayDirection = uniform(new THREE.Vector3());
    this.uniforms.mouseRayOrigin = uniform(new THREE.Vector3());
    this.uniforms.mouseForce = uniform(new THREE.Vector3());
    this.uniforms.sourceFieldCenter = uniform(new THREE.Vector3());
    this.uniforms.sourceFieldSecondaryCenter = uniform(new THREE.Vector3());
    this.uniforms.sourceFieldRadius = uniform(1);
    this.uniforms.sourceFieldSecondaryRadius = uniform(1);
    this.uniforms.convergenceSlowdown = uniform(0);
    this.uniforms.convergenceFreeze = uniform(0);
    this.uniforms.convergenceHeatRetention = uniform(0);
    this.uniforms.convergenceThermalExtinction = uniform(0);
    this.uniforms.mouseInfluence = uniform(1);
    this.uniforms.mouseActive = uniform(0);
    this.uniforms.heroBodyWeight = uniform(0);
    this.uniforms.authoredDirectionWeight = uniform(0);
    this.uniforms.returnBodyWeight = uniform(0);
    this.uniforms.recallLateralWeight = uniform(0);
    this.uniforms.recallVerticalWeight = uniform(0);
    this.uniforms.settleWeight = uniform(0);

    this.uniforms.heroCenter = uniform(new THREE.Vector3());
    this.uniforms.heroRadiusMax = uniform(1);
    this.uniforms.riftAnchorX = uniform(0);
    this.uniforms.riftAnchorZ = uniform(0);
    this.uniforms.riftAnchorXJitter = uniform(
      HERO_POINT_CLOUD.radiusX * 0.08,
    );
    this.uniforms.dissolveAccel = uniform(26.0);
    this.uniforms.dissolveCaptureRadius = uniform(1.5);
    this.uniforms.dissolveFadeZoneRadius = uniform(5.5);
    this.uniforms.dissolveDecayDuration = uniform(0.22);
    this.uniforms.dissolveVelocityDamping = uniform(0.7);
    this.uniforms.dissolveStaggerSpread = uniform(0.4);
    this.uniforms.dissolveDt = uniform(1 / 60);
    this.uniforms.dissolveExtractionT = uniform(0);

    this.kernels.clearGrid = Fn(() => {
      this.cellBuffer.setAtomic("x", false);
      this.cellBuffer.setAtomic("y", false);
      this.cellBuffer.setAtomic("z", false);
      this.cellBuffer.setAtomic("mass", false);

      If(instanceIndex.greaterThanEqual(uint(cellCount)), () => {
        Return();
      });

      this.cellBuffer.element(instanceIndex).get("x").assign(0);
      this.cellBuffer.element(instanceIndex).get("y").assign(0);
      this.cellBuffer.element(instanceIndex).get("z").assign(0);
      this.cellBuffer.element(instanceIndex).get("mass").assign(0);
      this.cellBufferF.element(instanceIndex).assign(0);
    })().compute(cellCount);

    const encodeFixedPoint = (f32) => {
      return int(f32.mul(this.fixedPointMultiplier));
    };
    const decodeFixedPoint = (i32) => {
      return float(i32).div(this.fixedPointMultiplier);
    };

    const getCellPtr = (ipos) => {
      const gridSize = this.uniforms.gridSize;
      const cellPtr = int(ipos.x)
        .mul(gridSize.y)
        .mul(gridSize.z)
        .add(int(ipos.y).mul(gridSize.z))
        .add(int(ipos.z))
        .toConst();
      return cellPtr;
    };
    const getCell = (ipos) => {
      return this.cellBuffer.element(getCellPtr(ipos));
    };

    this.kernels.p2g1 = Fn(() => {
      this.cellBuffer.setAtomic("x", true);
      this.cellBuffer.setAtomic("y", true);
      this.cellBuffer.setAtomic("z", true);
      this.cellBuffer.setAtomic("mass", true);

      If(
        instanceIndex.greaterThanEqual(uint(this.uniforms.numParticles)),
        () => {
          Return();
        },
      );
      const particlePosition = this.particleBuffer
        .element(instanceIndex)
        .get("position")
        .xyz.toConst("particlePosition");
      const particleVelocity = this.particleBuffer
        .element(instanceIndex)
        .get("velocity")
        .xyz.toConst("particleVelocity");
      const particleMass = this.particleBuffer
        .element(instanceIndex)
        .get("mass")
        .toConst("particleMass");

      const kernelState = buildQuadraticKernelState(particlePosition);

      const C = this.particleBuffer.element(instanceIndex).get("C").toConst();
      forEachNeighbor3x3x3(
        kernelState,
        particlePosition,
        ({ cellX, weight, cellDist }) => {
          const Q = C.mul(cellDist).mul(this.uniforms.apicBlend).toConst("Q");

          const massContrib = particleMass.mul(weight).toConst("massContrib");
          const velContrib = massContrib
            .mul(particleVelocity.add(Q))
            .toConst("velContrib");
          const cell = getCell(cellX);
          atomicAdd(cell.get("x"), encodeFixedPoint(velContrib.x));
          atomicAdd(cell.get("y"), encodeFixedPoint(velContrib.y));
          atomicAdd(cell.get("z"), encodeFixedPoint(velContrib.z));
          atomicAdd(cell.get("mass"), encodeFixedPoint(massContrib));
        },
        "nbrDistP2g1",
      );
    })().compute(1);

    this.kernels.p2g2 = Fn(() => {
      this.cellBuffer.setAtomic("x", true);
      this.cellBuffer.setAtomic("y", true);
      this.cellBuffer.setAtomic("z", true);
      this.cellBuffer.setAtomic("mass", false);

      If(
        instanceIndex.greaterThanEqual(uint(this.uniforms.numParticles)),
        () => {
          Return();
        },
      );
      const particlePosition = this.particleBuffer
        .element(instanceIndex)
        .get("position")
        .xyz.toConst("particlePosition");

      const kernelState = buildQuadraticKernelState(particlePosition);

      const density = float(0).toVar("density");
      forEachNeighbor3x3x3(
        kernelState,
        particlePosition,
        ({ cellX, weight }) => {
          const cell = getCell(cellX);
          density.addAssign(decodeFixedPoint(cell.get("mass")).mul(weight));
        },
        "nbrDistP2g2Density",
      );
      const densityStore = this.particleBuffer
        .element(instanceIndex)
        .get("density");
      densityStore.assign(mix(densityStore, density, 0.05));

      const volume = float(1).div(density);
      const pressure = max(
        0.0,
        pow(density.div(this.uniforms.restDensity), 5.0)
          .sub(1)
          .mul(this.uniforms.stiffness),
      ).toConst("pressure");
      const stress = mat3(
        pressure.negate(),
        0,
        0,
        0,
        pressure.negate(),
        0,
        0,
        0,
        pressure.negate(),
      ).toVar("stress");
      const dudv = this.particleBuffer
        .element(instanceIndex)
        .get("C")
        .toConst("C");

      const strain = dudv.add(dudv.transpose());
      stress.addAssign(strain.mul(this.uniforms.dynamicViscosity));
      const eq16Term0 = volume.mul(-4).mul(stress).mul(this.uniforms.dt);

      forEachNeighbor3x3x3(
        kernelState,
        particlePosition,
        ({ cellX, weight, cellDist }) => {
          const cell = getCell(cellX);
          const momentum = eq16Term0
            .mul(weight)
            .mul(cellDist)
            .toConst("momentum");
          atomicAdd(cell.get("x"), encodeFixedPoint(momentum.x));
          atomicAdd(cell.get("y"), encodeFixedPoint(momentum.y));
          atomicAdd(cell.get("z"), encodeFixedPoint(momentum.z));
        },
        "nbrDistP2g2Momentum",
      );
    })().compute(1);

    this.kernels.updateGrid = Fn(() => {
      this.cellBuffer.setAtomic("x", false);
      this.cellBuffer.setAtomic("y", false);
      this.cellBuffer.setAtomic("z", false);
      this.cellBuffer.setAtomic("mass", false);

      If(instanceIndex.greaterThanEqual(uint(cellCount)), () => {
        Return();
      });
      const cell = this.cellBuffer.element(instanceIndex).toConst("cell");

      const mass = decodeFixedPoint(cell.get("mass")).toConst();
      If(mass.lessThanEqual(0), () => {
        Return();
      });

      const vx = decodeFixedPoint(cell.get("x")).div(mass).toVar();
      const vy = decodeFixedPoint(cell.get("y")).div(mass).toVar();
      const vz = decodeFixedPoint(cell.get("z")).div(mass).toVar();

      const x = int(instanceIndex)
        .div(this.uniforms.gridSize.z)
        .div(this.uniforms.gridSize.y);
      const y = int(instanceIndex)
        .div(this.uniforms.gridSize.z)
        .mod(this.uniforms.gridSize.y);
      const z = int(instanceIndex).mod(this.uniforms.gridSize.z);

      // Match the hard particle clamp margin so grid-edge cells are zeroed
      // with the same explicit boundary rule.
      applyGridEdgeClamp(vx, x, this.uniforms.gridSize.x);
      applyGridEdgeClamp(vy, y, this.uniforms.gridSize.y);
      applyGridEdgeClamp(vz, z, this.uniforms.gridSize.z);

      this.cellBufferF.element(instanceIndex).assign(vec4(vx, vy, vz, mass));
    })().compute(cellCount);

    this.kernels.g2p = Fn(() => {
      If(
        instanceIndex.greaterThanEqual(uint(this.uniforms.numParticles)),
        () => {
          Return();
        },
      );
      const particlePosition = this.particleBuffer
        .element(instanceIndex)
        .get("position")
        .xyz.toVar("particlePosition");
      const particleVelocity = vec3(0).toVar();
      particleVelocity.addAssign(this.uniforms.gravity.mul(this.uniforms.dt));

      const noise = triNoise3Dvec(
        particlePosition.mul(PARTICLE_FORCE_TUNING.noise.positionScale),
        PARTICLE_FORCE_TUNING.noise.speed,
        time,
      )
        .sub(PARTICLE_FORCE_TUNING.noise.bias)
        .normalize()
        .mul(PARTICLE_FORCE_TUNING.noise.strength)
        .toVar();
      particleVelocity.subAssign(
        noise.mul(this.uniforms.noise).mul(this.uniforms.dt),
      );

      const kernelState = buildQuadraticKernelState(particlePosition);
      const { cellIndex } = kernelState;

      const B = mat3(0).toVar("B");
      forEachNeighbor3x3x3(
        kernelState,
        particlePosition,
        ({ cellX, weight, cellDist }) => {
          const cellPtr = getCellPtr(cellX);
          const weightedVelocity = this.cellBufferF
            .element(cellPtr)
            .xyz.mul(weight)
            .toConst("weightedVelocity");
          const term = mat3(
            weightedVelocity.mul(cellDist.x),
            weightedVelocity.mul(cellDist.y),
            weightedVelocity.mul(cellDist.z),
          );
          B.addAssign(term);
          particleVelocity.addAssign(weightedVelocity);
        },
        "nbrDistG2p",
      );

      // Late convergence smoothing: calm local rod chatter without reintroducing
      // any shape-building pull. This is only a neighborhood velocity average.
      // Slowdown-only neighbor blend; high `convergenceFreeze` must not drive this
      // into a single artificial velocity blob.
      const xsphStrength = smoothstep(
        float(CONVERGENCE_TUNING.xsph.slowdownBand[0]),
        float(CONVERGENCE_TUNING.xsph.slowdownBand[1]),
        this.uniforms.convergenceSlowdown,
      )
        .mul(float(CONVERGENCE_TUNING.xsph.slowdownWeight))
        .mul(this.uniforms.dt)
        .clamp(0, CONVERGENCE_TUNING.xsph.maxStrength)
        .toConst("xsphStrength");
      If(
        xsphStrength.greaterThan(float(CONVERGENCE_TUNING.xsph.minStrength)),
        () => {
          const xsphCellIndex = cellIndex.toConst("xsphCellIndex");
          const vxp = this.cellBufferF.element(
            getCellPtr(xsphCellIndex.add(ivec3(1, 0, 0))),
          ).xyz;
          const vxm = this.cellBufferF.element(
            getCellPtr(xsphCellIndex.add(ivec3(-1, 0, 0))),
          ).xyz;
          const vyp = this.cellBufferF.element(
            getCellPtr(xsphCellIndex.add(ivec3(0, 1, 0))),
          ).xyz;
          const vym = this.cellBufferF.element(
            getCellPtr(xsphCellIndex.add(ivec3(0, -1, 0))),
          ).xyz;
          const vzp = this.cellBufferF.element(
            getCellPtr(xsphCellIndex.add(ivec3(0, 0, 1))),
          ).xyz;
          const vzm = this.cellBufferF.element(
            getCellPtr(xsphCellIndex.add(ivec3(0, 0, -1))),
          ).xyz;
          const neighborAverage = vxp
            .add(vxm)
            .add(vyp)
            .add(vym)
            .add(vzp)
            .add(vzm)
            .mul(float(1.0 / 6.0))
            .toConst("neighborAverage");
          const smoothingDelta = neighborAverage
            .sub(particleVelocity)
            .toConst("smoothingDelta");
          particleVelocity.addAssign(smoothingDelta.mul(xsphStrength));
        },
      );

      const dist = cross(
        this.uniforms.mouseRayDirection,
        particlePosition.sub(this.uniforms.mouseRayOrigin),
      ).length();
      const force = dist
        .mul(PARTICLE_FORCE_TUNING.pointer.distanceScale)
        .oneMinus()
        .max(0.0)
        .pow(PARTICLE_FORCE_TUNING.pointer.power);
      particleVelocity.addAssign(
        this.uniforms.mouseForce
          .mul(this.uniforms.mouseInfluence)
          .mul(this.uniforms.mouseActive)
          .mul(force),
      );

      const returnBodyTargetPos = this.returnBodyTargetBuffer
        .element(instanceIndex)
        .get("returnBodyTarget")
        .xyz.toConst("returnBodyTargetPos");
      const returnBodyK = float(RECALL_STIFFNESS)
        .mul(this.uniforms.dt)
        .toConst("returnBodyK");
      If(this.uniforms.returnBodyWeight.greaterThan(float(0.0005)), () => {
        particleVelocity.addAssign(
          returnBodyTargetPos
            .sub(particlePosition)
            .mul(returnBodyK)
            .mul(this.uniforms.returnBodyWeight),
        );
      });

      // Bilobal recall: xz holds lobes; y can release first so mass sinks before lateral dissolves.
      const recallTargetPos = this.recallTargetBuffer
        .element(instanceIndex)
        .get("recallTarget")
        .xyz.toConst("recallTargetPos");
      const toTarget = recallTargetPos
        .sub(particlePosition)
        .toConst("recallToTarget");
      const toLat = vec3(toTarget.x, float(0), toTarget.z).toConst(
        "recallToLat",
      );
      const toVert = vec3(float(0), toTarget.y, float(0)).toConst(
        "recallToVert",
      );
      const k = float(RECALL_STIFFNESS).mul(this.uniforms.dt);
      If(this.uniforms.recallLateralWeight.greaterThan(float(0.0005)), () => {
        particleVelocity.addAssign(
          toLat.mul(k).mul(this.uniforms.recallLateralWeight),
        );
      });
      If(this.uniforms.recallVerticalWeight.greaterThan(float(0.0005)), () => {
        particleVelocity.addAssign(
          toVert.mul(k).mul(this.uniforms.recallVerticalWeight),
        );
      });

      If(this.uniforms.settleWeight.greaterThan(float(0.0005)), () => {
        const settleTargetPos = this.settleTargetBuffer
          .element(instanceIndex)
          .get("settleTarget")
          .xyz.toConst("settleTargetPos");
        const toSettle = settleTargetPos
          .sub(particlePosition)
          .toConst("settleToTarget");
        particleVelocity.addAssign(
          toSettle
            .mul(float(SETTLE_STIFFNESS))
            .mul(this.uniforms.settleWeight)
            .mul(this.uniforms.dt),
        );
      });

      const slowdownDamping = float(1)
        .sub(
          this.uniforms.convergenceSlowdown.mul(
            CONVERGENCE_TUNING.slowdownDamping.scale,
          ),
        )
        .max(float(CONVERGENCE_TUNING.slowdownDamping.floor))
        .toConst("slowdownDamping");
      particleVelocity.mulAssign(slowdownDamping);
      const particleSpeed = particleVelocity.length().toVar("particleSpeed");
      If(particleSpeed.greaterThan(this.uniforms.maxVelocity), () => {
        particleVelocity.mulAssign(
          this.uniforms.maxVelocity.div(particleSpeed),
        );
      });

      this.particleBuffer.element(instanceIndex).get("C").assign(B.mul(4));
      particlePosition.addAssign(particleVelocity.mul(this.uniforms.dt));
      particlePosition.assign(
        clamp(
          particlePosition,
          vec3(GRID_CLAMP_MARGIN),
          this.uniforms.gridSize.sub(GRID_CLAMP_MARGIN),
        ),
      );

      // Keep a one-cell buffer between hard position clamp and soft wall response.
      const xN = particlePosition
        .add(
          particleVelocity
            .mul(this.uniforms.dt)
            .mul(WALL_RESPONSE.predictionScale),
        )
        .toConst("xN");
      const wallMin = vec3(GRID_WALL_MARGIN).toConst("wallMin");
      const wallMax = vec3(this.uniforms.gridSize)
        .sub(GRID_WALL_MARGIN)
        .toConst("wallMax");
      applyWallResponse(particleVelocity.x, xN.x, wallMin.x, wallMax.x);
      applyWallResponse(particleVelocity.y, xN.y, wallMin.y, wallMax.y);
      applyWallResponse(particleVelocity.z, xN.z, wallMin.z, wallMax.z);

      this.particleBuffer
        .element(instanceIndex)
        .get("position")
        .assign(particlePosition);
      this.particleBuffer
        .element(instanceIndex)
        .get("velocity")
        .assign(particleVelocity);

      const direction = this.particleBuffer
        .element(instanceIndex)
        .get("direction")
        .xyz.toVar("particleDirection");
      // Before post-enter, rod orientation can trail velocity. During the arrest
      // proof, authored direction takes ownership and g2p stops rewriting it.
      If(
        this.uniforms.authoredDirectionWeight.greaterThan(float(0.0005)),
        () => {},
      ).Else(() => {
        direction.assign(mix(direction, particleVelocity, 0.1));
      });
      this.particleBuffer
        .element(instanceIndex)
        .get("direction")
        .assign(direction);
      const particleDensity = this.particleBuffer
        .element(instanceIndex)
        .get("density")
        .toConst("particleDensity");
      const previousHeat = this.particleBuffer
        .element(instanceIndex)
        .get("heat")
        .toConst("previousHeat");
      const previousColor = this.particleBuffer
        .element(instanceIndex)
        .get("color")
        .toConst("previousColor");

      const thermalState = buildThermalState({
        uniforms: this.uniforms,
        particleVelocity,
        particlePosition,
        particleDensity,
        previousHeat,
        previousColor,
        dist,
      });
      this.particleBuffer
        .element(instanceIndex)
        .get("color")
        .assign(thermalState.color);
      this.particleBuffer
        .element(instanceIndex)
        .get("heat")
        .assign(thermalState.heat);
    })().compute(1);

    // FORENSIC: one-shot kernel to zero velocity + C on all particles at Enter.
    // Dispatched before the main kernel sequence when _zeroVelocitiesNextFrame is set.
    this.kernels.zeroVelocities = Fn(() => {
      If(
        instanceIndex.greaterThanEqual(uint(this.uniforms.numParticles)),
        () => {
          Return();
        },
      );
      this.particleBuffer.element(instanceIndex).get("velocity").assign(vec3(0));
      this.particleBuffer.element(instanceIndex).get("C").assign(mat3(0));
    })().compute(1);

    // Soft acquire into the authored arrest pose.
    this.kernels.acquireHeroBody = Fn(() => {
      If(
        instanceIndex.greaterThanEqual(uint(this.uniforms.numParticles)),
        () => {
          Return();
        },
      );
      If(
        this.uniforms.heroBodyWeight
          .lessThanEqual(float(0.0005)),
        () => {
          Return();
        },
      );

      const heroTarget = this.heroBodyTargetBuffer
        .element(instanceIndex)
        .get("heroBodyTarget")
        .xyz.toConst("heroBodyTargetPos");
      const armTVal = this.heroBodyTargetBuffer
        .element(instanceIndex)
        .get("heroBodyTarget")
        .w.toConst("armTVal");
      const heroDirection = this.heroBodyDirectionBuffer
        .element(instanceIndex)
        .get("heroBodyDirection")
        .xyz.toConst("heroBodyDirectionPos");
      const baseAlpha = mix(
        float(0.014),
        float(0.045),
        this.uniforms.heroBodyWeight,
      );
      const staggerMul = mix(float(0.45), float(1.35), armTVal);
      const heroAcquireAlpha = baseAlpha
        .mul(staggerMul)
        .clamp(0.005, 0.12)
        .toConst("heroAcquireAlpha");
      const heroDirectionAlpha = mix(
        float(0.08),
        float(0.34),
        this.uniforms.authoredDirectionWeight,
      ).toConst("heroDirectionAlpha");
      const particle = this.particleBuffer.element(instanceIndex);
      const position = particle.get("position").xyz.toVar("heroAcquirePosition");
      const direction = particle
        .get("direction")
        .xyz.toVar("heroAcquireDirection");

      position.assign(mix(position, heroTarget, heroAcquireAlpha));
      direction.assign(
        mix(direction, heroDirection, heroDirectionAlpha).normalize(),
      );
      particle.get("position").assign(position);
      particle.get("direction").assign(direction);
      particle.get("velocity").assign(vec3(0));
      particle.get("C").assign(mat3(0));
    })().compute(1);

    // Hard snap into the authored arrest pose.
    this.kernels.commitHeroBody = Fn(() => {
      If(
        instanceIndex.greaterThanEqual(uint(this.uniforms.numParticles)),
        () => {
          Return();
        },
      );

      const heroTarget = this.heroBodyTargetBuffer
        .element(instanceIndex)
        .get("heroBodyTarget")
        .xyz.toConst("heroCommitTarget");
      const heroDirection = this.heroBodyDirectionBuffer
        .element(instanceIndex)
        .get("heroBodyDirection")
        .xyz.toConst("heroCommitDirection");
      const particle = this.particleBuffer.element(instanceIndex);
      particle.get("position").assign(heroTarget);
      particle.get("velocity").assign(vec3(0));
      particle.get("C").assign(mat3(0));
      particle.get("direction").assign(heroDirection);
      particle.get("density").assign(this.uniforms.restDensity);
      particle.get("dissolveState").assign(vec2(0, 0));
    })().compute(1);

    this.kernels.dissolveToRift = Fn(() => {
      If(
        instanceIndex.greaterThanEqual(uint(this.uniforms.numParticles)),
        () => {
          Return();
        },
      );
      If(this.uniforms.dissolveExtractionT.lessThanEqual(float(0.0001)), () => {
        Return();
      });

      const heroTarget = this.heroBodyTargetBuffer
        .element(instanceIndex)
        .get("heroBodyTarget")
        .xyz.toConst("heroDissolveTarget");
      const particle = this.particleBuffer.element(instanceIndex);
      const position = particle.get("position").xyz.toVar("dissolvePosition");
      const velocity = particle.get("velocity").xyz.toVar("dissolveVelocity");
      const dissolveState = particle.get("dissolveState").toVar("dissolveState");

      const radial = heroTarget
        .sub(this.uniforms.heroCenter)
        .length()
        .div(this.uniforms.heroRadiusMax.max(float(0.0001)))
        .clamp(0, 1)
        .toConst("dissolveRadial");
      const launchTime = float(1)
        .sub(smoothstep(float(0), float(1), radial))
        .mul(this.uniforms.dissolveStaggerSpread)
        .toConst("dissolveLaunchTime");

      If(this.uniforms.dissolveExtractionT.greaterThan(launchTime), () => {
        const extractionLocal = this.uniforms.dissolveExtractionT
          .sub(launchTime)
          .div(float(1).sub(launchTime).max(float(0.0001)))
          .clamp(0, 1)
          .toConst("dissolveExtractionLocal");
        const seamCollapseT = smoothstep(
          float(0.02),
          float(0.68),
          extractionLocal,
        ).toConst("dissolveSeamCollapseT");
        const fadeLeadT = smoothstep(
          float(0.08),
          float(0.8),
          extractionLocal,
        ).toConst("dissolveFadeLeadT");
        const hash = fract(
          sin(instanceIndex.toFloat().mul(12.9898).add(78.233)).mul(43758.5453),
        ).toConst("dissolveHash");
        const anchor = vec3(
          this.uniforms.riftAnchorX.add(
            hash
              .sub(0.5)
              .mul(2)
              .mul(this.uniforms.riftAnchorXJitter)
              .mul(float(1).sub(seamCollapseT.mul(0.72))),
          ),
          this.uniforms.heroCenter.y.add(
            heroTarget.y
              .sub(this.uniforms.heroCenter.y)
              .mul(mix(float(0.34), float(0.12), seamCollapseT)),
          ),
          mix(this.uniforms.heroCenter.z, this.uniforms.riftAnchorZ, float(0.74)),
        ).toConst("dissolveAnchor");

        const toAnchor = anchor.sub(position).toVar("toDissolveAnchor");
        const distance = toAnchor.length().max(float(0.0001)).toConst("dissolveDistance");
        const directionToAnchor = toAnchor
          .div(distance)
          .toConst("dissolveDirectionToAnchor");
        const fadeZoneSpan = this.uniforms.dissolveFadeZoneRadius
          .sub(this.uniforms.dissolveCaptureRadius)
          .max(float(0.0001))
          .toConst("dissolveFadeZoneSpan");
        const fadeZoneT = float(1)
          .sub(
            distance
              .sub(this.uniforms.dissolveCaptureRadius)
              .div(fadeZoneSpan)
              .clamp(0, 1),
          )
          .toConst("dissolveFadeZoneT");

        If(dissolveState.x.lessThan(float(0.5)), () => {
          velocity.addAssign(
            vec3(
              anchor.x.sub(position.x).mul(3.6),
              anchor.y.sub(position.y).mul(1.45),
              anchor.z.sub(position.z).mul(1.2),
            ).mul(this.uniforms.dissolveDt),
          );
          velocity.addAssign(
            directionToAnchor
              .mul(this.uniforms.dissolveAccel)
              .mul(this.uniforms.dissolveDt),
          );
          position.addAssign(velocity.mul(this.uniforms.dissolveDt));

          dissolveState.y.assign(
            dissolveState.y.add(
              this.uniforms.dissolveDt
                .div(this.uniforms.dissolveDecayDuration.max(float(0.0001)))
                .mul(
                  fadeZoneT.mul(0.72).add(fadeLeadT.mul(0.48)),
                ),
            ).clamp(0, 1),
          );

          If(distance.lessThan(this.uniforms.dissolveCaptureRadius), () => {
            dissolveState.x.assign(float(1));
          });
        }).Else(() => {
          velocity.addAssign(
            anchor.sub(position).mul(0.18).mul(this.uniforms.dissolveDt),
          );
          velocity.mulAssign(this.uniforms.dissolveVelocityDamping);
          position.addAssign(velocity.mul(this.uniforms.dissolveDt));
          dissolveState.y.assign(
            dissolveState.y.add(
              this.uniforms.dissolveDt.div(
                this.uniforms.dissolveDecayDuration.max(float(0.0001)),
              ).mul(1.45),
            ).clamp(0, 1),
          );
        });
      });

      particle.get("position").assign(position);
      particle.get("velocity").assign(velocity);
      particle.get("dissolveState").assign(dissolveState);
    })().compute(1);
    this._zeroVelocitiesNextFrame = false;
    this._commitHeroBodyNextFrame = false;
  }

  /** FORENSIC: schedule a one-shot velocity + C zero on the next update() call. */
  scheduleVelocityZero() {
    this._zeroVelocitiesNextFrame = true;
  }

  scheduleHeroBodyCommit() {
    this._commitHeroBodyNextFrame = true;
  }

  setMouseRay(origin, direction, pos) {
    const simScale = this.gridSize.x || 64;
    origin.multiplyScalar(simScale);
    pos.multiplyScalar(simScale);
    origin.add(GRID_POINTER_OFFSET.set((this.gridSize.x || 64) * 0.5, 0, 0));
    this.uniforms.mouseRayDirection.value.copy(direction.normalize());
    this.uniforms.mouseRayOrigin.value.copy(origin);
    this.mousePos.copy(pos);
  }

  async update(interval) {
    if (!this.renderer || !this.particleBuffer || !this.runtime) {
      return;
    }

    const { particles, run, speed } = this.runtime;

    this.syncRuntimeUniforms();

    if (particles !== this.numParticles) {
      this.numParticles = particles;
      this.uniforms.numParticles.value = particles;
      this.kernels.p2g1.count = particles;
      this.kernels.p2g1.updateDispatchCount();
      this.kernels.p2g2.count = particles;
      this.kernels.p2g2.updateDispatchCount();
      this.kernels.g2p.count = particles;
      this.kernels.g2p.updateDispatchCount();
      this.kernels.acquireHeroBody.count = particles;
      this.kernels.acquireHeroBody.updateDispatchCount();
      this.kernels.commitHeroBody.count = particles;
      this.kernels.commitHeroBody.updateDispatchCount();
      this.kernels.dissolveToRift.count = particles;
      this.kernels.dissolveToRift.updateDispatchCount();
    }

    // FORENSIC: dispatch one-shot velocity + C zero before main kernels.
    if (this._zeroVelocitiesNextFrame) {
      this._zeroVelocitiesNextFrame = false;
      this.kernels.zeroVelocities.count = this.numParticles;
      this.kernels.zeroVelocities.updateDispatchCount();
      await this.renderer.computeAsync(this.kernels.zeroVelocities);
    }

    if (this._commitHeroBodyNextFrame) {
      this._commitHeroBodyNextFrame = false;
      await this.renderer.computeAsync(this.kernels.commitHeroBody);
    }

    if (this.runtime.solverLocked) {
      if ((this.runtime.extractionT ?? 0) > 0.0001) {
        this.kernels.dissolveToRift.count = this.numParticles;
        this.kernels.dissolveToRift.updateDispatchCount();
        await this.renderer.computeAsync(this.kernels.dissolveToRift);
        this.markParticleBufferDirty();
      }
      return;
    }

    interval = Math.min(interval, 1 / 60);
    const dt = interval * 6 * speed;
    const substeps = Math.max(1, Math.floor(this.runtime.simSubsteps ?? 1));
    const subDt = dt / substeps;

    this.mousePosArray.push(this.mousePos.clone());
    if (this.mousePosArray.length > 2) {
      this.mousePosArray.shift();
    }
    if (this.mousePosArray.length > 1) {
      this.uniforms.mouseForce.value
        .copy(this.mousePosArray[this.mousePosArray.length - 1])
        .sub(this.mousePosArray[0])
        .multiplyScalar(PARTICLE_FORCE_TUNING.pointer.historyScale);
    } else {
      this.uniforms.mouseForce.value.copy(ZERO_VECTOR);
    }

    if (run) {
      const kernels = [
        this.kernels.clearGrid,
        this.kernels.p2g1,
        this.kernels.p2g2,
        this.kernels.updateGrid,
        this.kernels.g2p,
        this.kernels.acquireHeroBody,
      ];
      for (let i = 0; i < substeps; i++) {
        this.uniforms.dt.value = subDt;
        await this.renderer.computeAsync(kernels);
      }
    }
  }

  setMouseInfluence(value) {
    this.uniforms.mouseInfluence.value = value;
  }
  setMouseActive(value) {
    this.uniforms.mouseActive.value = value ? 1 : 0;
  }

  applyRuntime(runtime) {
    if (!runtime) {
      return;
    }
    this.runtime = runtime;
  }

  syncRuntimeUniforms() {
    const runtime = this.runtime;
    if (!runtime) {
      return;
    }
    const srcMul = runtime.postEnterSourceRadiusMul ?? 1;
    const primarySourceRadius =
      ((runtime.sourceFieldRadii.x +
        runtime.sourceFieldRadii.y +
        runtime.sourceFieldRadii.z) /
        3) *
      runtime.sourceRadiusScale.primary *
      srcMul;
    const secondarySourceRadius =
      ((runtime.sourceFieldSecondaryRadii.x +
        runtime.sourceFieldSecondaryRadii.y +
        runtime.sourceFieldSecondaryRadii.z) /
        3) *
      runtime.sourceRadiusScale.secondary *
      srcMul;

    this.uniforms.noise.value = runtime.noise;
    this.uniforms.stiffness.value = runtime.stiffness;
    const gNorm = Math.max(0, Math.min(runtime.gravity ?? 0, 1));
    this.uniforms.gravity.value.set(0, -0.2 * gNorm, 0);
    this.uniforms.dynamicViscosity.value = runtime.dynamicViscosity;
    this.uniforms.apicBlend.value = runtime.apicBlend;
    this.uniforms.maxVelocity.value = runtime.maxVelocity;
    this.uniforms.restDensity.value = runtime.restDensity;
    this.uniforms.sourceFieldCenter.value.copy(runtime.sourceFieldCenter);
    this.uniforms.sourceFieldSecondaryCenter.value.copy(
      runtime.sourceFieldSecondaryCenter,
    );
    this.uniforms.sourceFieldRadius.value = primarySourceRadius;
    this.uniforms.sourceFieldSecondaryRadius.value = secondarySourceRadius;
    this.uniforms.convergenceSlowdown.value = runtime.convergenceSlowdown;
    this.uniforms.convergenceFreeze.value = runtime.convergenceFreeze;
    this.uniforms.convergenceHeatRetention.value =
      runtime.convergenceHeatRetention;
    const ext = runtime.convergenceThermalExtinction ?? 0;
    const dissolveUnlock = runtime.settleDissolveUnlocked === 0 ? 0 : 1;
    this.uniforms.convergenceThermalExtinction.value = ext * dissolveUnlock;
    this.uniforms.heroBodyWeight.value = runtime.heroBodyWeight ?? 0;
    this.uniforms.authoredDirectionWeight.value =
      runtime.authoredDirectionWeight ?? 0;
    this.uniforms.returnBodyWeight.value = runtime.returnBodyWeight ?? 0;
    this.uniforms.recallLateralWeight.value = runtime.recallLateralWeight ?? 0;
    this.uniforms.recallVerticalWeight.value =
      runtime.recallVerticalWeight ?? 0;
    this.uniforms.settleWeight.value = runtime.settleWeight ?? 0;
    this.uniforms.dissolveExtractionT.value = runtime.extractionT ?? 0;
    this._syncDissolveAnchors();
  }

  markParticleBufferDirty() {
    const b = this.particleBuffer?.buffer;
    if (!b) return;
    b.needsUpdate = true;
    if (b.value) b.value.needsUpdate = true;
  }

  captureInitialParticlePositions() {
    if (
      !this.particleBuffer?.floatArray ||
      !this.particleBuffer?.layout?.position
    ) {
      return;
    }

    const particleCount = this.particleBuffer.length || 0;
    const basePositions = new Float32Array(particleCount * 3);
    const positionOffset = this.particleBuffer.layout.position.offset;

    for (let i = 0; i < particleCount; i++) {
      const baseIndex = i * 3;
      const sourceIndex = i * this.particleBuffer.structSize + positionOffset;
      basePositions[baseIndex + 0] =
        this.particleBuffer.floatArray[sourceIndex + 0];
      basePositions[baseIndex + 1] =
        this.particleBuffer.floatArray[sourceIndex + 1];
      basePositions[baseIndex + 2] =
        this.particleBuffer.floatArray[sourceIndex + 2];
    }

    this.initialParticlePositions = basePositions;
  }

  carvePopulationSlit({ splitPush = 1.8, gapWidth = 3.2 } = {}) {
    if (
      !this.runtime ||
      !this.particleBuffer ||
      !this.initialParticlePositions
    ) {
      return;
    }

    const particleCount = this.particleBuffer.length || 0;
    if (particleCount <= 0) {
      return;
    }

    const splitAxis = new THREE.Vector3(1, 0, 0);
    const splitMidpoint = this.runtime.chamberFlowCenter.clone();
    const flowDirection = this.runtime.ventAxis.clone();
    if (flowDirection.lengthSq() < 1e-6) {
      flowDirection.set(0, 1, 0);
    } else {
      flowDirection.normalize();
    }

    const particlePosition = new THREE.Vector3();
    const clampedMax = this.gridSize.clone().subScalar(GRID_CLAMP_MARGIN);
    const zeroVelocity = [0, 0, 0];
    const zeroColor = [0, 0, 0];
    const zeroMat3 = new Array(12).fill(0);
    const resetParticleState = (index) => {
      this.particleBuffer.set(index, "velocity", zeroVelocity);
      this.particleBuffer.set(index, "C", zeroMat3);
      this.particleBuffer.set(index, "density", this.runtime.restDensity);
      this.particleBuffer.set(index, "direction", flowDirection);
      this.particleBuffer.set(index, "color", zeroColor);
      this.particleBuffer.set(index, "heat", 0);
      this.particleBuffer.set(index, "dissolveState", [0, 0]);
    };

    for (let i = 0; i < particleCount; i++) {
      const baseIndex = i * 3;
      particlePosition.set(
        this.initialParticlePositions[baseIndex + 0],
        this.initialParticlePositions[baseIndex + 1],
        this.initialParticlePositions[baseIndex + 2],
      );

      applySlitDisplacement(
        particlePosition,
        splitMidpoint,
        splitAxis,
        gapWidth,
        splitPush,
      );

      particlePosition.clamp(
        new THREE.Vector3(
          GRID_CLAMP_MARGIN,
          GRID_CLAMP_MARGIN,
          GRID_CLAMP_MARGIN,
        ),
        clampedMax,
      );

      this.particleBuffer.set(i, "position", particlePosition);
      resetParticleState(i);
    }

    this.markParticleBufferDirty();
  }

  /**
   * Copies the canonical slit-carved CPU body directly into `returnBodyTargetBuffer`.
   *
   * Called only after `carvePopulationSlit()` while `particleBuffer.floatArray` still reflects
   * the freshly authored CPU body we want to restore during post-enter compress/hold.
   */
  buildCanonicalReturnBodyTargets() {
    if (
      !this.particleBuffer?.floatArray ||
      !this.returnBodyTargetBuffer ||
      !this.particleBuffer.layout?.position
    ) {
      return;
    }

    const positionOffset = this.particleBuffer.layout.position.offset;
    const structSize = this.particleBuffer.structSize;
    const fa = this.particleBuffer.floatArray;
    const cap = this.particleBuffer.length || 0;
    const particleCount = Math.min(
      this.numParticles > 0
        ? this.numParticles
        : (this.runtime?.particles ?? cap),
      cap,
    );
    if (particleCount <= 0) {
      return;
    }

    for (let i = 0; i < particleCount; i++) {
      const pi = i * structSize + positionOffset;
      this.returnBodyTargetBuffer.set(i, "returnBodyTarget", [
        fa[pi + 0],
        fa[pi + 1],
        fa[pi + 2],
        0,
      ]);
    }

    const b = this.returnBodyTargetBuffer.buffer;
    if (b) { b.needsUpdate = true; if (b.value) b.value.needsUpdate = true; }
  }

  /**
   * Copies **CPU** `particleBuffer` positions into `recallTargetBuffer`.
   *
   * **Safe call sites only:** right after **CPU-side** writes (e.g. end of `carvePopulationSlit`),
   * where `particleBuffer.floatArray` matches what will be uploaded. Do **not** call every frame
   * after `computeAsync` — WebGPU updates particle state on the GPU; reading `floatArray` then
   * yields stale/mismatched targets vs the simulated state, which explodes recall forces.
   */
  captureRecallTargetsFromLiveParticles() {
    if (
      !this.particleBuffer?.floatArray ||
      !this.recallTargetBuffer ||
      !this.particleBuffer.layout?.position
    ) {
      return;
    }

    const positionOffset = this.particleBuffer.layout.position.offset;
    const structSize = this.particleBuffer.structSize;
    const fa = this.particleBuffer.floatArray;
    const cap = this.particleBuffer.length || 0;
    const particleCount = Math.min(
      this.numParticles > 0
        ? this.numParticles
        : (this.runtime?.particles ?? cap),
      cap,
    );
    if (particleCount <= 0) {
      return;
    }

    for (let i = 0; i < particleCount; i++) {
      const pi = i * structSize + positionOffset;
      this.recallTargetBuffer.set(i, "recallTarget", [
        fa[pi + 0],
        fa[pi + 1],
        fa[pi + 2],
        0,
      ]);
    }

    const b = this.recallTargetBuffer.buffer;
    if (b) { b.needsUpdate = true; if (b.value) b.value.needsUpdate = true; }

    this.deriveSettleTargetsFromRecall();
  }

  /**
   * Builds recall targets for the bilobal recall spring from the slit-carved CPU positions.
   *
   * Called once right after `carvePopulationSlit()` in `seedMatureIdlePopulation()`, before
   * any GPU compute steps, so `particleBuffer.floatArray` holds fresh CPU-written positions.
   *
   * Targets:
   *   X  — clamped to ±`RECALL_X_HALF_MAX` from center (keeps targets off grid walls)
   *   Y  — compressed around `chamberFlowCenter.y` by `RECALL_Y_COMPRESS`, then clamped
   *        to the safe sim range so the volumetric bilobal stays compact without entering
   *        the hard wall zone
   *   Z  — lightly compressed toward `chamberFlowCenter.z` (lighter than settle)
   *
   * `deriveSettleTargetsFromRecall` is called afterward so settle targets always
   * derive from a coherent recall basis.
   */
  buildAnalyticalRecallTargets() {
    if (
      !this.particleBuffer?.floatArray ||
      !this.recallTargetBuffer ||
      !this.runtime?.chamberFlowCenter ||
      !this.particleBuffer.layout?.position ||
      !this.gridSize
    ) {
      return;
    }

    const posOff = this.particleBuffer.layout.position.offset;
    const structSize = this.particleBuffer.structSize;
    const fa = this.particleBuffer.floatArray;
    const cap = this.particleBuffer.length || 0;
    const particleCount = Math.min(
      this.numParticles > 0
        ? this.numParticles
        : (this.runtime?.particles ?? cap),
      cap,
    );
    if (particleCount <= 0) return;

    const mx = this.runtime.chamberFlowCenter.x;
    const my = this.runtime.chamberFlowCenter.y;
    const mz = this.runtime.chamberFlowCenter.z;
    const ymin = GRID_CLAMP_MARGIN;
    const ymax = this.gridSize.y - GRID_CLAMP_MARGIN;

    let minRecallX = Infinity;
    let maxRecallX = -Infinity;
    let minRecallY = Infinity;
    let maxRecallY = -Infinity;

    for (let i = 0; i < particleCount; i++) {
      const pi = i * structSize + posOff;
      const rx = fa[pi + 0]; // carve X — lobe-side already correct from slit
      const ry = fa[pi + 1]; // sphere Y — vertically compressed for a tighter bilobal volume
      const rz = fa[pi + 2]; // carve Z — compress lightly toward chamber center

      // Cap X displacement so no recall target falls into the grid wall zone.
      const sxRaw = rx - mx;
      const recallX =
        mx + Math.sign(sxRaw) * Math.min(Math.abs(sxRaw), RECALL_X_HALF_MAX);
      const recallY = THREE.MathUtils.clamp(
        my + (ry - my) * RECALL_Y_COMPRESS,
        ymin,
        ymax,
      );

      this.recallTargetBuffer.set(i, "recallTarget", [
        recallX,
        recallY,
        mz + (rz - mz) * RECALL_Z_COMPRESS,
        0,
      ]);

      if (recallX < minRecallX) minRecallX = recallX;
      if (recallX > maxRecallX) maxRecallX = recallX;
      if (recallY < minRecallY) minRecallY = recallY;
      if (recallY > maxRecallY) maxRecallY = recallY;
    }

    if (forensicEnabled()) {
      console.log("[forensic] recallTarget bounds (sim)", {
        minX: minRecallX,
        maxX: maxRecallX,
        minY: minRecallY,
        maxY: maxRecallY,
        particleCount,
      });
    }

    const b2 = this.recallTargetBuffer.buffer;
    if (b2) { b2.needsUpdate = true; if (b2.value) b2.value.needsUpdate = true; }

    this.deriveSettleTargetsFromRecall();
  }

  /**
   * Builds deterministic arrest targets as two curved `V` arms plus authored
   * rod directions for the isolated committed hold.
   */
  buildHeroBodyTargets() {
    if (
      !this.particleBuffer?.floatArray ||
      !this.heroBodyTargetBuffer ||
      !this.heroBodyDirectionBuffer ||
      !this.particleBuffer.layout?.position ||
      !this.heroBodyTargetBuffer.layout?.heroBodyTarget ||
      !this.heroBodyDirectionBuffer.layout?.heroBodyDirection ||
      !this.runtime?.chamberFlowCenter ||
      !this.gridSize
    ) {
      return;
    }

    const posOff = this.particleBuffer.layout.position.offset;
    const structSize = this.particleBuffer.structSize;
    const fa = this.particleBuffer.floatArray;
    const cap = this.particleBuffer.length || 0;
    const particleCount = Math.min(
      this.numParticles > 0
        ? this.numParticles
        : (this.runtime?.particles ?? cap),
      cap,
    );
    if (particleCount <= 0) {
      return;
    }

    const mx = this.runtime.chamberFlowCenter.x;
    const my = this.runtime.chamberFlowCenter.y;
    const mz = this.runtime.chamberFlowCenter.z;
    const H = HERO_POINT_CLOUD;
    const minBound = GRID_CLAMP_MARGIN + H.safetyMargin;
    const maxX = this.gridSize.x - GRID_CLAMP_MARGIN - H.safetyMargin;
    const maxY = this.gridSize.y - GRID_CLAMP_MARGIN - H.safetyMargin;
    const maxZ = this.gridSize.z - GRID_CLAMP_MARGIN - H.safetyMargin;
    // Contour control points (center-relative, 2D frontal plane); scale around tip anchor innerFoot
    const ax = H.innerFoot[0];
    const ay = H.innerFoot[1];
    const cs = H.contourScale;
    const sc = (p) => [ax + (p[0] - ax) * cs, ay + (p[1] - ay) * cs];
    const oS = sc(H.outerShoulder);
    const oM = sc(H.outerMid);
    const oF = sc(H.outerFoot);
    const iS = sc(H.innerShoulder);
    const iM = sc(H.innerMid);
    const iF = sc(H.innerFoot);
    const authoredDirection = new THREE.Vector3();
    let cohortCountHero = 0;
    let cohortCountSupport = 0;
    let cohortCountBulk = 0;

    for (let i = 0; i < particleCount; i++) {
      const pi = i * structSize + posOff;
      const rx = fa[pi + 0];
      const side = rx - mx >= 0 ? 1 : -1;

      const u0 = hash01(i, H.seeds.u0);
      const u1 = hash01(i, H.seeds.u1);
      const u2 = hash01(i, H.seeds.u2);
      const roleU = hash01(i, H.seeds.role);
      let cohortRole;
      if (roleU > H.roleHeroMin) {
        cohortRole = 1;
        cohortCountHero++;
      } else if (roleU > H.roleSupportMin) {
        cohortRole = 0.5;
        cohortCountSupport++;
      } else {
        cohortRole = 0;
        cohortCountBulk++;
      }

      // ── armT: position along arm (0 = shoulder, 1 = foot) ──
      const armT = Math.pow(u1, 0.86);
      const t = armT;
      const omt = 1 - t;
      const omt2 = omt * omt;
      const t2 = t * t;
      const apexThinT = THREE.MathUtils.smoothstep(armT, 0.58, 1.0);
      const frontalChance = THREE.MathUtils.lerp(
        H.frontalPercentage,
        H.frontalApexPercentage,
        apexThinT,
      );

      // ── Evaluate contours at armT (quadratic Bezier, 2D frontal plane) ──
      const innerX = omt2 * iS[0] + 2 * omt * t * iM[0] + t2 * iF[0];
      const innerY = omt2 * iS[1] + 2 * omt * t * iM[1] + t2 * iF[1];
      const outerX = omt2 * oS[0] + 2 * omt * t * oM[0] + t2 * oF[0];
      const outerY = omt2 * oS[1] + 2 * omt * t * oM[1] + t2 * oF[1];

      // ── 2.5D Layer Allocation ──
      const isFrontal = u2 < frontalChance;

      let crossT;
      let pz = 0;
      let isRear = false;

      if (isFrontal) {
        const roleCrossStart =
          cohortRole >= 1 ? 0.58 : cohortRole >= 0.5 ? 0.28 : 0.08;

        const roleCrossEnd =
          cohortRole >= 1 ? 1.0 : cohortRole >= 0.5 ? 0.78 : 0.44;

        crossT = THREE.MathUtils.lerp(roleCrossStart, roleCrossEnd, u0);

        const innerFrontDepth = THREE.MathUtils.lerp(0.1, -0.08, armT);
        const outerFrontDepth = THREE.MathUtils.lerp(1.92, 0.1, armT);

        const frontBaseDepth = THREE.MathUtils.lerp(
          innerFrontDepth,
          outerFrontDepth,
          crossT,
        );

        const depthTaper = Math.pow(1 - armT, 1.28);
        const pseudoHashZ = (u0 * 37.1 + u1 * 19.3) % 1.0;

        const roleFrontLift =
          cohortRole >= 1
            ? 0.18 * (1 - armT)
            : cohortRole >= 0.5
              ? 0.05 * (1 - armT)
              : -0.03;

        pz =
          frontBaseDepth * depthTaper +
          roleFrontLift +
          (pseudoHashZ - 0.5) *
            H.frontalThickness *
            Math.pow(1 - armT, 1.35);
      } else {
        isRear = true;
        crossT = THREE.MathUtils.lerp(0.18, 0.58, u0);

        const innerRearDepth = THREE.MathUtils.lerp(-0.62, -0.03, armT);
        const outerRearDepth = THREE.MathUtils.lerp(-1.45, -0.05, armT);

        const rearBaseDepth = THREE.MathUtils.lerp(
          innerRearDepth,
          outerRearDepth,
          crossT,
        );

        const rearRoleMul =
          cohortRole >= 1 ? 0.25 : cohortRole >= 0.5 ? 0.55 : 0.82;

        pz = rearBaseDepth * Math.pow(1 - armT, 1.95) * rearRoleMul;
      }

      // ── Cross-arm interpolation (frontal plane) ──
      const px = THREE.MathUtils.lerp(innerX, outerX, crossT);
      const py = THREE.MathUtils.lerp(innerY, outerY, crossT);

      // ── Slit clamp: taper the slit allowance to 0 near the foot so the V can merge ──
      // Smoothstep ensures the top half preserves the full `minSlitHalf` gap, but the bottom closes.
      const slitProtection = H.minSlitHalf * (1 - THREE.MathUtils.smoothstep(armT, 0.5, 1.0));
      
      const rawX = side * px;
      const clampedX =
        side > 0
          ? Math.max(rawX, slitProtection)
          : Math.min(rawX, -slitProtection);

      // ── Direction: arm tangent + subordinate rear direction ──
      const armTanX = 2 * omt * (oM[0] - oS[0]) + 2 * t * (oF[0] - oM[0]);
      const armTanY = 2 * omt * (oM[1] - oS[1]) + 2 * t * (oF[1] - oM[1]);
      const tLen = Math.sqrt(armTanX * armTanX + armTanY * armTanY) || 1;
      
      if (isRear) {
        // Rear particles have subordinate, simpler direction. Mostly tangent, pushed slightly backward.
        authoredDirection
          .set(side * armTanX / tLen, armTanY / tLen, -H.directionRearBias)
          .normalize();
      } else {
        // Frontal particles respect the cross-contour edges
        const crossDirX = outerX - innerX;
        const crossDirY = outerY - innerY;
        const cLen = Math.sqrt(crossDirX * crossDirX + crossDirY * crossDirY) || 1;
        const crossMix = crossT < 0.3 || crossT > 0.7 ? 0.3 : 0.1;
        authoredDirection
          .set(
            side * (armTanX / tLen + crossMix * (crossDirX / cLen)),
            armTanY / tLen + crossMix * (crossDirY / cLen),
            H.directionForwardBias,
          )
          .normalize();
      }

      // ── Final position: center-relative → sim-space (one translation) ──
      const hx = THREE.MathUtils.clamp(
        mx + H.centerX + clampedX,
        minBound,
        maxX,
      );
      const hy = THREE.MathUtils.clamp(
        my + H.centerY + py,
        minBound,
        maxY,
      );
      const hz = THREE.MathUtils.clamp(
        mz + H.centerZ + pz,
        minBound,
        maxZ,
      );

      this.heroBodyTargetBuffer.set(i, "heroBodyTarget", [hx, hy, hz, armT]);
      this.heroBodyDirectionBuffer.set(i, "heroBodyDirection", [
        authoredDirection.x,
        authoredDirection.y,
        authoredDirection.z,
        0,
      ]);
    }

    if (particleCount > 0) {
      const pctHero = ((cohortCountHero / particleCount) * 100).toFixed(1);
      const pctSupport = ((cohortCountSupport / particleCount) * 100).toFixed(1);
      const pctBulk = ((cohortCountBulk / particleCount) * 100).toFixed(1);
      console.log(
        `[hero cohort] hero ${pctHero}% / support ${pctSupport}% / bulk ${pctBulk}% (n=${particleCount})`,
      );
    }

    const hb = this.heroBodyTargetBuffer.buffer;
    if (hb) {
      hb.needsUpdate = true;
      if (hb.value) hb.value.needsUpdate = true;
    }
    const hd = this.heroBodyDirectionBuffer.buffer;
    if (hd) {
      hd.needsUpdate = true;
      if (hd.value) hd.value.needsUpdate = true;
    }

    // Parked for Pass B: late claim anchors still derive from the arrest volume.
    this._syncDissolveAnchors();
  }

  _syncDissolveAnchors() {
    if (!this.runtime?.chamberFlowCenter || !this.uniforms?.heroCenter) {
      return;
    }
    const H = HERO_POINT_CLOUD;
    const mx = this.runtime.chamberFlowCenter.x;
    const my = this.runtime.chamberFlowCenter.y;
    const mz = this.runtime.chamberFlowCenter.z;
    this.uniforms.heroCenter.value.set(mx, my + H.centerY, mz + H.centerZ);
    this.uniforms.heroRadiusMax.value = Math.max(
      H.radiusX,
      H.radiusY,
      H.radiusZ,
    );
    this.uniforms.riftAnchorX.value = mx;
    this.uniforms.riftAnchorZ.value = mz;
    this.uniforms.riftAnchorXJitter.value = H.radiusX * 0.08;
  }

  /**
   * Authored settle targets from idle `recallTarget`: fixed-sign banks, slit, heavy floor.
   */
  deriveSettleTargetsFromRecall() {
    if (
      !this.recallTargetBuffer?.floatArray ||
      !this.settleTargetBuffer ||
      !this.runtime?.chamberFlowCenter ||
      !this.gridSize
    ) {
      return;
    }

    const recallOff = this.recallTargetBuffer.layout?.recallTarget?.offset;
    if (recallOff === undefined) {
      return;
    }

    const cap = this.recallTargetBuffer.length || 0;
    const particleCount = Math.min(
      this.numParticles > 0
        ? this.numParticles
        : (this.runtime?.particles ?? cap),
      cap,
    );
    if (particleCount <= 0) {
      return;
    }

    const rs = this.recallTargetBuffer.structSize;
    const rfa = this.recallTargetBuffer.floatArray;

    const gap = IDLE_SLIT_PARAMS.gapWidth;
    const mx = this.runtime.chamberFlowCenter.x;
    const mz = this.runtime.chamberFlowCenter.z;
    const ymin = GRID_CLAMP_MARGIN + 1.15;
    const ymax = this.gridSize.y - GRID_CLAMP_MARGIN - 1.1;
    const V = SETTLE_VOLUME;

    for (let i = 0; i < particleCount; i++) {
      const ri = i * rs + recallOff;
      const rx = rfa[ri + 0];
      const rz = rfa[ri + 2];

      const sxRaw = rx - mx;
      const sign = sxRaw >= 0 ? 1 : -1;
      const bankCx = mx + sign * V.bankPeakX;

      let baseX;
      if (Math.abs(sxRaw) < gap) {
        baseX = mx + sign * gap * V.slitEdgeScale;
      } else {
        baseX = rx;
      }

      const x = baseX + (bankCx - baseX) * V.xBankPull;

      const z = mz + (rz - mz) * V.zCompress;

      const ax = Math.abs(x - mx);
      const distRift = Math.max(0, ax - gap);
      const heapBell = Math.exp(
        -(distRift * distRift) / (2 * V.bankHeapSigma * V.bankHeapSigma),
      );
      const riftBell = Math.exp(-(ax * ax) / (2 * V.riftYSigma * V.riftYSigma));

      let y = ymin + V.outerBankLift * heapBell - V.riftYDrop * riftBell;

      if (V.recallYBlend > 0) {
        const ry = rfa[ri + 1];
        y +=
          (ry - y) *
          V.recallYBlend *
          Math.min(1, Math.max(0, (ry - ymin) / 14));
      }

      if (y < ymin) {
        y = ymin;
      } else if (y > ymax) {
        y = ymax;
      }

      this.settleTargetBuffer.set(i, "settleTarget", [x, y, z, 0]);
    }

    const sb = this.settleTargetBuffer.buffer;
    if (sb) { sb.needsUpdate = true; if (sb.value) sb.value.needsUpdate = true; }
  }

  seedMatureIdlePopulation() {
    this.carvePopulationSlit({
      splitPush: IDLE_SLIT_PARAMS.splitPush,
      gapWidth: IDLE_SLIT_PARAMS.gapWidth,
    });
    this.buildCanonicalReturnBodyTargets();
    this.buildAnalyticalRecallTargets();
    this.buildHeroBodyTargets();
  }

  dispose() {
    this.mousePosArray = [];
    this.mousePos = null;
    this.initialParticlePositions = null;
    this.recallTargetBuffer = null;
    this.heroBodyTargetBuffer = null;
    this.heroBodyDirectionBuffer = null;
    this.returnBodyTargetBuffer = null;
    this.settleTargetBuffer = null;
    this.kernels = {};
    this.uniforms = {};
    this.particleBuffer = null;
    this.cellBuffer = null;
    this.cellBufferF = null;
    this.renderer = null;
    this.runtime = null;
  }
}

export default mlsMpmSimulator;
