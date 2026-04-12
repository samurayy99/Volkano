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
  setInteractiveEnabled: (enabled: boolean) => void;
  setPointer: (x: number, y: number, isDown: boolean) => void;
  /** Release pointer capture for the sim (e.g. pointer leave); matches host usage. */
  clearPointer: () => void;
  dispose: () => void;
}

export interface FlowEngineBridgeOptions {
  onError?: (error: unknown) => void;
  onRotationReady?: () => void;
  onFrontRailMetricsChange?: (metrics: FlowEngineFrontRailMetrics) => void;
}

export interface FlowEngineHostProps {
  onReady?: (api: FlowEngineApi) => void;
  onRotationReady?: () => void;
  onFrontRailMetricsChange?: (metrics: FlowEngineFrontRailMetrics) => void;
  onError?: (error: unknown) => void;
  className?: string;
}
