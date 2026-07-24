"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DesignId } from "./designRegistry";
import {
  PROOF_ANALYSIS_FIXTURE,
  type Locale,
  type ProofAnalysisFixture,
  type ProofSliceState,
} from "./experienceState";
import styles from "./RealityProofSlice.module.css";

const proofContent = {
  claim: "WEBSITES PEOPLE REMEMBER.\nAI SYSTEMS THAT KEEP WORKING.",
  descriptor:
    "High-end digital products and operational AI systems for Swiss businesses.",
  artifact: {
    title: "ONE BRIEF. THREE SYSTEMS.",
    body: "A neutral proof artifact showing how identical facts can acquire a different hierarchy, rhythm and character.",
  },
  inputLabel: "Company or website",
  inputPlaceholder: "example.ch",
} as const;

const decisionMap: Record<
  "trust" | "innovation" | "character",
  { design: DesignId; reason: string }
> = {
  trust: {
    design: "signal",
    reason:
      "SIGNAL leads because this brief must establish responsibility and precision before spectacle.",
  },
  innovation: {
    design: "gravity",
    reason:
      "GRAVITY leads because this brief must prove technical ambition through a spatial system.",
  },
  character: {
    design: "atelier",
    reason:
      "ATELIER leads because this brief must make editorial judgment and human character unmistakable.",
  },
};

type ProofRendererProps = {
  proofSlice: ProofSliceState;
  onInput: (input: string) => void;
  onAnalysis: () => void;
};

function ProofInput({ proofSlice, onInput, onAnalysis }: ProofRendererProps) {
  return (
    <div className={styles.inputBlock}>
      <label htmlFor="reality-proof-input">{proofContent.inputLabel}</label>
      <div>
        <input
          id="reality-proof-input"
          value={proofSlice.input}
          placeholder={proofContent.inputPlaceholder}
          onChange={(event) => onInput(event.target.value)}
        />
        <button type="button" onClick={onAnalysis}>
          {proofSlice.analysisOpen ? "CLOSE RESULT" : "RUN PROOF"}
        </button>
      </div>
    </div>
  );
}

function AnalysisResult({ result }: { result: ProofAnalysisFixture }) {
  return (
    <section className={styles.analysis} aria-label="Proof analysis fixture">
      <header>
        <strong>PROOF FIXTURE · NOT FOR PUBLIC RELEASE</strong>
      </header>
      <div className={styles.findings}>
        <h3>Five Findings</h3>
        <ol>
          {result.findings.map((finding) => <li key={finding}>{finding}</li>)}
        </ol>
      </div>
      <div className={styles.priorities}>
        <h3>Three Priorities</h3>
        <ol>
          {result.priorities.map((priority) => <li key={priority}>{priority}</li>)}
        </ol>
      </div>
      <div className={styles.direction}>
        <h3>One Direction</h3>
        <p>{result.direction}</p>
      </div>
    </section>
  );
}

function SharedFacts(props: ProofRendererProps) {
  return (
    <>
      <div className={styles.heroCopy}>
        <h1>
          {proofContent.claim.split("\n").map((line) => <span key={line}>{line}</span>)}
        </h1>
        <p>{proofContent.descriptor}</p>
      </div>
      <ProofInput {...props} />
      <article className={styles.artifact}>
        <h2>{proofContent.artifact.title}</h2>
        <p>{proofContent.artifact.body}</p>
      </article>
      {props.proofSlice.analysisOpen && props.proofSlice.analysisResult ? (
        <AnalysisResult result={props.proofSlice.analysisResult} />
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
  return (
    <div className={`${styles.reality} ${styles.gravity}`}>
      <p className={styles.realityStatement}>ART DIRECTION PENDING / COMPUTATIONAL FIELD ACTIVE</p>
      <div className={styles.gravityMass} aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <SharedFacts {...props} />
    </div>
  );
}

function AtelierProof(props: ProofRendererProps) {
  return (
    <div className={`${styles.reality} ${styles.atelier}`}>
      <p className={styles.realityStatement}>LENOX / EDITORIAL DIRECTION / HIERARCHY ANNOTATED</p>
      <aside className={styles.marginNote}>
        Identical information. The composition now foregrounds authorship and judgment.
      </aside>
      <SharedFacts {...props} />
    </div>
  );
}

function RealityRenderer({ design, ...props }: ProofRendererProps & { design: DesignId }) {
  if (design === "gravity") return <GravityProof {...props} />;
  if (design === "atelier") return <AtelierProof {...props} />;
  return <SignalProof {...props} />;
}

export function RealityProofSlice({
  design,
  locale,
  proofSlice,
  morphPhase,
  onProofSlice,
  onDesign,
}: {
  design: DesignId;
  locale: Locale;
  proofSlice: ProofSliceState;
  morphPhase: "idle" | "compress" | "release";
  onProofSlice: (proofSlice: ProofSliceState) => void;
  onDesign: (design: DesignId) => void;
}) {
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decisionReason, setDecisionReason] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      const designByKey: Record<string, DesignId | undefined> = {
        "1": "signal",
        "2": "gravity",
        "3": "atelier",
      };
      const nextDesign = designByKey[event.key];
      if (nextDesign) onDesign(nextDesign);
      if (event.key.toLowerCase() === "l") setDecisionOpen((open) => !open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDesign]);

  const updateInput = (input: string) => onProofSlice({ ...proofSlice, input });
  const toggleAnalysis = () => onProofSlice({
    ...proofSlice,
    analysisOpen: !proofSlice.analysisOpen,
    analysisResult: proofSlice.analysisResult ?? PROOF_ANALYSIS_FIXTURE,
  });
  const decide = (answer: keyof typeof decisionMap) => {
    const decision = decisionMap[answer];
    setDecisionReason(decision.reason);
    onDesign(decision.design);
  };

  return (
    <main
      className={styles.proof}
      data-design={design}
      data-locale={locale}
      data-morph-phase={morphPhase}
    >
      <div className={styles.sharedControls}>
        <div className={styles.switcher} role="group" aria-label="Current reality">
          <span>CURRENT REALITY: {design.toUpperCase()}</span>
          {(["signal", "gravity", "atelier"] as const).map((id, index) => (
            <button
              key={id}
              type="button"
              aria-pressed={design === id}
              onClick={() => onDesign(id)}
            >
              [{index + 1}] {id.toUpperCase()}
            </button>
          ))}
          <button type="button" onClick={() => setDecisionOpen((open) => !open)}>
            [L] LET LENOX DECIDE
          </button>
        </div>
        <Link className={styles.primaryCta} href="/#contact">REQUEST REVIEW</Link>
      </div>

      {decisionOpen ? (
        <section className={styles.decision} aria-label="Let LENOX decide">
          <h2>WHAT MUST YOUR WEBSITE PROVE FIRST?</h2>
          <div>
            <button type="button" onClick={() => decide("trust")}>TRUST</button>
            <button type="button" onClick={() => decide("innovation")}>INNOVATION</button>
            <button type="button" onClick={() => decide("character")}>CHARACTER</button>
          </div>
          {decisionReason ? <p aria-live="polite">{decisionReason}</p> : null}
        </section>
      ) : null}

      <RealityRenderer
        key={design}
        design={design}
        proofSlice={proofSlice}
        onInput={updateInput}
        onAnalysis={toggleAnalysis}
      />
    </main>
  );
}
