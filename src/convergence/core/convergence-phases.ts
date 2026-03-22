import type { ConvergencePhase, ConvergenceSnapshot } from './convergence-types';

export function clampConvergenceProgress(progress: number): number {
  return Math.min(Math.max(progress, 0), 100);
}

export function resolveConvergencePhase(snapshot: ConvergenceSnapshot): ConvergencePhase {
  if (snapshot.interfaceActive) return 'interface_active';
  if (snapshot.heroLanded) return 'hero_landed';
  if (snapshot.rotationActive || snapshot.rotationComplete) return 'rotating';
  if (snapshot.proofVisible) return 'proof_hold';
  if (snapshot.proofReady) return 'proof';
  if (snapshot.freezeSettled) return 'condensing';
  if (snapshot.progress >= 100) return 'frozen';
  if (snapshot.progress > 0) return 'converging';
  return 'source';
}

export function canRevealProof(snapshot: ConvergenceSnapshot): boolean {
  return snapshot.proofReady && !snapshot.proofVisible;
}

export function canStartRotation(snapshot: ConvergenceSnapshot): boolean {
  return snapshot.proofSettled && !snapshot.rotationActive && !snapshot.rotationComplete;
}

export function canRevealInterface(snapshot: ConvergenceSnapshot): boolean {
  return snapshot.heroLanded && !snapshot.interfaceActive;
}
