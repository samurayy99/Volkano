export type ConvergenceProgress = number;

export type ConvergencePhase =
  | 'source'
  | 'converging'
  | 'frozen';

export type ConvergenceInputSource =
  | 'enter'
  | 'programmatic';

export interface ConvergenceSnapshot {
  progress: ConvergenceProgress;
  phase: ConvergencePhase;
  inputSource: ConvergenceInputSource | null;
}

export interface ConvergenceEngineSignals {
  slowdownMix: number;
  viscosityMix: number;
  freezeMix: number;
  heatRetentionMix: number;
  thermalExtinctionMix: number;
  pointerInfluenceMix: number;
}
