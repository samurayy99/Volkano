"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FlowEngineApi } from "../../flow-engine/types";
import type { ScenarioBeat, ShowroomScenario } from "./types";

const TICK_MS = 100;

export type ScenarioPlayback = {
  scenario: ShowroomScenario | null;
  playing: boolean;
  /** True once the final beat has been applied (panels stay filled). */
  done: boolean;
  transcript: string[];
  /** Steps already activated, in order; last entry is the current one. */
  activatedSteps: string[];
  dossier: { label: string; value: string }[];
  ctaRevealed: boolean;
};

const IDLE_PLAYBACK: ScenarioPlayback = {
  scenario: null,
  playing: false,
  done: false,
  transcript: [],
  activatedSteps: [],
  dossier: [],
  ctaRevealed: false,
};

/**
 * Plays a declarative beat script: walks `scenario.beats` on a wall-clock,
 * drives the engine (`setConversationState` / `setChamberEnergy`) and
 * accumulates the UI-facing playback state.
 */
export function useScenarioPlayer(
  engineApiRef: React.RefObject<FlowEngineApi | null>,
) {
  const [playback, setPlayback] = useState<ScenarioPlayback>(IDLE_PLAYBACK);
  const intervalRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const beatIndexRef = useRef(0);
  const scenarioRef = useRef<ShowroomScenario | null>(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const applyBeat = useCallback(
    (beat: ScenarioBeat) => {
      const api = engineApiRef.current;
      if (beat.chamberState) api?.setConversationState(beat.chamberState);
      if (beat.energy !== undefined) api?.setChamberEnergy(beat.energy);

      setPlayback((prev) => ({
        ...prev,
        transcript: beat.transcriptLine
          ? [...prev.transcript, beat.transcriptLine]
          : prev.transcript,
        activatedSteps: beat.timelineStep
          ? [...prev.activatedSteps, beat.timelineStep]
          : prev.activatedSteps,
        dossier: beat.dossierField
          ? [...prev.dossier, beat.dossierField]
          : prev.dossier,
        ctaRevealed: beat.ctaReveal ? true : prev.ctaRevealed,
      }));
    },
    [engineApiRef],
  );

  const stopTicking = useCallback(() => {
    clearTimer();
    setPlayback((prev) => ({ ...prev, playing: false, done: true }));
  }, [clearTimer]);

  const play = useCallback(
    (scenario: ShowroomScenario) => {
      clearTimer();
      scenarioRef.current = scenario;
      beatIndexRef.current = 0;
      startedAtRef.current = performance.now();
      setPlayback({
        ...IDLE_PLAYBACK,
        scenario,
        playing: true,
      });

      intervalRef.current = window.setInterval(() => {
        const active = scenarioRef.current;
        if (!active) return;
        const elapsedSec = (performance.now() - startedAtRef.current) / 1000;
        const beats = active.beats;
        while (
          beatIndexRef.current < beats.length &&
          beats[beatIndexRef.current].atSec <= elapsedSec
        ) {
          applyBeat(beats[beatIndexRef.current]);
          beatIndexRef.current += 1;
        }
        if (beatIndexRef.current >= beats.length) {
          stopTicking();
        }
      }, TICK_MS);
    },
    [applyBeat, clearTimer, stopTicking],
  );

  /** Stop playback, ease the chamber back to dormant, clear all panels. */
  const reset = useCallback(() => {
    clearTimer();
    scenarioRef.current = null;
    engineApiRef.current?.resetCycle();
    setPlayback(IDLE_PLAYBACK);
  }, [clearTimer, engineApiRef]);

  /** Abort without touching the engine (e.g. Enter film takes ownership). */
  const abort = useCallback(() => {
    clearTimer();
    scenarioRef.current = null;
    setPlayback(IDLE_PLAYBACK);
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  return { playback, play, reset, abort };
}
