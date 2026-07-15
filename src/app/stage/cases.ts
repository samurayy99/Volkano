import type { LenoxEmotion } from "../../flow-engine/types";
import type { Locale } from "../../i18n/messages";

/**
 * THE CASES — what he does with real requests, replayed in front of you.
 *
 * Each case is ONE beat script that drives everything at once: the incoming
 * transcript, the process rail, the dossier assembling — and him. His emotions
 * and gaze are beats on the same clock as the artifacts, because "he worked the
 * case" and "panels filled themselves while he happened to emote" are told
 * apart entirely by whether they share a clock.
 *
 * Two honesty rules, and they are the site's own rules:
 *   – A case is a SCRIPTED REPLAY and says so in its disclosure line. It shows
 *     the choreography the live system runs against real channels; nothing in
 *     it pretends to have actually sent an SMS tonight.
 *   – No beat may fire the amber `confirm`. Amber is the one signal reserved
 *     for a result that is real, and the only real action on this site is the
 *     CONTACT transmission. A replay that ends in amber would be fake proof.
 *     The type below makes that unrepresentable, not merely unlikely.
 *
 * Wording law for dossier rows: a row describes a PREPARED artifact
 * ("entworfen", "vorbereitet", "formuliert"), never a completed outward send.
 * "SMS-Bestätigung gesendet" inside a replay is a claim about the world that
 * the replay did not make — drafted-not-sent is what actually happened here.
 */

/** A localized pair. German is the source of truth (Swiss `ss`, never `ß`). */
type L = { de: string; en: string };

export type CaseBeat = {
  /** Seconds on the case clock. Beats must be sorted ascending. */
  at: number;
  /** What he is doing — a system state, not a mood. Never a reaction. */
  emotion?: LenoxEmotion;
  /** Where he looks: at the artifacts he is producing, or back at you. */
  gaze?: "work" | "visitor";
  /** Append an incoming line (foreign matter — rendered as it was written). */
  request?: L;
  /** Activate a process step by index into `steps`. */
  step?: number;
  /** Append a dossier row. */
  field?: { label: L; value: L };
  /** Reveal the closing line and the disclosure. */
  outcome?: true;
};

export type LenoxCase = {
  id: string;
  title: L;
  tagline: L;
  /** Header over the transcript: channel and time of the incoming request. */
  channel: L;
  dossierLabel: L;
  steps: L[];
  closing: L;
  /** The honesty line. Always visible with the outcome, never skipped. */
  disclosure: L;
  beats: CaseBeat[];
};

/** The shared process rail — the same machine, whatever walks in. */
const STEPS: L[] = [
  { de: "HÖREN", en: "LISTENING" },
  { de: "EXTRAHIEREN", en: "EXTRACTING" },
  { de: "KLASSIFIZIEREN", en: "CLASSIFYING" },
  { de: "REGELN", en: "RULES" },
  { de: "ROUTING", en: "ROUTING" },
  { de: "BEREIT", en: "READY" },
];

const DISCLOSURE: L = {
  de: "Nachgestellter Fall. Die Live-Version arbeitet gegen echte Kanäle — hier wurde nichts wirklich versendet.",
  en: "A scripted replay. The live version runs against real channels — nothing here was actually sent.",
};

const CLOSING: L = {
  de: "Das erhält dein Team statt Chaos.",
  en: "This is what your team receives instead of chaos.",
};

/**
 * Property Emergency Desk — messy tenant SMS at night → P1 dispatch.
 * The one case where his face is allowed to darken: `concerned` is a system
 * state (risk recognized), and it lands exactly on the line that carries the
 * risk.
 */
