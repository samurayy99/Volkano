import type { CompositionMode } from "../types";

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

type Vec2 = [number, number];
type Segment2 = [Vec2, Vec2];

export const DESIGN01_GRAPHITE_LAYER_COUNT = 9;
export const DESIGN01_GRAPHITE_CORRIDOR = Object.freeze({
  minX: 0.08,
  maxX: 0.92,
});

const GOLDEN = 0.6180339887498949;
const TARGET_CENTER = Object.freeze({
  side: [0.75, 0.52, 0.5] as const,
  banded: [0.5, 0.61, 0.5] as const,
});
const TARGET_HALF_SIZE = Object.freeze({
  side: [7.4, 10.8, 4.6] as const,
  banded: [6.2, 11.4, 5.2] as const,
});
const fract = (value: number) => value - Math.floor(value);
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const pointKey = ([x, y]: Vec2) =>
  `${Math.round(x * 1e5)},${Math.round(y * 1e5)}`;

const buildLatticeSegments = (): Segment2[] => {
  const segments = new Map<string, Segment2>();
  const cellRadius = 0.28;
  const gridRadius = 2;
  for (let q = -gridRadius; q <= gridRadius; q += 1) {
    for (let r = -gridRadius; r <= gridRadius; r += 1) {
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) > gridRadius) continue;
      const center: Vec2 = [
        Math.sqrt(3) * cellRadius * (q + r * 0.5),
        cellRadius * 1.5 * r,
      ];
      const vertices = Array.from({ length: 6 }, (_, index): Vec2 => {
        const angle = Math.PI / 6 + index * Math.PI / 3;
        return [
          center[0] + Math.cos(angle) * cellRadius,
          center[1] + Math.sin(angle) * cellRadius,
        ];
      });
      for (let index = 0; index < vertices.length; index += 1) {
        const edge: Segment2 = [vertices[index], vertices[(index + 1) % 6]];
        const key = [pointKey(edge[0]), pointKey(edge[1])].sort().join("|");
        if (!segments.has(key)) segments.set(key, edge);
      }
    }
  }
  return [...segments.values()];
};

const LATTICE_SEGMENTS = buildLatticeSegments();
const LATTICE_MAX = LATTICE_SEGMENTS.reduce(
  (max, segment) => [
    Math.max(max[0], Math.abs(segment[0][0]), Math.abs(segment[1][0])),
    Math.max(max[1], Math.abs(segment[0][1]), Math.abs(segment[1][1])),
  ] as Vec2,
  [1, 1] as Vec2,
);

const rotateX = (point: readonly number[], angle: number) => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [point[0], point[1] * c - point[2] * s, point[1] * s + point[2] * c];
};

const rotateY = (point: readonly number[], angle: number) => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [point[0] * c + point[2] * s, point[1], -point[0] * s + point[2] * c];
};

const layerCohorts = (positions: Float32Array) => {
  const cohorts = new Map<number, number[]>();
  for (let index = 0; index < positions.length; index += 3) {
    const key = Math.round(positions[index + 1] * 1e5);
    const cohort = cohorts.get(key) ?? [];
    cohort.push(index / 3);
    cohorts.set(key, cohort);
  }
  return [...cohorts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, cohort]) => cohort);
};

const sampleLattice = (localIndex: number): Vec2 => {
  const segment = LATTICE_SEGMENTS[localIndex % LATTICE_SEGMENTS.length];
  const cycle = Math.floor(localIndex / LATTICE_SEGMENTS.length);
  const t = fract((cycle + 0.5) * GOLDEN);
  return [
    (segment[0][0] + (segment[1][0] - segment[0][0]) * t) / LATTICE_MAX[0],
    (segment[0][1] + (segment[1][1] - segment[0][1]) * t) / LATTICE_MAX[1],
  ];
};
export function buildDesign01GraphiteFormation(
  bank: FormationBank,
  bounds: FormationBounds,
  mode: CompositionMode,
): FormationBank {
  const cohorts = layerCohorts(bank.positions);
  if (cohorts.length !== DESIGN01_GRAPHITE_LAYER_COUNT) {
    throw new Error(
      `DESIGN 01 graphite expected ${DESIGN01_GRAPHITE_LAYER_COUNT} layers, received ${cohorts.length}.`,
    );
  }

  const span = bounds.max.map((value, axis) => value - bounds.min[axis]);
  const center = TARGET_CENTER[mode].map(
    (value, axis) => bounds.min[axis] + span[axis] * value,
  );
  const halfSize = TARGET_HALF_SIZE[mode];
  const positions = new Float32Array(bank.positions.length);

  cohorts.forEach((cohort, layerIndex) => {
    const layer = (layerIndex / (DESIGN01_GRAPHITE_LAYER_COUNT - 1)) * 2 - 1;
    const layerAngle = layer * 0.055;
    const c = Math.cos(layerAngle);
    const s = Math.sin(layerAngle);

    cohort.forEach((particleIndex, localIndex) => {
      const [sampleX, sampleY] = sampleLattice(localIndex);
      const sheetX = sampleX * c - sampleY * s + layer * 0.16;
      const sheetY = sampleX * s + sampleY * c + layer * 0.08;
      const bow = (1 - sampleX * sampleX) * (1 - sampleY * sampleY) * 0.08;
      const local = [sheetX, sheetY, layer * 0.82 + bow];
      const presented = rotateY(rotateX(local, -0.24), 0.18);
      const offset = particleIndex * 3;

      for (let axis = 0; axis < 3; axis += 1) {
        const margin = span[axis] * 0.035;
        positions[offset + axis] = clamp(
          center[axis] + presented[axis] * halfSize[axis],
          bounds.min[axis] + margin,
          bounds.max[axis] - margin,
        );
      }
    });
  });

  return {
    ...bank,
    positions,
    sizeScales: bank.sizeScales.map(() => (mode === "banded" ? 0.44 : 0.4)),
    interactionBudgets: bank.interactionBudgets.map(() => 0.62),
  };
}
