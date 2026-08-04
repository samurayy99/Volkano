import type { CompositionMode, FormationId, MatterCorridorId } from "../types";

export type FormationBounds = {
  min: [number, number, number];
  max: [number, number, number];
};

export type FormationBank = {
  positions: Float32Array;
  rotations: Float32Array;
  sizeScales: Float32Array;
  interactionBudgets: Float32Array;
  groups: Uint16Array;
};

export type FormationPair = {
  packed: Float32Array;
  count: number;
  fromCenter: Vec3;
  toCenter: Vec3;
};

type Vec3 = [number, number, number];
type Quaternion = [number, number, number, number];
type Sample = {
  position: Vec3;
  orientation: Vec3;
  roll?: number;
  sizeScale?: number;
  interactionBudget?: number;
  group?: number;
};
type Triangle = [Vec3, Vec3, Vec3];

const GOLDEN = 0.6180339887498949;
const SILVER = 0.414213562373095;
const GROUP_COUNT = 3;
export const FORMATION_PAIR_FLOATS = 24;
export const FORMATION_PAIR_STRIDE_BYTES = FORMATION_PAIR_FLOATS * Float32Array.BYTES_PER_ELEMENT;
export const FORMATION_PAIR_OFFSETS = Object.freeze({
  fromPosition: 0,
  toPosition: 4,
  fromRotation: 8,
  toRotation: 12,
  route: 16,
  params: 20,
});
const GRAPHITE_LAYERS = 9;
const DEFAULT_SIZE_SCALE = 0.72;
const DEFAULT_INTERACTION_BUDGET = 1.2;
const GRAPHITE_INTERACTION_BUDGET = 2.2;
const FULLERENE_INTERACTION_BUDGET = 0.9;
const FULLERENE_SIZE_SCALE = 0.38;

export const ALLOTROP_FORMATION_IDS = [
  "source.graphiteClosed",
  "source.graphiteOpen",
  "principle.triad",
  "principle.graphite",
  "principle.fullerene",
  "principle.diamondLattice",
  "capability.graphene",
  "capability.nanotube",
  "capability.routingLattice",
  "lenox.seed",
  "lenox.crystal",
  "lenox.roughDiamond",
  "contact.brilliant",
] as const satisfies readonly FormationId[];

export function getFormationGraphiteWeight(id: FormationId): number {
  if (id.startsWith("source.")) return 1;
  if (id === "principle.graphite") return 0.76;
  if (id === "principle.triad") return 0.14;
  return 0;
}

const fract = (value: number) => value - Math.floor(value);
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, value: number): Vec3 => [a[0] * value, a[1] * value, a[2] * value];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const normalize = (a: Vec3, fallback: Vec3 = [0, 1, 0]): Vec3 => {
  const magnitude = length(a);
  return magnitude > 1e-7 ? mul(a, 1 / magnitude) : fallback;
};
const distanceSquared = (a: Vec3, b: Vec3) => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
};
const rotateX = (point: Vec3, angle: number): Vec3 => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [point[0], point[1] * c - point[2] * s, point[1] * s + point[2] * c];
};
const rotateY = (point: Vec3, angle: number): Vec3 => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [point[0] * c + point[2] * s, point[1], -point[0] * s + point[2] * c];
};

const normalizeQuaternionRaw = (
  quaternion: Quaternion,
  fallback: Quaternion = [0, 0, 0, 1],
): Quaternion => {
  const magnitude = Math.hypot(...quaternion);
  if (!Number.isFinite(magnitude) || magnitude <= 1e-7) return fallback;
  return quaternion.map((value) => {
    const normalized = value / magnitude;
    return normalized === 0 ? 0 : normalized;
  }) as Quaternion;
};

const normalizeQuaternion = (
  quaternion: Quaternion,
  fallback: Quaternion = [0, 0, 0, 1],
): Quaternion => {
  const resolved = normalizeQuaternionRaw(quaternion, fallback);
  return resolved[3] < 0
    ? resolved.map((value) => (value === 0 ? 0 : -value)) as Quaternion
    : resolved;
};

export function nlerpFormationQuaternions(
  from: Quaternion,
  to: Quaternion,
  progress: number,
): Quaternion {
  const fromRotation = normalizeQuaternion(from);
  let toRotation = normalizeQuaternion(to);
  if (dot(fromRotation.slice(0, 3) as Vec3, toRotation.slice(0, 3) as Vec3)
    + fromRotation[3] * toRotation[3] < 0) {
    toRotation = toRotation.map((value) => (value === 0 ? 0 : -value)) as Quaternion;
  }
  const t = clamp(progress, 0, 1);
  if (t === 0) return fromRotation;
  if (t === 1) return toRotation;
  return normalizeQuaternionRaw(fromRotation.map(
    (value, index) => value + (toRotation[index] - value) * t,
  ) as Quaternion);
}

const quaternionFromBasis = (x: Vec3, y: Vec3, z: Vec3): Quaternion => {
  const m00 = x[0]; const m01 = y[0]; const m02 = z[0];
  const m10 = x[1]; const m11 = y[1]; const m12 = z[1];
  const m20 = x[2]; const m21 = y[2]; const m22 = z[2];
  const trace = m00 + m11 + m22;
  let quaternion: Quaternion;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    quaternion = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s * 0.25];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    quaternion = [s * 0.25, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    quaternion = [(m01 + m10) / s, s * 0.25, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    quaternion = [(m02 + m20) / s, (m12 + m21) / s, s * 0.25, (m10 - m01) / s];
  }
  return normalizeQuaternion(quaternion);
};

export function quaternionForFormationSlot(
  orientation: Vec3,
  roll = 0,
  slotIndex = 0,
): Quaternion {
  const finiteDirection = orientation.every(Number.isFinite)
    ? orientation
    : [0, 0, 1] as Vec3;
  const forward = normalize(finiteDirection, [0, 0, 1]);
  const primaryUp: Vec3 = Math.abs(dot(forward, [0, 1, 0])) < 0.92
    ? [0, 1, 0]
    : [1, 0, 0];
  const deterministicFallback: Vec3 = slotIndex % 2 === 0 ? [1, 0, 0] : [0, 0, 1];
  const right = normalize(cross(primaryUp, forward), deterministicFallback);
  const up = normalize(cross(forward, right), [0, 1, 0]);
  const safeRoll = Number.isFinite(roll) ? roll : 0;
  const c = Math.cos(safeRoll);
  const s = Math.sin(safeRoll);
  const rolledRight = add(mul(right, c), mul(up, s));
  const rolledUp = sub(mul(up, c), mul(right, s));
  return quaternionFromBasis(
    normalize(rolledRight, right),
    normalize(rolledUp, up),
    forward,
  );
}

