"use client";

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
import type { LenoxProofState, LenoxSignals } from "../../flow-engine/types";
import { FallbackEyes } from "../FallbackEyes";
import { createFilmScrubber, type FilmScrubber } from "../stage/filmScrubber";
import { useCompositionMode } from "../stage/compositionMode";
import type { StationPose } from "../stage/stations";
import { chapters, copy } from "./content";
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
import styles from "./StudioExperience.module.css";

const HERO_POSTER = "/studio/world/hero-keyframe.jpg";
const CLIP_A = "/flow-assets/gravity-clip-a-v2-dense.mp4";
const ARRIVAL_SOURCE: string | null = null;

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
      side: { zoom: 0.84, shiftX: -0.18, shiftY: 0.03 },
      banded: { zoom: 1.04, shiftX: 0, shiftY: -0.26 },
    },
  },
  {
    id: "principle",
    pose: {
      side: { zoom: 0.88, shiftX: -0.24, shiftY: 0 },
      banded: { zoom: 1.06, shiftX: 0, shiftY: -0.2 },
    },
  },
  {
    id: "capabilities",
    pose: {
      side: { zoom: 0.68, shiftX: -0.3, shiftY: -0.02 },
      banded: { zoom: 1.12, shiftX: 0, shiftY: -0.24 },
    },
  },
  {
    id: "lenox",
    pose: {
      side: { zoom: 0.62, shiftX: 0.22, shiftY: 0.02 },
      banded: { zoom: 0.96, shiftX: 0, shiftY: -0.2 },
    },
  },
  {
    id: "contact",
    pose: {
      side: { zoom: 0.82, shiftX: 0.3, shiftY: 0 },
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
      </button>
      <nav aria-label="Primary navigation">
        {chapters
          .filter((chapter) => chapter.id !== "hero")
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

/**
 * The entry never covers the field. The MLS-MPM play state is live and pointer-
 * reactive from the first paint; this layer only adds the words and the two ways in.
 */
function EntryGate({
  locale,
  phase,
  onPlay,
  onEnterStudio,
  onChoose,
  onSkip,
}: {
  locale: Locale;
  phase: IntroPhase;
  onPlay: () => void;
  onEnterStudio: () => void;
  onChoose: (design: DesignId) => void;
  onSkip: () => void;
}) {
  if (phase === "entered") return null;
  return (
    <div className={styles.entry} data-phase={phase}>
      <div className={styles.entryCopy}>
        {phase === "gate" ? (
          <div className={styles.entryActions}>
            <button type="button" onClick={onPlay}>{copy.play[locale]}</button>
            <button type="button" onClick={onEnterStudio}>{copy.enterStudio[locale]}</button>
          </div>
        ) : phase === "select" ? (
          <div className={styles.realityChoice}>
            <p>{copy.selectTitle[locale]}</p>
            <div role="group" aria-label={copy.selectTitle[locale]}>
              {DESIGN_IDS.map((id) => (
                <button key={id} type="button" onClick={() => onChoose(id)}>
                  {getDesign(id).label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className={styles.arrivalReadout}>
            <span>{copy.wake[locale]}</span>
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

function Lines({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line) => (
        <span key={line}>{line}</span>
      ))}
    </>
  );
}

function PrincipleChapter({
  locale,
  design,
  onMorph,
}: {
  locale: Locale;
  design: DesignId;
  onMorph: (design: DesignId) => void;
}) {
  return (
    <div className={styles.principleChapter}>
      <SplitTitle>{copy.principle.title[locale]}</SplitTitle>
      <p><Lines text={copy.principle.body[locale]} /></p>
      <div
        className={styles.designChoices}
        role="group"
        aria-label={copy.principle.switchLabel[locale]}
      >
        {DESIGN_IDS.map((id) => (
          <button
            key={id}
            type="button"
            aria-current={id === design}
            onClick={() => onMorph(id)}
          >
            {getDesign(id).shortLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

function CapabilitiesChapter({ locale }: { locale: Locale }) {
  return (
    <div className={styles.capabilitiesChapter}>
      <div className={styles.chapterIntro}>
        <SplitTitle>{copy.capabilities.title[locale]}</SplitTitle>
      </div>
      <div className={styles.capabilityLines}>
        {copy.capabilities.items.map((item) => (
          <article key={item.index}>
            <span>{item.index}</span>
            <h3>
              {item.index === "03" ? (
                <Link href="/ai-systems">{item.title[locale]}</Link>
              ) : (
                item.title[locale]
              )}
            </h3>
            <p>{item.body[locale]}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function LenoxChapter({ locale, onBrief }: { locale: Locale; onBrief: () => void }) {
  return (
    <div className={styles.lenoxChapter}>
      <SplitTitle>{copy.lenox.title[locale]}</SplitTitle>
      <p><Lines text={copy.lenox.body[locale]} /></p>
      <button className={styles.primaryAction} type="button" onClick={onBrief}>
        {copy.lenox.action[locale]}
      </button>
    </div>
  );
}

function ContactChapter({ locale }: { locale: Locale }) {
  const { state, dispatch } = useExperience();
  const briefOpen = state.projectBrief.open;
  const fields = copy.contact.fields;
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
      <SplitTitle>{copy.contact.title[locale]}</SplitTitle>
      <p>{copy.contact.body[locale]}</p>
      <button
        className={styles.primaryAction}
        type="button"
        aria-expanded={briefOpen}
        aria-controls="project-brief-form"
        onClick={() => update("open", !briefOpen)}
      >
        {copy.contact.action[locale]}
      </button>
      {briefOpen ? (
        <form id="project-brief-form" className={styles.briefForm} onSubmit={(event) => event.preventDefault()}>
          <input aria-label={fields.name[locale]} placeholder={fields.name[locale]} value={state.projectBrief.name} onChange={(event) => update("name", event.target.value)} />
          <input aria-label={fields.company[locale]} placeholder={fields.company[locale]} value={state.projectBrief.company} onChange={(event) => update("company", event.target.value)} />
          <input aria-label={fields.email[locale]} type="email" placeholder={fields.email[locale]} value={state.projectBrief.email} onChange={(event) => update("email", event.target.value)} />
          <textarea aria-label={fields.message[locale]} placeholder={fields.message[locale]} value={state.projectBrief.message} onChange={(event) => update("message", event.target.value)} />
          <a href={buildMailtoHref("hello@volkano.dev", "Project inquiry", briefBody)}>
            {fields.send[locale]}
          </a>
        </form>
      ) : null}
      <footer className={styles.studioFooter}>
        <span>{copy.studioName} · {copy.footer.location[locale]}</span>
        <span>{copy.footer.credit}</span>
      </footer>
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
  const { state, dispatch } = useExperience();
  const briefLenox = () => {
    dispatch({ type: "SET_PROJECT_BRIEF", brief: { ...state.projectBrief, open: true } });
    onNavigate("contact");
  };
  return (
    <>
      <ChapterShell id="hero">
        <div className={styles.heroChapter}>
          <SplitTitle level={1}>{copy.hero.title[locale]}</SplitTitle>
          <span><Lines text={copy.hero.body[locale]} /></span>
          <button
            className={styles.primaryAction}
            type="button"
            onClick={() => onNavigate("contact")}
          >
            {copy.hero.action[locale]}
          </button>
        </div>
      </ChapterShell>
      <ChapterShell id="principle">
        <PrincipleChapter locale={locale} design={design} onMorph={onMorph} />
      </ChapterShell>
      <ChapterShell id="capabilities"><CapabilitiesChapter locale={locale} /></ChapterShell>
      <ChapterShell id="lenox"><LenoxChapter locale={locale} onBrief={briefLenox} /></ChapterShell>
      <ChapterShell id="contact"><ContactChapter locale={locale} /></ChapterShell>
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
  const pointerFrameRef = useRef<number | null>(null);
  const pointerSampleRef = useRef({ x: 0, y: 0 });
  const positionCommitRef = useRef<number | null>(null);
  const timers = useRef<number[]>([]);
  const morphTimers = useRef<number[]>([]);
  const [gpuPath, setGpuPath] = useState<"probing" | "webgpu" | "fallback">("probing");
  const [engineState, setEngineState] = useState<LenoxProofState>("dormant");
  const [morphTarget, setMorphTarget] = useState<DesignId | null>(null);
  const [reduced, setReduced] = useState(false);
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
    const read = () => setReduced(media.matches);
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
      // Each reality owns its own background; the canvas contributes particles
      // and LENOX on transparency and nothing else.
      lenoxBackdrop: false,
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
    dispatch({ type: "SET_INTRO", phase: "handoff" });
    bridgeRef.current?.setLenoxState("waking");
    timers.current.push(window.setTimeout(markIntroSeen, reduced ? 0 : 900));
  }, [dispatch, markIntroSeen, reduced]);

  /** WAKE hands over to the reality choice, not straight into a design. */
  const revealSelection = useCallback(() => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    dispatch({ type: "SET_INTRO", phase: "select" });
  }, [dispatch]);

  useEffect(() => {
    if (state.introPhase !== "arrival") return;
    if (!ARRIVAL_SOURCE) {
      timers.current.push(window.setTimeout(revealSelection, reduced ? 0 : 1400));
    }
  }, [reduced, revealSelection, state.introPhase]);

  const chooseReality = useCallback((design: DesignId) => {
    dispatch({ type: "SET_DESIGN", design });
    finishIntro();
  }, [dispatch, finishIntro]);

  /** The direct door: no ritual, straight into SIGNAL. */
  const enterStudio = useCallback(() => {
    dispatch({ type: "SET_DESIGN", design: "design-02" });
    finishIntro();
  }, [dispatch, finishIntro]);

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
    bridgeRef.current?.setLenoxState("waking");
    if (ARRIVAL_SOURCE) void arrivalVideoRef.current?.play().catch(revealSelection);
  }, [dispatch, revealSelection]);

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
    const position = directorRef.current?.getPosition() ?? semanticRef.current;
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
        if (restoreRef.current) directorRef.current?.restore(restoreRef.current);
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
    const intent = position.chapter === "principle" || position.chapter === "capabilities"
      ? { kind: "guide" as const, arm: "right" as const, targetNdc: { x: 0.34, y: 0 }, reach: 0.78 }
      : { kind: "observe" as const };
    bridgeRef.current?.setLenoxIntent(intent);
    bridgeRef.current?.setLenoxEmotion(
      position.chapter === "principle" || position.chapter === "lenox" ? "thinking" : "curious",
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
      <EntryGate
        locale={state.locale}
        phase={state.introPhase}
        onPlay={wake}
        onEnterStudio={enterStudio}
        onChoose={chooseReality}
        onSkip={finishIntro}
      />
      <div className={styles.morphCurtain} data-active={morphTarget !== null} aria-hidden>
        <span>{morphTarget ? getDesign(morphTarget).label : getDesign(state.design).label}</span>
      </div>
    </div>
  );
}
