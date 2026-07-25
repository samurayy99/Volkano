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

/**
 * IDs are permanent and technical — they live in `?design=`, in `data-design` and in
 * the renderer class names. LABELS are free text: renaming a direction is one edit
 * here and breaks no URL, no stylesheet and no stored session.
 */
export const STUDIO_DESIGNS = {
  "design-01": {
    label: "GRAVITY",
    shortLabel: "GRAVITY",
    rendererClass: "renderer01",
    worldMedia: "film",
    lenoxPresence: "full",
    engineSignature: null,
  },
  "design-02": {
    label: "SIGNAL",
    shortLabel: "SIGNAL",
    rendererClass: "renderer02",
    worldMedia: "none",
    lenoxPresence: "recessed",
    engineSignature: null,
  },
  "design-03": {
    label: "ATELIER",
    shortLabel: "ATELIER",
    rendererClass: "renderer03",
    worldMedia: "none",
    lenoxPresence: "recessed",
    engineSignature: null,
  },
} as const satisfies Record<string, StudioDesignDefinition>;

export type DesignId = keyof typeof STUDIO_DESIGNS;

export const DEFAULT_DESIGN_ID: DesignId = "design-01";
export const DESIGN_IDS = Object.keys(STUDIO_DESIGNS) as DesignId[];

export function isDesignId(value: unknown): value is DesignId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(STUDIO_DESIGNS, value);
}

export function getDesign(id: DesignId): StudioDesignDefinition {
  return STUDIO_DESIGNS[id];
}
