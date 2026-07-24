"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import type {
  FlowEngineApi,
} from "../../flow-engine/types";
import { useCompositionMode } from "../stage/compositionMode";
import type { StationPose } from "../stage/stations";
import { aiModules, cases, chapters, copy, type CaseStudy } from "./content";
import {
  DESIGN_IDS,
  getDesign,
  isDesignId,
  writeDesignToUrl,
  type DesignId,
} from "./designRegistry";
import { useExperience } from "./ExperienceProvider";
import { RealityProofSlice } from "./RealityProofSlice";
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

function readReducedMotionPreference() {
  if (typeof window === "undefined") return false;
  const forceReduced =
    process.env.NODE_ENV === "development" &&
    new URLSearchParams(window.location.search).has("lenox-reduced");
  return forceReduced || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function readRealityProofMode() {
  if (typeof window === "undefined" || process.env.NODE_ENV !== "development") return false;
  return new URLSearchParams(window.location.search).get("proof") === "realities";
}

const subscribeRealityProofMode = () => () => {};

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
  engineState: "dormant",
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
  designs,
  announceStatus,
}: {
  locale: Locale;
  design: DesignId;
  status: LenoxStatus;
  onNavigate: (chapter: ChapterId) => void;
  onLocale: (locale: Locale) => void;
  onDesign: (design: DesignId) => void;
  designs: readonly DesignId[];
  announceStatus: boolean;
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
        {designs.length > 1 ? (
          <select
            className={styles.designPicker}
            value={design}
            aria-label={locale === "en" ? "Select design" : "Design wählen"}
            onChange={(event) => {
              if (isDesignId(event.target.value)) onDesign(event.target.value);
            }}
          >
            {designs.map((id) => (
              <option key={id} value={id}>{getDesign(id).shortLabel}</option>
            ))}
          </select>
        ) : null}
        <span className={styles.status} data-status={status} aria-live={announceStatus ? "polite" : "off"}>
          <i /> LENOX / {statusLabel[status]}
        </span>
      </div>
    </header>
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
  const { state, dispatch } = useExperience();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const bridgeRef = useRef<(FlowEngineApi & { readyAfterFirstFrame?: Promise<void> }) | null>(null);
  const bridgeInitRef = useRef<Promise<"webgpu" | "fallback"> | null>(null);
  const gravityFailedRef = useRef(false);
  const directorRef = useRef<StudioDirector | null>(null);
  const semanticRef = useRef<SemanticPosition>({ chapter: "hero", localProgress: 0 });
  const restoreRef = useRef<SemanticPosition | null>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const pointerSampleRef = useRef({ x: 0, y: 0 });
  const positionCommitRef = useRef<number | null>(null);
  const [gpuPath, setGpuPath] = useState<"idle" | "probing" | "webgpu" | "fallback">("idle");
  const [proofVisualDesign, setProofVisualDesign] = useState<DesignId>(state.design);
  const [proofPendingTarget, setProofPendingTarget] = useState<DesignId | null>(null);
  const [reduced, setReduced] = useState(readReducedMotionPreference);
  const mode = useCompositionMode(false);
  const proofMode = useSyncExternalStore(
    subscribeRealityProofMode,
    readRealityProofMode,
    () => false,
  );
  const displayDesign = proofMode ? proofVisualDesign : state.design;
  const activeDesign = getDesign(displayDesign);

  useEffect(() => {
    if (!directorRef.current) {
      semanticRef.current = {
        chapter: state.activeChapter,
        localProgress: state.localProgress,
      };
    }
  }, [state.activeChapter, state.localProgress]);

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

  const ensureGravityRuntime = useCallback((): Promise<"webgpu" | "fallback"> => {
    if (gravityFailedRef.current || !navigator.gpu) {
      gravityFailedRef.current = true;
      setGpuPath("fallback");
      return Promise.resolve("fallback");
    }
    if (bridgeInitRef.current) return bridgeInitRef.current;
    const host = hostRef.current;
    if (!host) return Promise.resolve("fallback");
    setGpuPath("probing");
    bridgeInitRef.current = import("../../flow-engine/engineBridge")
      .then(({ FlowEngineBridge }) => {
        const bridge = new FlowEngineBridge(host, {
          engineMode: "field",
          lenoxReducedMotion: reduced,
          onDeviceLost: () => {
            gravityFailedRef.current = true;
            setGpuPath("fallback");
          },
          onError: (error) => {
            if (process.env.NODE_ENV === "development") {
              console.warn("[gravity-field] static fallback", error);
            }
          },
        });
        bridgeRef.current = bridge;
        return bridge.init().then(() => {
          setGpuPath("webgpu");
          return "webgpu" as const;
        });
      })
      .catch(() => {
        gravityFailedRef.current = true;
        setGpuPath("fallback");
        return "fallback" as const;
      });
    return bridgeInitRef.current;
  }, [reduced]);

  useEffect(() => {
    if (displayDesign === "gravity" || proofPendingTarget === "gravity") {
      void ensureGravityRuntime().then((path) => {
        if (path === "webgpu") bridgeRef.current?.resume("reality");
      });
    } else {
      bridgeRef.current?.suspend("reality");
    }
  }, [displayDesign, ensureGravityRuntime, gpuPath, proofPendingTarget]);

  const prepareDesign = useCallback(async (design: DesignId): Promise<void> => {
    if (design !== "gravity") return;
    let timeoutId = 0;
    const timeout = new Promise<"fallback">((resolve) => {
      timeoutId = window.setTimeout(() => resolve("fallback"), 1500);
    });
    const result = await Promise.race([ensureGravityRuntime(), timeout]);
    window.clearTimeout(timeoutId);
    if (result === "fallback") setGpuPath("fallback");
  }, [ensureGravityRuntime]);

  useEffect(() => () => {
    bridgeRef.current?.dispose();
    bridgeRef.current = null;
    bridgeInitRef.current = null;
  }, []);

  useEffect(
    () => () => {
      if (pointerFrameRef.current !== null) window.cancelAnimationFrame(pointerFrameRef.current);
      if (positionCommitRef.current !== null) window.clearTimeout(positionCommitRef.current);
    },
    [],
  );

  const navigate = useCallback((chapter: ChapterId) => {
    directorRef.current?.scrollToChapter(chapter);
  }, []);

  const commitProofDesign = useCallback((design: DesignId) => {
    dispatch({ type: "SET_DESIGN", design });
    const url = writeDesignToUrl(new URL(window.location.href), design);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [dispatch]);

  const updateProofVisualState = useCallback((visual: DesignId, pending: DesignId | null) => {
    setProofVisualDesign(visual);
    setProofPendingTarget(pending);
  }, []);

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
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${position.chapter}`);
  }, [dispatch]);

  const onProgress = useCallback((progress: number, clipAProgress: number) => {
    bridgeRef.current?.setGravityScrollProgress(progress);
    void clipAProgress;
  }, []);

  const onPose = useCallback(() => {}, []);

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
    });
  }, []);

  const onPointerLeave = useCallback(() => {
    if (pointerFrameRef.current !== null) {
      window.cancelAnimationFrame(pointerFrameRef.current);
      pointerFrameRef.current = null;
    }
    bridgeRef.current?.clearPointer();
  }, []);

  const changeLocale = useCallback((locale: Locale) => {
    dispatch({ type: "SET_LOCALE", locale });
    const url = new URL(window.location.href);
    url.searchParams.set("lang", locale);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [dispatch]);

  const requestDesign = useCallback((design: DesignId) => {
    if (!proofMode || design === state.design) return;
    commitProofDesign(design);
    setProofVisualDesign(design);
  }, [commitProofDesign, proofMode, state.design]);

  const headerStatus = deriveLenoxStatus(
    state.introPhase,
    "dormant",
    state.audit.phase,
    proofPendingTarget !== null,
    state.projectBrief.open,
  );

  return (
    <div
      ref={rootRef}
      className={styles.root}
      data-design={displayDesign}
      data-world-media={activeDesign.worldMedia}
      data-lenox-presence={activeDesign.lenoxPresence}
      data-engine-mode={activeDesign.engineMode}
      data-intro={state.introPhase}
      data-composition={mode}
      data-proof={proofMode}
      data-reduced={reduced}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <div
        className={styles.lenoxLayer}
        data-visible={(displayDesign === "gravity" || proofPendingTarget === "gravity") && gpuPath === "webgpu"}
      >
        <div ref={hostRef} className={styles.engineHost} />
      </div>
      <StudioHeader
        locale={state.locale}
        design={displayDesign}
        status={headerStatus}
        onNavigate={navigate}
        onLocale={changeLocale}
        onDesign={requestDesign}
        designs={proofMode ? [] : ["signal"]}
        announceStatus={!proofMode}
      />
      {proofMode ? (
        <RealityProofSlice
          committedDesign={state.design}
          locale={state.locale}
          proofSlice={state.proofSlice}
          gpuPath={gpuPath}
          reduced={reduced}
          onProofSlice={(proofSlice) => dispatch({ type: "SET_PROOF_SLICE", proofSlice })}
          prepareDesign={prepareDesign}
          onCommitDesign={commitProofDesign}
          onVisualState={updateProofVisualState}
        />
      ) : (
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
          onMorph={requestDesign}
        />
      )}
    </div>
  );
}
