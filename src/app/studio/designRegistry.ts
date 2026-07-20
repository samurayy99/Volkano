import type { LenoxSignatureId } from "../../flow-engine/types";

export type StudioDesignDefinition = {
  label: string;
  shortLabel: string;
  rendererClass: string;
  worldMedia: "film" | "none";
  /** How present LENOX is over this design — CSS keys on the axis, not the id. */
  lenoxPresence: "full" | "recessed";
  engineSignature: LenoxSignatureId | null;
};

export const STUDIO_DESIGNS = {
  reef: {
    label: "GRAVITY REEF",
    shortLabel: "REEF",
    rendererClass: "reefRenderer",
    worldMedia: "film",
    lenoxPresence: "full",
    engineSignature: null,
  },
  signal: {
    label: "SIGNAL EDITORIAL",
    shortLabel: "SIGNAL",
    rendererClass: "signalRenderer",
    worldMedia: "none",
    lenoxPresence: "recessed",
    engineSignature: null,
  },
} as const satisfies Record<string, StudioDesignDefinition>;

export type DesignId = keyof typeof STUDIO_DESIGNS;

export const DEFAULT_DESIGN_ID: DesignId = "reef";
export const DESIGN_IDS = Object.keys(STUDIO_DESIGNS) as DesignId[];

export function isDesignId(value: unknown): value is DesignId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(STUDIO_DESIGNS, value);
}

export function getDesign(id: DesignId): StudioDesignDefinition {
  return STUDIO_DESIGNS[id];
}
