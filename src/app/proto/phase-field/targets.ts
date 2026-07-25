/**
 * PROOF A — target generators. Pure functions producing sim-space xyz triples.
 *
 * Two laws, both replaceable without touching anything else:
 *
 *   ambientAnchors  a distribution, NOT captured positions. `seedLenoxDustPopulation`
 *                   fires every particle out of a tight central sphere, so anything
 *                   captured afterwards is noise — pulling back to it produces a
 *                   twitching starfield rather than a settling field. The anchors
 *                   are generated and then slowly advected, so ambient stabilises
 *                   without freezing.
 *
 *   focusField      the LENOX concentration. A HYPOTHESIS, not a decided form.
 *                   Deliberately asymmetric and incomplete: closed concentric
 *                   rings are reachable in this parameter space and are exactly
 *                   what to avoid — we just retired the eye and must not rebuild
 *                   it out of particles. It must read as attention, never as iris,
 *                   portal or HUD.
 */

export type Bounds = { min: [number, number, number]; max: [number, number, number] };

/** Deterministic hash so a given index always lands in the same place. */
function hash01(i: number, seed: number): number {
  const x = Math.sin(i * 12.9898 + seed) * 43758.5453123;
  return x - Math.floor(x);
}

/**
 * Rest anchors spread through the visible box. Stratified rather than uniform
 * random: clumps read as noise, an even spread reads as a medium.
 */
export function ambientAnchors(
  count: number,
  bounds: Bounds,
  time = 0,
  drift = 0,
): Float32Array {
  const out = new Float32Array(count * 3);
  const [minX, minY, minZ] = bounds.min;
  const [maxX, maxY, maxZ] = bounds.max;
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const spanZ = maxZ - minZ;
  // Stratify on the two visible axes; depth stays shallow so the composition
  // reads as a field rather than as a volume seen end-on.
  const cols = Math.max(1, Math.round(Math.sqrt(count * (spanX / Math.max(spanY, 0.001)))));
  const rows = Math.max(1, Math.ceil(count / cols));

  for (let i = 0; i < count; i++) {
    const cx = i % cols;
    const cy = Math.floor(i / cols) % rows;
    const jx = hash01(i, 11.3);
    const jy = hash01(i, 27.7);
    const jz = hash01(i, 51.1);

    // Low-frequency advection: the anchors themselves wander, so the field
    // settles toward a moving rest state instead of snapping to fixed dots.
    const phase = hash01(i, 3.9) * Math.PI * 2;
    const wobbleX = Math.sin(time * 0.11 + phase) * drift;
    const wobbleY = Math.cos(time * 0.083 + phase * 1.7) * drift * 0.7;

    out[i * 3 + 0] = minX + ((cx + jx) / cols) * spanX + wobbleX;
    out[i * 3 + 1] = minY + ((cy + jy) / rows) * spanY + wobbleY;
    out[i * 3 + 2] = minZ + jz * spanZ;
  }
  return out;
}

export type FocusParams = {
  /** 1 = round, >1 stretches along `direction`. Round is the thing to avoid. */
  anisotropy: number;
  /** Focus displaced from the centre of mass, in sim units. */
  focusOffset: [number, number];
  /** 0..1 — how much of the ring exists. 1 closes it, which reads as an eye. */
  arcCompleteness: number;
  /** How sharply density falls away from the focus. */
  densityFalloff: number;
  /** Orientation of the concentration, radians. */
  direction: number;
  /** 0..1 — imbalance between the two sides of the arc. */
  asymmetry: number;
  /** Radial phase lag between particle groups, so it arrives in layers. */
  phaseLag: number;
};

export const DEFAULT_FOCUS: FocusParams = {
  anisotropy: 2.35,
  focusOffset: [3.4, -1.8],
  // A wedge, not most of a circle. Above ~0.5 the arc wraps far enough to read
  // as a ring no matter how the mass inside it is skewed.
  arcCompleteness: 0.34,
  densityFalloff: 1.9,
  direction: -0.42,
  asymmetry: 0.63,
  phaseLag: 0.35,
};

