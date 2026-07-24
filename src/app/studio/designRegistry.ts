import type { LenoxSignatureId } from "../../flow-engine/types";

export type StudioDesignDefinition = {
  label: string;
  shortLabel: string;
  rendererClass: string;
  worldMedia: "film" | "none";
  /** How present LENOX is over this design — CSS keys on the axis, not the id. */
  lenoxPresence: "full" | "recessed";
  engineMode: "off" | "field" | "character";
  engineSignature: LenoxSignatureId | null;
};

export const STUDIO_DESIGNS = {
  signal: {
    label: "SIGNAL",
    shortLabel: "SIGNAL",
    rendererClass: "signalRenderer",
    worldMedia: "none",
    lenoxPresence: "recessed",
    engineMode: "off",
    engineSignature: null,
  },
  gravity: {
    label: "GRAVITY",
    shortLabel: "GRAVITY",
    rendererClass: "gravityRenderer",
    worldMedia: "none",
    lenoxPresence: "full",
    engineMode: "field",
    engineSignature: null,
  },
  atelier: {
    label: "ATELIER",
    shortLabel: "ATELIER",
    rendererClass: "atelierRenderer",
    worldMedia: "none",
    lenoxPresence: "recessed",
    engineMode: "off",
    engineSignature: null,
  },
} as const satisfies Record<string, StudioDesignDefinition>;

export type DesignId = keyof typeof STUDIO_DESIGNS;

export const DEFAULT_DESIGN_ID: DesignId = "signal";
export const DESIGN_IDS = Object.keys(STUDIO_DESIGNS) as DesignId[];

export function isDesignId(value: unknown): value is DesignId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(STUDIO_DESIGNS, value);
}

export function normalizeDesignId(value: unknown): DesignId | null {
  if (value === "reef") return "gravity";
  return isDesignId(value) ? value : null;
}

export function migratePersistedExperience<
  T extends { design?: unknown; reality?: unknown; introPhase?: unknown },
>(persisted: T) {
  const design = normalizeDesignId(persisted.design) ?? normalizeDesignId(persisted.reality);
  const {
    reality: _legacyReality,
    design: _legacyDesign,
    introPhase: _legacyIntroPhase,
    ...rest
  } = persisted;
  void _legacyReality;
  void _legacyDesign;
  void _legacyIntroPhase;
  return {
    ...rest,
    ...(design ? { design } : {}),
    introPhase: "entered" as const,
  };
}

export function writeDesignToUrl(url: URL, design: DesignId): URL {
  url.searchParams.set("design", design);
  url.searchParams.delete("reality");
  return url;
}

export function getDesign(id: DesignId): StudioDesignDefinition {
  return STUDIO_DESIGNS[id];
}