const groupForIndex = (index: number, count: number) =>
  Math.min(GROUP_COUNT - 1, Math.floor((index * GROUP_COUNT) / Math.max(count, 1)));

function sampleLineSegments(segments: readonly [Vec3, Vec3][], count: number): Sample[] {
  if (segments.length === 0) return [];
  return Array.from({ length: count }, (_, index) => {
    const segment = segments[index % segments.length];
    const cycle = Math.floor(index / segments.length);
    const t = fract((cycle + 0.5) * GOLDEN);
    const delta = sub(segment[1], segment[0]);
    return {
      position: add(segment[0], mul(delta, t)),
      orientation: normalize(delta),
    };
  });
}

function triangleArea([a, b, c]: Triangle) {
  return length(cross(sub(b, a), sub(c, a))) * 0.5;
}

function sampleTriangles(triangles: readonly Triangle[], count: number): Sample[] {
  const cumulative: number[] = [];
  let totalArea = 0;
  for (const triangle of triangles) {
    totalArea += Math.max(triangleArea(triangle), 1e-6);
    cumulative.push(totalArea);
  }

  return Array.from({ length: count }, (_, index) => {
    const areaTarget = fract((index + 0.5) * GOLDEN) * totalArea;
    let triangleIndex = 0;
    while (triangleIndex < cumulative.length - 1 && areaTarget > cumulative[triangleIndex]) {
      triangleIndex += 1;
    }
    const [a, b, c] = triangles[triangleIndex];
    const r1 = Math.sqrt(fract((index + 0.5) * SILVER));
    const r2 = fract((index + 0.5) * 0.7548776662466927);
    const wa = 1 - r1;
    const wb = r1 * (1 - r2);
    const wc = r1 * r2;
    return {
      position: [
        a[0] * wa + b[0] * wb + c[0] * wc,
        a[1] * wa + b[1] * wb + c[1] * wc,
        a[2] * wa + b[2] * wb + c[2] * wc,
      ],
      orientation: normalize(sub(b, a)),
    };
  });
}

function graphite(count: number, open: boolean): Sample[] {
  const samples: Sample[] = [];
  const basePerLayer = Math.floor(count / GRAPHITE_LAYERS);
  const remainder = count % GRAPHITE_LAYERS;
  for (let layer = 0; layer < GRAPHITE_LAYERS; layer++) {
    const layerCount = basePerLayer + (layer < remainder ? 1 : 0);
    const columns = Math.max(1, Math.ceil(Math.sqrt(layerCount * 1.42)));
    const rows = Math.max(1, Math.ceil(layerCount / columns));
    const layerT = layer / (GRAPHITE_LAYERS - 1) - 0.5;
    const taper = 1 - Math.abs(layerT) * 0.12;
    const separation = open ? layerT * 0.42 : 0;
    for (let local = 0; local < layerCount; local++) {
      const row = Math.floor(local / columns);
      const column = local % columns;
      const stagger = (row & 1) * 0.5;
      const x = ((column + stagger) / Math.max(columns - 0.5, 1) - 0.5) * 1.92 * taper;
      const z = (row / Math.max(rows - 1, 1) - 0.5) * 1.46 * taper;
      const angle = (local + layer) % 2 === 0 ? 0 : Math.PI / 3;
      samples.push({
        position: [
          x + separation,
          layerT * 1.64,
          z,
        ],
        orientation: [Math.cos(angle), 0, Math.sin(angle)],
        roll: (layer % 3) * (Math.PI / 6),
        sizeScale: 0.74,
        interactionBudget: GRAPHITE_INTERACTION_BUDGET,
      });
    }
  }
  if (count >= GRAPHITE_LAYERS) {
    const layers = [...new Set(samples.map((sample) => Math.round(sample.position[1] * 1e7)))]
      .sort((a, b) => a - b);
    if (layers.length !== GRAPHITE_LAYERS) {
      throw new Error(`Gate-1 graphite expected ${GRAPHITE_LAYERS} distinct layers.`);
    }
    for (let index = 1; index < layers.length; index++) {
      if ((layers[index] - layers[index - 1]) / 1e7 <= 1e-4) {
        throw new Error("Gate-1 graphite layer spacing is degenerate.");
      }
    }
    const centers = new Set(samples.map((sample) => vecKey(sample.position)));
    if (centers.size !== samples.length) {
      throw new Error("Gate-1 graphite contains duplicate shard centres.");
    }
  }
  return samples;
}

function icosahedron() {
  const phi = (1 + Math.sqrt(5)) / 2;
  const vertices: Vec3[] = [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
  ].map((vertex) => normalize(vertex as Vec3));
  let edgeDistance = Infinity;
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      edgeDistance = Math.min(edgeDistance, length(sub(vertices[i], vertices[j])));
    }
  }
  const edges: [number, number][] = [];
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      if (Math.abs(length(sub(vertices[i], vertices[j])) - edgeDistance) < 1e-5) {
        edges.push([i, j]);
      }
    }
  }
  return { vertices, edges };
}

function vecKey(point: Vec3) {
  return point.map((value) => Math.round(value * 1e7)).join(",");
}

function uniqueSegments(segments: readonly [Vec3, Vec3][]): [Vec3, Vec3][] {
  const unique = new Map<string, [Vec3, Vec3]>();
  for (const segment of segments) {
    const key = [vecKey(segment[0]), vecKey(segment[1])].sort().join("|");
    if (!unique.has(key)) unique.set(key, segment);
  }
  return [...unique.values()];
}

