import type { ConvergenceSnapshot } from './convergence-types';

export function getSourceInteractive(snapshot: ConvergenceSnapshot): boolean {
  return snapshot.phase === 'source' || snapshot.phase === 'converging';
}

export function getProofVisible(snapshot: ConvergenceSnapshot): boolean {
  return snapshot.proofVisible;
}

export function getRotationAllowed(snapshot: ConvergenceSnapshot): boolean {
  return snapshot.proofSettled && !snapshot.rotationActive && !snapshot.rotationComplete;
}
