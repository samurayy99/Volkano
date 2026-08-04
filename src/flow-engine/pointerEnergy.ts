const clamp01 = (value: number) =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

export const POINTER_ENERGY_RELEASE_SECONDS = 0.22;

/**
 * One frame-rate-independent pointer envelope. Release is deliberately
 * finite so the formation resolve reaches exact neutral and can stop running.
 */
export function advancePointerEnergy(
  current: number,
  target: number,
  deltaSeconds: number,
): number {
  const from = clamp01(current);
  const to = clamp01(target);
  const dt = Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0);
  if (to >= from) {
    const rise = 1 - Math.exp(-dt / 0.055);
    return clamp01(from + (to - from) * rise);
  }
  const next = Math.max(to, from - dt / POINTER_ENERGY_RELEASE_SECONDS);
  return next < 1e-4 ? 0 : next;
}