function fullereneSegments(): [Vec3, Vec3][] {
  const { vertices, edges } = icosahedron();
  const adjacency = vertices.map(() => [] as number[]);
  for (const [a, b] of edges) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }

  const directed = new Map<string, Vec3>();
  for (const [a, b] of edges) {
    directed.set(`${a}:${b}`, add(mul(vertices[a], 2 / 3), mul(vertices[b], 1 / 3)));
    directed.set(`${b}:${a}`, add(mul(vertices[b], 2 / 3), mul(vertices[a], 1 / 3)));
  }

  const segments: [Vec3, Vec3][] = edges.map(([a, b]) => [
    directed.get(`${a}:${b}`) as Vec3,
    directed.get(`${b}:${a}`) as Vec3,
  ]);

  for (let vertexIndex = 0; vertexIndex < vertices.length; vertexIndex++) {
    const normal = vertices[vertexIndex];
    const basisX = normalize(cross(normal, Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    const basisY = cross(normal, basisX);
    const neighbours = [...adjacency[vertexIndex]].sort((a, b) => {
      const da = normalize(sub(vertices[a], normal));
      const db = normalize(sub(vertices[b], normal));
      return Math.atan2(dot(da, basisY), dot(da, basisX))
        - Math.atan2(dot(db, basisY), dot(db, basisX));
    });
    for (let i = 0; i < neighbours.length; i++) {
      segments.push([
        directed.get(`${vertexIndex}:${neighbours[i]}`) as Vec3,
        directed.get(`${vertexIndex}:${neighbours[(i + 1) % neighbours.length]}`) as Vec3,
      ]);
    }
  }
  return uniqueSegments(segments);
}

function fullereneOpeningCenters(): Vec3[] {
  const { vertices, edges } = icosahedron();
  const adjacency = vertices.map(() => [] as number[]);
  const edgeKeys = new Set<string>();
  for (const [a, b] of edges) {
    adjacency[a].push(b);
    adjacency[b].push(a);
    edgeKeys.add(`${Math.min(a, b)}:${Math.max(a, b)}`);
  }
  const centers: Vec3[] = adjacency.map((neighbours, vertexIndex) => {
    const ring = neighbours.map((neighbour) => add(
      mul(vertices[vertexIndex], 2 / 3),
      mul(vertices[neighbour], 1 / 3),
    ));
    return mul(
      ring.reduce((sum, point) => add(sum, point), [0, 0, 0] as Vec3),
      1 / ring.length,
    );
  });
  for (let a = 0; a < vertices.length; a++) {
    for (let b = a + 1; b < vertices.length; b++) {
      if (!edgeKeys.has(`${a}:${b}`)) continue;
      for (let c = b + 1; c < vertices.length; c++) {
        if (!edgeKeys.has(`${a}:${c}`) || !edgeKeys.has(`${b}:${c}`)) continue;
        centers.push(mul(add(add(vertices[a], vertices[b]), vertices[c]), 1 / 3));
      }
    }
  }
  if (centers.length !== 32) {
    throw new Error("Gate-1 C60 topology does not contain 12 pentagons and 20 hexagons.");
  }
  return centers;
}

function fullerene(count: number): Sample[] {
  const segments = fullereneSegments();
  const samples: Sample[] = [];
  const allocations: number[] = [];
  const basePerEdge = Math.floor(count / segments.length);
  const remainder = count % segments.length;
  const strandRadius = 0.014;
  for (let edgeIndex = 0; edgeIndex < segments.length; edgeIndex++) {
    const [a, b] = segments[edgeIndex];
    const slots = basePerEdge + (edgeIndex < remainder ? 1 : 0);
    allocations.push(slots);
    const tangent = normalize(sub(b, a), [0, 0, 1]);
    const midpoint = mul(add(a, b), 0.5);
    const radial = normalize(midpoint, [0, 1, 0]);
    const side = normalize(cross(tangent, radial), [1, 0, 0]);
    const outward = normalize(cross(side, tangent), radial);
    for (let local = 0; local < slots; local++) {
      const strand = local % 4;
      const alongIndex = Math.floor(local / 4);
      const strandSlots = Math.floor((slots - 1 - strand) / 4) + 1;
      const t = (alongIndex + 0.5) / Math.max(strandSlots, 1);
      const angle = strand * Math.PI * 0.5;
      const strandOffset = add(
        mul(side, Math.cos(angle) * strandRadius),
        mul(outward, Math.sin(angle) * strandRadius),
      );
      samples.push({
        position: add(add(a, mul(sub(b, a), t)), strandOffset),
        orientation: tangent,
        roll: angle + (edgeIndex % 3) * (Math.PI / 12),
        sizeScale: FULLERENE_SIZE_SCALE,
        interactionBudget: FULLERENE_INTERACTION_BUDGET,
      });
    }
  }
  if (segments.length !== 90) {
    throw new Error("Gate-1 C60 does not contain exactly 90 unique edges.");
  }
  if (count >= segments.length && Math.max(...allocations) - Math.min(...allocations) > 1) {
    throw new Error("Gate-1 C60 edge allocation differs by more than one slot.");
  }
  const centers = new Set(samples.map((sample) => vecKey(sample.position)));
  if (centers.size !== samples.length) {
    throw new Error("Gate-1 C60 contains duplicate shard centres.");
  }
  const centralRadius = samples.reduce(
    (minimum, sample) => Math.min(minimum, length(sample.position)),
    Infinity,
  );
  if (samples.length > 0 && centralRadius <= 0.35) {
    throw new Error("Gate-1 C60 central void is not open.");
  }
  for (const openingCenter of fullereneOpeningCenters()) {
    const openingRadius = samples.reduce(
      (minimum, sample) => Math.min(minimum, length(sub(sample.position, openingCenter))),
      Infinity,
    );
    if (samples.length > 0 && openingRadius <= 0.08) {
      throw new Error("Gate-1 C60 polygon opening contains a shard centre.");
    }
  }
  return samples;
}

export function getFullereneEdgeCount() {
  return fullereneSegments().length;
}

function diamondSegments(): [Vec3, Vec3][] {
  const basis: Vec3[] = [
    [0, 0, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [0.5, 0.5, 0],
    [0.25, 0.25, 0.25], [0.25, 0.75, 0.75], [0.75, 0.25, 0.75], [0.75, 0.75, 0.25],
  ];
  const points: Vec3[] = [];
  for (let x = 0; x < 3; x++) {
    for (let y = 0; y < 3; y++) {
      for (let z = 0; z < 3; z++) {
        for (const offset of basis) points.push([x + offset[0], y + offset[1], z + offset[2]]);
      }
    }
  }
  const nearest = Math.sqrt(3) / 4;
  const segments: [Vec3, Vec3][] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (Math.abs(length(sub(points[i], points[j])) - nearest) < 1e-5) {
        const a = points[i].map((value) => (value / 2.75) * 2 - 1) as Vec3;
        const b = points[j].map((value) => (value / 2.75) * 2 - 1) as Vec3;
        segments.push([a, b]);
      }
    }
  }
  return segments;
}

function diamondLattice(count: number): Sample[] {
  return sampleLineSegments(diamondSegments(), count);
}

function grapheneSegments(): [Vec3, Vec3][] {
  const segments: [Vec3, Vec3][] = [];
  const seen = new Set<string>();
  const radius = 0.16;
  for (let row = -5; row <= 5; row++) {
    for (let column = -4; column <= 4; column++) {
      const cx = column * radius * 3 + (row & 1 ? radius * 1.5 : 0);
      const cy = row * radius * Math.sqrt(3) * 0.86;
      const vertices = Array.from({ length: 6 }, (_, index): Vec3 => {
        const angle = (Math.PI / 3) * index;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        return [x, y, Math.sin(x * 2.4) * 0.09 + Math.cos(y * 2) * 0.04];
      });
      for (let i = 0; i < 6; i++) {
        const a = vertices[i];
        const b = vertices[(i + 1) % 6];
        const key = [a, b]
          .map((point) => point.map((value) => Math.round(value * 1000)).join(","))
          .sort()
          .join("|");
        if (!seen.has(key)) {
          seen.add(key);
          segments.push([a, b]);
        }
      }
    }
  }
  return segments;
}

