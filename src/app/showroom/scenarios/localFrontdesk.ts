import type { ShowroomScenario } from "../types";

/**
 * Local Service Frontdesk — public demo scenario #4.
 * Missed workshop call caught via WhatsApp: intent qualified, slots offered,
 * job card ready for the owner after hours.
 */
export const localFrontdeskScenario: ShowroomScenario = {
  id: "local-frontdesk",
  title: "Local Service Frontdesk",
  tagline: "Missed calls turned into booked jobs while you stay under the car.",
  requestLabel: "INCOMING · MISSED CALL → WHATSAPP · 16:41",
  dossierLabel: "JOB DOSSIER",
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
    { atSec: 0.6, transcriptLine: "hi, tried to call — my car needs winter tires next week" },
    { atSec: 1.8, transcriptLine: "vw golf, 205/55 r16" },
    { atSec: 2.9, transcriptLine: "any slot tue or wed afternoon?" },

    { atSec: 4.0, chamberState: "processing", timelineStep: "EXTRACTING" },
    { atSec: 5.2, timelineStep: "CLASSIFYING" },
    { atSec: 6.3, timelineStep: "APPLYING RULES" },
    { atSec: 7.3, timelineStep: "ROUTING" },

    { atSec: 8.1, chamberState: "speaking", energy: 0.7 },
    { atSec: 8.3, dossierField: { label: "Ticket ID", value: "LSF-2607-0233" } },
    { atSec: 8.85, dossierField: { label: "Intent", value: "Winter tire change" } },
    { atSec: 9.4, dossierField: { label: "Vehicle", value: "VW Golf · 205/55 R16" } },
    { atSec: 9.95, dossierField: { label: "Urgency", value: "Routine · next week" } },
    { atSec: 10.5, dossierField: { label: "Missing info", value: "Tire storage? · follow-up asked" } },
    { atSec: 11.05, dossierField: { label: "Proposed slots", value: "Tue 14:00 · Wed 15:30" } },
    { atSec: 11.6, dossierField: { label: "Customer notified", value: "WhatsApp confirmation sent" } },
    { atSec: 12.15, dossierField: { label: "Action", value: "Job card prepared for owner review" } },

    { atSec: 12.8, chamberState: "resolution", energy: 0, timelineStep: "READY" },
    { atSec: 13.6, ctaReveal: true },
  ],
};
