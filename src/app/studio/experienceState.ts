import type { DesignId } from "./designRegistry";

export type ChapterId =
  | "hero"
  | "work"
  | "services"
  | "lenox"
  | "ai-systems"
  | "volkan"
  | "recompose"
  | "contact";

export type LenoxStatus =
  | "dormant"
  | "arriving"
  | "observing"
  | "guiding"
  | "analysing"
  | "thinking"
  | "acting"
  | "ready";

export type IntroPhase = "gate" | "arrival" | "handoff" | "entered";
export type CaseId = "klein-paris" | "manaleaf" | "lenox-rnd";
export type Locale = "en" | "de";

export interface ExperienceState {
  design: DesignId;
  locale: Locale;
  introPhase: IntroPhase;
  activeChapter: ChapterId;
  localProgress: number;
  selectedCase: CaseId | null;
  audit: {
    phase: "idle" | "validating" | "previewing" | "complete";
    url: string;
  };
  projectBrief: {
    open: boolean;
    name: string;
    email: string;
    company: string;
    message: string;
  };
}

export type ExperienceAction =
  | { type: "SET_DESIGN"; design: DesignId }
  | { type: "SET_LOCALE"; locale: Locale }
  | { type: "SET_INTRO"; phase: IntroPhase }
  | { type: "SET_POSITION"; chapter: ChapterId; localProgress: number }
  | { type: "SELECT_CASE"; selectedCase: CaseId | null }
  | { type: "SET_AUDIT"; audit: ExperienceState["audit"] }
  | { type: "SET_PROJECT_BRIEF"; brief: ExperienceState["projectBrief"] }
  | { type: "HYDRATE"; state: Partial<ExperienceState> };

export const CHAPTER_IDS: readonly ChapterId[] = [
  "hero",
  "work",
  "services",
  "lenox",
  "ai-systems",
  "volkan",
  "recompose",
  "contact",
];

export function createInitialExperienceState(design: DesignId): ExperienceState {
  return {
    design,
    locale: "en",
    introPhase: "gate",
    activeChapter: "hero",
    localProgress: 0,
    selectedCase: null,
    audit: { phase: "idle", url: "" },
    projectBrief: { open: false, name: "", email: "", company: "", message: "" },
  };
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function experienceReducer(
  state: ExperienceState,
  action: ExperienceAction,
): ExperienceState {
  switch (action.type) {
    case "SET_DESIGN":
      return { ...state, design: action.design };
    case "SET_LOCALE":
      return { ...state, locale: action.locale };
    case "SET_INTRO":
      return { ...state, introPhase: action.phase };
    case "SET_POSITION":
      return {
        ...state,
        activeChapter: action.chapter,
        localProgress: clamp01(action.localProgress),
      };
    case "SELECT_CASE":
      return { ...state, selectedCase: action.selectedCase };
    case "SET_AUDIT":
      return { ...state, audit: action.audit };
    case "SET_PROJECT_BRIEF":
      return { ...state, projectBrief: action.brief };
    case "HYDRATE":
      return {
        design: action.state.design ?? state.design,
        locale: action.state.locale ?? state.locale,
        introPhase: action.state.introPhase ?? state.introPhase,
        activeChapter: action.state.activeChapter ?? state.activeChapter,
        localProgress: clamp01(action.state.localProgress ?? state.localProgress),
        selectedCase:
          action.state.selectedCase === undefined
            ? state.selectedCase
            : action.state.selectedCase,
        audit: { ...state.audit, ...action.state.audit },
        projectBrief: { ...state.projectBrief, ...action.state.projectBrief },
      };
    default:
      return state;
  }
}

export function chapterFromHash(hash: string): ChapterId | null {
  const value = hash.replace(/^#/, "") as ChapterId;
  return CHAPTER_IDS.includes(value) ? value : null;
}

export function semanticScrollTarget(
  sectionTop: number,
  sectionHeight: number,
  viewportHeight: number,
  localProgress: number,
): number {
  const travel = Math.max(sectionHeight - viewportHeight, 0);
  return sectionTop + travel * clamp01(localProgress);
}