function graphene(count: number): Sample[] {
  return sampleLineSegments(grapheneSegments(), count);
}

function nanotube(count: number): Sample[] {
  return Array.from({ length: count }, (_, index) => {
    const around = fract(index * GOLDEN);
    const along = fract(index * 0.5698402909980532);
    const angle = around * Math.PI * 2 + (Math.floor(index / 37) % 2) * 0.08;
    const radius = 0.82 + Math.sin((along * 18 + around * 12) * Math.PI) * 0.035;
    return {
      position: [Math.cos(angle) * radius, along * 2 - 1, Math.sin(angle) * radius],
      orientation: index % 3 === 0
        ? normalize([-Math.sin(angle), 0, Math.cos(angle)])
        : [0, 1, 0],
    };
  });
}

function routingLattice(count: number): Sample[] {
  const base = diamondLattice(count);
  return base.map((sample, index) => ({
    ...sample,
    position: [
      sample.position[0] * 0.88,
      sample.position[1],
      sample.position[2] * 0.48 + Math.sin(index * GOLDEN * Math.PI * 2) * 0.04,
    ],
  }));
}

function crystal(count: number, seedOnly: boolean): Sample[] {
  return Array.from({ length: count }, (_, index) => {
    const vertical = fract(index * GOLDEN);
    const angleStep = index % 8;
    const side = Math.floor(index / 8) % 2;
    const angle = (angleStep / 8) * Math.PI * 2;
    const y = seedOnly ? -0.9 + vertical * 0.2 : vertical * 1.75 - 0.88;
    const shoulder = seedOnly
      ? 0.42
      : clamp(Math.min((y + 1.02) * 2.6, (1.05 - y) * 2.2), 0.2, 0.82);
    const radius = shoulder * (side === 0 ? 1 : 0.82);
    return {
      position: [Math.cos(angle) * radius, y, Math.sin(angle) * radius],
      orientation: normalize([-Math.sin(angle), 0.45, Math.cos(angle)]),
    };
  });
}

function octahedronTriangles(): Triangle[] {
  const top: Vec3 = [0, 1, 0];
  const bottom: Vec3 = [0, -1, 0];
  const ring: Vec3[] = [[1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1]];
  const triangles: Triangle[] = [];
  for (let i = 0; i < ring.length; i++) {
    triangles.push([top, ring[i], ring[(i + 1) % ring.length]]);
    triangles.push([bottom, ring[(i + 1) % ring.length], ring[i]]);
  }
  return triangles;
}

function roughDiamond(count: number): Sample[] {
  return sampleTriangles(octahedronTriangles(), count);
}

function ring(count: number, radius: number, y: number, offset = 0): Vec3[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = offset + (index / count) * Math.PI * 2;
    return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
  });
}

function brilliantFacets(): Vec3[][] {
  const table = ring(8, 0.42, 0.36);
  const star = ring(8, 0.67, 0.23, Math.PI / 8);
  const girdle = ring(16, 1, 0);
  const pavilion = ring(8, 0.48, -0.42, Math.PI / 8);
  const culet: Vec3 = [0, -0.9, 0];
  const facets: Vec3[][] = [[...table]];

  for (let i = 0; i < 8; i++) {
    const next = (i + 1) % 8;
    facets.push([table[i], table[next], star[i]]); // 8 star facets
    facets.push([table[next], star[i], girdle[i * 2 + 1], star[next]]); // 8 bezels
    facets.push([pavilion[i], culet, pavilion[next]]); // 8 pavilion mains
  }
  for (let i = 0; i < 16; i++) {
    const next = (i + 1) % 16;
    const starIndex = Math.floor(i / 2);
    const pavilionIndex = Math.floor(i / 2);
    facets.push([star[starIndex], girdle[i], girdle[next]]); // 16 upper girdles
    facets.push([girdle[i], pavilion[pavilionIndex], girdle[next]]); // 16 lower girdles
  }
  return facets;
}

function triangulateFacets(facets: readonly Vec3[][]): Triangle[] {
  const triangles: Triangle[] = [];
  for (const facet of facets) {
    for (let index = 1; index < facet.length - 1; index++) {
      triangles.push([facet[0], facet[index], facet[index + 1]]);
    }
  }
  return triangles;
}

function brilliant(count: number): Sample[] {
  return sampleTriangles(triangulateFacets(brilliantFacets()), count);
}

function triad(count: number): Sample[] {
  const counts = [
    Math.ceil(count * 0.34),
    Math.floor(count * 0.33),
    count - Math.ceil(count * 0.34) - Math.floor(count * 0.33),
  ];
  const sources = [graphite(counts[0], true), fullerene(counts[1]), diamondLattice(counts[2])];
  const centers: Vec3[] = [[0.32, 0.68, 0], [-0.48, 0.02, 0], [0.34, -0.66, 0]];
  const scales = [0.38, 0.44, 0.38];
  return sources.flatMap((samples, group) => samples.map((sample) => ({
    position: add(centers[group], mul(sample.position, scales[group])),
    orientation: sample.orientation,
    group,
  })));
}

function generateRaw(id: FormationId, count: number): Sample[] {
  switch (id) {
    case "source.graphiteClosed": return graphite(count, false);
    case "source.graphiteOpen": return graphite(count, true);
    case "principle.triad": return triad(count);
    case "principle.graphite": return graphite(count, true);
    case "principle.fullerene": return fullerene(count);
    case "principle.diamondLattice": return diamondLattice(count);
    case "capability.graphene": return graphene(count);
    case "capability.nanotube": return nanotube(count);
    case "capability.routingLattice": return routingLattice(count);
    case "lenox.seed": return crystal(count, true);
    case "lenox.crystal": return crystal(count, false);
    case "lenox.roughDiamond": return roughDiamond(count);
    case "contact.brilliant": return brilliant(count);
    default:
      throw new Error(`Formation ${id} is authored by a dedicated Design 01 builder.`);
  }
}

function splitBy3(value: number) {
  value &= 0x3ff;
  value = (value | (value << 16)) & 0x030000ff;
  value = (value | (value << 8)) & 0x0300f00f;
  value = (value | (value << 4)) & 0x030c30c3;
  value = (value | (value << 2)) & 0x09249249;
  return value;
}

function mortonKey(position: Vec3, min: Vec3, max: Vec3) {
  const quantize = (value: number, axis: number) => Math.round(
    clamp((value - min[axis]) / Math.max(max[axis] - min[axis], 1e-6), 0, 1) * 1023,
  );
  return splitBy3(quantize(position[0], 0))
    | (splitBy3(quantize(position[1], 1)) << 1)
    | (splitBy3(quantize(position[2], 2)) << 2);
}

