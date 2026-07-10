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

const RIFT_FLIGHT_TUNING = Object.freeze({
  occluderHalfWidth: 2.8,
  innerBankHalfWidth: 8.5,
  targetBands: 24,
  targetJitterX: 0.32,
  targetJitterZ: 0.22,
  role0Delay: [1.1, 1.35],
  role1Delay: [2.5, 2.7],
  role2Delay: [2.55, 2.85],
  role3Delay: [3.5, 4.1],
  role0Duration: 1.1,
  role1Duration: 1.3,
  role2Duration: 1.5,
  role3Duration: 0.65,
  stragglerRate: 0.05,
});
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

const hash01Node = (seed) =>
  fract(sin(float(instanceIndex).add(1).mul(seed)).mul(43758.5453123));

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
    .mul(uniforms.postEnterHoverClamp)
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
    this.riftFlightStartBuffer = new StructuredArray(
      { riftFlightStart: { type: "vec4" } },
      maxParticles,
      "riftFlightStartData",
    );
    this.riftFlightTargetBuffer = new StructuredArray(
      { riftFlightTarget: { type: "vec4" } },
      maxParticles,
      "riftFlightTargetData",
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
    this.uniforms.postEnterArrestT = uniform(0);
    this.uniforms.postEnterFlightSec = uniform(0);
    this.uniforms.postEnterFlightDebugFrozen = uniform(0);
    this.uniforms.chamberFlowCenter = uniform(new THREE.Vector3());
    this.uniforms.riftTargetMin = uniform(new THREE.Vector3(32, 5.5, 58));
    this.uniforms.riftTargetMax = uniform(new THREE.Vector3(32, 58.5, 58));
    this.uniforms.riftTargetCenter = uniform(new THREE.Vector3(32, 31.8, 58));
    this.uniforms.mouseInfluence = uniform(1);
    this.uniforms.mouseActive = uniform(0);
    this.uniforms.postEnterHoverClamp = uniform(1);
    this.uniforms.postEnterThermalColorLock = uniform(0);
    this.uniforms.returnBodyWeight = uniform(0);
    this.uniforms.recallLateralWeight = uniform(0);
    this.uniforms.recallVerticalWeight = uniform(0);
    this.uniforms.settleWeight = uniform(0);
    /** Rigid offset added to settle targets (Lenox gaze); zero = chamber behavior. */
    this.uniforms.settleOffset = uniform(new THREE.Vector3());
    /** Vertical squash of settle targets around `settleSquashCenter` (Lenox pulse); 1 = identity. */
    this.uniforms.settleSquashT = uniform(1);
    this.uniforms.settleSquashCenter = uniform(32);
    /** Rigid drift applied to ALL settle targets (Lenox float/sway); zero = chamber behavior. */
    this.uniforms.settleBob = uniform(new THREE.Vector3());

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
        const settleData = this.settleTargetBuffer
          .element(instanceIndex)
          .get("settleTarget")
          .toConst("settleData");
        // w = focal weight (Lenox): focal particles follow the gaze offset
        // fully, shell density stays anchored. Chamber targets author w=0.
        // Role bands in w: 0 shell · 0.3 aura · 0.6 lid · 1 focal.
        // Only the focal core follows the gaze offset fully.
        const settleFocalW = smoothstep(
          float(0.85),
          float(0.98),
          settleData.w.clamp(0, 1),
        ).toConst("settleFocalW");
        // Vertical squash toward the ocular centerline (blink/squint); 1 = identity.
        const settleSquashedY = mix(
          this.uniforms.settleSquashCenter,
          settleData.y,
          this.uniforms.settleSquashT.clamp(0, 1.2),
        ).toConst("settleSquashedY");
        const settleTargetPos = vec3(settleData.x, settleSquashedY, settleData.z)
          .add(this.uniforms.settleBob)
          .add(
            // Gaze hierarchy: focal/attention particles carry the gaze;
            // the shell stays spatially anchored (0) so the presence never
            // destabilizes when looking around.
            this.uniforms.settleOffset.mul(
              mix(float(0.0), float(1.0), settleFocalW),
            ),
          )
          .toConst("settleTargetPos");
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
      direction.assign(mix(direction, particleVelocity, 0.1));
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
      const thermalColorLock = this.uniforms.postEnterThermalColorLock
        .clamp(0, 1)
        .toConst("thermalColorLock");
      const lockedColor = mix(
        thermalState.color,
        previousColor,
        thermalColorLock,
      ).toConst("lockedThermalColor");
      const lockedHeat = mix(
        thermalState.heat,
        previousHeat,
        thermalColorLock,
      ).toConst("lockedThermalHeat");
      this.particleBuffer
        .element(instanceIndex)
        .get("color")
        .assign(lockedColor);
      this.particleBuffer
        .element(instanceIndex)
        .get("heat")
        .assign(lockedHeat);
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
      this.particleBuffer.element(instanceIndex).get("dissolveState").assign(vec2(0, 0));
    })().compute(1);
    this._zeroVelocitiesNextFrame = false;

    this.kernels.postEnterArrestDamp = Fn(() => {
      If(
        instanceIndex.greaterThanEqual(uint(this.uniforms.numParticles)),
        () => {
          Return();
        },
      );

      const particle = this.particleBuffer.element(instanceIndex);
      const particlePosition = particle
        .get("position")
        .xyz.toVar("arrestPosition");
      const particleVelocity = particle
        .get("velocity")
        .xyz.toVar("arrestVelocity");
      const arrestT = this.uniforms.postEnterArrestT
        .clamp(0, 1)
        .toConst("arrestT");
      const dampCurve = smoothstep(float(0.05), float(1.0), arrestT).toConst(
        "arrestDampCurve",
      );
      const moveScale = mix(float(0.72), float(0.035), dampCurve).toConst(
        "arrestMoveScale",
      );
      const dampPerFrame = mix(float(0.94), float(0.22), dampCurve).toConst(
        "arrestDampPerFrame",
      );
      const damping = pow(
        dampPerFrame,
        this.uniforms.dt.mul(60).clamp(0, 1.25),
      ).toConst("arrestDamping");

      particlePosition.addAssign(
        particleVelocity.mul(this.uniforms.dt).mul(moveScale),
      );
      particlePosition.assign(
        clamp(
          particlePosition,
          vec3(GRID_CLAMP_MARGIN),
          this.uniforms.gridSize.sub(GRID_CLAMP_MARGIN),
        ),
      );

      const nextVelocity = particleVelocity
        .mul(damping)
        .mul(float(1).sub(smoothstep(float(0.82), float(1.0), arrestT)))
        .toConst("arrestNextVelocity");
      const previousDirection = particle
        .get("direction")
        .xyz.toConst("arrestPreviousDirection");
      const nextDirection = mix(
        previousDirection,
        nextVelocity.add(previousDirection.mul(0.12)),
        smoothstep(float(0.08), float(0.78), arrestT).mul(0.12),
      ).toConst("arrestNextDirection");
      const cSettleT = smoothstep(float(0.78), float(1.0), arrestT).toConst(
        "arrestCSettleT",
      );

      particle.get("position").assign(particlePosition);
      particle.get("velocity").assign(nextVelocity);
      particle.get("direction").assign(nextDirection);
      If(cSettleT.greaterThan(float(0.995)), () => {
        particle.get("C").assign(mat3(0));
      });
    })().compute(1);

    this.kernels.initPostEnterRiftFlight = Fn(() => {
      If(
        instanceIndex.greaterThanEqual(uint(this.uniforms.numParticles)),
        () => {
          Return();
        },
      );

      const particle = this.particleBuffer.element(instanceIndex);
      const startPos = particle.get("position").xyz.toConst("riftStartPos");
      const hDelay = hash01Node(17.31).toConst("riftDelayHash");
      const hBand = hash01Node(29.73).toConst("riftBandHash");
      const hX = hash01Node(41.19).toConst("riftXHash");
      const hZ = hash01Node(53.87).toConst("riftZHash");
      const hStraggler = hash01Node(71.43).toConst("riftStragglerHash");
      const absDx = startPos.x
        .sub(this.uniforms.chamberFlowCenter.x)
        .abs()
        .toConst("riftAbsDx");

      const delaySec = float(0).toVar("riftDelaySec");
      const durationSec = float(RIFT_FLIGHT_TUNING.role2Duration).toVar(
        "riftDurationSec",
      );

      const role2Spread = smoothstep(
        float(RIFT_FLIGHT_TUNING.innerBankHalfWidth),
        float(24),
        absDx,
      );
      delaySec.assign(
        mix(
          float(RIFT_FLIGHT_TUNING.role2Delay[0]),
          float(RIFT_FLIGHT_TUNING.role2Delay[1]),
          role2Spread,
        ).add(hDelay.mul(0.12)),
      );

      If(absDx.lessThan(float(RIFT_FLIGHT_TUNING.innerBankHalfWidth)), () => {
        const innerSpread = smoothstep(
          float(RIFT_FLIGHT_TUNING.occluderHalfWidth),
          float(RIFT_FLIGHT_TUNING.innerBankHalfWidth),
          absDx,
        );
        delaySec.assign(
          mix(
            float(RIFT_FLIGHT_TUNING.role1Delay[0]),
            float(RIFT_FLIGHT_TUNING.role1Delay[1]),
            innerSpread,
          ).add(hDelay.mul(0.08)),
        );
        durationSec.assign(float(RIFT_FLIGHT_TUNING.role1Duration));
      });

      If(absDx.lessThan(float(RIFT_FLIGHT_TUNING.occluderHalfWidth)), () => {
        const centerSpread = absDx
          .div(float(RIFT_FLIGHT_TUNING.occluderHalfWidth))
          .clamp(0, 1);
        delaySec.assign(
          mix(
            float(RIFT_FLIGHT_TUNING.role0Delay[0]),
            float(RIFT_FLIGHT_TUNING.role0Delay[1]),
            centerSpread,
          ).add(hDelay.mul(0.05)),
        );
        durationSec.assign(float(RIFT_FLIGHT_TUNING.role0Duration));
      });

      If(
        absDx
          .greaterThanEqual(float(RIFT_FLIGHT_TUNING.occluderHalfWidth))
          .and(hStraggler.lessThan(float(RIFT_FLIGHT_TUNING.stragglerRate))),
        () => {
          delaySec.assign(
            mix(
              float(RIFT_FLIGHT_TUNING.role3Delay[0]),
              float(RIFT_FLIGHT_TUNING.role3Delay[1]),
              hDelay,
            ),
          );
          durationSec.assign(float(RIFT_FLIGHT_TUNING.role3Duration));
        },
      );

      const band = int(instanceIndex).mod(int(RIFT_FLIGHT_TUNING.targetBands));
      const y01 = float(band)
        .add(hBand)
        .div(float(RIFT_FLIGHT_TUNING.targetBands))
        .clamp(0, 1)
        .toConst("riftY01");
      const targetY = mix(
        this.uniforms.riftTargetMin.y,
        this.uniforms.riftTargetMax.y,
        y01,
      );
      const targetX = this.uniforms.riftTargetCenter.x.add(
        hX.sub(0.5).mul(RIFT_FLIGHT_TUNING.targetJitterX),
      );
      const targetZ = this.uniforms.riftTargetCenter.z.add(
        hZ.sub(0.5).mul(RIFT_FLIGHT_TUNING.targetJitterZ),
      );

      this.riftFlightStartBuffer
        .element(instanceIndex)
        .get("riftFlightStart")
        .assign(vec4(startPos, delaySec));
      this.riftFlightTargetBuffer
        .element(instanceIndex)
        .get("riftFlightTarget")
        .assign(vec4(targetX, targetY, targetZ, durationSec));
    })().compute(1);

    this.kernels.postEnterRiftFlight = Fn(() => {
      If(
        instanceIndex.greaterThanEqual(uint(this.uniforms.numParticles)),
        () => {
          Return();
        },
      );

      const particle = this.particleBuffer.element(instanceIndex);
      const previousPosition = particle
        .get("position")
        .xyz.toConst("riftPreviousPosition");
      const previousDirection = particle
        .get("direction")
        .xyz.toConst("riftPreviousDirection");
      const previousColor = particle.get("color").xyz.toConst("riftPrevColor");
      const previousHeat = particle.get("heat").toConst("riftPrevHeat");
      const startData = this.riftFlightStartBuffer
        .element(instanceIndex)
        .get("riftFlightStart")
        .toConst("riftStartData");
      const targetData = this.riftFlightTargetBuffer
        .element(instanceIndex)
        .get("riftFlightTarget")
        .toConst("riftTargetData");
      const startPos = startData.xyz.toConst("riftStart");
      const absorbTarget = targetData.xyz.toConst("riftAbsorbTarget");
      const delaySec = startData.w.toConst("riftDelay");
      const durationSec = targetData.w.max(float(0.001)).toConst("riftDuration");
      If(this.uniforms.postEnterFlightSec.lessThan(delaySec), () => {
        particle.get("position").assign(startPos);
        particle.get("velocity").assign(vec3(0));
        particle.get("direction").assign(previousDirection);
        particle.get("C").assign(mat3(0));
        particle.get("color").assign(previousColor);
        particle.get("heat").assign(previousHeat);
        // Waiting particles are not in flight yet.
        // dissolveState.x is a per-particle flight activation ramp, not a global claim flag.
        particle.get("dissolveState").assign(vec2(0.0, 0.0));
        Return();
      });
      const localT = this.uniforms.postEnterFlightSec
        .sub(delaySec)
        .div(durationSec)
        .clamp(0, 1)
        .toConst("riftLocalT");

      const isBreachFlight = smoothstep(float(2.2), float(2.6), delaySec)
        .toConst("isBreachFlight");

      const slowDrift = localT.mul(float(0.06));
      const tasteRapidPull = pow(
        smoothstep(float(0.22), float(0.95), localT),
        float(2.0),
      );
      const breachRapidPull = pow(
        smoothstep(float(0.08), float(0.72), localT),
        float(2.5),
      );
      const rapidPull = mix(tasteRapidPull, breachRapidPull, isBreachFlight);
      const moveT = slowDrift
        .max(rapidPull)
        .clamp(0, 1)
        .toConst("riftApproachT");
      const flightActiveT = smoothstep(float(0.025), float(0.16), localT)
        .clamp(0, 1)
        .toConst("riftFlightActiveT");
      const absorbMoveT = smoothstep(float(0.72), float(1.0), localT).toConst(
        "riftAbsorbMoveT",
      );
      const oneMinusT = float(1).sub(moveT).toConst("riftOneMinusT");

      const tasteXZAuthority = mix(
        float(0.10),
        float(0.58),
        smoothstep(float(0.62), float(1.0), localT),
      );
      const breachXZAuthority = mix(
        float(0.32),
        float(0.90),
        smoothstep(float(0.12), float(0.68), localT),
      );
      const entryXZAuthority = mix(
        tasteXZAuthority,
        breachXZAuthority,
        isBreachFlight,
      ).toConst("riftEntryXZAuthority");

      // Do not preserve the original Y sheet until the final absorb.
      // Taste keeps most of its height; breach starts gathering into the rift throat early.
      const tasteYGather = smoothstep(float(0.58), float(1.0), localT)
        .mul(float(0.22))
        .toConst("riftTasteYGather");
      const breachYGather = mix(
        float(0.18),
        float(0.68),
        smoothstep(float(0.12), float(0.74), localT),
      ).toConst("riftBreachYGather");
      const entryYGather = mix(
        tasteYGather,
        breachYGather,
        isBreachFlight,
      ).toConst("riftEntryYGather");

      const entryTarget = vec3(
        this.uniforms.riftTargetCenter.x.add(
          absorbTarget.x
            .sub(this.uniforms.riftTargetCenter.x)
            .mul(entryXZAuthority),
        ),
        mix(startPos.y, absorbTarget.y, entryYGather),
        this.uniforms.riftTargetCenter.z.add(
          absorbTarget.z
            .sub(this.uniforms.riftTargetCenter.z)
            .mul(entryXZAuthority),
        ),
      ).toConst("riftEntryTarget");
      const toAbsorb = absorbTarget.sub(startPos).toConst("riftToAbsorb");

      // Non-collinear controls — bend mass into the slit instead of a straight push.
      const centerPullX = this.uniforms.riftTargetCenter.x
        .sub(startPos.x)
        .toConst("riftCenterPullX");
      const centerPullZ = this.uniforms.riftTargetCenter.z
        .sub(startPos.z)
        .toConst("riftCenterPullZ");
      const startSideX = startPos.x
        .sub(this.uniforms.riftTargetCenter.x)
        .toConst("riftStartSideX");
      const startDepthZ = startPos.z
        .sub(this.uniforms.riftTargetCenter.z)
        .toConst("riftStartDepthZ");

      const c1Pull = mix(float(0.06), float(0.16), isBreachFlight).toConst(
        "riftControl1Pull",
      );
      const c1YGather = mix(float(0.02), float(0.1), isBreachFlight).toConst(
        "riftControl1YGather",
      );
      const c2SideKeep = mix(float(0.08), float(0.22), isBreachFlight).toConst(
        "riftControl2SideKeep",
      );
      const c2DepthKeep = mix(float(0.3), float(0.42), isBreachFlight).toConst(
        "riftControl2DepthKeep",
      );
      const c2YGather = mix(float(0.08), float(0.44), isBreachFlight).toConst(
        "riftControl2YGather",
      );

      const control1 = vec3(
        startPos.x.add(centerPullX.mul(c1Pull)),
        mix(startPos.y, absorbTarget.y, c1YGather),
        startPos.z.add(centerPullZ.mul(c1Pull)),
      ).toConst("riftControl1");
      const control2 = vec3(
        this.uniforms.riftTargetCenter.x.add(startSideX.mul(c2SideKeep)),
        mix(startPos.y, absorbTarget.y, c2YGather),
        this.uniforms.riftTargetCenter.z.add(startDepthZ.mul(c2DepthKeep)),
      ).toConst("riftControl2");
      const omt2 = oneMinusT.mul(oneMinusT);
      const omt3 = omt2.mul(oneMinusT);
      const t2 = moveT.mul(moveT);
      const t3 = t2.mul(moveT);
      const approachPosition = startPos
        .mul(omt3)
        .add(control1.mul(float(3).mul(omt2).mul(moveT)))
        .add(control2.mul(float(3).mul(oneMinusT).mul(t2)))
        .add(entryTarget.mul(t3))
        .toConst("riftApproachPosition");
      const newPosition = mix(approachPosition, absorbTarget, absorbMoveT).toConst(
        "riftNewPosition",
      );
      const debugVelocity = toAbsorb
        .add(vec3(0.001, 0, 0))
        .normalize()
        .mul(mix(float(0.42), float(1.45), localT))
        .toConst("riftDebugVelocity");
      const rawLiveVelocity = newPosition
        .sub(previousPosition)
        .div(this.uniforms.dt.max(float(1 / 240)))
        .toConst("riftRawLiveVelocity");
      const rawLiveSpeed = rawLiveVelocity.length().toConst("riftRawLiveSpeed");
      const liveVelocity = rawLiveVelocity
        .add(vec3(0.001, 0, 0))
        .normalize()
        .mul(rawLiveSpeed.clamp(0, 2.2))
        .toConst("riftLiveVelocity");
      const velocity = mix(
        liveVelocity,
        debugVelocity,
        this.uniforms.postEnterFlightDebugFrozen.clamp(0, 1),
      ).toConst("riftVelocity");

      const riftDx = newPosition.x.sub(this.uniforms.riftTargetCenter.x);
      const riftDz = newPosition.z.sub(this.uniforms.riftTargetCenter.z);
      const riftDist = vec2(riftDx, riftDz).length().toConst("riftContactDist");
      const killChannelT = float(1)
        .sub(smoothstep(float(1.2), float(3.5), riftDist))
        .clamp(0, 1)
        .toConst("riftKillChannelT");

      const contactAbsorbT = smoothstep(float(0.18), float(0.72), killChannelT)
        .mul(smoothstep(float(0.40), float(0.95), localT))
        .toConst("riftContactAbsorbT");
      const timeFinalT = smoothstep(float(0.88), float(1.0), localT).toConst(
        "riftTimeFinalT",
      );
      const absorbT = contactAbsorbT
        .max(timeFinalT)
        .clamp(0, 1)
        .toConst("riftAbsorbT");

      particle.get("position").assign(newPosition);
      particle.get("velocity").assign(velocity);
      particle.get("direction").assign(velocity);
      particle.get("C").assign(mat3(0));
      particle.get("color").assign(previousColor);
      particle.get("heat").assign(previousHeat);
      particle.get("dissolveState").assign(vec2(flightActiveT, absorbT));
    })().compute(1);
    this._postEnterRiftFlightInitPending = false;
  }

  /** FORENSIC: schedule a one-shot velocity + C zero on the next update() call. */
  scheduleVelocityZero() {
    this._zeroVelocitiesNextFrame = true;
  }

  schedulePostEnterRiftFlightInit() {
    this._postEnterRiftFlightInitPending = true;
  }

  resetPostEnterRiftFlightState() {
    this._postEnterRiftFlightInitPending = false;
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
      this.kernels.postEnterArrestDamp.count = particles;
      this.kernels.postEnterArrestDamp.updateDispatchCount();
      this.kernels.initPostEnterRiftFlight.count = particles;
      this.kernels.initPostEnterRiftFlight.updateDispatchCount();
      this.kernels.postEnterRiftFlight.count = particles;
      this.kernels.postEnterRiftFlight.updateDispatchCount();
    }

    // FORENSIC: dispatch one-shot velocity + C zero before main kernels.
    if (this._zeroVelocitiesNextFrame) {
      this._zeroVelocitiesNextFrame = false;
      this.kernels.zeroVelocities.count = this.numParticles;
      this.kernels.zeroVelocities.updateDispatchCount();
      await this.renderer.computeAsync(this.kernels.zeroVelocities);
    }

    if (this.runtime.postEnterArrestActive) {
      this.uniforms.dt.value = Math.max(1 / 240, Math.min(interval, 1 / 60));
      this.kernels.postEnterArrestDamp.count = this.numParticles;
      this.kernels.postEnterArrestDamp.updateDispatchCount();
      await this.renderer.computeAsync(this.kernels.postEnterArrestDamp);
      return;
    }

    if (this.runtime.postEnterRiftFlightActive) {
      this.uniforms.dt.value = Math.max(1 / 240, Math.min(interval, 1 / 60));
      if (this._postEnterRiftFlightInitPending) {
        this._postEnterRiftFlightInitPending = false;
        this.kernels.initPostEnterRiftFlight.count = this.numParticles;
        this.kernels.initPostEnterRiftFlight.updateDispatchCount();
        await this.renderer.computeAsync(this.kernels.initPostEnterRiftFlight);
      }
      this.kernels.postEnterRiftFlight.count = this.numParticles;
      this.kernels.postEnterRiftFlight.updateDispatchCount();
      await this.renderer.computeAsync(this.kernels.postEnterRiftFlight);
      return;
    }

    if (this.runtime.solverLocked) {
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
    this.uniforms.chamberFlowCenter.value.copy(runtime.chamberFlowCenter);
    this.uniforms.riftTargetMin.value.copy(runtime.riftTargetMin);
    this.uniforms.riftTargetMax.value.copy(runtime.riftTargetMax);
    this.uniforms.riftTargetCenter.value.copy(runtime.riftTargetCenter);
    this.uniforms.sourceFieldRadius.value = primarySourceRadius;
    this.uniforms.sourceFieldSecondaryRadius.value = secondarySourceRadius;
    this.uniforms.convergenceSlowdown.value = runtime.convergenceSlowdown;
    this.uniforms.convergenceFreeze.value = runtime.convergenceFreeze;
    this.uniforms.convergenceHeatRetention.value =
      runtime.convergenceHeatRetention;
    this.uniforms.convergenceThermalExtinction.value =
      runtime.convergenceThermalExtinction ?? 0;
    this.uniforms.postEnterHoverClamp.value =
      runtime.postEnterHoverClamp ?? 1;
    this.uniforms.postEnterThermalColorLock.value =
      runtime.postEnterThermalColorLock ?? 0;
    this.uniforms.postEnterArrestT.value = runtime.postEnterArrestT ?? 0;
    const freezeSec =
      typeof globalThis !== "undefined" &&
      Number.isFinite(globalThis.__VOLKANO_RIFT_FLIGHT_FREEZE_SEC)
        ? Number(globalThis.__VOLKANO_RIFT_FLIGHT_FREEZE_SEC)
        : null;
    this.uniforms.postEnterFlightSec.value =
      freezeSec === null ? (runtime.postEnterFlightSec ?? 0) : freezeSec;
    this.uniforms.postEnterFlightDebugFrozen.value = freezeSec === null ? 0 : 1;
    // Conversation-layer spring weights (sourceChamberDrive); default 0 keeps
    // plain source play and every post-enter path byte-identical.
    this.uniforms.returnBodyWeight.value = runtime.returnBodyWeight ?? 0;
    this.uniforms.recallLateralWeight.value = runtime.recallLateralWeight ?? 0;
    this.uniforms.recallVerticalWeight.value = runtime.recallVerticalWeight ?? 0;
    this.uniforms.settleWeight.value = runtime.settleWeight ?? 0;
    if (runtime.settleOffset) {
      this.uniforms.settleOffset.value.copy(runtime.settleOffset);
    } else {
      this.uniforms.settleOffset.value.set(0, 0, 0);
    }
    this.uniforms.settleSquashT.value = runtime.settleSquashT ?? 1;
    this.uniforms.settleSquashCenter.value = runtime.settleSquashCenter ?? 32;
    if (runtime.settleBob) {
      this.uniforms.settleBob.value.copy(runtime.settleBob);
    } else {
      this.uniforms.settleBob.value.set(0, 0, 0);
    }
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

  /**
   * Lenox: author settle targets as N organic clusters. CPU one-shot write
   * into `settleTargetBuffer` — same safe call-site class as
   * `buildAnalyticalRecallTargets` (never per frame).
   *
   * Cluster spec (per entry):
   *   center, radii        — ellipsoid placement
   *   aperture   (0..0.9)  — hollow core fraction: particles author OUTSIDE
   *                          this radius so the pupil reads as negative space
   *   almond     (0..1)    — vertical taper toward the outer x-corners
   *   focalFrac  (0..0.3)  — fraction of particles authored as a small focal
   *                          core inside the aperture; written with w=1 so
   *                          the gaze offset moves them fully (kernel reads w)
   *   focalRadius (0..1)   — focal core size relative to radii
   *
   * @param {{center:[number,number,number], radii:[number,number,number],
   *   aperture?:number, almond?:number, focalFrac?:number, focalRadius?:number}[]} clusters
   */
  buildLenoxClusterTargets(clusters) {
    if (
      !this.settleTargetBuffer ||
      !Array.isArray(clusters) ||
      clusters.length === 0 ||
      !this.gridSize
    ) {
      return;
    }

    const cap = this.settleTargetBuffer.length || 0;
    const particleCount = Math.min(
      this.numParticles > 0
        ? this.numParticles
        : (this.runtime?.particles ?? cap),
      cap,
    );
    if (particleCount <= 0) return;

    const lo = GRID_CLAMP_MARGIN + 1;
    const hiX = this.gridSize.x - GRID_CLAMP_MARGIN - 1;
    const hiY = this.gridSize.y - GRID_CLAMP_MARGIN - 1;
    const hiZ = this.gridSize.z - GRID_CLAMP_MARGIN - 1;
    const GOLDEN = 2.399963229728653;
    const clamp3 = (v, loV, hiV) => Math.min(hiV, Math.max(loV, v));

    for (let i = 0; i < particleCount; i++) {
      const c = clusters[i % clusters.length];
      const aperture = c.aperture ?? 0;
      const almond = c.almond ?? 0;
      const focalFrac = c.focalFrac ?? 0;

      let x;
      let y;
      let z;
      let w = 0;

      if (focalFrac > 0 && hash01(i, 57.585) < focalFrac) {
        // Focal core: sparse mass inside the aperture; follows gaze (w=1).
        const fr = (c.focalRadius ?? 0.3) * Math.sqrt(hash01(i, 17.323));
        const fAz = i * GOLDEN + hash01(i, 91.421) * 1.7;
        const fInc = Math.acos(2 * hash01(i, 33.719) - 1);
        x = c.center[0] + Math.sin(fInc) * Math.cos(fAz) * fr * c.radii[0];
        y = c.center[1] + Math.cos(fInc) * fr * c.radii[1];
        z = c.center[2] + Math.sin(fInc) * Math.sin(fAz) * fr * c.radii[2];
        w = 1;
      } else if (aperture > 0) {
        // Ocular shell: planar annulus (hollow core = pupil void), organic
        // radial jitter, almond taper so the outer corners close down.
        const azimuth = i * GOLDEN + hash01(i, 12.9898) * 0.9;
        const r01 = Math.sqrt(
          aperture * aperture +
            (1 - aperture * aperture) * hash01(i, 39.3461),
        );
        const r = r01 * (0.9 + hash01(i, 94.673) * 0.24);
        const xFrac = Math.abs(Math.cos(azimuth)) * Math.min(r, 1);
        const lidTaper = 1 - almond * Math.pow(xFrac, 1.6);
        x = c.center[0] + Math.cos(azimuth) * r * c.radii[0];
        y = c.center[1] + Math.sin(azimuth) * r * c.radii[1] * lidTaper;
        z =
          c.center[2] +
          (hash01(i, 78.233) - 0.5) * 2 * c.radii[2] * (1 - r01 * 0.4);
      } else {
        // Solid organic ellipsoid (gather sphere).
        const azimuth = i * GOLDEN + hash01(i, 12.9898) * 0.9;
        const inclination = Math.acos(2 * hash01(i, 78.233) - 1);
        const r =
          Math.sqrt(hash01(i, 39.3461)) * (0.82 + hash01(i, 94.673) * 0.36);
        x = c.center[0] + Math.sin(inclination) * Math.cos(azimuth) * r * c.radii[0];
        y = c.center[1] + Math.cos(inclination) * r * c.radii[1];
        z = c.center[2] + Math.sin(inclination) * Math.sin(azimuth) * r * c.radii[2];
      }

      this.settleTargetBuffer.set(i, "settleTarget", [
        clamp3(x, lo, hiX),
        clamp3(y, lo, hiY),
        clamp3(z, lo, hiZ),
        w,
      ]);
    }

    const sb = this.settleTargetBuffer.buffer;
    if (sb) { sb.needsUpdate = true; if (sb.value) sb.value.needsUpdate = true; }
  }

  /**
   * Lenox Visual Reset: presence-field authoring. One coherent signal cloud,
   * no facial geometry. Layers (role in target w):
   *   envelope — large soft fog, ragged edges                (w=0.3, dim)
   *   core     — inner living field                          (w=0)
   *   contour  — single sweeping density arc for structure   (w=0.6)
   *   nodes    — two asymmetric attention knots; follow gaze (w=1)
   * CPU one-shot write (same call-site class as buildAnalyticalRecallTargets).
   *
   * `opts.spread` (>= 1) loosens every position away from the presence
   * center while KEEPING the per-index role assignment — the same particle
   * flows deterministically from its latent (loose) spot to its present
   * (tight) spot across lifecycle phases: one entity being born, never a
   * sequence of unrelated objects.
   */
  buildLenoxPresenceTargets(spec, opts = {}) {
    if (!this.settleTargetBuffer || !this.gridSize || !spec) return;
    const spread = Math.max(opts.spread ?? 1, 1);
    const looseJitter = (spread - 1) * 1.6;

    const cap = this.settleTargetBuffer.length || 0;
    const particleCount = Math.min(
      this.numParticles > 0
        ? this.numParticles
        : (this.runtime?.particles ?? cap),
      cap,
    );
    if (particleCount <= 0) return;

    const {
      centerX,
      centerY,
      zBase,
      envelopeR, // [rx, ry, rz]
      coreR, // [rx, ry, rz]
      nodes, // [{x, y, r}, {x, y, r}] — asymmetric attention knots
      contourLift, // arc height factor above centerY
    } = spec;

    const lo = GRID_CLAMP_MARGIN + 1;
    const hiX = this.gridSize.x - GRID_CLAMP_MARGIN - 1;
    const hiY = this.gridSize.y - GRID_CLAMP_MARGIN - 1;
    const hiZ = this.gridSize.z - GRID_CLAMP_MARGIN - 1;
    const GOLDEN = 2.399963229728653;
    const clampV = (v, loV, hiV) => Math.min(hiV, Math.max(loV, v));

    for (let i = 0; i < particleCount; i++) {
      const roll = hash01(i, 7.77);
      const azimuth = i * GOLDEN + hash01(i, 12.9898) * 0.9;
      let x;
      let y;
      let z;
      let w;

      if (roll < 0.42) {
        // Envelope fog: ragged organic cloud, densest toward the middle.
        const inc = Math.acos(2 * hash01(i, 78.233) - 1);
        const r =
          Math.pow(hash01(i, 39.3461), 0.62) *
          (0.75 + hash01(i, 94.673) * 0.5);
        x = centerX + Math.sin(inc) * Math.cos(azimuth) * r * envelopeR[0];
        y = centerY + Math.cos(inc) * r * envelopeR[1];
        z = zBase + Math.sin(inc) * Math.sin(azimuth) * r * envelopeR[2];
        w = 0.3;
      } else if (roll < 0.72) {
        // Core field: the living body of the presence.
        const inc = Math.acos(2 * hash01(i, 51.77) - 1);
        const r =
          Math.sqrt(hash01(i, 43.91)) * (0.85 + hash01(i, 27.53) * 0.3);
        x = centerX + Math.sin(inc) * Math.cos(azimuth) * r * coreR[0];
        y = centerY + Math.cos(inc) * r * coreR[1];
        z = zBase + Math.sin(inc) * Math.sin(azimuth) * r * coreR[2];
        w = 0;
      } else if (roll < 0.82) {
        // Density contour: one sweeping arc across the upper presence.
        const t = hash01(i, 83.313);
        const az = Math.PI * (0.1 + 0.8 * t);
        const r = 0.9 + hash01(i, 61.17) * 0.25;
        x = centerX + Math.cos(az) * r * coreR[0] * 1.08;
        y = centerY + Math.sin(az) * r * coreR[1] * contourLift;
        z = zBase + (hash01(i, 66.29) - 0.5) * coreR[2];
        w = 0.6;
      } else {
        // Attention nodes: two calm, asymmetric density knots.
        const node = nodes[i % nodes.length];
        const fr = node.r * Math.sqrt(hash01(i, 17.323));
        const fAz = i * GOLDEN + hash01(i, 91.421) * 1.7;
        const fInc = Math.acos(2 * hash01(i, 33.719) - 1);
        x = node.x + Math.sin(fInc) * Math.cos(fAz) * fr;
        y = node.y + Math.cos(fInc) * fr * 0.8;
        z = zBase - 1.2 + Math.sin(fInc) * Math.sin(fAz) * fr * 0.6;
        w = 1;
      }

      // Lifecycle spread: loosen away from the presence center, add organic
      // jitter, keep roles fixed per index.
      if (spread > 1) {
        x = centerX + (x - centerX) * spread + (hash01(i, 3.31) - 0.5) * looseJitter;
        y = centerY + (y - centerY) * spread + (hash01(i, 5.73) - 0.5) * looseJitter;
        z = zBase + (z - zBase) * spread + (hash01(i, 9.19) - 0.5) * looseJitter;
      }

      // Face exclusion zone (tight shapes only): fog must FRAME the face,
      // never paint over it — non-focal targets inside the facial oval are
      // pushed behind the face plane (camera looks from -z).
      if (spread <= 1.05 && w < 0.85) {
        const fdx = (x - centerX) / 11;
        const fdy = (y - (centerY + 0.6)) / 7.4;
        if (fdx * fdx + fdy * fdy < 1 && z < zBase + 1.0) {
          z = zBase + 1.0 + hash01(i, 13.57) * 1.8;
        }
      }

      this.settleTargetBuffer.set(i, "settleTarget", [
        clampV(x, lo, hiX),
        clampV(y, lo, hiY),
        clampV(z, lo, hiZ),
        w,
      ]);
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
  }

  dispose() {
    this.mousePosArray = [];
    this.mousePos = null;
    this.initialParticlePositions = null;
    this.recallTargetBuffer = null;
    this.returnBodyTargetBuffer = null;
    this.settleTargetBuffer = null;
    this.riftFlightStartBuffer = null;
    this.riftFlightTargetBuffer = null;
    this._zeroVelocitiesNextFrame = false;
    this._postEnterRiftFlightInitPending = false;
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
