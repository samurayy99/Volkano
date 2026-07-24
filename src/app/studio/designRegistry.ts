import type { LenoxSignatureId } from "../../flow-engine/types";

export type StudioDesignDefinition = {
  label: string;
  shortLabel: string;
  rendererClass: string;
  availability: "public" | "proof";
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
    availability: "public",
    worldMedia: "none",
    lenoxPresence: "recessed",
    engineMode: "off",
    engineSignature: null,
  },
  gravity: {
    label: "GRAVITY",
    shortLabel: "GRAVITY",
    rendererClass: "gravityRenderer",
    availability: "proof",
    worldMedia: "none",
    lenoxPresence: "full",
    engineMode: "field",
    engineSignature: null,
  },
  atelier: {
    label: "ATELIER",
    shortLabel: "ATELIER",
    rendererClass: "atelierRenderer",
    availability: "proof",
    worldMedia: "none",
    lenoxPresence: "recessed",
    engineMode: "off",
    engineSignature: null,
  },
} as const satisfies Record<string, StudioDesignDefinition>;

export type DesignId = keyof typeof STUDIO_DESIGNS;

export const DEFAULT_DESIGN_ID: DesignId = "signal";
export const DESIGN_IDS = Object.keys(STUDIO_DESIGNS) as DesignId[];
export const PUBLIC_DESIGN_IDS = DESIGN_IDS.filter(
  (id) => STUDIO_DESIGNS[id].availability === "public",
);

export type DesignEnvironment = "development" | "production" | "test";

export type DesignResolution = {
  requested: unknown;
  environment: DesignEnvironment;
  proofMode: boolean;
};

export function isDesignId(value: unknown): value is DesignId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(STUDIO_DESIGNS, value);
}

export function normalizeDesignId(value: unknown): DesignId | null {
  if (value === "reef") return "gravity";
  return isDesignId(value) ? value : null;
}

export function resolveAvailableDesign({
  requested,
  environment,
  proofMode,
}: DesignResolution): DesignId {
  const normalized = normalizeDesignId(requested);
  if (!normalized) return DEFAULT_DESIGN_ID;
  if (STUDIO_DESIGNS[normalized].availability === "public") return normalized;
  return environment === "development" && proofMode
    ? normalized
    : DEFAULT_DESIGN_ID;
}

export function buildDesignBootstrapScript(environment: DesignEnvironment): string {
  const designs = JSON.stringify(DESIGN_IDS);
  const availability = JSON.stringify(
    Object.fromEntries(DESIGN_IDS.map((id) => [id, STUDIO_DESIGNS[id].availability])),
  );
  return `try{var v=sessionStorage.getItem('volkan-studio-experience-v2')||sessionStorage.getItem('volkan-studio-experience-v1')||'{}',s=JSON.parse(v),p=new URLSearchParams(location.search),l=p.get('lang'),a=${designs},b=${availability},e='${environment}',q=e==='development'&&p.get('proof')==='realities',n=function(x){return x==='reef'?'gravity':a.includes(x)?x:null},r=function(x){var y=n(x);return y&&(b[y]==='public'||q)?y:'${DEFAULT_DESIGN_ID}'},d=r(p.get('design')||p.get('reality')||s.design||s.reality);document.documentElement.dataset.design=d;document.documentElement.lang=l==='de'||(!l&&s.locale==='de')?'de':'en'}catch(e){document.documentElement.dataset.design='${DEFAULT_DESIGN_ID}';document.documentElement.lang='en'}`;
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
