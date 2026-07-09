"use client";

import { useState } from "react";
import type { ScenarioPlayback } from "./useScenarioPlayer";
import type { ShowroomScenario } from "./types";
import { propertyEmergencyScenario } from "./scenarios/propertyEmergency";
import { clinicConciergeScenario } from "./scenarios/clinicConcierge";
import { privateConciergeScenario } from "./scenarios/privateConcierge";
import { localFrontdeskScenario } from "./scenarios/localFrontdesk";
import styles from "./ShowroomPanel.module.css";

/** All four public modes; each is pure scenario config. */
const MODES: ShowroomScenario[] = [
  propertyEmergencyScenario,
  clinicConciergeScenario,
  privateConciergeScenario,
  localFrontdeskScenario,
];

export function ShowroomPanel({
  playback,
  onSimulate,
  onReset,
}: {
  playback: ScenarioPlayback;
  onSimulate: (scenario: ShowroomScenario) => void;
  onReset: () => void;
}) {
  const [selectedId, setSelectedId] = useState(MODES[0].id);
  const selected =
    MODES.find((mode) => mode.id === selectedId) ?? MODES[0];
  // While a run owns the panel, render that run's scenario, not the selector.
  const scenario = playback.scenario ?? selected;
  const running = playback.playing || playback.done;
  const activeStep =
    playback.activatedSteps[playback.activatedSteps.length - 1] ?? null;

  const selectMode = (mode: ShowroomScenario) => {
    if (playback.playing) return;
    if (playback.done) onReset();
    setSelectedId(mode.id);
  };

  return (
    <aside className={styles.panel} aria-label="VOLKAN OS showroom">
      <div className={styles.brandRow}>
        <span className={styles.brand}>VOLKAN OS</span>
        <span className={styles.claim}>FROM CHAOS TO ACTION</span>
      </div>

      <section>
        <p className={styles.sectionLabel}>DEMO MODE</p>
        <div className={styles.modeList}>
          {MODES.map((mode, index) => (
            <button
              key={mode.id}
              type="button"
              className={
                mode.id === scenario.id
                  ? `${styles.modeButton} ${styles.modeButtonActive}`
                  : styles.modeButton
              }
              disabled={playback.playing}
              onClick={() => selectMode(mode)}
            >
              <span className={styles.modeIndex}>
                {String(index + 1).padStart(2, "0")}
              </span>
              {mode.title}
            </button>
          ))}
        </div>
      </section>

      {!running ? (
        <>
          <p className={styles.tagline}>{scenario.tagline}</p>
          <button
            type="button"
            className={styles.simulateButton}
            onClick={() => onSimulate(scenario)}
          >
            SIMULATE REQUEST
          </button>
        </>
      ) : null}

      {running && playback.transcript.length > 0 ? (
        <section>
          <p className={styles.sectionLabel}>{scenario.requestLabel}</p>
          <div className={styles.transcript}>
            {playback.transcript.map((line) => (
              <p key={line} className={styles.transcriptLine}>
                {line}
              </p>
            ))}
          </div>
        </section>
      ) : null}

      {running ? (
        <section>
          <p className={styles.sectionLabel}>SYSTEM</p>
          <div className={styles.timeline}>
            {scenario.timelineSteps.map((step) => {
              const activated = playback.activatedSteps.includes(step);
              const isActive = step === activeStep;
              const isReady = step === "READY" && activated;
              const cls = [
                styles.timelineStep,
                activated ? styles.timelineDone : "",
                isActive ? styles.timelineActive : "",
                isReady ? styles.timelineReady : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <span key={step} className={cls}>
                  {step}
                </span>
              );
            })}
          </div>
        </section>
      ) : null}

      {running && playback.dossier.length > 0 ? (
        <section>
          <p className={styles.sectionLabel}>{scenario.dossierLabel}</p>
          <div className={styles.dossier}>
            {playback.dossier.map((field) => (
              <div
                key={field.label}
                className={
                  field.label === "Priority"
                    ? `${styles.dossierRow} ${styles.dossierPriority}`
                    : styles.dossierRow
                }
              >
                <span className={styles.dossierLabel}>{field.label}</span>
                <span className={styles.dossierValue}>{field.value}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {playback.ctaRevealed ? (
        <>
          <p className={styles.closing}>{scenario.closingLine}</p>
          <div className={styles.ctaRow}>
            <a
              className={styles.ctaButton}
              href="mailto:hello@volkano.dev?subject=Generate%20my%20demo"
            >
              GENERATE MY DEMO
            </a>
            <button
              type="button"
              className={styles.resetButton}
              onClick={onReset}
            >
              RUN ANOTHER
            </button>
          </div>
        </>
      ) : null}
    </aside>
  );
}
