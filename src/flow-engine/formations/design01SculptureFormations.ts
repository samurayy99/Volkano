import type { CompositionMode, FormationId } from "../types";
import type { FormationBank, FormationBounds } from "./allotropFormations";

export const DESIGN01_SCULPTURE_IDS = [
  "principle.continuum",
  "capability.triaxis",
  "lenox.vectorLoom",
  "contact.forwardVector",
] as const satisfies readonly FormationId[];

export type Design01SculptureId = (typeof DESIGN01_SCULPTURE_IDS)[number];

export const isDesign01SculptureId = (id: FormationId): id is Design01SculptureId =>
  DESIGN01_SCULPTURE_IDS.includes(id as Design01SculptureId);

type Vec3 = [number, number, number];
type Quaternion = [number, number, number, number];
type Sample = {
  position: Vec3;
  tangent: Vec3;
  roll: number;
  group: number;
};

type Placement = {
  center: Vec3;
  halfSize: Vec3;
  particleScale: number;
  interactionBudget: number;
};
const TAU = Math.PI * 2;
const GOLDEN = 0.6180339887498949;
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const fract = (value: number) => value - Math.floor(value);
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, value: number): Vec3 => [a[0] * value, a[1] * value, a[2] * value];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const length = (value: Vec3) => Math.hypot(value[0], value[1], value[2]);
const normalize = (value: Vec3, fallback: Vec3 = [0, 1, 0]): Vec3 => {
  const magnitude = length(value);
  return magnitude > 1e-7 ? mul(value, 1 / magnitude) : fallback;
};
const normalizeQuaternion = (value: Quaternion): Quaternion => {
  const magnitude = Math.hypot(...value);
  if (!Number.isFinite(magnitude) || magnitude <= 1e-7) return [0, 0, 0, 1];
  const normalized = value.map((component) => component / magnitude) as Quaternion;
  return normalized[3] < 0
    ? normalized.map((component) => -component) as Quaternion
    : normalized;
};

const quaternionFromBasis = (x: Vec3, y: Vec3, z: Vec3): Quaternion => {
  const m00 = x[0]; const m01 = y[0]; const m02 = z[0];
  const m10 = x[1]; const m11 = y[1]; const m12 = z[1];
  const m20 = x[2]; const m21 = y[2]; const m22 = z[2];
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const scale = Math.sqrt(trace + 1) * 2;
    return normalizeQuaternion([(m21 - m12) / scale, (m02 - m20) / scale, (m10 - m01) / scale, scale * 0.25]);
  }
  if (m00 > m11 && m00 > m22) {
    const scale = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return normalizeQuaternion([scale * 0.25, (m01 + m10) / scale, (m02 + m20) / scale, (m21 - m12) / scale]);
  }
  if (m11 > m22) {
    const scale = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return normalizeQuaternion([(m01 + m10) / scale, scale * 0.25, (m12 + m21) / scale, (m02 - m20) / scale]);
  }
  const scale = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return normalizeQuaternion([(m02 + m20) / scale, (m12 + m21) / scale, scale * 0.25, (m10 - m01) / scale]);
};

const quaternionForSlot = (forwardInput: Vec3, roll: number, index: number): Quaternion => {
  const forward = normalize(forwardInput, [0, 0, 1]);
  const primaryUp: Vec3 = Math.abs(dot(forward, [0, 1, 0])) < 0.92 ? [0, 1, 0] : [1, 0, 0];
  const fallback: Vec3 = index % 2 === 0 ? [1, 0, 0] : [0, 0, 1];
  const right = normalize(cross(primaryUp, forward), fallback);
  const up = normalize(cross(forward, right), [0, 1, 0]);
  const c = Math.cos(roll);
  const s = Math.sin(roll);
  const rolledRight = add(mul(right, c), mul(up, s));
  const rolledUp = sub(mul(up, c), mul(right, s));
  return quaternionFromBasis(normalize(rolledRight, right), normalize(rolledUp, up), forward);
};

const derivative = (curve: (u: number) => Vec3, u: number): Vec3 => {
  const epsilon = 1 / 8192;
  return normalize(sub(curve((u + epsilon) % 1), curve((u - epsilon + 1) % 1)));
};
const sampleTube = (
  count: number,
  curve: (u: number) => Vec3,
  tubeRadius: number,
  group: number,
  ringSegments = 12,
  uStart = 0,
  uEnd = 1,
): Sample[] => {
  const samples: Sample[] = [];
  const alongCount = Math.ceil(count / ringSegments);
  for (let index = 0; index < count; index += 1) {
    const lane = index % ringSegments;
    const along = Math.floor(index / ringSegments);
    const u = uStart + (uEnd - uStart) * ((along + 0.5) / alongCount);
    const center = curve(u);
    const tangent = derivative(curve, u);
    const reference: Vec3 = Math.abs(tangent[1]) < 0.88 ? [0, 1, 0] : [1, 0, 0];
    const normal = normalize(cross(tangent, reference), [1, 0, 0]);
    const binormal = normalize(cross(tangent, normal), [0, 0, 1]);
    const angle = TAU * (lane / ringSegments + fract(along * GOLDEN) * 0.035);
    const offset = add(
      mul(normal, Math.cos(angle) * tubeRadius),
      mul(binormal, Math.sin(angle) * tubeRadius),
    );
    samples.push({ position: add(center, offset), tangent, roll: angle, group });
  }
  return samples;
};
const distribute = (count: number, groups: number) =>
  Array.from({ length: groups }, (_, group) =>
    Math.floor(count / groups) + (group < count % groups ? 1 : 0));

