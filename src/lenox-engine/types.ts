export type LenoxVisualState =
  | 'idle'
  | 'waking'
  | 'awakening'
  | 'alive'
  | 'processing'
  | 'resolved'
  | 'error';

export type AwakeningPhase =
  | 'void'
  | 'play'
  | 'wake'
  | 'ritual'
  | 'forming'
  | 'alive'
  | 'greeting'
  | 'emailAsk'
  | 'processing'
  | 'confirmed'
  | 'error';

export interface LenoxEngineApi {
  setState: (state: LenoxVisualState) => void;
  setEnergy: (level: number) => void;
  setCursor: (x: number, y: number) => void;
  dispose: () => void;
}

export interface LenoxEngineCallbacks {
  onReady?: (api: LenoxEngineApi) => void;
  onError?: (error: unknown) => void;
  onWakeComplete?: () => void;
  onAwake?: () => void;
}
