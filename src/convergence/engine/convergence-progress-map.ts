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
  const compressionGlowMix = smoothstep(progress, 62, 82);
  const thermalExtinctionMix = smoothstep(progress, 82, 96) * 0.58;
  return {
    slowdownMix: smoothstep(progress, 72, 88),
    densifyMix: smoothstep(progress, 70, 90),
    compressionMix: smoothstep(progress, 78, 94),
    freezeMix: smoothstep(progress, 92, 100),
    settleMix: smoothstep(progress, 72, 90),
    heatRetentionMix: compressionGlowMix * (1 - thermalExtinctionMix),
    thermalExtinctionMix,
    pointerInfluenceMix: smoothstep(progress, 84, 100),
    holdShapeMix: smoothstep(progress, 82, 98),
  };
}
