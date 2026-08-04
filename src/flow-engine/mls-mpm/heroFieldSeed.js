/**
 * Hero Field authored seed — "Suspended Rift Mass" (V1).
 *
 * Pure, deterministic CPU placement for the hero-field starting population.
 * No solver, no renderer, no camera involvement. Same reload → same world.
 *
 * Contract (see docs/review/hero-seed-plan-2026-08-04.md):
 *  - four spatial cohorts (A primary mass · B upper canopy · C depth stream ·
 *    D sparse satellites) at a 55 / 22 / 15 / 8 split
 *  - one authored curved stay-out void (missing matter, not an object)
 *  - no authored particle below `floorY`
 *  - near-zero deterministic initial velocities (composition, not motion design)
 *  - portrait is its own distribution, never a crop of landscape
 *
 * Only `hero-field` may call this seed.
 */
export const HERO_FIELD_SEED = Object.freeze({
  landscape: Object.freeze({
    cohorts: Object.freeze({
      A: Object.freeze({
        center: [30, 36.5, 30],
        radii: [11, 7, 6],
        profile: "primary",
        velocity: [0.15, 0.25, 0.05],
      }),
      B: Object.freeze({
        center: [31, 43, 32],
        radii: [9, 3.5, 5],
        profile: "canopy",
        velocity: [-0.1, 0.1, 0.02],
      }),
      C: Object.freeze({
        center: [30, 34, 38],
        radii: [8, 6, 4],
        profile: "depth",
        velocity: [0, 0.05, 0.2],
      }),
      D: Object.freeze({
        clusters: Object.freeze([
          Object.freeze({ center: [32, 51, 30], radius: 3 }),
          Object.freeze({ center: [30, 30, 45], radius: 3 }),
          Object.freeze({ center: [48, 34, 32], radius: 3 }),
        ]),
        velocity: [0.02, 0.01, 0.01],
      }),
    }),
    void: Object.freeze({
      center: [40, 30, 30],
      radii: [6, 4, 4],
      bendX: 1.35,
      bendY: 0.55,
      warp: 0.12,
    }),
    floorY: 22,
  }),
  portrait: Object.freeze({
    cohorts: Object.freeze({
      A: Object.freeze({
        center: [31, 36, 30],
        radii: [8, 7.5, 5],
        profile: "primary",
        velocity: [0.1, 0.2, 0.04],
      }),
      B: Object.freeze({
        center: [31.5, 44, 31],
        radii: [6.5, 4, 4],
        profile: "canopy",
        velocity: [-0.08, 0.08, 0.02],
      }),
      C: Object.freeze({
        center: [31, 33, 38],
        radii: [6, 6, 3.5],
        profile: "depth",
        velocity: [0, 0.04, 0.15],
      }),
      D: Object.freeze({
        clusters: Object.freeze([
          Object.freeze({ center: [31.5, 50, 31], radius: 2.5 }),
          Object.freeze({ center: [31, 29, 45], radius: 2.5 }),
          Object.freeze({ center: [42, 33, 32], radius: 2.5 }),
        ]),
        velocity: [0.02, 0.01, 0.01],
      }),
    }),
    void: Object.freeze({
      center: [40, 29.5, 30],
      radii: [4.7, 4.4, 4],
      bendX: 1.05,
      bendY: 0.65,
      warp: 0.11,
    }),
    floorY: 22,
  }),
});

/** Cohort split: A 55 % · B 22 % · C 15 % · D 8 %. */
const COHORT_SPLITS = Object.freeze([
  { cohort: "A", threshold: 0.55 },
  { cohort: "B", threshold: 0.77 },
  { cohort: "C", threshold: 0.92 },
  { cohort: "D", threshold: 1.0 },
]);

const GOLDEN = 2.399963229728653;
const TAU = Math.PI * 2;
const MAX_VOID_RESAMPLES = 12;

/** Deterministic [0,1) hash per particle id (same idiom as the engine). */
export function heroFieldHash01(index, seed) {
  const x = Math.sin((index + 1) * seed) * 43758.5453123;
  return x - Math.floor(x);
}

function assignCohort(i) {
  const h = heroFieldHash01(i, 1.6180339887);
  for (const { cohort, threshold } of COHORT_SPLITS) {
    if (h < threshold) return cohort;
  }
  return "D";
}