const propertyEmergency: LenoxCase = {
  id: "property-emergency",
  title: { de: "NOTFALL-DESK IMMOBILIEN", en: "PROPERTY EMERGENCY DESK" },
  tagline: {
    de: "Mieter-Chaos nach Feierabend, triagiert bevor dein Telefon klingelt.",
    en: "After-hours tenant chaos, triaged before your phone rings.",
  },
  channel: { de: "EINGANG · SMS · 22:46", en: "INCOMING · SMS · 22:46" },
  dossierLabel: { de: "FALL-DOSSIER", en: "CASE DOSSIER" },
  steps: STEPS,
  closing: CLOSING,
  disclosure: DISCLOSURE,
  beats: [
    { at: 0, emotion: "listening", gaze: "work", step: 0 },
    {
      at: 0.5,
      request: {
        de: "hallo?? bei mir tropft wasser aus der decke!!",
        en: "hello?? water is dripping from my ceiling!!",
      },
    },
    {
      at: 1.7,
      request: {
        de: "im bad, es wird immer mehr",
        en: "in the bathroom, it keeps getting worse",
      },
    },
    {
      at: 2.9,
      request: {
        de: "meierweg 12, 3. og, wohnung schmid",
        en: "meierweg 12, 3rd floor, apartment schmid",
      },
    },
    {
      at: 4.1,
      request: {
        de: "bitte schnell, unten wohnt jemand!!",
        en: "please hurry, someone lives below!!",
      },
    },
    // The risk registers. Not on a timer — on the sentence that contains it.
    { at: 4.5, emotion: "concerned" },
    { at: 5.3, emotion: "thinking", gaze: "visitor", step: 1 },
    { at: 6.4, step: 2 },
    { at: 7.4, step: 3 },
    { at: 8.2, emotion: "acting", gaze: "work", step: 4 },
    {
      at: 8.6,
      field: {
        label: { de: "Fall-ID", en: "Case ID" },
        value: { de: "PED-2607-0042", en: "PED-2607-0042" },
      },
    },
    {
      at: 9.15,
      field: {
        label: { de: "Kategorie", en: "Category" },
        value: {
          de: "Wasserschaden — aktives Leck",
          en: "Water damage — active leak",
        },
      },
    },
    {
      at: 9.7,
      field: {
        label: { de: "Priorität", en: "Priority" },
        value: { de: "P1 — Notfall-Dispatch", en: "P1 — emergency dispatch" },
      },
    },
    {
      at: 10.25,
      field: {
        label: { de: "Risiko", en: "Risk" },
        value: {
          de: "Eskalation in die Wohnung darunter",
          en: "Escalation to the unit below",
        },
      },
    },
    {
      at: 10.8,
      field: {
        label: { de: "Verifikation", en: "Verification" },
        value: {
          de: "Adresse im Mieterregister bestätigt",
          en: "Address matched · tenant registry",
        },
      },
    },
    {
      at: 11.35,
      field: {
        label: { de: "Aktion", en: "Action" },
        value: {
          de: "Aufgebot Sanitär-Pikett vorbereitet",
          en: "Dispatch prepared: on-call sanitary partner",
        },
      },
    },
    {
      at: 11.9,
      field: {
        label: { de: "Mieter-Antwort", en: "Tenant reply" },
        value: {
          de: "SMS-Bestätigung entworfen · 22:47",
          en: "SMS confirmation drafted · 22:47",
        },
      },
    },
    {
      at: 12.45,
      field: {
        label: { de: "Protokoll", en: "Audit log" },
        value: {
          de: "Volles Transkript im Dossier",
          en: "Full transcript in the dossier",
        },
      },
    },
    { at: 13.2, step: 5, emotion: "pleased" },
    { at: 13.7, outcome: true },
    { at: 15.6, emotion: "neutral", gaze: "visitor" },
  ],
};

/**
 * Clinic Concierge — high-ticket dental lead via Instagram DM. The point is
 * the guardrail row: what he did NOT say is the professional part.
 */
