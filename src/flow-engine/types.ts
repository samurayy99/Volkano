export type FlowEngineDebugView = "composite" | "geometry" | "particles";

export interface FlowEngineFrontRailMetrics {
  // Pixel-space rect of the lower front frame band relative to the engine host.
  left: number;
  top: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface FlowEngineApi {
  setConvergenceProgress: (progress: number) => void;
  setFreezeSettled: (settled: boolean) => void;
  setInteractiveEnabled: (enabled: boolean) => void;
  setPointer: (x: number, y: number, isDown: boolean) => void;
  setDebugView: (view: FlowEngineDebugView) => void;
  dispose: () => void;
}

export interface FlowEngineBridgeOptions {
  onError?: (error: unknown) => void;
  onConvergenceFreeze?: () => void;
  onProofReady?: () => void;
  onFrontRailMetricsChange?: (metrics: FlowEngineFrontRailMetrics) => void;
  debugView?: FlowEngineDebugView;
}

export interface FlowEngineHostProps {
  onReady?: (api: FlowEngineApi) => void;
  onConvergenceFreeze?: () => void;
  onProofReady?: () => void;
  onFrontRailMetricsChange?: (metrics: FlowEngineFrontRailMetrics) => void;
  onError?: (error: unknown) => void;
  className?: string;
  debugView?: FlowEngineDebugView;
}
