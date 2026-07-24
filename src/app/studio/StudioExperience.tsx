"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { FlowEngineBridge } from "../../flow-engine/engineBridge";
import type {
  LenoxEmotion,
  LenoxIntent,
  LenoxJourneyPose,
  LenoxProofState,
  LenoxReaction,
  LenoxSignals,
} from "../../flow-engine/types";
import { FallbackEyes } from "../FallbackEyes";
import { createFilmScrubber, type FilmScrubber } from "../stage/filmScrubber";
import { useCompositionMode } from "../stage/compositionMode";
import type { StationPose } from "../stage/stations";
import { aiModules, cases, chapters, copy, type CaseStudy } from "./content";
import {
  DESIGN_IDS,
  getDesign,
  isDesignId,
  type DesignId,
} from "./designRegistry";
import { useExperience } from "./ExperienceProvider";
import type {
  ChapterId,
  IntroPhase,
  LenoxStatus,
  Locale,
} from "./experienceState";
import {
  createStudioDirector,
  type SemanticPosition,
  type StudioDirector,
  type StudioStation,
} from "./studioDirector";
import { buildMailtoHref } from "./studioLinks";
import { WebsiteIntelligence } from "./WebsiteIntelligence";
import styles from "./StudioExperience.module.css";

const HERO_POSTER = "/studio/world/hero-keyframe.jpg";
const CLIP_A = "/flow-assets/gravity-clip-a-v2-dense.mp4";
const ARRIVAL_SOURCE: string | null = null;

