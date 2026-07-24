"use client";

import { createFilmScrubber } from "../../stage/filmScrubber";
import { copy } from "../content";
import type { IntroPhase, Locale } from "../experienceState";
import styles from "../StudioExperience.module.css";

export const LEGACY_HERO_POSTER = "/studio/world/hero-keyframe.jpg";
export const LEGACY_CLIP_A = "/flow-assets/gravity-clip-a-v2-dense.mp4";

export function createLegacyFilmScrubber(video: HTMLVideoElement) {
  return createFilmScrubber(video);
}

export function LegacyEntryGate({
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
