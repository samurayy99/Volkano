import type {
  ConvergenceEngineSignals,
  ConvergenceProgress,
} from '../core/convergence-types';

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function inverseLerp(value: number, min: number, max: number): number {
  if (max <= min) {
    return 0;
  }

  return clamp01((value - min) / (max - min));
}

function smoothstep(value: number, min: number, max: number): number {
  const t = inverseLerp(value, min, max);
  return t * t * (3 - 2 * t);
}

export function mapProgressToEngineSignals(
  progress: ConvergenceProgress,
): ConvergenceEngineSignals {
  const compressionGlowMix = smoothstep(progress, 68, 82);
  const holdSculptMix = inverseLerp(progress, 74, 94) * 0.72;
  // Thermal extinction: capped at 0.65 so deep warm pockets survive into hold.
  // The hold reads as erstarrt but not farblos — inner glow in core/occlusion zones.
  // Capped at 0.22 so lava embers survive deep into hold — red life inside the rock.
  const thermalExtinctionMix = smoothstep(progress, 80, 90) * 0.08;
  // Settle drives solver downward pull DURING convergence (not after freeze)
  const settleMix = smoothstep(progress, 55, 88);

  return {
    slowdownMix: smoothstep(progress, 74, 96),
    densifyMix: smoothstep(progress, 70, 92),
    compressionMix: smoothstep(progress, 72, 96),
    holdSculptMix,
    freezeMix: smoothstep(progress, 96, 100),
    settleMix,
    heatRetentionMix: compressionGlowMix * (1 - thermalExtinctionMix),
    thermalExtinctionMix,
    pointerInfluenceMix: smoothstep(progress, 84, 100),
  };
}