function readReducedMotionPreference() {
  if (typeof window === "undefined") return false;
  const forceReduced =
    process.env.NODE_ENV === "development" &&
    new URLSearchParams(window.location.search).has("lenox-reduced");
  return forceReduced || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type LenoxReviewApi = {
  go: (chapter: ChapterId, localProgress?: number) => void;
  intent: (intent: LenoxIntent) => void;
  emotion: (emotion: LenoxEmotion) => void;
  reaction: (reaction: LenoxReaction) => void;
  gaze: (x: number, y: number) => void;
  pose: (pose: LenoxJourneyPose, tau?: number) => void;
  snapshot: () => {
    design: DesignId;
    chapter: ChapterId;
    localProgress: number;
    composition: "side" | "banded";
    engineState: LenoxProofState;
  };
};

declare global {
  interface Window {
    __LENOX_REVIEW__?: LenoxReviewApi;
  }
}

const statusLabel: Record<LenoxStatus, string> = {
  dormant: "DORMANT",
  arriving: "ARRIVING",
  observing: "OBSERVING",
  guiding: "GUIDING",
  analysing: "ANALYSING · DEMO",
  thinking: "THINKING",
  acting: "ACTING",
  ready: "READY",
};

function deriveLenoxStatus(
  phase: IntroPhase,
  engineState: LenoxProofState,
  auditPhase: "idle" | "validating" | "previewing" | "complete",
  morphing: boolean,
  briefOpen: boolean,
): LenoxStatus {
  if (phase === "gate") return "dormant";
  if (phase === "arrival" || phase === "handoff") return "arriving";
  if (morphing) return "thinking";
  if (auditPhase === "validating" || auditPhase === "previewing") return "analysing";
  if (briefOpen) return "acting";
  if (auditPhase === "complete") return "ready";
  if (["dormant", "idle"].includes(engineState)) return "dormant";
  if (["waking", "awakening", "armed"].includes(engineState)) return "arriving";
  return "observing";
}

const STUDIO_STATIONS: readonly StudioStation[] = [
  {
    id: "hero",
    pose: {
      side: { zoom: 0.95, shiftX: -0.65, shiftY: 0.03 },
      banded: { zoom: 1.04, shiftX: 0, shiftY: -0.26 },
    },
  },
  {
    id: "work",
    pose: {
      side: { zoom: 1.05, shiftX: -0.7, shiftY: 0.02 },
      banded: { zoom: 1.22, shiftX: 0, shiftY: -0.2 },
    },
  },
  {
    id: "services",
    pose: {
      side: { zoom: 0.85, shiftX: -0.68, shiftY: -0.02 },
      banded: { zoom: 1.12, shiftX: 0, shiftY: -0.24 },
    },
  },
  {
    id: "lenox",
    pose: {
      side: { zoom: 0.7, shiftX: -0.68, shiftY: 0.02 },
      banded: { zoom: 0.96, shiftX: 0, shiftY: -0.2 },
    },
  },
  {
    id: "ai-systems",
    pose: {
      side: { zoom: 0.85, shiftX: -0.68, shiftY: 0 },
      banded: { zoom: 1.15, shiftX: 0, shiftY: -0.22 },
    },
  },
  {
    id: "volkan",
    pose: {
      side: { zoom: 1.2, shiftX: -0.72, shiftY: 0.04 },
      banded: { zoom: 1.42, shiftX: 0, shiftY: -0.08 },
    },
  },
  {
    id: "recompose",
    pose: {
      side: { zoom: 1, shiftX: -0.68, shiftY: 0 },
      banded: { zoom: 1.06, shiftX: 0, shiftY: -0.2 },
    },
  },
  {
    id: "contact",
    pose: {
      side: { zoom: 1, shiftX: -0.68, shiftY: 0 },
      banded: { zoom: 1.08, shiftX: 0, shiftY: -0.18 },
    },
  },
];

function SplitTitle({ children, level = 2 }: { children: string; level?: 1 | 2 }) {
  const Title = level === 1 ? "h1" : "h2";
  return (
    <Title>
      {children.split("\n").map((line, index) => (
        <span key={`${index}-${line}`}>{line}</span>
      ))}
    </Title>
  );
}

function StudioHeader({
  locale,
  design,
  status,
  onNavigate,
  onLocale,
  onDesign,
}: {
  locale: Locale;
  design: DesignId;
  status: LenoxStatus;
  onNavigate: (chapter: ChapterId) => void;
  onLocale: (locale: Locale) => void;
  onDesign: (design: DesignId) => void;
}) {
  return (
    <header className={styles.header}>
      <button className={styles.brand} type="button" onClick={() => onNavigate("hero")}>
        <strong>{copy.studioName}</strong>
        <span>{copy.studioDescriptor[locale]}</span>
      </button>
      <nav aria-label="Primary navigation">
        {chapters
          .filter((chapter) =>
            ["work", "services", "lenox", "ai-systems", "contact"].includes(chapter.id),
          )
          .map((chapter) => (
            <button key={chapter.id} type="button" onClick={() => onNavigate(chapter.id)}>
              {chapter.nav[locale]}
            </button>
          ))}
      </nav>
      <div className={styles.headerTools}>
        <button type="button" onClick={() => onLocale(locale === "en" ? "de" : "en")}>
          {locale.toUpperCase()}
        </button>
        <select
          className={styles.designPicker}
          value={design}
          aria-label={locale === "en" ? "Select design" : "Design wählen"}
          onChange={(event) => {
            if (isDesignId(event.target.value)) onDesign(event.target.value);
          }}
        >
          {DESIGN_IDS.map((id) => (
            <option key={id} value={id}>{getDesign(id).shortLabel}</option>
          ))}
        </select>
        <span className={styles.status} data-status={status} aria-live="polite">
          <i /> LENOX / {statusLabel[status]}
        </span>
      </div>
    </header>
  );
}

function EntryGate({
  locale,
  phase,
  onWake,
  onSkip,
}: {
  locale: Locale;
  phase: IntroPhase;
  onWake: () => void;
  onSkip: () => void;
}) {
  if (phase === "entered") return null;
  return (
    <div className={styles.entry} data-phase={phase}>
      <div className={styles.distantAtmosphere} />
      <div className={styles.entryCopy}>
        <p>{copy.gateEyebrow[locale]}</p>
        <p className={styles.entryTitle}>{copy.gateTitle[locale]}</p>
        <span>{copy.gateBody[locale]}</span>
        {phase === "gate" ? (
          <div className={styles.entryActions}>
            <button type="button" onClick={onWake}>{copy.wake[locale]}</button>
            <button type="button" onClick={onSkip}>{copy.skip[locale]}</button>
          </div>
        ) : (
          <div className={styles.arrivalReadout}>
            <span>{phase === "arrival" ? "DESCENT / 06 SEC" : "HANDOFF / LENOX"}</span>
            <i />
          </div>
        )}
      </div>
      {phase !== "gate" ? (
        <button type="button" className={styles.skipArrival} onClick={onSkip}>
          {copy.skip[locale]} · ESC
        </button>
      ) : null}
    </div>
  );
}

function CasePanel({ study, locale }: { study: CaseStudy; locale: Locale }) {
  const tabId = `case-tab-${study.id}`;
  const panelId = `case-panel-${study.id}`;
  return (
    <article
      id={panelId}
      role="tabpanel"
      aria-labelledby={tabId}
      className={styles.casePanel}
      style={{ "--case-color": study.color } as CSSProperties}
    >
      <div className={styles.caseMedia}>
        <Image src={study.image} alt={study.imageAlt[locale]} fill sizes="(max-width: 800px) 92vw, 48vw" />
        <span>{study.index}</span>
      </div>
      <div className={styles.caseDetails}>
        <header>
          <h3>{study.title}</h3>
          <div className={styles.caseMeta}>
            <p>{study.discipline[locale]}</p>
            <span>{study.provenance[locale]}</span>
          </div>
        </header>
        <div className={styles.evidenceGrid}>
          {study.evidence.map((item) => (
            <div key={item.label}>
              <span>{item.label}</span>
              <p>{item.text[locale]}</p>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function WorkChapter({ locale }: { locale: Locale }) {
  const { state, dispatch } = useExperience();
  const active = cases.find((item) => item.id === state.selectedCase) ?? cases[0];
  const selectCase = (index: number) => {
    const next = cases[index];
    dispatch({ type: "SELECT_CASE", selectedCase: next.id });
    window.requestAnimationFrame(() => document.getElementById(`case-tab-${next.id}`)?.focus());
  };
  const onCaseKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const current = cases.findIndex((study) => study.id === active.id);
    let next = current;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % cases.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (current - 1 + cases.length) % cases.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = cases.length - 1;
    else return;
    event.preventDefault();
    selectCase(next);
  };
  return (
    <div className={styles.workChapter}>
      <div className={styles.chapterIntro}>
        <SplitTitle>{copy.work.title[locale]}</SplitTitle>
        <p>{copy.work.body[locale]}</p>
      </div>
      <div
        className={styles.caseSelector}
        role="tablist"
        aria-label={locale === "en" ? "Selected work" : "Ausgewählte Arbeiten"}
        onKeyDown={onCaseKeyDown}
      >
        {cases.map((study) => (
          <button
            key={study.id}
            id={`case-tab-${study.id}`}
            type="button"
            role="tab"
            aria-selected={active.id === study.id}
            aria-controls={`case-panel-${study.id}`}
            tabIndex={active.id === study.id ? 0 : -1}
            onClick={() => dispatch({ type: "SELECT_CASE", selectedCase: study.id })}
          >
            <span>{study.index}</span>
            {study.title}
          </button>
        ))}
      </div>
      <CasePanel study={active} locale={locale} />
    </div>
  );
}

function ServicesChapter({ locale }: { locale: Locale }) {
  const services = [
    ["01", "WEB DESIGN", locale === "en" ? "New digital identities built from strategy to production." : "Neue digitale Identitäten von Strategie bis Produktion."],
    ["02", "STRATEGIC REDESIGN", locale === "en" ? "Reframe what already exists, then rebuild only what earns its place." : "Bestehendes neu rahmen und nur das neu bauen, was seinen Platz verdient."],
    ["03", "INTERACTIVE SYSTEMS", locale === "en" ? "Motion, spatial interfaces and AI behaviour integrated as product logic." : "Motion, räumliche Interfaces und AI-Verhalten als Produktlogik integriert."],
  ];
  return (
    <div className={styles.servicesChapter}>
      <div className={styles.chapterIntro}>
        <SplitTitle>{copy.services.title[locale]}</SplitTitle>
        <p>{copy.services.body[locale]}</p>
      </div>
      <div className={styles.serviceLines}>
        {services.map(([index, title, body]) => (
          <article key={title}>
            <span>{index}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function LenoxChapter({ locale }: { locale: Locale }) {
  const abilities = locale === "en"
    ? ["Perceives attention", "Guides the next action", "Preserves context", "Recomposes the interface"]
    : ["Erkennt Aufmerksamkeit", "Führt zur nächsten Aktion", "Bewahrt Kontext", "Komponiert das Interface neu"];
  return (
    <div className={styles.lenoxChapter}>
      <div className={styles.chapterIntro}>
        <SplitTitle>{copy.lenox.title[locale]}</SplitTitle>
        <p>{copy.lenox.body[locale]}</p>
      </div>
      <ol className={styles.abilityList}>
        {abilities.map((ability, index) => (
          <li key={ability}><span>0{index + 1}</span>{ability}</li>
        ))}
      </ol>
    </div>
  );
}

function AiChapter({ locale }: { locale: Locale }) {
  return (
    <div className={styles.aiChapter}>
      <div className={styles.chapterIntro}>
        <SplitTitle>{copy.ai.title[locale]}</SplitTitle>
        <p>{copy.ai.body[locale]}</p>
      </div>
      <WebsiteIntelligence locale={locale} />
      <div className={styles.moduleTeasers}>
        {aiModules.slice(1).map((module) => (
          <article key={module.title}>
            <span>{module.index}</span>
            <div><h3>{module.title}</h3><p>{module.body[locale]}</p></div>
            <small>{module.state}</small>
          </article>
        ))}
      </div>
      <Link className={styles.inlineLink} href="/ai-systems">
        {locale === "en" ? "EXPLORE ALL AI SYSTEMS" : "ALLE AI-SYSTEME ENTDECKEN"}
      </Link>
    </div>
  );
}

function VolkanChapter({ locale }: { locale: Locale }) {
  return (
    <div className={styles.volkanChapter}>
      <div className={styles.chapterIntro}>
        <SplitTitle>{copy.volkan.title[locale]}</SplitTitle>
        <p>{copy.volkan.body[locale]}</p>
      </div>
      <div className={styles.roleMatrix}>
        {[
          ["STRATEGY", "01"], ["ART DIRECTION", "02"], ["DESIGN", "03"], ["ENGINEERING", "04"],
        ].map(([label, index]) => <div key={label}><span>{index}</span>{label}</div>)}
      </div>
    </div>
  );
}

function ContactChapter({ locale, onAnalysis }: { locale: Locale; onAnalysis: () => void }) {
  const { state, dispatch } = useExperience();
  const briefOpen = state.projectBrief.open;
  const update = <Field extends keyof typeof state.projectBrief>(
    field: Field,
    value: (typeof state.projectBrief)[Field],
  ) => {
    dispatch({
      type: "SET_PROJECT_BRIEF",
      brief: { ...state.projectBrief, [field]: value },
    });
  };
  const briefBody = `${state.projectBrief.name}\n${state.projectBrief.company}\n${state.projectBrief.email}\n\n${state.projectBrief.message}`;
  return (
    <div className={styles.contactChapter}>
      <div className={styles.chapterIntro}>
        <SplitTitle>{copy.contact.title[locale]}</SplitTitle>
      </div>
      <div className={styles.contactActions}>
        <button
          type="button"
          aria-expanded={briefOpen}
          aria-controls="project-brief-form"
          onClick={() => update("open", !briefOpen)}
        >
          {copy.contact.brief[locale]}
        </button>
        <button type="button" onClick={onAnalysis}>{copy.contact.analysis[locale]}</button>
        <a href={buildMailtoHref("hello@volkano.dev", "Project inquiry")}>{copy.contact.book[locale]}</a>
      </div>
      {briefOpen ? (
        <form id="project-brief-form" className={styles.briefForm} onSubmit={(event) => event.preventDefault()}>
          <input aria-label="Name" placeholder="NAME" value={state.projectBrief.name} onChange={(event) => update("name", event.target.value)} />
          <input aria-label="Company" placeholder="COMPANY" value={state.projectBrief.company} onChange={(event) => update("company", event.target.value)} />
          <input aria-label="Email" type="email" placeholder="EMAIL" value={state.projectBrief.email} onChange={(event) => update("email", event.target.value)} />
          <textarea aria-label="Project" placeholder="WHAT SHOULD EXIST NEXT?" value={state.projectBrief.message} onChange={(event) => update("message", event.target.value)} />
          <a href={buildMailtoHref("hello@volkano.dev", "Project inquiry", briefBody)}>
            {locale === "en" ? "OPEN EMAIL WITH THIS BRIEF" : "E-MAIL MIT DIESEM BRIEF ÖFFNEN"}
          </a>
        </form>
      ) : null}
    </div>
  );
}

function ChapterShell({ id, children }: { id: ChapterId; children: ReactNode }) {
  const chapter = chapters.find((item) => item.id === id)!;
  return (
    <section
      id={id}
      data-chapter={id}
      className={styles.chapter}
      style={{ "--chapter-vh": chapter.spanVh } as CSSProperties}
    >
      <div className={styles.chapterSticky}>{children}</div>
    </section>
  );
}

function JourneyContent({
  locale,
  design,
  onMorph,
  onNavigate,
}: {
  locale: Locale;
  design: DesignId;
  onMorph: (design: DesignId) => void;
  onNavigate: (chapter: ChapterId) => void;
}) {
  const availableDesigns = DESIGN_IDS.filter((id) => id !== design);
  return (
    <>
      <ChapterShell id="hero">
        <div className={styles.heroChapter}>
          <p>I’M LENOX. WELCOME INSIDE THE WORK.</p>
          <SplitTitle level={1}>{copy.hero.title[locale]}</SplitTitle>
          <span>{copy.hero.body[locale]}</span>
        </div>
      </ChapterShell>
      <ChapterShell id="work"><WorkChapter locale={locale} /></ChapterShell>
      <ChapterShell id="services"><ServicesChapter locale={locale} /></ChapterShell>
      <ChapterShell id="lenox"><LenoxChapter locale={locale} /></ChapterShell>
      <ChapterShell id="ai-systems"><AiChapter locale={locale} /></ChapterShell>
      <ChapterShell id="volkan"><VolkanChapter locale={locale} /></ChapterShell>
      <ChapterShell id="recompose">
        <div className={styles.recomposeChapter}>
          <SplitTitle>{copy.recompose.title[locale]}</SplitTitle>
          <p>{copy.recompose.body[locale]}</p>
          <div
            className={styles.designChoices}
            role="group"
            aria-label={locale === "en" ? "Choose another design" : "Anderes Design wählen"}
          >
            {availableDesigns.map((id) => (
              <button key={id} type="button" onClick={() => onMorph(id)}>
                {copy.recompose.action[locale]} · {getDesign(id).label}
              </button>
            ))}
          </div>
        </div>
      </ChapterShell>
      <ChapterShell id="contact">
        <ContactChapter locale={locale} onAnalysis={() => onNavigate("ai-systems")} />
      </ChapterShell>
    </>
  );
}

function RegisteredRenderer(props: Parameters<typeof JourneyContent>[0]) {
  const design = getDesign(props.design);
  const rendererStyles = styles[design.rendererClass];
  if (!rendererStyles && process.env.NODE_ENV !== "production") {
    console.error(
      `[studio] design "${props.design}" declares rendererClass "${design.rendererClass}", which has no rule in StudioExperience.module.css`,
    );
  }
  return (
    <main className={`${styles.journey} ${rendererStyles ?? ""}`}>
      <JourneyContent {...props} />
    </main>
  );
}

function StudioJourney({
  active,
  design,
  locale,
  mode,
  reduced,
  onProgress,
  onPose,
  onPosition,
  onDirector,
  onMorph,
}: {
  active: boolean;
  design: DesignId;
  locale: Locale;
  mode: "side" | "banded";
  reduced: boolean;
  onProgress: (progress: number, clipAProgress: number) => void;
  onPose: (pose: StationPose, tau: number) => void;
  onPosition: (position: SemanticPosition, changed: boolean) => void;
  onDirector: (director: StudioDirector | null) => void;
  onMorph: (design: DesignId) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const onDirectorRef = useRef(onDirector);

  useEffect(() => {
    onDirectorRef.current = onDirector;
  }, [onDirector]);

  useEffect(() => {
    if (!active) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const sections = Array.from(scroller.querySelectorAll<HTMLElement>("[data-chapter]"));
    const director = createStudioDirector(
      scroller,
      sections,
      STUDIO_STATIONS,
      mode,
      reduced,
      { onProgress, onPosition, setPose: onPose },
    );
    onDirectorRef.current(director);
    return () => {
      onDirectorRef.current(null);
      director.destroy();
    };
  }, [active, design, locale, mode, onPose, onPosition, onProgress, reduced]);

  const rendererProps = {
    locale,
    design,
    onMorph,
    onNavigate: (chapter: ChapterId) =>
      createNavigationEvent(chapter, scrollerRef.current),
  };

  return (
    <div
      ref={scrollerRef}
      className={styles.scroller}
      data-design={design}
      data-active={active}
      aria-hidden={!active}
      inert={!active}
    >
      <RegisteredRenderer {...rendererProps} />
    </div>
  );
}

function createNavigationEvent(chapter: ChapterId, scroller: HTMLElement | null) {
  const section = scroller?.querySelector<HTMLElement>(`[data-chapter="${chapter}"]`);
  section?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function StudioExperience() {
  const { state, dispatch, markIntroSeen } = useExperience();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const worldVideoRef = useRef<HTMLVideoElement | null>(null);
  const arrivalVideoRef = useRef<HTMLVideoElement | null>(null);
  const bridgeRef = useRef<FlowEngineBridge | null>(null);
  const scrubberRef = useRef<FilmScrubber | null>(null);
  const directorRef = useRef<StudioDirector | null>(null);
  const semanticRef = useRef<SemanticPosition>({ chapter: "hero", localProgress: 0 });
  const restoreRef = useRef<SemanticPosition | null>(null);
  const wakeInFlightRef = useRef(false);
  const presenceCommittedRef = useRef(false);
  const pointerFrameRef = useRef<number | null>(null);
  const pointerSampleRef = useRef({ x: 0, y: 0 });
  const positionCommitRef = useRef<number | null>(null);
  const timers = useRef<number[]>([]);
  const morphTimers = useRef<number[]>([]);
  const [gpuPath, setGpuPath] = useState<"probing" | "webgpu" | "fallback">("probing");
  const [engineState, setEngineState] = useState<LenoxProofState>("dormant");
  const [morphTarget, setMorphTarget] = useState<DesignId | null>(null);
  const [reduced, setReduced] = useState(readReducedMotionPreference);
  const mode = useCompositionMode(false);

  useEffect(() => {
    if (!directorRef.current) {
      semanticRef.current = {
        chapter: state.activeChapter,
        localProgress: state.localProgress,
      };
    }
  }, [state.activeChapter, state.localProgress]);

  const writeSignals = useCallback((signals: LenoxSignals) => {
    const root = rootRef.current;
    if (!root) return;
    root.style.setProperty("--lenox-energy", signals.energy.toFixed(4));
    root.style.setProperty("--lenox-attention", signals.attention.toFixed(4));
    root.style.setProperty("--lenox-tension", signals.tension.toFixed(4));
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const forceReduced =
      process.env.NODE_ENV === "development" &&
      new URLSearchParams(window.location.search).has("lenox-reduced");
    const read = () => setReduced(forceReduced || media.matches);
    read();
    media.addEventListener("change", read);
    return () => media.removeEventListener("change", read);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !navigator.gpu) {
      const fallbackTimer = window.setTimeout(() => setGpuPath("fallback"), 0);
      return () => window.clearTimeout(fallbackTimer);
    }
    const bridge = new FlowEngineBridge(host, {
      lenoxMode: true,
      lenoxReducedMotion: reduced,
      onLenoxStateChange: setEngineState,
      onLenoxSignals: writeSignals,
      onDeviceLost: () => setGpuPath("fallback"),
      onError: (error) => console.error("[lenox] engine error", error),
    });
    bridgeRef.current = bridge;
    let cancelled = false;
    bridge.init().then(() => {
      if (!cancelled) setGpuPath("webgpu");
    }).catch((error) => {
      console.warn("[lenox] WebGPU unavailable, using static fallback", error);
      if (!cancelled) setGpuPath("fallback");
    });
    return () => {
      cancelled = true;
      bridge.dispose();
      if (bridgeRef.current === bridge) bridgeRef.current = null;
    };
  }, [reduced, writeSignals]);

  useEffect(() => {
    bridgeRef.current?.setCompositionMode(mode);
  }, [mode]);

  useEffect(() => {
    const opacity = state.introPhase === "gate"
      ? 1
      : getDesign(state.design).worldMedia === "film"
        ? 0.16
        : 1;
    bridgeRef.current?.setLenoxBackdropOpacity(opacity);
  }, [gpuPath, state.design, state.introPhase]);

  useEffect(() => {
    if (engineState === "present") {
      wakeInFlightRef.current = false;
      presenceCommittedRef.current = true;
      return;
    }
    if (
      gpuPath !== "webgpu" ||
      state.introPhase !== "entered" ||
      wakeInFlightRef.current
    ) return;
    if (
      !presenceCommittedRef.current ||
      engineState === "dormant" ||
      engineState === "idle"
    ) {
      bridgeRef.current?.setLenoxState("present");
    }
  }, [engineState, gpuPath, state.introPhase]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("lenox-review")) return;

    const review: LenoxReviewApi = {
      go(chapter, localProgress = 0) {
        directorRef.current?.restore({
          chapter,
          localProgress: Math.min(1, Math.max(0, localProgress)),
        });
      },
      intent: (intent) => bridgeRef.current?.setLenoxIntent(intent),
      emotion: (emotion) => bridgeRef.current?.setLenoxEmotion(emotion),
      reaction: (reaction) => bridgeRef.current?.setLenoxReaction(reaction),
      gaze: (x, y) => bridgeRef.current?.setLenoxGaze(x, y),
      pose: (pose, tau) => bridgeRef.current?.setJourneyPose(pose, tau),
      snapshot() {
        const position = directorRef.current?.getPosition() ?? semanticRef.current;
        return {
          design: state.design,
          chapter: position.chapter,
          localProgress: position.localProgress,
          composition: mode,
          engineState,
        };
      },
    };
    window.__LENOX_REVIEW__ = review;

    const preset = params.get("lenox-preset");
    const forcePresent = params.has("lenox-force-present") || preset !== null;
    const presetTimer = forcePresent
      ? window.setTimeout(() => {
          bridgeRef.current?.setLenoxState("present");
          if (!preset) return;
          review.go("lenox", 0.35);
          if (preset === "neutral") {
            review.emotion("neutral");
            review.intent({ kind: "rest" });
          } else if (preset === "thinking") {
            review.emotion("thinking");
            review.intent({ kind: "observe" });
          } else if (preset === "concerned") {
            review.emotion("concerned");
            review.intent({ kind: "observe" });
          } else if (preset === "confirm") {
            review.emotion("pleased");
            review.intent({ kind: "confirm" });
            review.reaction("confirm");
          } else if (preset === "guide-left" || preset === "guide-right") {
            review.emotion("curious");
            review.intent({
              kind: "guide",
              arm: preset === "guide-left" ? "left" : "right",
              targetNdc: { x: preset === "guide-left" ? -0.34 : 0.34, y: 0 },
              reach: 0.78,
            });
          }
        }, 0)
      : null;
    return () => {
      if (presetTimer !== null) window.clearTimeout(presetTimer);
      if (window.__LENOX_REVIEW__ === review) delete window.__LENOX_REVIEW__;
    };
  }, [engineState, gpuPath, mode, state.activeChapter, state.design, state.introPhase]);

  useEffect(() => {
    const signature = getDesign(state.design).engineSignature;
    if (signature) bridgeRef.current?.setSignature(signature);
  }, [gpuPath, state.design]);

  useEffect(() => {
    const design = getDesign(state.design);
    if (state.introPhase !== "entered" || mode === "banded" || design.worldMedia !== "film") return;
    const video = worldVideoRef.current;
    if (!video) return;
    video.load();
    const scrubber = createFilmScrubber(video);
    scrubberRef.current = scrubber;
    return () => {
      scrubber.dispose();
      if (scrubberRef.current === scrubber) scrubberRef.current = null;
    };
  }, [mode, state.design, state.introPhase]);

  useEffect(() => {
    if (reduced && state.introPhase !== "entered") markIntroSeen();
  }, [markIntroSeen, reduced, state.introPhase]);

  const finishIntro = useCallback(() => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    wakeInFlightRef.current = true;
    dispatch({ type: "SET_INTRO", phase: "handoff" });
    bridgeRef.current?.setLenoxState("waking");
    timers.current.push(window.setTimeout(markIntroSeen, reduced ? 0 : 900));
  }, [dispatch, markIntroSeen, reduced]);

  useEffect(() => {
    if (state.introPhase !== "arrival") return;
    if (!ARRIVAL_SOURCE) {
      timers.current.push(window.setTimeout(finishIntro, reduced ? 0 : 700));
    }
  }, [finishIntro, reduced, state.introPhase]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && state.introPhase !== "entered") finishIntro();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finishIntro, state.introPhase]);

  useEffect(
    () => () => {
      timers.current.forEach(window.clearTimeout);
      morphTimers.current.forEach(window.clearTimeout);
      if (pointerFrameRef.current !== null) window.cancelAnimationFrame(pointerFrameRef.current);
      if (positionCommitRef.current !== null) window.clearTimeout(positionCommitRef.current);
    },
    [],
  );

  const wake = useCallback(() => {
    worldVideoRef.current?.load();
    const unlock = worldVideoRef.current?.play();
    unlock?.then(() => worldVideoRef.current?.pause()).catch(() => {});
    dispatch({ type: "SET_INTRO", phase: "arrival" });
    if (ARRIVAL_SOURCE) void arrivalVideoRef.current?.play().catch(finishIntro);
  }, [dispatch, finishIntro]);

  const navigate = useCallback((chapter: ChapterId) => {
    if (state.introPhase !== "entered") {
      const position = { chapter, localProgress: 0 };
      semanticRef.current = position;
      restoreRef.current = position;
      dispatch({ type: "SET_POSITION", ...position });
      finishIntro();
      return;
    }
    directorRef.current?.scrollToChapter(chapter);
  }, [dispatch, finishIntro, state.introPhase]);

  const morph = useCallback((targetDesign: DesignId) => {
    morphTimers.current.forEach(window.clearTimeout);
    morphTimers.current = [];
    if (targetDesign === state.design) {
      setMorphTarget(null);
      return;
    }
    const position = { ...(directorRef.current?.getPosition() ?? semanticRef.current) };
    semanticRef.current = position;
    restoreRef.current = position;
    dispatch({ type: "SET_POSITION", chapter: position.chapter, localProgress: position.localProgress });
    setMorphTarget(targetDesign);
    morphTimers.current.push(
      window.setTimeout(() => {
        dispatch({ type: "SET_DESIGN", design: targetDesign });
        const url = new URL(window.location.href);
        url.searchParams.set("design", targetDesign);
        url.searchParams.delete("reality");
        window.history.replaceState(null, "", `${url.pathname}${url.search}#${position.chapter}`);
      }, reduced ? 60 : 420),
      window.setTimeout(() => {
        directorRef.current?.restore(position);
        restoreRef.current = null;
        setMorphTarget(null);
      }, reduced ? 120 : 720),
    );
  }, [dispatch, reduced, state.design]);

  const onPosition = useCallback((position: SemanticPosition, changed: boolean) => {
    semanticRef.current = position;
    if (changed) {
      if (positionCommitRef.current !== null) {
        window.clearTimeout(positionCommitRef.current);
        positionCommitRef.current = null;
      }
      dispatch({ type: "SET_POSITION", chapter: position.chapter, localProgress: position.localProgress });
    } else if (positionCommitRef.current === null) {
      positionCommitRef.current = window.setTimeout(() => {
        positionCommitRef.current = null;
        const current = semanticRef.current;
        dispatch({ type: "SET_POSITION", chapter: current.chapter, localProgress: current.localProgress });
      }, 180);
    }
    if (!changed) return;
    const intent = position.chapter === "work" || position.chapter === "ai-systems"
      ? { kind: "guide" as const, arm: "right" as const, targetNdc: { x: 0.34, y: 0 }, reach: 0.78 }
      : { kind: "observe" as const };
    bridgeRef.current?.setLenoxIntent(intent);
    bridgeRef.current?.setLenoxEmotion(
      position.chapter === "ai-systems" || position.chapter === "recompose" ? "thinking" : "curious",
    );
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${position.chapter}`);
  }, [dispatch]);

  const onProgress = useCallback((progress: number, clipAProgress: number) => {
    bridgeRef.current?.setGravityScrollProgress(progress);
    scrubberRef.current?.setProgress(clipAProgress);
  }, []);

  const onPose = useCallback((pose: StationPose, tau: number) => {
    bridgeRef.current?.setJourneyPose(pose, tau);
  }, []);

  const onDirector = useCallback((director: StudioDirector | null) => {
    directorRef.current = director;
    if (director) {
      director.restore(
        restoreRef.current ?? {
          chapter: state.activeChapter,
          localProgress: state.localProgress,
        },
      );
      restoreRef.current = null;
    }
  }, [state.activeChapter, state.localProgress]);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    pointerSampleRef.current = { x: event.clientX, y: event.clientY };
    if (pointerFrameRef.current !== null) return;
    pointerFrameRef.current = window.requestAnimationFrame(() => {
      pointerFrameRef.current = null;
      const bridge = bridgeRef.current;
      if (!bridge) return;
      const { x, y } = pointerSampleRef.current;
      bridge.setPointer(x, y, false);
      bridge.setLenoxGaze(x / window.innerWidth - 0.5, 0.5 - y / window.innerHeight);
    });
  }, []);

  const onPointerLeave = useCallback(() => {
    if (pointerFrameRef.current !== null) {
      window.cancelAnimationFrame(pointerFrameRef.current);
      pointerFrameRef.current = null;
    }
    bridgeRef.current?.clearPointer();
    bridgeRef.current?.setLenoxGaze(0, 0);
  }, []);

  const changeLocale = useCallback((locale: Locale) => {
    dispatch({ type: "SET_LOCALE", locale });
    const url = new URL(window.location.href);
    url.searchParams.set("lang", locale);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [dispatch]);

  const requestDesign = useCallback((design: DesignId) => {
    if (design === state.design) return;
    if (state.introPhase === "entered") {
      morph(design);
      return;
    }
    dispatch({ type: "SET_DESIGN", design });
    const url = new URL(window.location.href);
    url.searchParams.set("design", design);
    url.searchParams.delete("reality");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    finishIntro();
  }, [dispatch, finishIntro, morph, state.design, state.introPhase]);

  const activeDesign = getDesign(state.design);
  const headerStatus = deriveLenoxStatus(
    state.introPhase,
    engineState,
    state.audit.phase,
    morphTarget !== null,
    state.projectBrief.open,
  );

  return (
    <div
      ref={rootRef}
      className={styles.root}
      data-design={state.design}
      data-world-media={activeDesign.worldMedia}
      data-lenox-presence={activeDesign.lenoxPresence}
      data-intro={state.introPhase}
      data-composition={mode}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <div className={styles.world} aria-hidden>
        <div className={styles.worldPoster} />
        <video
          ref={worldVideoRef}
          className={styles.worldFilm}
          src={CLIP_A}
          poster={HERO_POSTER}
          muted
          playsInline
          preload="none"
          disablePictureInPicture
        />
      </div>
      <div className={styles.lenoxLayer} data-visible="true">
        {gpuPath === "fallback" ? (
          <FallbackEyes state={engineState} />
        ) : (
          <div ref={hostRef} className={styles.engineHost} />
        )}
      </div>
      {ARRIVAL_SOURCE ? (
        <video
          ref={arrivalVideoRef}
          className={styles.arrivalFilm}
          src={ARRIVAL_SOURCE}
          muted
          playsInline
          preload="metadata"
          onEnded={finishIntro}
          onError={finishIntro}
        />
      ) : null}
      <StudioHeader
        locale={state.locale}
        design={state.design}
        status={headerStatus}
        onNavigate={navigate}
        onLocale={changeLocale}
        onDesign={requestDesign}
      />
      <StudioJourney
        key={state.design}
        active={state.introPhase === "entered"}
        design={state.design}
        locale={state.locale}
        mode={mode}
        reduced={reduced}
        onProgress={onProgress}
        onPose={onPose}
        onPosition={onPosition}
        onDirector={onDirector}
        onMorph={morph}
      />
      <EntryGate locale={state.locale} phase={state.introPhase} onWake={wake} onSkip={finishIntro} />
      <div className={styles.morphCurtain} data-active={morphTarget !== null} aria-hidden>
        <span>{morphTarget ? getDesign(morphTarget).label : getDesign(state.design).label}</span>
      </div>
    </div>
  );
}
