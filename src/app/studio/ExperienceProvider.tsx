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
} from "./experienceState";
import { DEFAULT_DESIGN_ID, isDesignId } from "./designRegistry";

const STORAGE_KEY = "volkan-studio-experience-v1";

type ExperienceContextValue = {
  state: ExperienceState;
  dispatch: Dispatch<ExperienceAction>;
  markIntroSeen: () => void;
};

const ExperienceContext = createContext<ExperienceContextValue | null>(null);

type PersistedExperience = Partial<ExperienceState> & { reality?: unknown };

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
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    let persisted: PersistedExperience = {};
    if (stored) {
      try {
        persisted = JSON.parse(stored) as PersistedExperience;
      } catch {
        window.sessionStorage.removeItem(STORAGE_KEY);
      }
    }
    const requestedDesign = params.get("design") ?? params.get("reality");
    const design = isDesignId(requestedDesign)
      ? requestedDesign
      : isDesignId(persisted.design)
        ? persisted.design
        : isDesignId(persisted.reality)
          ? persisted.reality
          : undefined;
    const persistedState = { ...persisted } as Partial<ExperienceState>;
    delete persistedState.design;
    const locale = params.get("lang");
    const chapter = chapterFromHash(window.location.hash);
    dispatch({
      type: "HYDRATE",
      state: {
        ...persistedState,
        ...(design ? { design } : {}),
        ...(locale === "en" || locale === "de" ? { locale } : {}),
        ...(chapter ? { activeChapter: chapter } : {}),
        introPhase: "entered",
      },
    });
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
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    const persistBeforeLeaving = () => {
      if (!hydrated.current) return;
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stateRef.current));
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
