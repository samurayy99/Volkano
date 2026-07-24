"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { DesignId } from "./designRegistry";
import {
  PROOF_ANALYSIS_FIXTURE,
  type Locale,
  type ProofSliceState,
} from "./experienceState";
import {
  PROOF_CONTENT,
  PROOF_FINDING_IDS,
  PROOF_PRIORITY_IDS,
} from "./proofContent";
import styles from "./RealityProofSlice.module.css";
import { isCurrentMorphToken, selectVisualBase } from "./realityMorph";

export type GravityPath = "idle" | "probing" | "webgpu" | "fallback";

type ProofRendererProps = {
  locale: Locale;
  layerId: string;
  proofSlice: ProofSliceState;
  gpuPath: GravityPath;
  onInput: (input: string) => void;
  onAnalysis: () => void;
};

type TransitionState = {
  source: DesignId;
  target: DesignId;
  token: number;
  focusKey: string | null;
};

function ProofInput({ locale, layerId, proofSlice, onInput, onAnalysis }: ProofRendererProps) {
  const content = PROOF_CONTENT[locale];
  const inputId = `reality-proof-input-${layerId}`;
  return (
    <div className={styles.inputBlock}>
      <label htmlFor={inputId}>{content.inputLabel}</label>
      <div>
        <input
          id={inputId}
          data-focus-key="proof-input"
          value={proofSlice.input}
          placeholder={content.inputPlaceholder}
          onChange={(event) => onInput(event.target.value)}
        />
        <button type="button" data-focus-key="proof-run" onClick={onAnalysis}>
          {proofSlice.analysisOpen ? content.closeResult : content.runProof}
        </button>
      </div>
    </div>
  );
}

function AnalysisResult({ locale }: { locale: Locale }) {
  const content = PROOF_CONTENT[locale];
  return (
    <section className={styles.analysis} aria-label={content.fixtureLabel}>
      <header><strong>{content.fixtureLabel}</strong></header>
      <div className={styles.findings}>
        <h3>{content.findingsTitle}</h3>
        <ol>{PROOF_FINDING_IDS.map((id) => <li key={id}>{content.findings[id]}</li>)}</ol>
      </div>
      <div className={styles.priorities}>
        <h3>{content.prioritiesTitle}</h3>
        <ol>{PROOF_PRIORITY_IDS.map((id) => <li key={id}>{content.priorities[id]}</li>)}</ol>
      </div>
      <div className={styles.direction}>
        <h3>{content.directionTitle}</h3>
        <p>{content.direction}</p>
      </div>
    </section>
  );
}

function Hero({ locale }: { locale: Locale }) {
  const content = PROOF_CONTENT[locale];
  return (
    <div className={styles.heroCopy}>
      <h1>{content.claim.split("\n").map((line) => <span key={line}>{line}</span>)}</h1>
      <p>{content.descriptor}</p>
    </div>
  );
}

function NeutralArtifact({ locale }: { locale: Locale }) {
  const content = PROOF_CONTENT[locale];
  return (
    <article className={styles.artifact}>
      <h2>{locale === "de" ? "EIN BRIEFING. DREI SYSTEME." : "ONE BRIEF. THREE SYSTEMS."}</h2>
      <p>{content.direction}</p>
    </article>
  );
}

function SharedFacts(props: ProofRendererProps) {
  return (
    <>
      <Hero locale={props.locale} />
      <ProofInput {...props} />
      <NeutralArtifact locale={props.locale} />
      {props.proofSlice.analysisOpen && props.proofSlice.analysisResult?.fixtureId === PROOF_ANALYSIS_FIXTURE.fixtureId ? (
        <AnalysisResult locale={props.locale} />
      ) : null}
    </>
  );
}

function SignalProof(props: ProofRendererProps) {
  return (
    <div className={`${styles.reality} ${styles.signal}`}>
      <p className={styles.realityStatement}>LENOX / ANALYST / SOURCE ORDER VERIFIED</p>
      <SharedFacts {...props} />
    </div>
  );
}

