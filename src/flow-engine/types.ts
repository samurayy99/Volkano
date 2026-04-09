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
  setConvergenceSettled: (settled: boolean) => void;
  setInteractiveEnabled: (enabled: boolean) => void;
  setPointer: (x: number, y: number, isDown: boolean) => void;
  dispose: () => void;
}

export interface FlowEngineBridgeOptions {
  onError?: (error: unknown) => void;
  onPostEnterHoldStart?: () => void;
  onRiftReady?: () => void;
  onFrontRailMetricsChange?: (metrics: FlowEngineFrontRailMetrics) => void;
}

export interface FlowEngineHostProps {
  onReady?: (api: FlowEngineApi) => void;
  onPostEnterHoldStart?: () => void;
  onRiftReady?: () => void;
  onFrontRailMetricsChange?: (metrics: FlowEngineFrontRailMetrics) => void;
  onError?: (error: unknown) => void;
  className?: string;
}
