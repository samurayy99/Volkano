import type { ConversationState } from "../../flow-engine/types";

/**
 * One beat of a scripted scenario. Every field is optional — a beat applies
 * only what it declares. Beats must be sorted by `atSec`; the player applies
 * each beat exactly once when the clock passes it.
 */
export type ScenarioBeat = {
  atSec: number;
  /** Drive the chamber (eased by sourceChamberDrive). */
  chamberState?: ConversationState;
  /** 0–1 chamber energy (visible as pulse while speaking). */
  energy?: number;
  /** Append a line to the incoming-request transcript. */
  transcriptLine?: string;
  /** Activate this system-timeline step (must exist in `timelineSteps`). */
  timelineStep?: string;
  /** Append a field to the output dossier. */
  dossierField?: { label: string; value: string };
  /** Reveal the closing line + CTA. */
  ctaReveal?: boolean;
};

export type ShowroomScenario = {
  id: string;
  /** Mode-selector label. */
  title: string;
  /** One-line business framing under the title. */
  tagline: string;
  /** Header over the transcript, e.g. incoming channel + time. */
  requestLabel: string;
  /** Header over the dossier. */
  dossierLabel: string;
  /** Full ordered step list (rendered as pending until activated). */
  timelineSteps: string[];
  /** Shown next to the CTA once revealed. */
  closingLine: string;
  beats: ScenarioBeat[];
};
