import type { FlowEngineBridgeOptions } from "./types";

export type ResolvedExperienceMode =
  | "chamber"
  | "legacy-lenox"
  | "phase-field"
  | "living-surface";

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

export const LIVING_SURFACE_PRESET = Object.freeze({
  primitive: "billboard" as const,
  coherenceMaterial: true,
  coherenceDebug: false,
  environment: "studio" as const,
  environmentRotation: 0,
  environmentIntensity: 1,
  size: 0.68,
  roughness: 0.3,
  metalness: 0.85,
  coherenceInner: 5,
  coherenceOuter: 15,
  coherenceRecruit: 0.5,
  coherenceRelease: 0.42,
  noise: 1.08,
  speed: 1.02,
  gravity: 0,
  dynamicViscosity: 0.034,
  targetInfluence: 0.075,
});
