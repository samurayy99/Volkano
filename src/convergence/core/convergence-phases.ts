import type { ConvergencePhase, ConvergenceSnapshot } from './convergence-types';

export function clampConvergenceProgress(progress: number): number {
  return progress < 0 ? 0 : progress > 100 ? 100 : progress;
}

export function resolveConvergencePhase(snapshot: ConvergenceSnapshot): ConvergencePhase {
  if (snapshot.progress >= 100) return 'frozen';
  if (snapshot.progress > 0) return 'converging';
  return 'source';
}
