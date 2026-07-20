/**
 * The site is Swiss-German first. Two rules that are not stylistic:
 *   – Written Hochdeutsch, never dialect. Dialect on a business site reads as
 *     pandering; a Zürich operator wants precision, not "Grüezi".
 *   – Always `ss`, never `ß`. A single ß in the first line and the reader knows
 *     the page was not written for him.
 *
 * `de` is the source of truth and must always be complete. The other locales are
 * partial by design — a missing key falls back to German rather than rendering
 * an empty string, because an empty string is a layout bug, not a translation.
 */

export const LOCALES = ["de", "fr", "it", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const WRITTEN_LOCALES = ["de", "en"] as const satisfies readonly Locale[];

/** What the entity is doing. Instrumentation, not decoration — every value is a real engine state. */
export type EntityStatus =
  | "offline"
  | "initialising"
  | "online"
  | "building"
  | "unavailable";

/**
 * The workspace regions. They exist ONLY in the finished workspace, where the
 * visitor can see what they mean. Asking someone to choose between these words
 * before the page exists is a menu for a site nobody has seen yet.
 */
export const REGIONS = [
  "experience",
  "systems",
  "lenox",
  "work",
  "volkan",
  "contact",
] as const;
export type Region = (typeof REGIONS)[number];

export type Messages = {
  brand: string;
  entity: string;
  status: Record<EntityStatus, string>;
  /**
   * First contact. He states what is undecided — and then he asks the ONE
   * question a stranger can answer in two seconds: who defines the signature.
   * Not a sales intake, a move in a game (DER BEGLEITER, Akt II).
   */
  greeting: string;
  /** The question and its two answers on the hairline. */
  calibration: {
    question: string;
    you: string;
    lenox: string;
  };
  region: Record<Region, string>;
  /**
   * What each region actually contains. Two rules, and they are the same rule:
   *   – EXPERIENCE and SYSTEMS describe this machine, and every line is checkable
   *     against the code. They are true.
   *   – WORK, VOLKAN and CONTACT are not written yet, so they say so. A region
   *     that admits it is unbuilt is honest; one filled with plausible marketing
   *     copy is the fake proof this whole site argues against.
   * `pending` is what he says instead of pretending.
   */
  content: Record<
    Region,
    {
      lead: string;
      modules: { title: string; body: string }[];
      pending?: string;
    }
  >;
  /**
   * Chrome of the case stage (WORK). The case content itself lives in
   * `src/app/stage/cases.ts`, beside its timing — a beat script split across
   * two files would drift.
   */
  caseUi: {
    run: string;
    close: string;
    again: string;
    index: string;
  };
  /**
   * The CONTACT uplink — the one real action. Three outcomes, three truths:
   * sent (amber, it happened), unwired (no relay key on this environment),
   * failed (attempted and did not happen). He never claims a send he did not
   * make.
   */
  uplink: {
    brief: string;
    placeholder: string;
    action: string;
    sending: string;
    sentTitle: string;
    sentBody: string;
    unwiredTitle: string;
    unwiredBody: string;
    failedTitle: string;
    failedBody: string;
    invalid: string;
  };
};

const de: Messages = {
  brand: "VOLKAN AI STUDIO",
  entity: "LENOX",
  status: {
    offline: "OFFLINE",
    initialising: "INITIALISIERT",
    online: "ONLINE",
    building: "BAUT",
    unavailable: "NICHT VERFÜGBAR",
  },
  greeting: "Ich bin Lenox. Diese Welt ist noch nicht entschieden.",
  calibration: {
    question: "Bevor ich sie baue: Wer bestimmt ihre Handschrift?",
    you: "DU",
    lenox: "LENOX",
  },
  region: {
    experience: "EXPERIENCE",
    systems: "SYSTEMS",
    lenox: "LENOX",
    work: "WORK",
    volkan: "VOLKAN",
    contact: "CONTACT",
  },
  content: {
    experience: {
      lead: "Was du gerade gesehen hast.",
      modules: [
        {
          title: "WAKE",
          body: "Ein freies Partikelfeld verdichtet sich zu Lenox. Echte Fluidsimulation, kein Video.",
        },
        {
          title: "FIRST CONTACT",
          body: "Eine Hairline wächst aus ihm. Der Satz dekodiert darauf. Er sucht deinen Cursor.",
        },
        {
          title: "BUILD",
          body: "Diese Oberfläche wurde vor deinen Augen aufgebaut. Sie war vorher nicht da.",
        },
      ],
    },
    systems: {
      lead: "Woraus diese Seite gemacht ist.",
      modules: [
        {
          title: "ENGINE",
          body: "WebGPU. MLS-MPM-Fluid und ein 3D-Rig, live gerechnet im Browser.",
        },
        {
          title: "STAGE",
          body: "Eine State-Machine führt den Ablauf. Eine GSAP-Timeline besitzt die Zeit.",
        },
        {
          title: "FALLBACK",
          body: "Diese Experience braucht WebGPU. Ohne WebGPU bleibt eine reduzierte Anzeige und der klare Hinweis, dass ich nicht da bin.",
        },
      ],
    },
    lenox: {
      lead: "Der Film ist seine Welt. Er selbst bleibt echt.",
      modules: [
        {
          title: "PERCEPTION",
          body: "Seine Augen reagieren zuerst. Aufmerksamkeit wird sichtbar, bevor der Körper folgt.",
        },
        {
          title: "BODY",
          body: "Kern, zwei Führungsarme und vier Begleitarme antworten mit eigener Trägheit.",
        },
        {
          title: "PRESENCE",
          body: "Die Welt läuft als Film. Lenox lebt darüber im Browser und reagiert auf dich.",
        },
      ],
    },
    work: {
      lead: "Drei Fälle. Ich spiele sie dir Schritt für Schritt vor.",
      modules: [],
    },
    volkan: {
      lead: "Der Mensch dahinter.",
      modules: [],
      pending: "Diesen Bereich habe ich noch nicht gebaut.",
    },
    contact: {
      lead: "Kontakt.",
      modules: [],
    },
  },
  caseUi: {
    run: "REPLAY",
    close: "SCHLIESSEN",
    again: "NOCH EINMAL",
    index: "ALLE FÄLLE",
  },
  uplink: {
    brief:
      "Eine Adresse genügt. Ich stelle die System-Übersicht zusammen und sende sie jetzt, während du zusiehst.",
    placeholder: "name@firma.ch",
    action: "SENDEN",
    sending: "ÜBERTRAGUNG LÄUFT",
    sentTitle: "GESENDET",
    sentBody:
      "Wirklich versendet, kein Mock. Prüfe deinen Posteingang. Absender: lenox@volkanaistudio.com.",
    unwiredTitle: "KEIN RELAY KONFIGURIERT",
    unwiredBody:
      "Auf dieser Umgebung fehlt der Versandschlüssel. Ich behaupte keinen Versand, den es nicht gab.",
    failedTitle: "ÜBERTRAGUNG FEHLGESCHLAGEN",
    failedBody: "Nichts wurde gesendet. Versuch es gleich noch einmal.",
    invalid: "Das ist keine gültige Adresse.",
  },
};

const en: Partial<Messages> = {
  status: {
    offline: "OFFLINE",
    initialising: "INITIALISING",
    online: "ONLINE",
    building: "BUILDING",
    unavailable: "UNAVAILABLE",
  },
  greeting: "I am Lenox. This world is not decided yet.",
  calibration: {
    question: "Before I build it: who defines its signature?",
    you: "YOU",
    lenox: "LENOX",
  },
  content: {
    experience: {
      lead: "What you just watched.",
      modules: [
        {
          title: "WAKE",
          body: "A free particle field condenses into Lenox. Real fluid simulation, not a video.",
        },
        {
          title: "FIRST CONTACT",
          body: "A hairline grows out of him. The sentence decodes on it. He finds your cursor.",
        },
        {
          title: "BUILD",
          body: "This interface was assembled in front of you. It was not here before.",
        },
      ],
    },
    systems: {
      lead: "What this page is made of.",
      modules: [
        {
          title: "ENGINE",
          body: "WebGPU. MLS-MPM fluid and a 3D rig, computed live in the browser.",
        },
        {
          title: "STAGE",
          body: "A state machine runs the sequence. A GSAP timeline owns the time.",
        },
        {
          title: "FALLBACK",
          body: "This experience needs WebGPU. Without it, a reduced view remains with a clear statement that I am not here.",
        },
      ],
    },
    lenox: {
      lead: "The film is his world. He remains real.",
      modules: [
        {
          title: "PERCEPTION",
          body: "His eyes respond first. Attention becomes visible before the body follows.",
        },
        {
          title: "BODY",
          body: "Core, two lead arms and four support arms answer with their own inertia.",
        },
        {
          title: "PRESENCE",
          body: "The world runs as film. Lenox lives above it in the browser and responds to you.",
        },
      ],
    },
    work: {
      lead: "Three cases. I will replay them for you step by step.",
      modules: [],
    },
    volkan: {
      lead: "The human behind it.",
      modules: [],
      pending: "I have not built this region yet.",
    },
    contact: {
      lead: "Contact.",
      modules: [],
    },
  },
  caseUi: {
    run: "REPLAY",
    close: "CLOSE",
    again: "AGAIN",
    index: "ALL CASES",
  },
  uplink: {
    brief:
      "One address is enough. I will assemble the system overview and send it now, while you watch.",
    placeholder: "name@company.com",
    action: "SEND",
    sending: "TRANSMITTING",
    sentTitle: "SENT",
    sentBody:
      "Actually sent, not mocked. Check your inbox. Sender: lenox@volkanaistudio.com.",
    unwiredTitle: "NO RELAY CONFIGURED",
    unwiredBody:
      "This environment has no sending key. I do not claim a send that did not happen.",
    failedTitle: "TRANSMISSION FAILED",
    failedBody: "Nothing was sent. Try again in a moment.",
    invalid: "That is not a valid address.",
  },
};

/** Structure only. Filled when the market is actually served — not before. */
const fr: Partial<Messages> = {};
const it: Partial<Messages> = {};

const CATALOGUE: Record<Locale, Partial<Messages>> = { de, en, fr, it };

export function isWrittenLocale(value: string): value is Locale {
  return (WRITTEN_LOCALES as readonly string[]).includes(value);
}

export function messagesFor(locale: Locale): Messages {
  const partial = CATALOGUE[locale];
  return {
    brand: partial.brand ?? de.brand,
    entity: partial.entity ?? de.entity,
    status: { ...de.status, ...partial.status },
    greeting: partial.greeting ?? de.greeting,
    calibration: { ...de.calibration, ...partial.calibration },
    region: { ...de.region, ...partial.region },
    content: { ...de.content, ...partial.content },
    caseUi: { ...de.caseUi, ...partial.caseUi },
    uplink: { ...de.uplink, ...partial.uplink },
  };
}