/** Deterministic cohort assignment per particle id (exported for tests). */
export function assignHeroFieldCohort(i) {
  return assignCohort(i);
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function heroFieldVoidFrame(y, z, v) {
  const ny = (y - v.center[1]) / v.radii[1];
  const nz = (z - v.center[2]) / v.radii[2];
  const curve = Math.sin(nz * 1.18 + ny * 0.34);
  const crossWarp = Math.sin(ny * 1.41 - nz * 0.83 + 0.6);

  return {
    centerX: v.center[0] + curve * v.bendX + ny * 0.28,
    centerY: v.center[1] + Math.sin(nz * 1.07 + 0.35) * v.bendY,
    radiusX: v.radii[0] * (1 + crossWarp * v.warp),
    radiusY: v.radii[1] * (1 - curve * v.warp * 0.55),
    radiusZ: v.radii[2] * (1 + crossWarp * v.warp * 0.35),
  };
}

/** Curved, slowly warped void metric. Values below 1 are missing matter. */
export function heroFieldVoidMetric(x, y, z, v) {
  const frame = heroFieldVoidFrame(y, z, v);
  const nx = (x - frame.centerX) / frame.radiusX;
  const ny = (y - frame.centerY) / frame.radiusY;
  const nz = (z - v.center[2]) / frame.radiusZ;
  return nx * nx + ny * ny + nz * nz;
}

function sampleVolume(index, attempt, radialPower) {
  const sampleIndex = index + attempt * 104729;
  const az = sampleIndex * GOLDEN + heroFieldHash01(sampleIndex, 12.9898) * 0.9;
  const inc = Math.acos(2 * heroFieldHash01(sampleIndex, 78.233) - 1);
  const radius = Math.pow(heroFieldHash01(sampleIndex, 39.3461), radialPower);
  return {
    x: Math.sin(inc) * Math.cos(az) * radius,
    y: Math.cos(inc) * radius,
    z: Math.sin(inc) * Math.sin(az) * radius,
    radius,
    sampleIndex,
  };
}

function warpAuthoredVolume(sample, cohort) {
  const { center, radii, profile } = cohort;
  const edgeT = clamp01((sample.radius - 0.48) / 0.52);
  const erosion = 1 - edgeT * (0.035 + heroFieldHash01(sample.sampleIndex, 91.73) * 0.075);
  const phase = profile === "canopy" ? TAU / 3 : profile === "depth" ? (TAU * 2) / 3 : 0.35;
  const field = sample.x * 1.61 + sample.y * 1.13 + sample.z * 0.87 + phase;
  const warpX = Math.sin(field);
  const warpY = Math.sin(field + 2.0943951024);
  const warpZ = Math.sin(field + 4.1887902048);

  let nx = sample.x * erosion;
  let ny = sample.y * erosion;
  let nz = sample.z * erosion;
  const liftBias = profile === "primary" ? 0.14 : 0.08;
  ny += (1 - clamp01(Math.abs(ny))) * liftBias;
  let xScale = nx < 0 ? 0.78 : 1.06;
  let yScale = ny < 0 ? 0.72 : 1.02;
  let zScale = nz > 0 ? 0.82 : 1;
  let warpAmount = 0.1;
  let arch = 0;

  if (profile === "canopy") {
    xScale = nx < 0 ? 0.88 : 1.05;
    yScale = ny < 0 ? 0.82 : 1.08;
    zScale = nz > 0 ? 0.9 : 1;
    warpAmount = 0.16;
    arch = (1 - clamp01(Math.abs(nx))) * radii[1] * 0.18;
  } else if (profile === "depth") {
    xScale = nx < 0 ? 0.9 : 1.04;
    yScale = ny < 0 ? 0.8 : 1;
    zScale = nz > 0 ? 0.9 : 1.04;
    warpAmount = 0.12;
  }

  const lowerT = clamp01(-ny);
  const lowerTaper = 1 - lowerT * (profile === "primary" ? 0.28 : 0.16);
  nx *= lowerTaper;
  nz *= lowerTaper;

  return [
    center[0] + nx * radii[0] * xScale + warpX * radii[0] * warpAmount,
    center[1] + ny * radii[1] * yScale + warpY * radii[1] * warpAmount * 0.72 + arch,
    center[2] + nz * radii[2] * zScale + warpZ * radii[2] * warpAmount * 0.82,
  ];
}

function sampleCluster(index, attempt, cohort) {
  const sample = sampleVolume(index, attempt, 0.5);
  const cluster = cohort.clusters[
    Math.floor(heroFieldHash01(sample.sampleIndex, 4.21) * cohort.clusters.length)
  ];
  const field = sample.x * 1.4 + sample.y * 0.9 + sample.z * 1.1;
  const irregularity = 1 + Math.sin(field + index * 0.013) * 0.1;
  return [
    cluster.center[0] + sample.x * cluster.radius * irregularity,
    cluster.center[1] + sample.y * cluster.radius * irregularity,
    cluster.center[2] + sample.z * cluster.radius * irregularity,
  ];
}

function sampleCohortPosition(index, attempt, cohort) {
  if (cohort.clusters) return sampleCluster(index, attempt, cohort);
  return warpAuthoredVolume(sampleVolume(index, attempt, 0.45), cohort);
}

/**
 * Build the deterministic hero-field starting population.
 *
 * @param {number} count  particle count (already resolved by composition mode)
 * @param {"landscape"|"portrait"} layout
 * @returns {{ positions: Float32Array, velocities: Float32Array }}
 */
export function buildHeroFieldSeed(count, layout) {
  const params = HERO_FIELD_SEED[layout];
  if (!params) throw new Error(`hero-field seed: unknown layout "${layout}"`);

  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const cohort = assignCohort(i);
    const c = params.cohorts[cohort];

    let x;
    let y;
    let z;
    for (let attempt = 0; attempt < MAX_VOID_RESAMPLES; attempt++) {
      [x, y, z] = sampleCohortPosition(i, attempt, c);
      if (heroFieldVoidMetric(x, y, z, params.void) >= 1) break;
    }

    // Rejection sampling normally resolves the void. Keep a deterministic
    // curved fallback for pathological future presets without creating a wall.
    if (heroFieldVoidMetric(x, y, z, params.void) < 1) {
      const frame = heroFieldVoidFrame(y, z, params.void);
      const side = x >= frame.centerX ? 1 : -1;
      x = frame.centerX + side * frame.radiusX * (1.04 + heroFieldHash01(i, 63.17) * 0.08);
    }

    // Hard authored floor: never born as a sedimented bank. Gravity is 0.
    if (y < params.floorY) y = params.floorY;

    positions[i * 3 + 0] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    // Extremely subtle deterministic drift per cohort; alive, not animated.
    const vel = c.velocity;
    velocities[i * 3 + 0] = vel[0] + (heroFieldHash01(i, 11.17) - 0.5) * 0.02;
    velocities[i * 3 + 1] = vel[1] + (heroFieldHash01(i, 22.23) - 0.5) * 0.02;
    velocities[i * 3 + 2] = vel[2] + (heroFieldHash01(i, 33.31) - 0.5) * 0.02;
  }

  return { positions, velocities };
}

