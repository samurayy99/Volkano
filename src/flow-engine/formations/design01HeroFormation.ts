type CompositionMode = "side" | "banded";

type FormationBounds = {
  min: [number, number, number];
  max: [number, number, number];
};

type FormationBank = {
  positions: Float32Array;
  rotations: Float32Array;
  sizeScales: Float32Array;
  interactionBudgets: Float32Array;
  groups: Uint16Array;
};

export const DESIGN01_FULL_VIEW_CORRIDOR = Object.freeze({
  minX: 0.08,
  maxX: 0.92,
});

const HERO_CENTER = Object.freeze({
  side: [0.63, 0.52, 0.5] as const,
  banded: [0.5, 0.66, 0.5] as const,
});
const HERO_SCALE = Object.freeze({
  side: [1.48, 1.48, 1.48] as const,
  banded: [0.9, 1.18, 0.72] as const,
});
const midpoint = (min: number, max: number) => min + (max - min) * 0.5;

/**
 * Gate 1 keeps the proven C60 topology but removes the copy corridor. The base
 * generator owns deterministic slots; this pure transform gives them hero scale.
 */
export function buildDesign01HeroFormation(
  bank: FormationBank,
  bounds: FormationBounds,
  mode: CompositionMode,
): FormationBank {
  if (bank.positions.length === 0) return bank;

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < bank.positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = bank.positions[index + axis];
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }

  const span = bounds.max.map((value, axis) => value - bounds.min[axis]);
  const sourceCenter = min.map((value, axis) => midpoint(value, max[axis]));
  const targetCenter = HERO_CENTER[mode].map(
    (value, axis) => bounds.min[axis] + span[axis] * value,
  );
  const scale = HERO_SCALE[mode];
  const positions = new Float32Array(bank.positions.length);

  for (let index = 0; index < bank.positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      positions[index + axis] = targetCenter[axis]
        + (bank.positions[index + axis] - sourceCenter[axis]) * scale[axis];
    }
  }

  return {
    ...bank,
    positions,
    sizeScales: bank.sizeScales.map((value) => value * 0.92),
    interactionBudgets: bank.interactionBudgets.map(() => 1.35),
  };
}