const continuumSamples = (count: number): Sample[] => {
  const curve = (u: number): Vec3 => {
    const t = u * TAU;
    return [
      (Math.sin(t) + 2 * Math.sin(2 * t)) * 0.46,
      (Math.cos(t) - 2 * Math.cos(2 * t)) * 0.46,
      -Math.sin(3 * t) * 0.58,
    ];
  };
  const samples = sampleTube(count, curve, 0.12, 0, 14);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index].group = Math.min(2, Math.floor(index * 3 / Math.max(samples.length, 1)));
  }
  return samples;
};

const triAxisSamples = (count: number): Sample[] => {
  const allocations = distribute(count, 3);
  return allocations.flatMap((allocation, axis) => {
    const curve = (u: number): Vec3 => {
      const t = u * TAU;
      const radius = 1.06 + Math.sin(t * 3 + axis) * 0.055;
      if (axis === 0) return [Math.cos(t) * radius, Math.sin(t) * radius, 0];
      if (axis === 1) return [0, Math.cos(t) * radius, Math.sin(t) * radius];
      return [Math.sin(t) * radius, 0, Math.cos(t) * radius];
    };
    return sampleTube(allocation, curve, 0.105, axis, 10);
  });
};
const vectorLoomSamples = (count: number): Sample[] => {
  const allocations = distribute(count, 3);
  const curve = (phase: number) => (u: number): Vec3 => {
    const t = u * TAU;
    return [
      Math.sin(2 * t + phase) * 0.76,
      Math.cos(t) * 1.34 + Math.sin(3 * t) * 0.12,
      Math.sin(3 * t + Math.PI / 3 + phase) * 0.5,
    ];
  };
  return [
    ...sampleTube(allocations[0], curve(0), 0.095, 0, 10, 0, 0.5),
    ...sampleTube(allocations[1], curve(0), 0.095, 1, 10, 0.5, 1),
    ...sampleTube(allocations[2], curve(0.16), 0.055, 2, 8),
  ];
};

const derivativeOpen = (curve: (u: number) => Vec3, u: number): Vec3 => {
  const epsilon = 1 / 8192;
  return normalize(sub(
    curve(clamp(u + epsilon, 0, 1)),
    curve(clamp(u - epsilon, 0, 1)),
  ));
};

const sampleOpenTube = (
  count: number,
  curve: (u: number) => Vec3,
  tubeRadius: number,
  group: number,
  ringSegments = 10,
): Sample[] => {
  const samples: Sample[] = [];
  const alongCount = Math.ceil(count / ringSegments);
  for (let index = 0; index < count; index += 1) {
    const lane = index % ringSegments;
    const along = Math.floor(index / ringSegments);
    const u = (along + 0.5) / Math.max(alongCount, 1);
    const center = curve(u);
    const tangent = derivativeOpen(curve, u);
    const reference: Vec3 = Math.abs(tangent[1]) < 0.88 ? [0, 1, 0] : [1, 0, 0];
    const normal = normalize(cross(tangent, reference), [1, 0, 0]);
    const binormal = normalize(cross(tangent, normal), [0, 0, 1]);
    const angle = TAU * (lane / ringSegments + fract(along * GOLDEN) * 0.03);
    const offset = add(
      mul(normal, Math.cos(angle) * tubeRadius),
      mul(binormal, Math.sin(angle) * tubeRadius),
    );
    samples.push({ position: add(center, offset), tangent, roll: angle, group });
  }
  return samples;
};

