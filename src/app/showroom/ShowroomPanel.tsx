"use client";

import type { ScenarioPlayback } from "./useScenarioPlayer";
import type { ShowroomScenario } from "./types";
import { propertyEmergencyScenario } from "./scenarios/propertyEmergency";
import styles from "./ShowroomPanel.module.css";

/** Patch 3 ships one live scenario; the other modes land as configs (3.1). */
const MODES: { id: string; title: string; scenario: ShowroomScenario | null }[] =
  [
    {
      id: "property-emergency",
      title: "Property Emergency Desk",
      scenario: propertyEmergencyScenario,
    },
    { id: "clinic-concierge", title: "Clinic Concierge", scenario: null },
    {
      id: "private-concierge",
      title: "Private / Hospitality Concierge",
      scenario: null,
    },
    { id: "local-frontdesk", title: "Local Service Frontdesk", scenario: null },
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
  const scenario = playback.scenario ?? propertyEmergencyScenario;
  const running = playback.playing || playback.done;
  const activeStep =
    playback.activatedSteps[playback.activatedSteps.length - 1] ?? null;

  return (
    <aside className={styles.panel} aria-label="VOLKAN OS showroom">
      <div className={styles.brandRow}>
        <span className={styles.brand}>VOLKAN OS</span>
        <span className={styles.brand}>FROM CHAOS TO ACTION</span>
      </div>

      <section>
        <p className={styles.sectionLabel}>DEMO MODE</p>
        <div className={styles.modeList}>
          {MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={
                mode.id === scenario.id
                  ? `${styles.modeButton} ${styles.modeButtonActive}`
                  : styles.modeButton
              }
              disabled={mode.scenario === null || playback.playing}
            >
              {mode.title}
              {mode.scenario === null ? (
                <span className={styles.modeSoon}>SOON</span>
              ) : null}
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
