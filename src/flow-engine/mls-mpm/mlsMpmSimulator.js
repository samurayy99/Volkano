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
  vec3,
  vec4,
  atomicAdd,
  uint,
  max,
  pow,
  mat3,
  clamp,
  time,
  cross,
  mix,
  ivec3,
  smoothstep,
} from "three/tsl";
import { triNoise3Dvec } from "../common/noise";
import { StructuredArray } from "./structuredArray.js";

/** Upper bound for particle buffer allocation (must match App runtime.maxParticles policy). */
const DEFAULT_MAX_PARTICLE_CAPACITY = 8192 * 16;

const GRID_POINTER_OFFSET = new THREE.Vector3();
const ZERO_VECTOR = new THREE.Vector3(0, 0, 0);
const GRID_CLAMP_MARGIN = 2;
const GRID_WALL_MARGIN = 3;

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

const shouldSkipParticleMotion = (uniforms) =>
  uniforms.solverLocked.greaterThan(float(0.5));

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
    .mul(0.985)
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
    this.uniforms.solverLocked = uniform(0);
    this.uniforms.mouseInfluence = uniform(1);
    this.uniforms.mouseActive = uniform(0);

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
      If(this.uniforms.solverLocked.greaterThan(float(0.5)), () => {
        Return();
      });
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
      If(this.uniforms.solverLocked.greaterThan(float(0.5)), () => {
        Return();
      });
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
      If(shouldSkipParticleMotion(this.uniforms), () => {
        // Post-enter lock: solver stops integrating particle motion.
        this.particleBuffer.element(instanceIndex).get("C").assign(mat3(0));
        this.particleBuffer
          .element(instanceIndex)
          .get("velocity")
          .assign(vec3(0));
        Return();
      });
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
        .get("direction");
      direction.assign(mix(direction, particleVelocity, 0.1));
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
      const thermalUpdateT = float(1)
        .sub(this.uniforms.solverLocked)
        .clamp(0, 1)
        .toConst("thermalUpdateT");

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
        .assign(mix(previousColor, thermalState.color, thermalUpdateT));
      this.particleBuffer
        .element(instanceIndex)
        .get("heat")
        .assign(mix(previousHeat, thermalState.heat, thermalUpdateT));
    })().compute(1);
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

  applyPostEnterFrame(derived) {
    this.uniforms.solverLocked.value = derived?.solverLocked ? 1 : 0;
  }

  syncRuntimeUniforms() {
    const runtime = this.runtime;
    if (!runtime) {
      return;
    }
    const primarySourceRadius =
      ((runtime.sourceFieldRadii.x +
        runtime.sourceFieldRadii.y +
        runtime.sourceFieldRadii.z) /
        3) *
      runtime.sourceRadiusScale.primary;
    const secondarySourceRadius =
      ((runtime.sourceFieldSecondaryRadii.x +
        runtime.sourceFieldSecondaryRadii.y +
        runtime.sourceFieldSecondaryRadii.z) /
        3) *
      runtime.sourceRadiusScale.secondary;

    this.uniforms.noise.value = runtime.noise;
    this.uniforms.stiffness.value = runtime.stiffness;
    this.uniforms.gravity.value.set(0, runtime.gravity > 0.5 ? -0.2 : 0, 0);
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
    this.uniforms.convergenceThermalExtinction.value =
      runtime.convergenceThermalExtinction;
  }

  markParticleBufferDirty() {
    const particleAttribute = this.particleBuffer?.buffer?.value;
    if (particleAttribute) {
      particleAttribute.needsUpdate = true;
    }
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
    };

    for (let i = 0; i < particleCount; i++) {
      const baseIndex = i * 3;
      particlePosition.set(
        this.initialParticlePositions[baseIndex + 0],
        this.initialParticlePositions[baseIndex + 1],
        this.initialParticlePositions[baseIndex + 2],
      );

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

  seedMatureIdlePopulation() {
    this.carvePopulationSlit({
      splitPush: 0.8,
      gapWidth: 2.45,
    });
  }

  dispose() {
    this.mousePosArray = [];
    this.mousePos = null;
    this.initialParticlePositions = null;
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
