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
  /**
   * Thermal wash in MLS-MPM (`buildThermalState`) was ramping 82→96 while the UI timeline
   * still had a long tail before 100 — colors went dull *before* post-enter arrest / rift.
   * Keep the buffer vivid through most of convergence; only apply extinction in the final
   * approach to 100 (post-enter still handles the locked read in the renderer).
   */
  const thermalExtinctionMix = smoothstep(progress, 97, 100) * 0.58;
  return {
    slowdownMix: smoothstep(progress, 72, 88),
    viscosityMix: smoothstep(progress, 70, 90),
    freezeMix: smoothstep(progress, 92, 96),
    heatRetentionMix: compressionGlowMix * (1 - thermalExtinctionMix),
    thermalExtinctionMix,
    pointerInfluenceMix: smoothstep(progress, 84, 100),
  };
}
