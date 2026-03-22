import type {
  ConvergenceEngineSignals,
  ConvergenceProgress,
  ConvergenceSnapshot,
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
  // Thermal extinction: cooling starts mid-descent so particles land as warm red, not white blowout
  const thermalExtinctionMix = smoothstep(progress, 80, 98);
  // Settle drives solver downward pull DURING convergence (not after freeze)
  const settleMix = smoothstep(progress, 55, 88);

  return {
    slowdownMix: smoothstep(progress, 84, 98),
    densifyMix: smoothstep(progress, 86, 98),
    compressionMix: smoothstep(progress, 88, 100),
    freezeMix: smoothstep(progress, 98, 100),
    settleMix,
    heatRetentionMix: compressionGlowMix * (1 - thermalExtinctionMix),
    thermalExtinctionMix,
    pointerInfluenceMix: smoothstep(progress, 84, 100),
  };
}

export function mapSnapshotToEngineSignals(
  snapshot: ConvergenceSnapshot,
): ConvergenceEngineSignals {
  return mapProgressToEngineSignals(snapshot.progress);
}