function prepareSamples(samples: Sample[], count: number): Sample[] {
  const explicitGroups = samples.some((sample) => sample.group !== undefined);
  if (!explicitGroups) {
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const sample of samples) {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], sample.position[axis]);
        max[axis] = Math.max(max[axis], sample.position[axis]);
      }
    }
    samples.sort((a, b) => mortonKey(a.position, min, max) - mortonKey(b.position, min, max));
    samples.forEach((sample, index) => { sample.group = groupForIndex(index, count); });
  }

  const result: Sample[] = [];
  for (let group = 0; group < GROUP_COUNT; group++) {
    const cohort = samples.filter((sample) => sample.group === group);
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const sample of cohort) {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], sample.position[axis]);
        max[axis] = Math.max(max[axis], sample.position[axis]);
      }
    }
    cohort.sort((a, b) => mortonKey(a.position, min, max) - mortonKey(b.position, min, max));
    result.push(...cohort);
  }
  return result;
}

function refineAgainstCanonical(canonical: Sample[], target: Sample[]): Sample[] {
  const result = [...target];
  let groupStart = 0;
  for (let group = 0; group < GROUP_COUNT; group++) {
    const groupEnd = result.findIndex(
      (sample, index) => index >= groupStart && (sample.group ?? 0) > group,
    );
    const end = groupEnd === -1 ? result.length : groupEnd;
    for (let index = groupStart; index < end; index++) {
      let best = index;
      let bestDistance = distanceSquared(canonical[index].position, result[index].position);
      const windowEnd = Math.min(end, index + 32);
      for (let candidate = index + 1; candidate < windowEnd; candidate++) {
        const candidateDistance = distanceSquared(
          canonical[index].position,
          result[candidate].position,
        );
        if (candidateDistance < bestDistance - 1e-9) {
          best = candidate;
          bestDistance = candidateDistance;
        }
      }
      if (best !== index) [result[index], result[best]] = [result[best], result[index]];
    }
    groupStart = end;
  }
  return result;
}

/**
 * THE COPY CORRIDOR IS A NUMBER, NOT AN INTENTION.
 *
 * Two video rejections in a row were the same defect: matter lying on the copy
 * while the CSS corridor was provably correct. The corridor was written down in
 * prose, so nothing could enforce it. Here it is a bound the tests check.
 *
 * Calibrated against the fixed studio pose (`STUDIO_POSE` in
 * `StudioExperience.tsx`), measured on the real route at 1440px:
 *
 *     normalised x 0.90 → screen  8.4%
 *     normalised x 0.70 → screen 31.7%
 *
 * Simulation +x renders screen-left, so a HIGHER normalised x sits further
 * left. `min` is therefore the right-most edge the matter may reach.
 *
 * If the studio pose ever changes, these numbers must be re-measured — that is
 * exactly why the camera is no longer allowed to move per chapter.
 */
const SCREEN_AT_X090 = 8.4;
const SCREEN_PER_X = (31.7 - 8.4) / (0.9 - 0.7);

export const screenPercentForNormalisedX = (x: number): number =>
  SCREEN_AT_X090 + (0.9 - x) * SCREEN_PER_X;

/**
 * Per family, the screen band the matter may occupy in `side` composition.
 * Mirrors the copy columns in `StudioExperience.module.css` (`.renderer01`)
 * with a two-point gutter:
 *
 *   hero / principle  copy from 47%  → matter may run to 45%
 *   capabilities      copy from 22%  → matter may run to 20%
 *   lenox             copy 6%..68%   → matter lives right of it
 *   contact           copy from 22%  → matter may run to 20%
 */
/** A band of normalised simulation x the matter is not allowed to leave. */
export type MatterCorridor = { minX: number; maxX: number };

export const normalisedXForScreenPercent = (percent: number): number =>
  clamp(0.9 - (percent - SCREEN_AT_X090) / SCREEN_PER_X, 0.08, 0.92);

const corridorFromScreen = (fromPercent: number, toPercent: number): MatterCorridor => ({
  minX: normalisedXForScreenPercent(toPercent),
  maxX: normalisedXForScreenPercent(fromPercent),
});

/**
 * The corridor belongs to the CHAPTER, mirroring the copy columns in
 * `StudioExperience.module.css` (`.renderer01`) with a two-point gutter:
 *
 *   hero / principle  copy from 47%  → matter may run to 45%
 *   capabilities      copy from 22%  → matter may run to 20%
 *   lenox             copy 6%..68%   → matter lives right of it
 *   contact           copy from 22%  → matter may run to 20%
 */
/*
 * The bands are stated in normalised x, but a body also has depth, and
 * perspective turns that depth into extra screen width — measured at roughly
 * three points for the nine-layer graphite. So each band is pulled in by that
 * much beyond the gutter the copy needs. The numbers below are the measured
 * ones, not the nominal ones; `narrow` at a nominal 20% put matter across the
 * capability index digits at 22%.
 */
export const MATTER_CORRIDORS: Readonly<Record<MatterCorridorId, MatterCorridor>> = Object.freeze({
  wide: corridorFromScreen(2, 42),
  narrow: corridorFromScreen(2, 16.5),
  right: corridorFromScreen(72, 97),
});

const FAMILY_CORRIDOR: Readonly<Record<string, MatterCorridorId>> = Object.freeze({
  "source.": "wide",
  "principle.": "wide",
  "capability.": "narrow",
  "lenox.": "right",
  "contact.": "narrow",
});

export const corridorForFormation = (id: FormationId): MatterCorridor =>
  MATTER_CORRIDORS[
    FAMILY_CORRIDOR[
      Object.keys(FAMILY_CORRIDOR).find((prefix) => id.startsWith(prefix)) ?? "source."
    ]
  ];