function GravityProof(props: ProofRendererProps) {
  const status = props.gpuPath === "webgpu"
    ? "COMPUTATIONAL FIELD ACTIVE"
    : props.gpuPath === "probing"
      ? "COMPUTATIONAL FIELD INITIALISING"
      : "STATIC FALLBACK";
  return (
    <div className={`${styles.reality} ${styles.gravity}`}>
      <p className={styles.realityStatement}>LENOX / PHYSICAL CAUSE / {status}</p>
      {props.gpuPath !== "webgpu" ? <div className={styles.gravityMass} aria-hidden><i /><i /><i /></div> : null}
      <SharedFacts {...props} />
    </div>
  );
}

function AtelierProof(props: ProofRendererProps) {
  const content = PROOF_CONTENT[props.locale];
  return (
    <div className={`${styles.reality} ${styles.atelier}`}>
      <p className={styles.realityStatement}>LENOX / EDITORIAL DIRECTOR / ARTIFACT VERIFIED</p>
      <Hero locale={props.locale} />
      <aside className={styles.marginNote}>01 — INTERNAL STUDY<br />02 — DECISION TRACE<br />03 — CANONICAL FACTS</aside>
      <ProofInput {...props} />
      <figure className={styles.artifactStudy}>
        <div className={styles.artifactImage}>
          <Image
            src="/studio/proof/atelier-historical-study.png"
            alt={content.artifact.alt}
            width={1586}
            height={992}
            sizes="(max-width: 980px) 92vw, 58vw"
          />
          <figcaption>{content.artifact.label}</figcaption>
        </div>
        <div className={styles.artifactNotes}>
          <h2>{content.artifact.title}</h2>
          {content.artifact.notes.map((note) => (
            <article key={note.label}>
              <strong>{note.label}</strong>
              <p>{note.body}</p>
            </article>
          ))}
        </div>
      </figure>
      {props.proofSlice.analysisOpen && props.proofSlice.analysisResult?.fixtureId === PROOF_ANALYSIS_FIXTURE.fixtureId ? (
        <AnalysisResult locale={props.locale} />
      ) : null}
    </div>
  );
}

function RealityRenderer({ design, ...props }: ProofRendererProps & { design: DesignId }) {
  if (design === "gravity") return <GravityProof {...props} />;
  if (design === "atelier") return <AtelierProof {...props} />;
  return <SignalProof {...props} />;
}

function animationProgress(animation: Animation | null): number {
  if (!animation) return 0;
  const timing = animation.effect?.getComputedTiming();
  const duration = typeof timing?.duration === "number" ? timing.duration : 1;
  const current = typeof animation.currentTime === "number" ? animation.currentTime : 0;
  return Math.min(1, Math.max(0, current / Math.max(duration, 1)));
}

