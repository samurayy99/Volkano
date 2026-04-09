import type { ConvergencePhase, ConvergenceSnapshot } from './convergence-types';

export function clampConvergenceProgress(progress: number): number {
  return progress < 0 ? 0 : progress > 100 ? 100 : progress;
}

export function resolveConvergencePhase(snapshot: ConvergenceSnapshot): ConvergencePhase {
  if (snapshot.interfaceActive) return 'interface_active';
  if (snapshot.heroLanded) return 'hero_landed';
  if (snapshot.rotationActive || snapshot.rotationComplete) return 'rotating';
  if (snapshot.convergenceSettled) return 'condensing';
  if (snapshot.progress >= 100) return 'frozen';
  if (snapshot.progress > 0) return 'converging';
  return 'source';
}

export function canStartRotation(snapshot: ConvergenceSnapshot): boolean {
  return snapshot.convergenceSettled && !snapshot.rotationActive && !snapshot.rotationComplete;
}

export function canRevealInterface(snapshot: ConvergenceSnapshot): boolean {
  return snapshot.heroLanded && !snapshot.interfaceActive;
}
