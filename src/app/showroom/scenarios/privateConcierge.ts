import type { ShowroomScenario } from "../types";

/**
 * Private / Hospitality Concierge — public demo scenario #3.
 * Deliberately generic and discreet: screening + deposit before any detail
 * is released. The public site carries no vertical-specific wording.
 */
export const privateConciergeScenario: ShowroomScenario = {
  id: "private-concierge",
  title: "Private / Hospitality Concierge",
  tagline: "Discreet requests vetted and confirmed without a single leak.",
  requestLabel: "INCOMING · WHATSAPP · 19:03",
  dossierLabel: "REQUEST DOSSIER",
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
    { atSec: 0.6, transcriptLine: "good evening, i'd like to request a private booking for friday evening" },
    { atSec: 1.8, transcriptLine: "two guests, discretion is important" },
    { atSec: 2.9, transcriptLine: "we can arrive after 9pm" },

    { atSec: 4.0, chamberState: "processing", timelineStep: "EXTRACTING" },
    { atSec: 5.2, timelineStep: "CLASSIFYING" },
    { atSec: 6.3, timelineStep: "APPLYING RULES" },
    { atSec: 7.3, timelineStep: "ROUTING" },

    { atSec: 8.1, chamberState: "speaking", energy: 0.7 },
    { atSec: 8.3, dossierField: { label: "Request ID", value: "PHC-2607-0071" } },
    { atSec: 8.85, dossierField: { label: "Type", value: "Private booking" } },
    { atSec: 9.4, dossierField: { label: "Time window", value: "Friday · after 21:00 · 2 guests" } },
    { atSec: 9.95, dossierField: { label: "Language", value: "EN" } },
    { atSec: 10.5, dossierField: { label: "Screening", value: "Pending · house rules sent" } },
    { atSec: 11.05, dossierField: { label: "Privacy", value: "Details withheld until confirmed" } },
    { atSec: 11.6, dossierField: { label: "Operator handoff", value: "Prepared" } },
    { atSec: 12.15, dossierField: { label: "Action", value: "Screening + deposit before address release" } },

    { atSec: 12.8, chamberState: "resolution", energy: 0, timelineStep: "READY" },
    { atSec: 13.6, ctaReveal: true },
  ],
};