/**
 * A directed concentration: dense toward one side of an incomplete, stretched
 * arc, thinning outward. Attention comes from the direction and the imbalance,
 * not from a shape anyone could name.
 */
export function focusField(
  count: number,
  bounds: Bounds,
  p: FocusParams,
): Float32Array {
  const out = new Float32Array(count * 3);
  const [minX, minY, minZ] = bounds.min;
  const [maxX, maxY, maxZ] = bounds.max;
  const cx = (minX + maxX) * 0.5 + p.focusOffset[0];
  const cy = (minY + maxY) * 0.5 + p.focusOffset[1];
  const cz = (minZ + maxZ) * 0.5;
  const baseR = Math.min(maxX - minX, maxY - minY) * 0.26;
  const cos = Math.cos(p.direction);
  const sin = Math.sin(p.direction);

  for (let i = 0; i < count; i++) {
    const u = hash01(i, 7.7);
    const v = hash01(i, 19.3);
    const w = hash01(i, 33.1);

    // Incomplete arc, biased to one side. `asymmetry` skews where mass sits;
    // `arcCompleteness` decides how much of the circle exists at all.
    // Built in LOCAL space and rotated once at the end — applying `direction`
    // here as well would cancel the sidedness and hand back a symmetric ring.
    const span = Math.PI * 2 * p.arcCompleteness;
    const skew = Math.pow(u, 1 + p.asymmetry * 2);
    const theta = -span * 0.5 + skew * span;

    // Density falls off from the focus, and each group arrives at its own
    // radius so the concentration layers instead of appearing as one shell.
    const radial = Math.pow(v, p.densityFalloff);
    const lag = 1 + (hash01(i, 63.5) - 0.5) * p.phaseLag;
    const r = baseR * radial * lag;

    const ex = Math.cos(theta) * r * p.anisotropy;
    const ey = Math.sin(theta) * r;

    out[i * 3 + 0] = cx + ex * cos - ey * sin;
    out[i * 3 + 1] = cy + ex * sin + ey * cos;
    out[i * 3 + 2] = cz + (w - 0.5) * (maxZ - minZ) * 0.22;
  }
  return out;
}

/**
 * LENOX is a state INSIDE the field, not a replacement for it.
 *
 * The first version wrote either ambient anchors or the focus field for the
 * whole population, which proved a global mode switch — exactly what the
 * direction says LENOX is not. Here a coherent fraction takes focus targets
 * while everything else stays in the advected ambient field, so both exist at
 * once and the visitor sees matter that has become locally intelligent rather
 * than matter that has been replaced.
 *
 * Which particles join is deterministic per index, so a particle does not
 * flicker between roles frame to frame.
 */
export function blendedTargets(
  count: number,
  bounds: Bounds,
  time: number,
  drift: number,
  focus: FocusParams,
  coherence: number,
): Float32Array {
  const ambient = ambientAnchors(count, bounds, time, drift);
  if (coherence <= 0) return ambient;

  const focused = focusField(count, bounds, focus);
  const share = Math.min(1, coherence);
  for (let i = 0; i < count; i++) {
    // Stable membership: the same indices always form the concentration.
    if (hash01(i, 91.7) > share) continue;
    ambient[i * 3 + 0] = focused[i * 3 + 0];
    ambient[i * 3 + 1] = focused[i * 3 + 1];
    ambient[i * 3 + 2] = focused[i * 3 + 2];
  }
  return ambient;
}

/** Clamp a generated set into the solver's safe interior. */
export function clampToBounds(points: Float32Array, bounds: Bounds): Float32Array {
  const [minX, minY, minZ] = bounds.min;
  const [maxX, maxY, maxZ] = bounds.max;
  for (let i = 0; i < points.length; i += 3) {
    points[i] = Math.min(maxX, Math.max(minX, points[i]));
    points[i + 1] = Math.min(maxY, Math.max(minY, points[i + 1]));
    points[i + 2] = Math.min(maxZ, Math.max(minZ, points[i + 2]));
  }
  return points;
}
