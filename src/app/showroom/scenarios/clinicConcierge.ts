import type { ShowroomScenario } from "../types";

/**
 * Clinic Concierge — public demo scenario #2.
 * High-ticket dental lead via Instagram DM: instant, discreet qualification
 * with hard guardrails (no medical advice, no price quotes).
 */
export const clinicConciergeScenario: ShowroomScenario = {
  id: "clinic-concierge",
  title: "Clinic Concierge",
  tagline: "High-ticket leads answered in seconds, not after the weekend.",
  requestLabel: "INCOMING · INSTAGRAM DM · 21:38",
  dossierLabel: "LEAD DOSSIER",
  timelineSteps: [
    "LISTENING",
    "EXTRACTING",
    "CLASSIFYING",
    "APPLYING RULES",
    "ROUTING",
    "READY",
  ],
  closingLine: "This is what your team receives instead of chaos.",
  beats: [
    { atSec: 0, chamberState: "listening", energy: 0, timelineStep: "LISTENING" },
    { atSec: 0.6, transcriptLine: "hi, i saw your invisalign posts…" },
    { atSec: 1.7, transcriptLine: "how much does it roughly cost?" },
    { atSec: 2.8, transcriptLine: "and does it hurt? i have a wedding in june" },

    { atSec: 3.9, chamberState: "processing", timelineStep: "EXTRACTING" },
    { atSec: 5.1, timelineStep: "CLASSIFYING" },
    { atSec: 6.2, timelineStep: "APPLYING RULES" },
    { atSec: 7.2, timelineStep: "ROUTING" },

    { atSec: 8.0, chamberState: "speaking", energy: 0.7 },
    { atSec: 8.2, dossierField: { label: "Lead ID", value: "CC-2607-0118" } },
    { atSec: 8.75, dossierField: { label: "Channel", value: "Instagram DM · answered in 4 s" } },
    { atSec: 9.3, dossierField: { label: "Treatment interest", value: "Invisalign" } },
    { atSec: 9.85, dossierField: { label: "Main question", value: "Cost range" } },
    { atSec: 10.4, dossierField: { label: "Concern", value: "Pain · timeline (wedding in June)" } },
    { atSec: 10.95, dossierField: { label: "Guardrail", value: "No medical advice · no price quoted" } },
    { atSec: 11.5, dossierField: { label: "Qualification", value: "Warm lead · timeline pressure" } },
    { atSec: 12.05, dossierField: { label: "Action", value: "Consultation slot offered · deposit link ready" } },

    { atSec: 12.7, chamberState: "resolution", energy: 0, timelineStep: "READY" },
    { atSec: 13.5, ctaReveal: true },
  ],
};
