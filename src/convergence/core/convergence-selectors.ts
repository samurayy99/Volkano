import type { ConvergenceSnapshot } from './convergence-types';

export function getSourceInteractive(snapshot: ConvergenceSnapshot): boolean {
  return snapshot.phase === 'source' || snapshot.phase === 'converging';
}
