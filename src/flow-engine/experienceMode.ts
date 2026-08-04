import type { FlowEngineBridgeOptions } from "./types";

export type ResolvedExperienceMode =
  | "chamber"
  | "legacy-lenox"
  | "phase-field"
  | "living-surface"
  | "hero-field";

export function resolveExperienceMode(
  options: Pick<FlowEngineBridgeOptions, "experienceMode" | "phaseField" | "lenoxMode">,
): ResolvedExperienceMode {
  if (options.experienceMode) return options.experienceMode;
  if (options.phaseField) return "phase-field";
  if (options.lenoxMode) return "legacy-lenox";
  return "chamber";
}

export const shouldStartLenoxDrive = (mode: ResolvedExperienceMode) =>
  mode === "legacy-lenox";

/** Modes whose host owns runtime values and must not be overwritten by a drive. */
export const isHostOwnedRuntimeMode = (mode: ResolvedExperienceMode) =>
  mode === "phase-field" || mode === "hero-field";

export const LIVING_SURFACE_PRESET = Object.freeze({
  primitive: "billboard" as const,
  coherenceMaterial: true,
  coherenceDebug: false,
  environment: "studio" as const,
  environmentRotation: 0,
  environmentIntensity: 0.2,
  particlesDesktop: 6_144,
  particlesBanded: 4_096,
  maxParticles: 8_192,
  size: 0.58,
  roughness: 0.48,
  metalness: 0.28,
  coherenceInner: 5,
  coherenceOuter: 15,
  coherenceRecruit: 0.5,
  coherenceRelease: 0.42,
  noise: 0.7,
  speed: 1.02,
  gravity: 0,
  dynamicViscosity: 0.034,
  targetInfluence: 0.16,
});

/**
 * Hero Field prototype (`/proto/hero-field`).
 *
 * Deliberately standalone: it must never read `LIVING_SURFACE_PRESET`, because
 * the whole point of the mode is that the approved production state can be
 * re-tuned without dragging this experiment with it, and vice versa.
 *
 * It reuses the chamber physics — free MLS-MPM play, no formation bank, no
 * formation drive, no station score — but none of the chamber's visual stage:
 * no vessel, no backdrop, no character, no thermal/basalt material path.
 *
 * `targetInfluence: 0` is the load-bearing value. It is what keeps the field a
 * field: with no target authority the population is shaped by force, pressure
 * and boundaries alone, never by an authored silhouette.
 */
export const HERO_FIELD_PRESET = Object.freeze({
  primitive: "shard" as const,
  environment: "studio" as const,
  environmentRotation: 0,
  environmentIntensity: 0.62,
  exposure: 0.82,
  bloomStrength: 0,
  /** Dense enough to read as a packed body rather than a shell. */
  particlesDesktop: 16_384,
  particlesPortrait: 8_192,
  maxParticles: 16_384,
  size: 0.52,
  /** Coherent end of the material range; disorder is derived in the TSL gate. */
  roughness: 0.22,
  metalness: 0.92,
  coherenceInner: 7,
  coherenceOuter: 22,
  coherenceRecruit: 0.8,
  coherenceRelease: 0.3,
  noise: 0.44,
  speed: 1.0,
  gravity: 0,
  dynamicViscosity: 0.09,
  /** Rendered shard envelope, measured from actual particle size in world space. */
  screenBoundsRadiusScale: 1.2,
  /** Initial body occupies the viewport without touching its collision envelope. */
  screenBoundsFill: 0.86,
  /** Dense field recoil without turning the viewport into a pinball box. */
  wallRestitution: 0.42,
  /** No authored silhouette. A field, not an object. */
  targetInfluence: 0,
});

/**
 * Neutral rig for the hero prototype only, applied through the `Lights`
 * instance setter. The global `LIGHT_RIG` default stays orange/blue for every
 * other experience — a monochrome hero cannot be produced by a graded rig, but
 * that grade is the approved look elsewhere.
 */
export const HERO_FIELD_LIGHT_RIG = Object.freeze({
  warmColor: 0xf4f6f8,
  warmIntensity: 1.8,
  warmDirection: [-1.0, 0.42, 0.7] as [number, number, number],
  coolColor: 0x9ba4b2,
  coolIntensity: 0.95,
  coolDirection: [1.0, -0.3, 0.55] as [number, number, number],
  hemiIntensity: 0.12,
  keyIntensity: 1.1,
});
