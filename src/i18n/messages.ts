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
   * First contact. He states what is missing and what he is about to do about
   * it — and then he does it. He asks nothing here: a visitor who has known him
   * for four seconds cannot answer a question about a site that does not exist.
   */
  greeting: string;
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
  greeting: "Ich bin Lenox. Diese Seite existiert noch nicht. Also baue ich sie.",
  region: {
    experience: "EXPERIENCE",
    systems: "SYSTEMS",
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
          body: "Diese Experience braucht WebGPU. Ohne WebGPU bleibt eine reduzierte Anzeige — und der klare Hinweis, dass ich nicht da bin.",
        },
      ],
    },
    work: {
      lead: "Arbeiten.",
      modules: [],
      pending: "Diesen Bereich habe ich noch nicht gebaut.",
    },
    volkan: {
      lead: "Der Mensch dahinter.",
      modules: [],
      pending: "Diesen Bereich habe ich noch nicht gebaut.",
    },
    contact: {
      lead: "Kontakt.",
      modules: [],
      pending:
        "Noch nicht verdrahtet. Ich zeige keinen Weg, den ich nicht wirklich habe.",
    },
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
  greeting: "I am Lenox. This page does not exist yet. So I will build it.",
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
          body: "This experience needs WebGPU. Without it, a reduced view remains — and a clear statement that I am not here.",
        },
      ],
    },
    work: {
      lead: "Work.",
      modules: [],
      pending: "I have not built this region yet.",
    },
    volkan: {
      lead: "The human behind it.",
      modules: [],
      pending: "I have not built this region yet.",
    },
    contact: {
      lead: "Contact.",
      modules: [],
      pending: "Not wired yet. I do not show a path I do not actually have.",
    },
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
    region: { ...de.region, ...partial.region },
    content: { ...de.content, ...partial.content },
  };
}