export function formationPlacement(id: FormationId, mode: CompositionMode) {
  const banded = mode === "banded";
  if (id.startsWith("source.")) {
    return banded
      ? { center: [0.5, 0.67, 0.5] as Vec3, scale: [0.22, 0.27, 0.13] as Vec3 }
      : { center: [0.8, 0.5, 0.5] as Vec3, scale: [0.1, 0.3, 0.1] as Vec3 };
  }
  if (id === "principle.triad") {
    return { center: [0.79, 0.49, 0.5] as Vec3, scale: [0.16, 0.3, 0.13] as Vec3 };
  }
  if (id.startsWith("principle.")) {
    return banded
      ? { center: [0.5, 0.69, 0.5] as Vec3, scale: [0.32, 0.25, 0.19] as Vec3 }
      : { center: [0.78, 0.5, 0.5] as Vec3, scale: [0.14, 0.27, 0.14] as Vec3 };
  }
  if (id.startsWith("capability.")) {
    return banded
      ? { center: [0.5, 0.7, 0.5] as Vec3, scale: [0.34, 0.23, 0.17] as Vec3 }
      : { center: [0.85, 0.5, 0.5] as Vec3, scale: [0.04, 0.29, 0.12] as Vec3 };
  }
  if (id.startsWith("lenox.")) {
    // Was center 0.17 / scale 0.09, which projected to 83%..104% — the growing
    // crystal ran off the right edge of the screen. Now inside 71%..96%.
    return banded
      ? { center: [0.5, 0.7, 0.5] as Vec3, scale: [0.28, 0.25, 0.19] as Vec3 }
      : { center: [0.255, 0.52, 0.5] as Vec3, scale: [0.115, 0.29, 0.13] as Vec3 };
  }
  // Contact: was center 0.84 / scale 0.1, whose right edge landed at 27% and
  // ran into a headline that starts at 22%.
  return banded
    ? { center: [0.5, 0.7, 0.5] as Vec3, scale: [0.3, 0.23, 0.22] as Vec3 }
    : { center: [0.862, 0.64, 0.5] as Vec3, scale: [0.058, 0.2, 0.13] as Vec3 };
}

function toBank(
  samples: Sample[],
  bounds: FormationBounds,
  id: FormationId,
  mode: CompositionMode,
  corridor: MatterCorridor,
): FormationBank {
  const { center, scale } = formationPlacement(id, mode);
  const span: Vec3 = [
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  ];
  const positions = new Float32Array(samples.length * 3);
  const rotations = new Float32Array(samples.length * 4);
  const sizeScales = new Float32Array(samples.length);
  const interactionBudgets = new Float32Array(samples.length);
  const groups = new Uint16Array(samples.length);

  const presented = samples.map((sample) => (
    id === "contact.brilliant"
      ? {
        position: rotateY(rotateX(sample.position, -0.28), 0.36),
        orientation: rotateY(rotateX(sample.orientation, -0.28), 0.36),
      }
      : { position: sample.position, orientation: sample.orientation }
  ));

  /*
   * Fit the whole body into the chapter's corridor before anything is written.
   * The corridor belongs to the chapter, the placement to the formation, and
   * the same formation can appear under different corridors — graphite is the
   * hero body and is also held under the far narrower capabilities corridor.
   * Authoring both by hand is how a headline ends up with matter across it, so
   * the fit is computed rather than trusted. The shrink is uniform across all
   * three axes: squeezing x alone would turn a cage into an egg.
   */
  let minX = Infinity;
  let maxX = -Infinity;
  for (const sample of presented) {
    const x = center[0] + sample.position[0] * scale[0];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  const bodyWidth = Math.max(maxX - minX, 1e-6);
  const corridorWidth = Math.max(corridor.maxX - corridor.minX, 1e-6);
  const shrink = Math.min(1, corridorWidth / bodyWidth);
  const bodyCenter = (minX + maxX) / 2;
  const corridorCenter = (corridor.minX + corridor.maxX) / 2;
  const fittedHalf = (bodyWidth * shrink) / 2;
  const targetCenter = clamp(
    bodyCenter,
    corridor.minX + fittedHalf,
    corridor.maxX - fittedHalf,
  );
  const offsetX = (Number.isFinite(targetCenter) ? targetCenter : corridorCenter)
    - bodyCenter * shrink;

  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index];
    const { position: presentationPosition, orientation: presentationOrientation } =
      presented[index];
    const rotation = quaternionForFormationSlot(
      normalize(presentationOrientation, [0, 0, 1]),
      sample.roll ?? 0,
      index,
    );
    for (let axis = 0; axis < 3; axis++) {
      const raw = center[axis] + presentationPosition[axis] * scale[axis];
      // x is shifted into the corridor; y and z only shrink with it, around
      // their own placement centre, so the body keeps its proportions.
      const normalized = axis === 0
        ? raw * shrink + offsetX
        : center[axis] + (raw - center[axis]) * shrink;
      positions[index * 3 + axis] = bounds.min[axis] + span[axis] * clamp(normalized, 0.08, 0.92);
    }
    rotations.set(rotation, index * 4);
    sizeScales[index] = sample.sizeScale ?? DEFAULT_SIZE_SCALE;
    interactionBudgets[index] = sample.interactionBudget ?? DEFAULT_INTERACTION_BUDGET;
    groups[index] = sample.group ?? groupForIndex(index, samples.length);
  }
  return { positions, rotations, sizeScales, interactionBudgets, groups };
}

export function buildAllotropFormation(
  id: FormationId,
  bounds: FormationBounds,
  count: number,
  mode: CompositionMode,
  corridor: MatterCorridor = corridorForFormation(id),
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
  const canonical = prepareSamples(graphite(resolvedCount, false), resolvedCount);
  const target = prepareSamples(generateRaw(id, resolvedCount), resolvedCount);
  const bank = toBank(
    id === "source.graphiteClosed" ? canonical : refineAgainstCanonical(canonical, target),
    bounds,
    id,
    mode,
    corridor,
  );
  validateFormationBank(bank, resolvedCount, id);
  return bank;
}

export function validateFormationBank(
  bank: FormationBank,
  count: number,
  id: FormationId,
) {
  const expectedLengths = [
    ["positions", bank.positions.length, count * 3],
    ["rotations", bank.rotations.length, count * 4],
    ["size scales", bank.sizeScales.length, count],
    ["interaction budgets", bank.interactionBudgets.length, count],
    ["groups", bank.groups.length, count],
  ] as const;
  for (const [label, actual, expected] of expectedLengths) {
    if (actual !== expected) {
      throw new Error(`ALLOTROP ${id} ${label} length ${actual} does not match ${expected}.`);
    }
  }
  const gateOneCenters = id === "source.graphiteClosed" || id === "principle.fullerene"
    ? new Set<string>()
    : null;
  for (let index = 0; index < count; index++) {
    const position: Vec3 = [
      bank.positions[index * 3],
      bank.positions[index * 3 + 1],
      bank.positions[index * 3 + 2],
    ];
    const rotation = bank.rotations.slice(index * 4, index * 4 + 4);
    if (!position.every(Number.isFinite) || !rotation.every(Number.isFinite)) {
      throw new Error(`ALLOTROP ${id} contains non-finite slot data at ${index}.`);
    }
    if (Math.abs(Math.hypot(...rotation) - 1) > 1e-4) {
      throw new Error(`ALLOTROP ${id} quaternion is not normalized at slot ${index}.`);
    }
    if (
      !Number.isFinite(bank.sizeScales[index])
      || !Number.isFinite(bank.interactionBudgets[index])
      || bank.sizeScales[index] <= 0
      || bank.interactionBudgets[index] <= 0
    ) {
      throw new Error(`ALLOTROP ${id} scale metadata is invalid at slot ${index}.`);
    }
    if (gateOneCenters) {
      const key = vecKey(position);
      if (gateOneCenters.has(key)) {
        throw new Error(`ALLOTROP ${id} contains duplicate placed centres.`);
      }
      gateOneCenters.add(key);
    }
  }
}

