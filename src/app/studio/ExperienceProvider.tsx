"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type Dispatch,
  type ReactNode,
} from "react";
import {
  chapterFromHash,
  createInitialExperienceState,
  experienceReducer,
  type ExperienceAction,
  type ExperienceState,
  type PersistedExperienceInput,
  serializeExperienceState,
} from "./experienceState";
import {
  DEFAULT_DESIGN_ID,
  migratePersistedExperience,
  normalizeDesignId,
  resolveAvailableDesign,
  writeDesignToUrl,
} from "./designRegistry";

const STORAGE_KEY = "volkan-studio-experience-v2";
const LEGACY_STORAGE_KEY = "volkan-studio-experience-v1";

type ExperienceContextValue = {
  state: ExperienceState;
  dispatch: Dispatch<ExperienceAction>;
  markIntroSeen: () => void;
};

const ExperienceContext = createContext<ExperienceContextValue | null>(null);

export function ExperienceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    experienceReducer,
    DEFAULT_DESIGN_ID,
    createInitialExperienceState,
  );
  const hydrated = useRef(false);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const currentStored = window.sessionStorage.getItem(STORAGE_KEY);
    const legacyStored = window.sessionStorage.getItem(LEGACY_STORAGE_KEY);
    const stored = currentStored ?? legacyStored;
    let persisted: PersistedExperienceInput = {};
    if (stored) {
      try {
        persisted = JSON.parse(stored) as PersistedExperienceInput;
      } catch {
        if (currentStored !== null) window.sessionStorage.removeItem(STORAGE_KEY);
      }
    }
    const proofMode =
      process.env.NODE_ENV === "development" && params.get("proof") === "realities";
    const requestedRaw = params.get("design") ?? params.get("reality");
    const requested =
      normalizeDesignId(params.get("design")) ??
      normalizeDesignId(params.get("reality"));
    const persistedState = migratePersistedExperience(persisted) as Partial<ExperienceState>;
    const design = resolveAvailableDesign({
      requested: requested ?? persistedState.design,
      environment: process.env.NODE_ENV,
      proofMode,
    });
    const locale = params.get("lang");
    const chapter = chapterFromHash(window.location.hash);
    dispatch({
      type: "HYDRATE",
      state: {
        ...persistedState,
        design,
        ...(locale === "en" || locale === "de" ? { locale } : {}),
        ...(chapter ? { activeChapter: chapter } : {}),
        introPhase: "entered",
      },
    });
    if (requestedRaw !== null) {
      const canonicalRequested = normalizeDesignId(requestedRaw);
      const url = new URL(window.location.href);
      if (canonicalRequested === design && (proofMode || design === DEFAULT_DESIGN_ID)) {
        writeDesignToUrl(url, design);
      } else {
        url.searchParams.delete("design");
        url.searchParams.delete("reality");
      }
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    document.documentElement.dataset.design = state.design;
    document.documentElement.lang = state.locale;
  }, [state.design, state.locale]);

  useEffect(() => {
    if (!hydrated.current) return;
    const timer = window.setTimeout(() => {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(serializeExperienceState(state)),
      );
    }, 180);
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    const persistBeforeLeaving = () => {
      if (!hydrated.current) return;
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(serializeExperienceState(stateRef.current)),
      );
    };
    window.addEventListener("pagehide", persistBeforeLeaving);
    return () => window.removeEventListener("pagehide", persistBeforeLeaving);
  }, []);

  const markIntroSeen = useCallback(() => {
    dispatch({ type: "SET_INTRO", phase: "entered" });
  }, []);

  const value = useMemo(
    () => ({ state, dispatch, markIntroSeen }),
    [markIntroSeen, state],
  );

  return (
    <ExperienceContext.Provider value={value}>
      {children}
    </ExperienceContext.Provider>
  );
}

export function useExperience() {
  const value = useContext(ExperienceContext);
  if (!value) throw new Error("useExperience must be used within ExperienceProvider");
  return value;
}