const forwardVectorSamples = (count: number): Sample[] => {
  const allocations = distribute(count, 3);
  const railOffsets = [-0.82, 0.82, 0] as const;
  return allocations.flatMap((allocation, group) => {
    const guide = group === 2;
    const offset = railOffsets[group];
    const p0: Vec3 = [1.22, offset, guide ? -0.34 : -0.58 + group * 0.18];
    const p1: Vec3 = [0.68, offset * 1.2, guide ? 0.28 : 0.82];
    const p2: Vec3 = [-0.22, offset * 0.26, guide ? -0.04 : -0.34];
    const p3: Vec3 = [guide ? -1.56 : -1.04, offset * 0.025, guide ? 0.12 : 0.3];
    const curve = (u: number): Vec3 => {
      const oneMinus = 1 - u;
      const a = oneMinus * oneMinus * oneMinus;
      const b = 3 * oneMinus * oneMinus * u;
      const c = 3 * oneMinus * u * u;
      const d = u * u * u;
      return [
        p0[0] * a + p1[0] * b + p2[0] * c + p3[0] * d,
        p0[1] * a + p1[1] * b + p2[1] * c + p3[1] * d,
        p0[2] * a + p1[2] * b + p2[2] * c + p3[2] * d,
      ];
    };
    return sampleOpenTube(
      allocation,
      curve,
      guide ? 0.052 : 0.095,
      group,
      guide ? 6 : 8,
    );
  });
};
const PLACEMENTS: Record<Design01SculptureId, Record<CompositionMode, Placement>> = {
  "principle.continuum": {
    side: { center: [0.76, 0.52, 0.5], halfSize: [0.19, 0.29, 0.19], particleScale: 0.34, interactionBudget: 1.08 },
    banded: { center: [0.5, 0.64, 0.5], halfSize: [0.18, 0.2, 0.16], particleScale: 0.38, interactionBudget: 1.02 },
  },
  "capability.triaxis": {
    side: { center: [0.9, 0.49, 0.5], halfSize: [0.11, 0.21, 0.17], particleScale: 0.34, interactionBudget: 1.04 },
    banded: { center: [0.5, 0.63, 0.5], halfSize: [0.17, 0.18, 0.15], particleScale: 0.4, interactionBudget: 1 },
  },
  "lenox.vectorLoom": {
    side: { center: [0.24, 0.52, 0.5], halfSize: [0.15, 0.25, 0.17], particleScale: 0.3, interactionBudget: 1.16 },
    banded: { center: [0.5, 0.63, 0.5], halfSize: [0.15, 0.22, 0.16], particleScale: 0.36, interactionBudget: 1.08 },
  },
  "contact.forwardVector": {
    side: { center: [0.73, 0.55, 0.5], halfSize: [0.15, 0.19, 0.15], particleScale: 0.34, interactionBudget: 1.12 },
    banded: { center: [0.5, 0.63, 0.5], halfSize: [0.18, 0.2, 0.16], particleScale: 0.38, interactionBudget: 1.04 },
  },
};

const samplesFor = (id: Design01SculptureId, count: number): Sample[] => {
  if (id === "principle.continuum") return continuumSamples(count);
  if (id === "capability.triaxis") return triAxisSamples(count);
  if (id === "lenox.vectorLoom") return vectorLoomSamples(count);
  return forwardVectorSamples(count);
};
export function buildDesign01SculptureFormation(
  id: Design01SculptureId,
  bounds: FormationBounds,
  count: number,
  mode: CompositionMode,
): FormationBank {
  const resolvedCount = Math.max(0, Math.floor(count));
  if (resolvedCount === 0) {
    return {
      positions: new Float32Array(),
      rotations: new Float32Array(),
      sizeScales: new Float32Array(),
      interactionBudgets: new Float32Array(),
      groups: new Uint16Array(),
    };
  }
  const samples = samplesFor(id, resolvedCount);
  const placement = PLACEMENTS[id][mode];
  const span: Vec3 = [
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  ];
  const modelMin: Vec3 = [Infinity, Infinity, Infinity];
  const modelMax: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const sample of samples) {
    for (let axis = 0; axis < 3; axis += 1) {
      modelMin[axis] = Math.min(modelMin[axis], sample.position[axis]);
      modelMax[axis] = Math.max(modelMax[axis], sample.position[axis]);
    }
  }
  const modelCenter = modelMin.map((value, axis) => (value + modelMax[axis]) * 0.5) as Vec3;
  const modelHalf = modelMin.map((value, axis) =>
    Math.max((modelMax[axis] - value) * 0.5, 1e-6)) as Vec3;
  const positions = new Float32Array(resolvedCount * 3);
  const rotations = new Float32Array(resolvedCount * 4);
  const sizeScales = new Float32Array(resolvedCount);
  const interactionBudgets = new Float32Array(resolvedCount);
  const groups = new Uint16Array(resolvedCount);
  const targetCenter = placement.center.map(
    (value, axis) => bounds.min[axis] + span[axis] * value,
  ) as Vec3;

  for (let index = 0; index < resolvedCount; index += 1) {
    const sample = samples[index];
    for (let axis = 0; axis < 3; axis += 1) {
      const normalized = (sample.position[axis] - modelCenter[axis]) / modelHalf[axis];
      const value = targetCenter[axis] + normalized * span[axis] * placement.halfSize[axis];
      positions[index * 3 + axis] = clamp(
        value,
        bounds.min[axis] + span[axis] * 0.06,
        bounds.max[axis] - span[axis] * 0.06,
      );
    }
    rotations.set(
      quaternionForSlot(sample.tangent, sample.roll, index),
      index * 4,
    );
    sizeScales[index] = placement.particleScale;
    interactionBudgets[index] = placement.interactionBudget;
    groups[index] = sample.group;
  }

  return { positions, rotations, sizeScales, interactionBudgets, groups };
}