export function RealityProofSlice({
  committedDesign,
  locale,
  proofSlice,
  gpuPath,
  reduced,
  onProofSlice,
  prepareDesign,
  onCommitDesign,
  onVisualState,
}: {
  committedDesign: DesignId;
  locale: Locale;
  proofSlice: ProofSliceState;
  gpuPath: GravityPath;
  reduced: boolean;
  onProofSlice: (proofSlice: ProofSliceState) => void;
  prepareDesign: (design: DesignId) => Promise<void>;
  onCommitDesign: (design: DesignId) => void;
  onVisualState: (visual: DesignId, pending: DesignId | null) => void;
}) {
  const content = PROOF_CONTENT[locale];
  const [visualDesign, setVisualDesign] = useState(committedDesign);
  const [transition, setTransition] = useState<TransitionState | null>(null);
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decisionReason, setDecisionReason] = useState("");
  const visualRef = useRef(visualDesign);
  const transitionRef = useRef(transition);
  const requestTokenRef = useRef(0);
  const sourceRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef<HTMLDivElement | null>(null);
  const edgeRef = useRef<HTMLDivElement | null>(null);
  const primaryAnimationRef = useRef<Animation | null>(null);
  const animationsRef = useRef<Animation[]>([]);
  const decisionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const decisionTitleRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => { visualRef.current = visualDesign; }, [visualDesign]);
  useEffect(() => { transitionRef.current = transition; }, [transition]);

  useEffect(() => {
    if (transitionRef.current) return;
    const frame = requestAnimationFrame(() => {
      setVisualDesign(committedDesign);
      visualRef.current = committedDesign;
      onVisualState(committedDesign, null);
    });
    return () => cancelAnimationFrame(frame);
  }, [committedDesign, onVisualState]);

  const cancelAnimations = useCallback(() => {
    for (const animation of animationsRef.current) animation.cancel();
    animationsRef.current = [];
    primaryAnimationRef.current = null;
  }, []);

  const beginTransition = useCallback((source: DesignId, target: DesignId, token: number) => {
    const active = document.activeElement as HTMLElement | null;
    const focusKey = active?.dataset.focusKey ?? null;
    const next = { source, target, token, focusKey };
    transitionRef.current = next;
    setTransition(next);
    onVisualState(source, target);
  }, [onVisualState]);

  const requestDesign = useCallback(async (target: DesignId) => {
    const token = ++requestTokenRef.current;
    let source = visualRef.current;
    const active = transitionRef.current;
    if (active) {
      source = selectVisualBase(
        active.source,
        active.target,
        animationProgress(primaryAnimationRef.current),
      );
      cancelAnimations();
      transitionRef.current = null;
      setTransition(null);
      visualRef.current = source;
      setVisualDesign(source);
      onVisualState(source, null);
    }
    if (source === target) return;
    await prepareDesign(target);
    if (!isCurrentMorphToken(token, requestTokenRef.current)) return;
    requestAnimationFrame(() => {
      if (isCurrentMorphToken(token, requestTokenRef.current)) beginTransition(source, target, token);
    });
  }, [beginTransition, cancelAnimations, onVisualState, prepareDesign]);

  useEffect(() => {
    if (!transition) return;
    const source = sourceRef.current;
    const target = targetRef.current;
    const edge = edgeRef.current;
    if (!source || !target || !edge) return;
    const duration = reduced ? 180 : window.innerWidth <= 980 ? 1000 : 1200;
    const easing = "cubic-bezier(0.76, 0, 0.24, 1)";
    const targetAnimation = target.animate(
      reduced
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { clipPath: "polygon(0 0, 0 0, 0 100%, 0 100%)" },
            { clipPath: "polygon(0 0, 104% 0, 100% 100%, 0 100%)" },
          ],
      { duration, easing, fill: "forwards" },
    );
    const sourceAnimation = source.animate(
      reduced
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [
            { transform: "translate3d(0,0,0) scale(1)", opacity: 1 },
            { transform: "translate3d(-1.2%,0,0) scale(0.992)", opacity: 0.78 },
          ],
      { duration, easing, fill: "forwards" },
    );
    const edgeAnimation = edge.animate(
      reduced
        ? [{ opacity: 0 }, { opacity: 0 }]
        : [
            { transform: "translate3d(-8vw,0,0) skewX(-4deg)", opacity: 0 },
            { transform: "translate3d(108vw,0,0) skewX(2deg)", opacity: 0.92 },
          ],
      { duration, easing, fill: "forwards" },
    );
    primaryAnimationRef.current = targetAnimation;
    animationsRef.current = [targetAnimation, sourceAnimation, edgeAnimation];
    targetAnimation.onfinish = () => {
      if (!isCurrentMorphToken(transition.token, requestTokenRef.current)) return;
      animationsRef.current = [];
      primaryAnimationRef.current = null;
      visualRef.current = transition.target;
      transitionRef.current = null;
      setVisualDesign(transition.target);
      setTransition(null);
      onVisualState(transition.target, null);
      onCommitDesign(transition.target);
      requestAnimationFrame(() => {
        if (!transition.focusKey) return;
        document.querySelector<HTMLElement>(`[data-reality-layer="${transition.target}"] [data-focus-key="${transition.focusKey}"]`)?.focus();
      });
    };
    return cancelAnimations;
  }, [cancelAnimations, onCommitDesign, onVisualState, reduced, transition]);

  useEffect(() => () => {
    requestTokenRef.current += 1;
    cancelAnimations();
  }, [cancelAnimations]);

  const closeDecision = useCallback(() => {
    setDecisionOpen(false);
    requestAnimationFrame(() => decisionTriggerRef.current?.focus());
  }, []);

  const toggleDecision = useCallback(() => {
    if (decisionOpen) {
      closeDecision();
      return;
    }
    setDecisionOpen(true);
    requestAnimationFrame(() => decisionTitleRef.current?.focus());
  }, [closeDecision, decisionOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key === "Escape" && decisionOpen) {
        event.preventDefault();
        closeDecision();
        return;
      }
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      const designByKey: Record<string, DesignId | undefined> = { "1": "signal", "2": "gravity", "3": "atelier" };
      const nextDesign = designByKey[event.key];
      if (nextDesign) void requestDesign(nextDesign);
      if (event.key.toLowerCase() === "l") toggleDecision();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeDecision, decisionOpen, requestDesign, toggleDecision]);

  const updateInput = (input: string) => onProofSlice({ ...proofSlice, input });
  const toggleAnalysis = () => onProofSlice({
    ...proofSlice,
    analysisOpen: !proofSlice.analysisOpen,
    analysisResult: proofSlice.analysisResult ?? PROOF_ANALYSIS_FIXTURE,
  });
  const decide = (answer: keyof typeof content.decisions) => {
    const decision = content.decisions[answer];
    setDecisionReason(decision.reason);
    void requestDesign(decision.design);
  };

  const renderedDesigns = transition
    ? [transition.source, transition.target]
    : [visualDesign];

  return (
    <main className={styles.proof} data-design={visualDesign} data-locale={locale} data-transition={transition ? "running" : "idle"}>
      <div className={styles.sharedControls}>
        <div className={styles.switcher} role="group" aria-label={content.currentReality}>
          <span>{content.currentReality}: {visualDesign.toUpperCase()}</span>
          {(["signal", "gravity", "atelier"] as const).map((id, index) => (
            <button
              key={id}
              type="button"
              aria-pressed={visualDesign === id}
              onPointerEnter={() => { if (id === "gravity") void prepareDesign(id); }}
              onFocus={() => { if (id === "gravity") void prepareDesign(id); }}
              onClick={() => void requestDesign(id)}
            >
              [{index + 1}] {id.toUpperCase()}
            </button>
          ))}
          <button
            ref={decisionTriggerRef}
            type="button"
            aria-expanded={decisionOpen}
            aria-controls="lenox-decision-region"
            onClick={toggleDecision}
          >
            [L] {content.decide}
          </button>
        </div>
        <Link className={styles.primaryCta} href="/#contact">{content.requestReview}</Link>
      </div>

      {decisionOpen ? (
        <section id="lenox-decision-region" className={styles.decision} role="region" aria-labelledby="lenox-decision-title">
          <header>
            <h2 id="lenox-decision-title" ref={decisionTitleRef} tabIndex={-1}>{content.decisionTitle}</h2>
            <button type="button" onClick={closeDecision}>{content.close}</button>
          </header>
          <div>
            {(Object.keys(content.decisions) as (keyof typeof content.decisions)[]).map((answer) => (
              <button key={answer} type="button" onClick={() => decide(answer)}>{content.decisions[answer].label}</button>
            ))}
          </div>
          <p aria-live="polite">{decisionReason}</p>
        </section>
      ) : null}

      <div className={styles.realityStage} data-transition={transition ? "running" : "idle"}>
        {renderedDesigns.map((design) => {
          const isTarget = transition?.target === design;
          const isSource = !isTarget;
          const accessible = !transition && design === visualDesign || Boolean(transition && isSource);
          return (
            <div
              key={design}
              ref={isTarget ? targetRef : sourceRef}
              className={`${styles.realityLayer} ${isTarget ? styles.targetLayer : styles.sourceLayer}`}
              data-reality-layer={design}
              aria-hidden={!accessible}
              inert={!accessible}
              style={{ "--layer-order": isTarget ? 2 : 1 } as CSSProperties}
            >
              <RealityRenderer
                design={design}
                locale={locale}
                layerId={`${design}-${transition?.token ?? "stable"}`}
                proofSlice={proofSlice}
                gpuPath={gpuPath}
                onInput={updateInput}
                onAnalysis={toggleAnalysis}
              />
            </div>
          );
        })}
        {transition ? <div ref={edgeRef} className={styles.cutEdge} aria-hidden /> : null}
      </div>
      <p className={styles.morphAnnouncement} aria-live="polite">
        {!transition ? `${content.currentReality}: ${visualDesign.toUpperCase()}` : ""}
      </p>
    </main>
  );
}
