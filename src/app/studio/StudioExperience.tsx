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
  LenoxStatus,
  Locale,
} from "./experienceState";
import type { StudioOpeningScore } from "./studioOpening";
import {
  createStudioDirector,
  type SemanticPosition,
  type StudioDirector,
  type StudioStation,
} from "./studioDirector";
import { buildMailtoHref } from "./studioLinks";
import styles from "./StudioExperience.module.css";

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
  engineState: LenoxProofState,
  auditPhase: "idle" | "validating" | "previewing" | "complete",
  morphing: boolean,
  briefOpen: boolean,
): LenoxStatus {
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
      side: { zoom: 0.72, shiftX: -0.1, shiftY: 0 },
      banded: { zoom: 0.92, shiftX: 0, shiftY: -0.08 },
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
  onOpening,
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
  onOpening: (score: StudioOpeningScore) => void;
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
      design === "design-01",
      { onProgress, onPosition, onOpening, setPose: onPose },
    );
    onDirectorRef.current(director);
    return () => {
      onDirectorRef.current(null);
      director.destroy();
    };
  }, [active, design, locale, mode, onOpening, onPose, onPosition, onProgress, reduced]);

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
  const bridgeRef = useRef<FlowEngineBridge | null>(null);
  const directorRef = useRef<StudioDirector | null>(null);
  const semanticRef = useRef<SemanticPosition>({ chapter: "hero", localProgress: 0 });
  const restoreRef = useRef<SemanticPosition | null>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const pointerSampleRef = useRef({ x: 0, y: 0, isDown: false });
  const positionCommitRef = useRef<number | null>(null);
  const morphTimers = useRef<number[]>([]);
  const hintDismissedRef = useRef(false);
  const [gpuPath, setGpuPath] = useState<"probing" | "webgpu" | "fallback">("probing");
  const [engineState, setEngineState] = useState<LenoxProofState>("dormant");
  const [morphTarget, setMorphTarget] = useState<DesignId | null>(null);
  const [playHintVisible, setPlayHintVisible] = useState(false);
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
      experienceMode: "living-surface",
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
    bridgeRef.current?.setInteractiveEnabled(!reduced);
    if (reduced) bridgeRef.current?.clearPointer();
  }, [gpuPath, reduced]);

  useEffect(() => {
    const signature = getDesign(state.design).engineSignature;
    if (signature) bridgeRef.current?.setSignature(signature);
  }, [gpuPath, state.design]);

  const dismissPlayHint = useCallback(() => {
    if (hintDismissedRef.current) return;
    hintDismissedRef.current = true;
    setPlayHintVisible(false);
  }, []);

  useEffect(() => {
    if (reduced || state.design !== "design-01") return;
    const timer = window.setTimeout(() => {
      if (!hintDismissedRef.current) setPlayHintVisible(true);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [reduced, state.design]);

  useEffect(
    () => () => {
      morphTimers.current.forEach(window.clearTimeout);
      if (pointerFrameRef.current !== null) window.cancelAnimationFrame(pointerFrameRef.current);
      if (positionCommitRef.current !== null) window.clearTimeout(positionCommitRef.current);
    },
    [],
  );

  const navigate = useCallback((chapter: ChapterId) => {
    directorRef.current?.scrollToChapter(chapter);
  }, []);

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
    if (changed) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}#${position.chapter}`,
      );
    }
  }, [dispatch]);

  const onProgress = useCallback(() => {}, []);

  const onOpening = useCallback((score: StudioOpeningScore) => {
    if (state.design !== "design-01") {
      bridgeRef.current?.setLivingSurfaceOpening({ tension: 0, aperture: 0 });
      return;
    }
    const root = rootRef.current;
    if (root) {
      root.style.setProperty("--opening-hero-exit", score.heroExit.toFixed(4));
      root.style.setProperty(
        "--opening-principle-entry",
        score.principleEntry.toFixed(4),
      );
      root.style.setProperty("--opening-camera", score.camera.toFixed(4));
    }
    bridgeRef.current?.setLivingSurfaceOpening(
      { tension: score.tension, aperture: score.aperture },
      reduced ? 0.05 : 0.22,
    );
    if (
      score.tension > 0 ||
      score.aperture > 0 ||
      score.heroExit > 0 ||
      score.principleEntry > 0
    ) {
      dismissPlayHint();
    }
  }, [dismissPlayHint, reduced, state.design]);

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
    dismissPlayHint();
    if (reduced) return;
    pointerSampleRef.current = {
      x: event.clientX,
      y: event.clientY,
      isDown: event.pointerType !== "mouse" && event.buttons !== 0,
    };
    if (pointerFrameRef.current !== null) return;
    pointerFrameRef.current = window.requestAnimationFrame(() => {
      pointerFrameRef.current = null;
      const bridge = bridgeRef.current;
      if (!bridge) return;
      const { x, y, isDown } = pointerSampleRef.current;
      bridge.setPointer(x, y, isDown);
    });
  }, [dismissPlayHint, reduced]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    dismissPlayHint();
    if (!reduced) {
      bridgeRef.current?.setPointer(event.clientX, event.clientY, true);
    }
  }, [dismissPlayHint, reduced]);

  const onPointerEnd = useCallback(() => {
    bridgeRef.current?.clearPointer();
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
    if (design === state.design) return;
    morph(design);
  }, [morph, state.design]);

  const activeDesign = getDesign(state.design);
  const headerStatus = deriveLenoxStatus(
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
      data-gpu={gpuPath}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={onPointerLeave}
    >
      <div className={styles.world} aria-hidden>
        <div className={styles.worldPoster} />
      </div>
      <div className={styles.lenoxLayer} data-visible="true">
        <div ref={hostRef} className={styles.engineHost} />
      </div>
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
        active
        design={state.design}
        locale={state.locale}
        mode={mode}
        reduced={reduced}
        onProgress={onProgress}
        onPose={onPose}
        onPosition={onPosition}
        onOpening={onOpening}
        onDirector={onDirector}
        onMorph={morph}
      />
      <div
        className={styles.playHint}
        data-visible={playHintVisible}
        aria-hidden="true"
      >
        {copy.play[state.locale]}
      </div>
      <div className={styles.morphCurtain} data-active={morphTarget !== null} aria-hidden>
        <span>{morphTarget ? getDesign(morphTarget).label : getDesign(state.design).label}</span>
      </div>
    </div>
  );
}
