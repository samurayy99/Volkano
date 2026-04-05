export { createConvergenceController } from './core/convergence-controller';
export type {
  ConvergenceController,
  CreateConvergenceControllerOptions,
} from './core/convergence-controller';
export type {
  ConvergenceEngineSignals,
  ConvergenceInputSource,
  ConvergencePhase,
  ConvergenceProgress,
  ConvergenceSnapshot,
} from './core/convergence-types';
export {
  canRevealInterface,
  canRevealProof,
  canStartRotation,
  clampConvergenceProgress,
  resolveConvergencePhase,
} from './core/convergence-phases';
export {
  getProofVisible,
  getRotationAllowed,
  getSourceInteractive,
} from './core/convergence-selectors';
export { createConvergenceEngineBridge } from './engine/convergence-engine-bridge';
export type { ConvergenceEngineBridge } from './engine/convergence-engine-bridge';
export {
  mapProgressToEngineSignals,
} from './engine/convergence-progress-map';
export { ConvergenceTrigger } from './ui/ConvergenceTrigger';
export type { ConvergenceTriggerProps } from './ui/ConvergenceTrigger';
export { useConvergenceTimeline } from './ui/useConvergenceTimeline';
export type { UseConvergenceTimelineResult } from './ui/useConvergenceTimeline';
