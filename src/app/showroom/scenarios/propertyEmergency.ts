import type { ShowroomScenario } from "../types";

/**
 * Property Emergency Desk — public demo scenario #1.
 * Fully scripted (no LLM/voice): messy tenant SMS → triage → P1 dispatch.
 */
export const propertyEmergencyScenario: ShowroomScenario = {
  id: "property-emergency",
  title: "Property Emergency Desk",
  tagline: "After-hours tenant chaos, triaged before your phone rings.",
  requestLabel: "INCOMING · SMS · 22:46",
  dossierLabel: "CASE DOSSIER",
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
    { atSec: 0.6, transcriptLine: "hallo?? bei mir tropft wasser aus der decke!!" },
    { atSec: 1.7, transcriptLine: "im bad, es wird immer mehr" },
    { atSec: 2.8, transcriptLine: "meierweg 12, 3. og, wohnung schmid" },
    { atSec: 3.9, transcriptLine: "bitte schnell, unten wohnt jemand!!" },

    { atSec: 4.9, chamberState: "processing", timelineStep: "EXTRACTING" },
    { atSec: 6.1, timelineStep: "CLASSIFYING" },
    { atSec: 7.2, timelineStep: "APPLYING RULES" },
    { atSec: 8.2, timelineStep: "ROUTING" },

    { atSec: 9.0, chamberState: "speaking", energy: 0.7 },
    { atSec: 9.2, dossierField: { label: "Case ID", value: "PED-2607-0042" } },
    { atSec: 9.75, dossierField: { label: "Category", value: "Water damage — active leak" } },
    { atSec: 10.3, dossierField: { label: "Priority", value: "P1 — Emergency dispatch" } },
    { atSec: 10.85, dossierField: { label: "Risk", value: "Escalation to unit below" } },
    { atSec: 11.4, dossierField: { label: "Verification", value: "Address matched · tenant registry" } },
    { atSec: 11.95, dossierField: { label: "Action", value: "Dispatch on-call sanitary partner" } },
    { atSec: 12.5, dossierField: { label: "Tenant notified", value: "SMS confirmation · 22:47" } },
    { atSec: 13.05, dossierField: { label: "Audit log", value: "Recorded · full transcript attached" } },

    { atSec: 13.7, chamberState: "resolution", energy: 0, timelineStep: "READY" },
    { atSec: 14.5, ctaReveal: true },
  ],
};