const clinicConcierge: LenoxCase = {
  id: "clinic-concierge",
  title: { de: "KLINIK-CONCIERGE", en: "CLINIC CONCIERGE" },
  tagline: {
    de: "High-Ticket-Anfragen in Sekunden beantwortet, nicht nach dem Wochenende.",
    en: "High-ticket leads answered in seconds, not after the weekend.",
  },
  channel: {
    de: "EINGANG · INSTAGRAM DM · 21:38",
    en: "INCOMING · INSTAGRAM DM · 21:38",
  },
  dossierLabel: { de: "LEAD-DOSSIER", en: "LEAD DOSSIER" },
  steps: STEPS,
  closing: CLOSING,
  disclosure: DISCLOSURE,
  beats: [
    { at: 0, emotion: "listening", gaze: "work", step: 0 },
    {
      at: 0.5,
      request: {
        de: "hi, ich hab eure invisalign-posts gesehen…",
        en: "hi, i saw your invisalign posts…",
      },
    },
    {
      at: 1.6,
      request: {
        de: "was kostet das ungefähr?",
        en: "how much does it roughly cost?",
      },
    },
    {
      at: 2.7,
      request: {
        de: "und tut das weh? ich habe im juni eine hochzeit",
        en: "and does it hurt? i have a wedding in june",
      },
    },
    // A date is a lever. He notices it.
    { at: 3.5, emotion: "curious" },
    { at: 4.3, emotion: "thinking", gaze: "visitor", step: 1 },
    { at: 5.4, step: 2 },
    { at: 6.4, step: 3 },
    { at: 7.3, emotion: "acting", gaze: "work", step: 4 },
    {
      at: 7.7,
      field: {
        label: { de: "Lead-ID", en: "Lead ID" },
        value: { de: "CC-2607-0118", en: "CC-2607-0118" },
      },
    },
    {
      at: 8.25,
      field: {
        label: { de: "Kanal", en: "Channel" },
        value: {
          de: "Instagram DM · Antwortzeit: 4 s",
          en: "Instagram DM · response time: 4 s",
        },
      },
    },
    {
      at: 8.8,
      field: {
        label: { de: "Interesse", en: "Treatment interest" },
        value: { de: "Invisalign", en: "Invisalign" },
      },
    },
    {
      at: 9.35,
      field: {
        label: { de: "Kernfrage", en: "Main question" },
        value: { de: "Kostenrahmen", en: "Cost range" },
      },
    },
    {
      at: 9.9,
      field: {
        label: { de: "Bedenken", en: "Concern" },
        value: {
          de: "Schmerz · Termindruck (Hochzeit im Juni)",
          en: "Pain · timeline (wedding in June)",
        },
      },
    },
    {
      at: 10.45,
      field: {
        label: { de: "Leitplanke", en: "Guardrail" },
        value: {
          de: "Keine medizinische Auskunft · kein Preis genannt",
          en: "No medical advice · no price quoted",
        },
      },
    },
    {
      at: 11.0,
      field: {
        label: { de: "Qualifikation", en: "Qualification" },
        value: {
          de: "Warmer Lead · Termindruck",
          en: "Warm lead · timeline pressure",
        },
      },
    },
    {
      at: 11.55,
      field: {
        label: { de: "Aktion", en: "Action" },
        value: {
          de: "Terminvorschlag & Anzahlungslink vorbereitet",
          en: "Consultation offer & deposit link prepared",
        },
      },
    },
    { at: 12.3, step: 5, emotion: "pleased" },
    { at: 12.8, outcome: true },
    { at: 14.7, emotion: "neutral", gaze: "visitor" },
  ],
};

/**
 * Local Service Frontdesk — a missed workshop call caught on WhatsApp,
 * qualified and turned into a job card while the owner stays under the car.
 */