const hash01 = (value: number) => fract(Math.sin(value * 12.9898 + 78.233) * 43758.5453);

export function packFormationPair(
  fromId: FormationId,
  toId: FormationId,
  from: FormationBank,
  to: FormationBank,
  bounds?: FormationBounds,
): FormationPair {
  if (from.groups.length !== to.groups.length) {
    throw new Error("ALLOTROP banks must contain the same number of slots.");
  }
  const count = from.groups.length;
  const packed = new Float32Array(count * FORMATION_PAIR_FLOATS);
  const fromCenter = formationCenter(from.positions, count);
  const toCenter = formationCenter(to.positions, count);
  const graphiteUnfold = fromId === "principle.fullerene"
    && toId === "source.graphiteClosed";
  const heroContinuum = fromId === "principle.fullerene"
    && toId === "principle.continuum";
  const continuumTriAxis = fromId === "principle.continuum"
    && toId === "capability.triaxis";
  const triAxisVectorLoom = fromId === "capability.triaxis"
    && toId === "lenox.vectorLoom";
  const vectorLoomForwardVector = fromId === "lenox.vectorLoom"
    && toId === "contact.forwardVector";
  const sourceGroupRanks = new Uint32Array(count);
  const sourceGroupCounts = [0, 0, 0];
  for (let index = 0; index < count; index += 1) {
    const group = clamp(Math.round(from.groups[index]), 0, 2);
    sourceGroupRanks[index] = sourceGroupCounts[group];
    sourceGroupCounts[group] += 1;
  }
  let minToX = Infinity;
  let maxToX = -Infinity;
  let minToY = Infinity;
  let maxToY = -Infinity;
  let minToZ = Infinity;
  let maxToZ = -Infinity;
  for (let index = 0; index < count; index++) {
    minToX = Math.min(minToX, to.positions[index * 3]);
    maxToX = Math.max(maxToX, to.positions[index * 3]);
    minToY = Math.min(minToY, to.positions[index * 3 + 1]);
    maxToY = Math.max(maxToY, to.positions[index * 3 + 1]);
    minToZ = Math.min(minToZ, to.positions[index * 3 + 2]);
    maxToZ = Math.max(maxToZ, to.positions[index * 3 + 2]);
  }

  for (let index = 0; index < count; index++) {
    const base = index * FORMATION_PAIR_FLOATS;
    const fp: Vec3 = [from.positions[index * 3], from.positions[index * 3 + 1], from.positions[index * 3 + 2]];
    const tp: Vec3 = [to.positions[index * 3], to.positions[index * 3 + 1], to.positions[index * 3 + 2]];
    const fromRotation = Array.from(from.rotations.slice(index * 4, index * 4 + 4)) as Quaternion;
    const toRotation = nlerpFormationQuaternions(
      fromRotation,
      Array.from(to.rotations.slice(index * 4, index * 4 + 4)) as Quaternion,
      1,
    );
    const delta = sub(tp, fp);
    const deltaLength = length(delta);
    const routeFallback: Vec3 = [hash01(index + 1) - 0.5, hash01(index + 17) - 0.5, hash01(index + 41) * 0.3 - 0.15];
    const standardRouteAxis = normalize(
      [-delta[1], delta[0], delta[2] * 0.18],
      normalize(routeFallback),
    );
    const sourceRadial = normalize(sub(fp, fromCenter), normalize(routeFallback));
    const unfoldRouteAxis = normalize(
      cross(sourceRadial, [0, 0, 1]),
      standardRouteAxis,
    );
    const deltaDirection = normalize(delta, standardRouteAxis);
    const heroCurlAxis = normalize(
      cross(sourceRadial, deltaDirection),
      standardRouteAxis,
    );
    const heroRouteAxis = normalize(
      add(mul(heroCurlAxis, 0.78), mul(standardRouteAxis, 0.22)),
      standardRouteAxis,
    );
    const sourceGroup = clamp(Math.round(from.groups[index]), 0, 2);
    const axisNormal: Vec3 = sourceGroup === 0
      ? [0, 0, 1]
      : sourceGroup === 1 ? [1, 0, 0] : [0, 1, 0];
    const triAxisCurl = normalize(
      cross(deltaDirection, axisNormal),
      standardRouteAxis,
    );
    const triAxisRouteAxis = normalize(
      add(
        add(mul(triAxisCurl, 0.72), mul(axisNormal, 0.22)),
        mul(sourceRadial, 0.06),
      ),
      standardRouteAxis,
    );
    const loomLift: Vec3 = sourceGroup === 0
      ? [0, 1, -0.24]
      : sourceGroup === 1 ? [0, 1, 0.24] : [0, 0.56, -0.84];
    const loomCurl = normalize(
      cross(deltaDirection, loomLift),
      standardRouteAxis,
    );
    const loomRouteAxis = normalize(
      add(mul(loomLift, 0.82), mul(loomCurl, 0.18)),
      standardRouteAxis,
    );
    const forwardRailNormal: Vec3 = sourceGroup === 2
      ? [0, 0.12, 1]
      : sourceGroup === 0 ? [0, -0.72, 0.34] : [0, 0.72, -0.34];
    const forwardRailCurl = normalize(
      cross(deltaDirection, forwardRailNormal),
      standardRouteAxis,
    );
    const forwardRouteAxis = normalize(
      add(mul(forwardRailCurl, 0.74), mul(forwardRailNormal, 0.26)),
      standardRouteAxis,
    );
    const routeAxis = heroContinuum
      ? heroRouteAxis
      : continuumTriAxis
        ? triAxisRouteAxis
        : triAxisVectorLoom
          ? loomRouteAxis
          : vectorLoomForwardVector
            ? forwardRouteAxis
            : graphiteUnfold ? unfoldRouteAxis : standardRouteAxis;
    const heightDelay = (tp[1] - minToY) / Math.max(maxToY - minToY, 1e-6);
    const depthDelay = (tp[2] - minToZ) / Math.max(maxToZ - minToZ, 1e-6);
    const sourceAzimuth = fract(
      Math.atan2(sourceRadial[1], sourceRadial[0]) / (Math.PI * 2) + 1,
    );
    const heroDelay = clamp(
      sourceAzimuth * 0.86
        + (sourceRadial[2] * 0.5 + 0.5) * 0.1
        + hash01(index + 5) * 0.04,
      0,
      1,
    );
    const sourceGroupPhase = sourceGroupRanks[index]
      / Math.max(sourceGroupCounts[sourceGroup] - 1, 1);
    const triAxisDelay = clamp(
      sourceGroup * 0.24 + sourceGroupPhase * 0.27 + hash01(index + 5) * 0.03,
      0,
      1,
    );
    const opposingMainPhase = sourceGroup === 1
      ? 1 - sourceGroupPhase
      : sourceGroupPhase;
    const loomDelay = clamp(
      sourceGroup === 2
        ? 0.42 + sourceGroupPhase * 0.24 + hash01(index + 5) * 0.02
        : sourceGroup * 0.06 + opposingMainPhase * 0.32 + hash01(index + 5) * 0.02,
      0,
      1,
    );
    const targetForwardPhase = clamp(
      (tp[0] - minToX) / Math.max(maxToX - minToX, 1e-6),
      0,
      1,
    );
    const forwardDelay = clamp(
      sourceGroup === 2
        ? targetForwardPhase * 0.28 + hash01(index + 5) * 0.01
        : 0.18
          + targetForwardPhase * 0.52
          + (sourceGroup === 1 ? 0.08 : 0)
          + hash01(index + 5) * 0.015,
      0,
      1,
    );
    const delay = heroContinuum
      ? heroDelay
      : continuumTriAxis
        ? triAxisDelay
        : triAxisVectorLoom
          ? loomDelay
          : vectorLoomForwardVector
            ? forwardDelay
            : graphiteUnfold
        ? clamp(depthDelay * 0.84 + hash01(index + 5) * 0.1, 0, 1)
        : toId === "lenox.crystal"
          ? clamp(heightDelay * 0.82 + hash01(index + 5) * 0.18, 0, 1)
          : hash01(index + 5);
    const requestedAmplitude = fromId === toId
      ? 0
      : heroContinuum
        ? Math.min(1.05, deltaLength * 0.075 + 0.09 + hash01(index + 9) * 0.05)
        : continuumTriAxis
          ? Math.min(0.88, deltaLength * 0.065 + 0.07 + hash01(index + 9) * 0.04)
          : triAxisVectorLoom
            ? Math.min(
                sourceGroup === 2 ? 4.8 : 7.2,
                deltaLength * (sourceGroup === 2 ? 0.12 : 0.18)
                  + (sourceGroup === 2 ? 0.9 : 1.6)
                  + hash01(index + 9) * 0.3,
              )
            : vectorLoomForwardVector
              ? Math.min(
                  sourceGroup === 2 ? 1.9 : 3.2,
                  deltaLength * (sourceGroup === 2 ? 0.055 : 0.085)
                    + (sourceGroup === 2 ? 0.38 : 0.65)
                    + hash01(index + 9) * 0.18,
                )
              : graphiteUnfold
          ? Math.min(0.78, deltaLength * 0.055 + hash01(index + 9) * 0.08)
          : Math.min(1.5, deltaLength * 0.12 + hash01(index + 9) * 0.16);
    let amplitude = requestedAmplitude;
    if (bounds) {
      const span = sub(bounds.max, bounds.min);
      const safeMin = add(bounds.min, mul(span, 0.06));
      const safeMax = sub(bounds.max, mul(span, 0.06));
      for (let axis = 0; axis < 3; axis++) {
        const axisWeight = Math.abs(routeAxis[axis]);
        if (axisWeight < 1e-5) continue;
        const headroom = Math.min(
          fp[axis] - safeMin[axis],
          tp[axis] - safeMin[axis],
          safeMax[axis] - fp[axis],
          safeMax[axis] - tp[axis],
        );
        amplitude = Math.min(amplitude, Math.max(0, headroom * 0.8) / axisWeight);
      }
    }

    packed.set([fp[0], fp[1], fp[2], from.sizeScales[index]], base);
    packed.set([tp[0], tp[1], tp[2], to.sizeScales[index]], base + 4);
    packed.set(fromRotation, base + 8);
    packed.set(toRotation, base + 12);
    packed.set([
      routeAxis[0],
      routeAxis[1],
      routeAxis[2],
      heroContinuum
        ? 0.25
        : continuumTriAxis
          ? 0.45
          : triAxisVectorLoom
            ? 0.65
            : vectorLoomForwardVector ? 0.75 : graphiteUnfold ? 0.55 : 1,
    ], base + 16);
    packed.set([
      delay,
      amplitude,
      Math.max(from.interactionBudgets[index], to.interactionBudgets[index]),
      0,
    ], base + 20);
  }
  validatePackedFormationPair(packed, count);
  return {
    packed,
    count,
    fromCenter,
    toCenter,
  };
}