/**
 * Fit one authored Hero Field population into the current projected viewport.
 * The source silhouette remains authored; only its X/Y placement and scale are
 * resolved from the live screen envelope. Z is untouched so the rift keeps its
 * designed depth hierarchy.
 *
 * @param {Float32Array} positions
 * @param {{min:number[], max:number[], inset?:number[], fill?:number}} viewport
 */
export function fitHeroFieldSeedToViewport(positions, viewport) {
  if (!viewport || positions.length === 0) return positions;

  const sourceMin = [Infinity, Infinity];
  const sourceMax = [-Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    sourceMin[0] = Math.min(sourceMin[0], positions[i]);
    sourceMax[0] = Math.max(sourceMax[0], positions[i]);
    sourceMin[1] = Math.min(sourceMin[1], positions[i + 1]);
    sourceMax[1] = Math.max(sourceMax[1], positions[i + 1]);
  }

  const fill = Math.max(0.5, Math.min(viewport.fill ?? 0.86, 0.98));
  const insetX = Math.max(0, viewport.inset?.[0] ?? 0);
  const insetY = Math.max(0, viewport.inset?.[1] ?? 0);
  const targetCenterX = (viewport.min[0] + viewport.max[0]) * 0.5;
  const targetCenterY = (viewport.min[1] + viewport.max[1]) * 0.5;
  const targetHalfX = Math.max(
    0.5,
    ((viewport.max[0] - viewport.min[0]) * 0.5 - insetX) * fill,
  );
  const targetHalfY = Math.max(
    0.5,
    ((viewport.max[1] - viewport.min[1]) * 0.5 - insetY) * fill,
  );
  const sourceCenterX = (sourceMin[0] + sourceMax[0]) * 0.5;
  const sourceCenterY = (sourceMin[1] + sourceMax[1]) * 0.5;
  const sourceHalfX = Math.max(0.0001, (sourceMax[0] - sourceMin[0]) * 0.5);
  const sourceHalfY = Math.max(0.0001, (sourceMax[1] - sourceMin[1]) * 0.5);

  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = targetCenterX
      + ((positions[i] - sourceCenterX) / sourceHalfX) * targetHalfX;
    positions[i + 1] = targetCenterY
      + ((positions[i + 1] - sourceCenterY) / sourceHalfY) * targetHalfY;
  }

  return positions;
}

/** Map the existing composition mode to a seed layout. */
export function resolveHeroFieldLayout(compositionMode) {
  return compositionMode === "banded" ? "portrait" : "landscape";
}

/** Hero Field owns a simple full-viewport orientation contract. */
export function resolveHeroFieldCompositionMode(width, height) {
  return width / Math.max(height, 1) < 0.85 ? "banded" : "side";
}
