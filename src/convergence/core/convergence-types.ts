export type ConvergenceProgress = number;

export type ConvergencePhase =
  | 'source'
  | 'converging'
  | 'frozen'
  | 'condensing'
  | 'proof'
  | 'proof_hold'
  | 'rotating'
  | 'hero_landed'
  | 'interface_active';

export type ConvergenceInputSource =
  | 'enter'
  | 'programmatic';

export interface ConvergenceSnapshot {
  progress: ConvergenceProgress;
  phase: ConvergencePhase;
  inputSource: ConvergenceInputSource | null;
  freezeSettled: boolean;
  proofReady: boolean;
  proofVisible: boolean;
  proofSettled: boolean;
  rotationActive: boolean;
  rotationComplete: boolean;
  heroLanded: boolean;
  interfaceActive: boolean;
}

export interface ConvergenceEngineSignals {
  slowdownMix: number;
  densifyMix: number;
  compressionMix: number;
  freezeMix: number;
  settleMix: number;
  heatRetentionMix: number;
  thermalExtinctionMix: number;
  pointerInfluenceMix: number;
}
