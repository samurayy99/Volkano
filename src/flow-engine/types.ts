import type { FlowMode } from "./sequenceTimeline";

export type FlowEnginePhase = "play";
export type FlowEngineDebugView = "composite" | "geometry" | "particles";

export interface FlowEngineApi {
  setPhase: (phase: FlowEnginePhase) => void;
  setMode: (mode: FlowMode) => void;
  setInteractiveEnabled: (enabled: boolean) => void;
  setPointer: (x: number, y: number, isDown: boolean) => void;
  setDebugView: (view: FlowEngineDebugView) => void;
  dispose: () => void;
}

export interface FlowEngineBridgeOptions {
  onPhaseChange?: (phase: FlowEnginePhase) => void;
  onError?: (error: unknown) => void;
  debugView?: FlowEngineDebugView;
}

export interface FlowEngineHostProps {
  onReady?: (api: FlowEngineApi) => void;
  onPhaseChange?: (phase: FlowEnginePhase) => void;
  onError?: (error: unknown) => void;
  className?: string;
  debugView?: FlowEngineDebugView;
}