const localFrontdesk: LenoxCase = {
  id: "local-frontdesk",
  title: { de: "WERKSTATT-FRONTDESK", en: "LOCAL SERVICE FRONTDESK" },
  tagline: {
    de: "Verpasste Anrufe werden gebuchte Aufträge, während du unter dem Auto bleibst.",
    en: "Missed calls turned into booked jobs while you stay under the car.",
  },
  channel: {
    de: "EINGANG · VERPASSTER ANRUF → WHATSAPP · 16:41",
    en: "INCOMING · MISSED CALL → WHATSAPP · 16:41",
  },
  dossierLabel: { de: "AUFTRAGS-DOSSIER", en: "JOB DOSSIER" },
  steps: STEPS,
  closing: CLOSING,
  disclosure: DISCLOSURE,
  beats: [
    { at: 0, emotion: "listening", gaze: "work", step: 0 },
    {
      at: 0.5,
      request: {
        de: "hallo, hab versucht anzurufen — mein auto braucht nächste woche winterreifen",
        en: "hi, tried to call — my car needs winter tires next week",
      },
    },
    {
      at: 1.8,
      request: { de: "vw golf, 205/55 r16", en: "vw golf, 205/55 r16" },
    },
    {
      at: 2.9,
      request: {
        de: "gibts einen termin di oder mi nachmittag?",
        en: "any slot tue or wed afternoon?",
      },
    },
    { at: 4.0, emotion: "thinking", gaze: "visitor", step: 1 },
    { at: 5.1, step: 2 },
    { at: 6.1, step: 3 },
    { at: 7.0, emotion: "acting", gaze: "work", step: 4 },
    {
      at: 7.4,
      field: {
        label: { de: "Auftrags-ID", en: "Ticket ID" },
        value: { de: "LSF-2607-0233", en: "LSF-2607-0233" },
      },
    },
    {
      at: 7.95,
      field: {
        label: { de: "Anliegen", en: "Intent" },
        value: { de: "Winterreifen-Wechsel", en: "Winter tire change" },
      },
    },
    {
      at: 8.5,
      field: {
        label: { de: "Fahrzeug", en: "Vehicle" },
        value: { de: "VW Golf · 205/55 R16", en: "VW Golf · 205/55 R16" },
      },
    },
    {
      at: 9.05,
      field: {
        label: { de: "Dringlichkeit", en: "Urgency" },
        value: { de: "Routine · nächste Woche", en: "Routine · next week" },
      },
    },
    {
      at: 9.6,
      field: {
        label: { de: "Fehlende Info", en: "Missing info" },
        value: {
          de: "Reifen eingelagert? · Rückfrage formuliert",
          en: "Tire storage? · follow-up drafted",
        },
      },
    },
    {
      at: 10.15,
      field: {
        label: { de: "Slot-Vorschlag", en: "Proposed slots" },
        value: { de: "Di 14:00 · Mi 15:30", en: "Tue 14:00 · Wed 15:30" },
      },
    },
    {
      at: 10.7,
      field: {
        label: { de: "Kunden-Antwort", en: "Customer reply" },
        value: {
          de: "WhatsApp-Bestätigung entworfen",
          en: "WhatsApp confirmation drafted",
        },
      },
    },
    {
      at: 11.25,
      field: {
        label: { de: "Aktion", en: "Action" },
        value: {
          de: "Auftragskarte bereit für Review",
          en: "Job card prepared for owner review",
        },
      },
    },
    { at: 12.0, step: 5, emotion: "pleased" },
    { at: 12.5, outcome: true },
    { at: 14.4, emotion: "neutral", gaze: "visitor" },
  ],
};

export const CASES: readonly LenoxCase[] = [
  propertyEmergency,
  clinicConcierge,
  localFrontdesk,
];

/* ── Locale resolution ──────────────────────────────────────────────────── */

export type ResolvedBeat = Omit<CaseBeat, "request" | "field"> & {
  request?: string;
  field?: { label: string; value: string };
};

export type ResolvedCase = {
  id: string;
  title: string;
  tagline: string;
  channel: string;
  dossierLabel: string;
  steps: string[];
  closing: string;
  disclosure: string;
  beats: ResolvedBeat[];
};

/** Same fallback law as `messagesFor`: everything that is not English is German. */
function pick(l: L, locale: Locale): string {
  return locale === "en" ? l.en : l.de;
}

export function resolveCase(c: LenoxCase, locale: Locale): ResolvedCase {
  return {
    id: c.id,
    title: pick(c.title, locale),
    tagline: pick(c.tagline, locale),
    channel: pick(c.channel, locale),
    dossierLabel: pick(c.dossierLabel, locale),
    steps: c.steps.map((s) => pick(s, locale)),
    closing: pick(c.closing, locale),
    disclosure: pick(c.disclosure, locale),
    beats: c.beats.map((b) => ({
      ...b,
      request: b.request ? pick(b.request, locale) : undefined,
      field: b.field
        ? { label: pick(b.field.label, locale), value: pick(b.field.value, locale) }
        : undefined,
    })),
  };
}