function formationCenter(positions: Float32Array, count: number): Vec3 {
  const center: Vec3 = [0, 0, 0];
  if (count <= 0) return center;
  for (let index = 0; index < count; index++) {
    center[0] += positions[index * 3] / count;
    center[1] += positions[index * 3 + 1] / count;
    center[2] += positions[index * 3 + 2] / count;
  }
  return center;
}

export function validatePackedFormationPair(packed: Float32Array, count: number) {
  if (packed.length !== count * FORMATION_PAIR_FLOATS) {
    throw new Error("ALLOTROP pair length does not match its fixed 96-byte stride.");
  }
  for (let index = 0; index < count; index++) {
    const base = index * FORMATION_PAIR_FLOATS;
    for (let component = 0; component < FORMATION_PAIR_FLOATS; component++) {
      if (!Number.isFinite(packed[base + component])) {
        throw new Error(`ALLOTROP pair contains a non-finite value at slot ${index}.`);
      }
    }
    if (packed[base + 3] <= 0 || packed[base + 7] <= 0 || packed[base + 19] <= 0) {
      throw new Error(`ALLOTROP pair contains a non-positive scale at slot ${index}.`);
    }
    if (packed[base + 20] < 0 || packed[base + 20] > 1 || packed[base + 22] <= 0) {
      throw new Error(`ALLOTROP pair metadata is outside its contract at slot ${index}.`);
    }
    if (packed[base + 23] !== 0) {
      throw new Error(`ALLOTROP pair reserved field is not zero at slot ${index}.`);
    }
    for (const rotationOffset of [8, 12]) {
      const magnitude = Math.hypot(
        packed[base + rotationOffset],
        packed[base + rotationOffset + 1],
        packed[base + rotationOffset + 2],
        packed[base + rotationOffset + 3],
      );
      if (Math.abs(magnitude - 1) > 1e-4) {
        throw new Error(`ALLOTROP pair quaternion is not normalized at slot ${index}.`);
      }
    }
  }
}

export function getBrilliantFacetCount() {
  return brilliantFacets().length;
}
