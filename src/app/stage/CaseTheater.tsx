"use client";

import { useEffect, useMemo, useRef } from "react";
import type { CompositionMode, LenoxEmotion } from "../../flow-engine/types";
import type { Locale, Messages } from "../../i18n/messages";
import { CASES, resolveCase } from "./cases";
import styles from "./CaseTheater.module.css";
import { useCaseRunner } from "./useCaseRunner";
import { useDecode } from "./useDecode";

/**
 * THE CASES — the WORK region is not a portfolio, it is a stage. A case is
 * picked, and he works it in front of you: the request arrives as foreign
 * matter, his face runs the real system states, and the dossier is assembled
 * row by row on the same clock as his gaze.
 *
 * Nothing here fires the amber confirm. A replay that ended in the "this
 * really happened" signal would be the fake proof this site argues against —
 * the disclosure line under every outcome says exactly what this was.
 */

/** An incoming line arrives the way everything on this site arrives. */
function IncomingLine({ text }: { text: string }) {
  const shown = useDecode(text, true, 420);
  return (
    <p className={styles.requestLine}>
      {/* The churn is noise until it settles; screen readers get the sentence. */}
      <span aria-hidden>{shown}</span>
      <span className={styles.srOnly}>{text}</span>
    </p>
  );
}

function ClosingLine({ text }: { text: string }) {
  const shown = useDecode(text, true, 620);
  return (
    <p className={styles.closing}>
      <span aria-hidden>{shown}</span>
      <span className={styles.srOnly}>{text}</span>
    </p>
  );
}

export function CaseTheater({
  locale,
  mode,
  ui,
  onEmotion,
  onGaze,
}: {
  locale: Locale;
  mode: CompositionMode;
  ui: Messages["caseUi"];
  onEmotion: (emotion: LenoxEmotion) => void;
  onGaze: (x: number, y: number) => void;
}) {
  const cases = useMemo(
    () => CASES.map((c) => resolveCase(c, locale)),
    [locale],
  );

  // Where "the work" is: beside him on a desktop, beneath him on a phone.
  // The same coordinates the build timeline uses for the same glance.
  const workGaze = useMemo<readonly [number, number]>(
    () => (mode === "banded" ? [0, -0.38] : [0.42, -0.05]),
    [mode],
  );

  const { run, start, stop } = useCaseRunner({ onEmotion, onGaze, workGaze });
  const active = run.caseId
    ? (cases.find((c) => c.id === run.caseId) ?? null)
    : null;

  // He keeps his work in frame: as the dossier grows past the fold, the
  // scroller follows the newest row. Nearest-block, so it never yanks.
  const tailRef = useRef<HTMLSpanElement | null>(null);
  const rowCount = run.fields.length;
  const outcomeShown = run.outcome;
  useEffect(() => {
    if (rowCount === 0 && !outcomeShown) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    tailRef.current?.scrollIntoView({
      block: "nearest",
      behavior: reduced ? "auto" : "smooth",
    });
  }, [rowCount, outcomeShown]);

  if (!active) {
    return (
      <ul className={styles.index}>
        {cases.map((c) => (
          <li key={c.id} className={styles.indexItem}>
            <button
              type="button"
              className={styles.caseRow}
              onClick={() => start(c)}
            >
              <span className={styles.channel}>{c.channel}</span>
              <span className={styles.caseTitle}>{c.title}</span>
              <span className={styles.caseTagline}>{c.tagline}</span>
              <span className={styles.runMark} aria-hidden>
                {ui.run}
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className={styles.run} aria-busy={run.running}>
      <header className={styles.runHead}>
        <span className={styles.channel}>{active.channel}</span>
        <button type="button" className={styles.control} onClick={stop}>
          {ui.close}
        </button>
      </header>

      {run.requests.length > 0 ? (
        <div className={styles.transcript}>
          {run.requests.map((line, i) => (
            <IncomingLine key={`${active.id}-${i}`} text={line} />
          ))}
        </div>
      ) : null}

      <ol className={styles.rail} aria-label={active.dossierLabel}>
        {active.steps.map((step, i) => (
          <li
            key={step}
            className={styles.step}
            data-state={
              i < run.activeStep
                ? "done"
                : i === run.activeStep
                  ? "active"
                  : "pending"
            }
          >
            {step}
          </li>
        ))}
      </ol>

      {run.fields.length > 0 ? (
        <section className={styles.dossier}>
          <h4 className={styles.dossierLabel}>{active.dossierLabel}</h4>
          <dl className={styles.rows}>
            {run.fields.map((f) => (
              <div className={styles.row} key={f.label}>
                <dt className={styles.rowLabel}>{f.label}</dt>
                <dd className={styles.rowValue}>{f.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {run.outcome ? (
        <footer className={styles.outcome} aria-live="polite">
          <span className={styles.outcomeRule} aria-hidden />
          <ClosingLine text={active.closing} />
          <p className={styles.disclosure}>{active.disclosure}</p>
          {run.done ? (
            <div className={styles.controls}>
              <button
                type="button"
                className={styles.control}
                onClick={() => start(active)}
              >
                {ui.again}
              </button>
              <button
                type="button"
                className={styles.control}
                onClick={stop}
              >
                {ui.index}
              </button>
            </div>
          ) : null}
        </footer>
      ) : null}

      <span ref={tailRef} aria-hidden />
    </div>
  );
}
