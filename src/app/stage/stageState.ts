import type { EntityStatus } from "../../i18n/messages";
import type { LenoxProofState } from "../../flow-engine/types";

/**
 * The experience lifecycle. Six transient states, one owner.
 *
 * These are NOT routes. WAKING and BUILDING are two seconds of choreography, not
 * places you can link to — mixing the animation lifecycle with the router is how
 * you end up with a URL that renders a half-finished camera move. Content routes
 * (systems / work / studio) arrive later and live beside this, not inside it.
 */
export type StageState =
  | "dormant" // the field is loose; nothing has happened yet
  | "waking" // the collapse — drive-owned, we only watch
  | "recognition" // he is here; greeting, the question, and his reason all live here
  | "transforming" // the world changes: gather → ignition → scan (one clock)
  | "building" // particles → hairlines → decode
  | "ready"; // he steps aside; the page he made is standing

/**
 * What can happen. The engine owns its own lifecycle and reports it; everything
 * after recognition is the visitor's move, and the visitor's moves are events.
 *
 * There is no calibration event, and that is deliberate. A question asked before
 * the build ("where should I begin — EXPERIENCE / SYSTEMS / WORK?") is a menu for
 * a site the visitor has never seen: unanswerable, and a sales move besides. The
 * one question a stranger can answer comes AFTER he builds, when there is
 * something on screen to have an opinion about — explore, or be shown.
 */
export type StageEvent =
  | { type: "ENGINE"; state: LenoxProofState } // the drive reports where it is
  | { type: "SPOKEN" } // the question is answered and his reason spoken; the world changes
  | { type: "TRANSFORMED" } // the scan has passed; he starts building
  | { type: "BUILT" }; // the page is standing

/** Pre-wake engine states. The drive owns these; the stage only reads them. */
const PRE_WAKE: LenoxProofState[] = [
  "dormant",
  "engaged",
  "armed",
  "idle",
  "attract",
];

/**
 * The only legal moves. A machine that merely *tends* to run in order is a
 * machine that will one day start building on top of a half-finished wake — so
 * the illegal transition is not unlikely here, it is unrepresentable.
 */
const LEGAL: Record<StageState, readonly StageState[]> = {
  dormant: ["waking"],
  waking: ["recognition"],
  recognition: ["transforming"],
  transforming: ["building"],
  building: ["ready"],
  ready: [],
};

function advance(current: StageState, next: StageState): StageState {
  return LEGAL[current].includes(next) ? next : current;
}

/**
 * Before he is present the engine is the only authority, so we mirror it. Once
 * he is present the engine has no opinion left — it does not know that a page is
 * about to be built — and the stage takes over.
 */
export function stageReducer(
  current: StageState,
  event: StageEvent,
): StageState {
  switch (event.type) {
    case "ENGINE": {
      if (PRE_WAKE.includes(event.state)) {
        // Never fall backwards: once he has woken, a late pre-wake frame from
        // the drive must not drag the visitor back to an empty room.
        return current === "dormant" ? "dormant" : current;
      }
      if (event.state === "waking" || event.state === "awakening") {
        return advance(current, "waking");
      }
      // present / alive
      return advance(current, "recognition");
    }
    case "SPOKEN":
      return advance(current, "transforming");
    case "TRANSFORMED":
      return advance(current, "building");
    case "BUILT":
      return advance(current, "ready");
  }
}

/** What the corner readout says he is doing. One value per real engine state. */
export function statusFor(
  stage: StageState,
  gpu: "webgpu" | "fallback" | "probing",
): EntityStatus {
  if (gpu === "fallback") return "unavailable";
  if (gpu === "probing") return "initialising";
  switch (stage) {
    case "dormant":
      return "offline";
    case "waking":
      return "initialising";
    case "transforming":
    case "building":
      return "building";
    default:
      return "online";
  }
}
