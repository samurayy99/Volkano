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
    { atSec: 0.8, transcriptLine: "hallo?? bei mir tropft wasser aus der decke!!" },
    { atSec: 2.4, transcriptLine: "im bad, es wird immer mehr" },
    { atSec: 4.0, transcriptLine: "meierweg 12, 3. og, wohnung schmid" },
    { atSec: 5.6, transcriptLine: "bitte schnell, unten wohnt jemand!!" },

    { atSec: 7.0, chamberState: "processing", timelineStep: "EXTRACTING" },
    { atSec: 9.2, timelineStep: "CLASSIFYING" },
    { atSec: 11.2, timelineStep: "APPLYING RULES" },
    { atSec: 13.0, timelineStep: "ROUTING" },

    { atSec: 14.5, chamberState: "speaking", energy: 0.7 },
    { atSec: 14.8, dossierField: { label: "Case ID", value: "PED-2607-0042" } },
    { atSec: 15.7, dossierField: { label: "Category", value: "Water damage — active leak" } },
    { atSec: 16.6, dossierField: { label: "Priority", value: "P1 — Emergency (Art. 259 OR)" } },
    { atSec: 17.5, dossierField: { label: "Risk", value: "Escalation to unit below" } },
    { atSec: 18.4, dossierField: { label: "Verification", value: "Address matched · tenant registry" } },
    { atSec: 19.3, dossierField: { label: "Action", value: "Dispatch on-call sanitary partner" } },
    { atSec: 20.2, dossierField: { label: "Tenant notified", value: "SMS confirmation · 22:47" } },
    { atSec: 21.1, dossierField: { label: "Audit log", value: "Recorded · full transcript attached" } },

    { atSec: 22.2, chamberState: "resolution", energy: 0, timelineStep: "READY" },
    { atSec: 23.8, ctaReveal: true },
  ],
};
