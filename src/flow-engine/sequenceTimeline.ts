export const FLOW_ROTATION_DURATION_MS = 1900;
export const FLOW_ROTATION_DURATION_SECONDS = FLOW_ROTATION_DURATION_MS / 1000;
export const FLOW_UI_SETTLE_DURATION_SECONDS = 0.7;

export const FLOW_SEQUENCE_MARKS = Object.freeze({
  ENTER_BURST_END: 0.9,
  SPREAD_END: 2.4,
  CLEAR_ROTATE_END: 2.4 + FLOW_ROTATION_DURATION_SECONDS,
  UI_SETTLE_END: 2.4 + FLOW_ROTATION_DURATION_SECONDS + FLOW_UI_SETTLE_DURATION_SECONDS,
});

export const FLOW_TRANSITION_PARTICLE_COUNT = Object.freeze({
  desktop: 1800,
  mobile: 900,
});

export type FlowMode =
  | "idle"
  | "enter_burst"
  | "spread"
  | "clear_and_rotate"
  | "ui_settle";

export function resolveFlowMode(elapsedSeconds: number): FlowMode {
  if (elapsedSeconds < FLOW_SEQUENCE_MARKS.ENTER_BURST_END) {
    return "enter_burst";
  }

  if (elapsedSeconds < FLOW_SEQUENCE_MARKS.SPREAD_END) {
    return "spread";
  }

  if (elapsedSeconds < FLOW_SEQUENCE_MARKS.CLEAR_ROTATE_END) {
    return "clear_and_rotate";
  }

  return "ui_settle";
}

export function isFlowSequenceFinished(elapsedSeconds: number): boolean {
  return elapsedSeconds >= FLOW_SEQUENCE_MARKS.UI_SETTLE_END;
}
