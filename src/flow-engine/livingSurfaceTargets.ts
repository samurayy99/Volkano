export type LivingSurfaceBounds = {
  min: [number, number, number];
  max: [number, number, number];
};

export const LIVING_SURFACE_SAFE_MARGIN = 0.08;

const fract = (value: number): number => value - Math.floor(value);
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function buildLivingSurfaceTargets(
  bounds: LivingSurfaceBounds,
  count: number,
): Float32Array {
  const resolvedCount = Math.max(0, Math.floor(count));
  const targets = new Float32Array(resolvedCount * 3);
  const span = bounds.max.map((value, axis) =>
    value - bounds.min[axis],
  ) as [number, number, number];
  const safeMin = bounds.min.map((value, axis) =>
    value + span[axis] * LIVING_SURFACE_SAFE_MARGIN,
  ) as [number, number, number];
  const safeMax = bounds.max.map((value, axis) =>
    value - span[axis] * LIVING_SURFACE_SAFE_MARGIN,
  ) as [number, number, number];

  for (let i = 0; i < resolvedCount; i++) {
    const u = fract(0.17 + i * 0.754877666);
    const v = fract(0.43 + i * 0.569840296);
    const w = fract(0.71 + i * 0.438579021);
    const vertical = v * 2 - 1;
    const envelope = Math.sqrt(Math.max(0, 1 - vertical * vertical));
    const halfWidth = 0.055 + envelope * 0.01;

    // Simulation +x renders screen-left. The bank stays left while the wider
    // z distribution keeps it a volume instead of a projected white sheet.
    const normalized = [
      clamp(
        0.825
          + vertical * 0.02
          + (u * 2 - 1) * halfWidth
          + Math.sin(vertical * Math.PI * 2.5) * 0.003,
        0.73,
        0.9,
      ),
      0.5 + vertical * 0.38,
      0.32 + w * 0.36,
    ];

    for (let axis = 0; axis < 3; axis++) {
      targets[i * 3 + axis] = clamp(
        bounds.min[axis] + span[axis] * normalized[axis],
        safeMin[axis],
        safeMax[axis],
      );
    }
  }

  return targets;
}
