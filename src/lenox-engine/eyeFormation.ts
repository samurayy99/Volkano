/**
 * Eye formation math for the Lenox particle system.
 *
 * Generates target positions for particles that form two eyes
 * from a scattered distribution.
 */

export interface EyeConfig {
  /** Center of left eye in normalized coords (0–1). */
  leftCenter: { x: number; y: number };
  /** Center of right eye in normalized coords (0–1). */
  rightCenter: { x: number; y: number };
  /** Eye width relative to canvas width. */
  eyeWidth: number;
  /** Eye height relative to canvas height. */
  eyeHeight: number;
  /** How many particles form the eye outline vs fill. */
  outlineRatio: number;
}

const DEFAULT_EYE_CONFIG: EyeConfig = {
  leftCenter: { x: 0.35, y: 0.42 },
  rightCenter: { x: 0.65, y: 0.42 },
  eyeWidth: 0.12,
  eyeHeight: 0.06,
  outlineRatio: 0.55,
};

/**
 * Returns a target position for a particle index when forming eyes.
 * Particles are distributed: some form the outline (ellipse), others fill the interior.
 */
export function getEyePosition(
  particleIndex: number,
  totalParticles: number,
  config: Partial<EyeConfig> = {},
): { x: number; y: number } {
  const cfg = { ...DEFAULT_EYE_CONFIG, ...config };
  const isLeft = particleIndex < totalParticles / 2;
  const center = isLeft ? cfg.leftCenter : cfg.rightCenter;
  const localIndex = isLeft
    ? particleIndex
    : particleIndex - Math.floor(totalParticles / 2);
  const halfCount = Math.floor(totalParticles / 2);
  const isOutline = localIndex < halfCount * cfg.outlineRatio;

  if (isOutline) {
    // Distribute along ellipse outline
    const outlineCount = Math.floor(halfCount * cfg.outlineRatio);
    const angle = (localIndex / outlineCount) * Math.PI * 2;
    const x = center.x + Math.cos(angle) * cfg.eyeWidth * 0.5;
    const y = center.y + Math.sin(angle) * cfg.eyeHeight * 0.5;
    return { x, y };
  } else {
    // Fill interior
    const fillCount = halfCount - Math.floor(halfCount * cfg.outlineRatio);
    const fi = localIndex - Math.floor(halfCount * cfg.outlineRatio);
    const r = Math.sqrt((fi + 0.5) / fillCount); // sqrt for uniform disc
    const angle = (fi * 2.399963) % (Math.PI * 2); // golden angle
    const x = center.x + Math.cos(angle) * r * cfg.eyeWidth * 0.4;
    const y = center.y + Math.sin(angle) * r * cfg.eyeHeight * 0.4;
    return { x, y };
  }
}

/**
 * Generate a random scatter position for a particle.
 */
export function getScatterPosition(
  seed: number,
): { x: number; y: number } {
  // Use unrelated irrational multipliers for x and y
  const x = ((seed * 0.7071067811865476 + 0.3) % 1);  // sqrt(2)/2
  const y = ((seed * 0.5235987755982988 + 0.7) % 1);  // π/6
  return {
    x: x * 0.8 + 0.1,
    y: y * 0.6 + 0.2,
  };
}

/**
 * Lerp between two positions.
 */
export function lerpPosition(
  from: { x: number; y: number },
  to: { x: number; y: number },
  t: number,
): { x: number; y: number } {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}