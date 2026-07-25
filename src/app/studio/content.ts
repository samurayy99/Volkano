import type { ChapterId, Locale } from "./experienceState";

type Localized = Record<Locale, string>;

/**
 * The content kernel. One set of words, five chapters, two locales — shared by every
 * registered design. A design may change type, colour, rhythm and composition; it may
 * never change a sentence. Contract: docs/product/studio-content-contract.md
 */
export const chapters: ReadonlyArray<{
  id: ChapterId;
  nav: Localized;
  spanVh: number;
}> = [
  { id: "hero", nav: { en: "Studio", de: "Studio" }, spanVh: 140 },
  { id: "principle", nav: { en: "Principle", de: "Prinzip" }, spanVh: 200 },
  { id: "capabilities", nav: { en: "Capabilities", de: "Leistungen" }, spanVh: 220 },
  { id: "lenox", nav: { en: "Lenox", de: "Lenox" }, spanVh: 180 },
  { id: "contact", nav: { en: "Contact", de: "Kontakt" }, spanVh: 140 },
] as const;

export const copy = {
  studioName: "VOLKAN AI STUDIO",
  /** The protected entry: the field is alive before a word is read. */
  play: { en: "PLAY WITH ME", de: "SPIEL MIT MIR" },
  wake: { en: "WAKE LENOX", de: "LENOX WECKEN" },
  enterStudio: { en: "ENTER STUDIO", de: "STUDIO BETRETEN" },
  selectTitle: { en: "CHOOSE A REALITY", de: "REALITÄT WÄHLEN" },
  skip: { en: "SKIP", de: "ÜBERSPRINGEN" },
  hero: {
    title: {
      en: "WEBSITES PEOPLE REMEMBER.\nAI SYSTEMS THAT KEEP WORKING.",
      de: "WEBSITES, DIE BLEIBEN.\nAI-SYSTEME, DIE WEITERARBEITEN.",
    },
    body: {
      en: "Independent studio for digital design,\nstrategic redesign and applied AI.",
      de: "Unabhängiges Studio für digitales Design,\nstrategisches Redesign und angewandte AI.",
    },
    action: { en: "START A PROJECT", de: "PROJEKT STARTEN" },
  },
  principle: {
    title: { en: "THE STUDIO IS THE DEMO.", de: "DAS STUDIO IST DIE DEMO." },
    body: {
      en: "One message. Three complete websites.\nThe content stays fixed. Everything else changes.",
      de: "Eine Botschaft. Drei vollständige Websites.\nDer Inhalt bleibt. Alles andere wechselt.",
    },
    switchLabel: { en: "Choose a design", de: "Design wählen" },
  },
  capabilities: {
    title: { en: "WHAT WE BUILD.", de: "WAS WIR BAUEN." },
    items: [
      {
        index: "01",
        title: { en: "SIGNATURE WEBSITES", de: "SIGNATURE-WEBSITES" },
        body: {
          en: "Positioning, art direction, design and engineering as one system.",
          de: "Positionierung, Art Direction, Design und Engineering als ein System.",
        },
      },
      {
        index: "02",
        title: { en: "STRATEGIC REDESIGN", de: "STRATEGISCHES REDESIGN" },
        body: {
          en: "Reframe what exists. Rebuild only what earns its place.",
          de: "Neu denken, was existiert. Neu bauen, was es verdient.",
        },
      },
      {
        index: "03",
        title: { en: "APPLIED AI SYSTEMS", de: "ANGEWANDTE AI-SYSTEME" },
        body: {
          en: "Turn knowledge, requests and decisions into reliable workflows.",
          de: "Wissen, Anfragen und Entscheidungen werden zu verlässlichen Abläufen.",
        },
      },
    ],
  },
  lenox: {
    title: {
      en: "AI-ACCELERATED.\nHUMAN-DIRECTED.",
      de: "AI-BESCHLEUNIGT.\nMENSCHLICH GEFÜHRT.",
    },
    body: {
      en: "LENOX researches, structures, compares and tests.\nVolkan directs the work and approves what ships.",
      de: "LENOX recherchiert, strukturiert, vergleicht und testet.\nVolkan führt die Arbeit und gibt frei, was rausgeht.",
    },
    action: { en: "BRIEF LENOX", de: "LENOX BRIEFEN" },
  },
  contact: {
    title: {
      en: "BUILD WHAT YOUR COMPANY\nSHOULD BECOME NEXT.",
      de: "BAUEN, WAS AUS IHREM\nUNTERNEHMEN WERDEN SOLL.",
    },
    body: { en: "Tell us what must change.", de: "Sagen Sie uns, was sich ändern muss." },
    action: { en: "START A PROJECT", de: "PROJEKT STARTEN" },
    fields: {
      name: { en: "NAME", de: "NAME" },
      company: { en: "COMPANY", de: "UNTERNEHMEN" },
      email: { en: "EMAIL", de: "E-MAIL" },
      message: { en: "WHAT MUST CHANGE?", de: "WAS MUSS SICH ÄNDERN?" },
      send: {
        en: "OPEN EMAIL WITH THIS BRIEF",
        de: "E-MAIL MIT DIESEM BRIEF ÖFFNEN",
      },
    },
  },
  footer: {
    location: { en: "SWITZERLAND", de: "SCHWEIZ" },
    credit: "CREATIVE DIRECTION & ENGINEERING — VOLKAN",
  },
} as const;

export const aiModules = [
  {
    index: "01",
    title: "WEBSITE INTELLIGENCE",
    body: {
      en: "A structured interface for reviewing positioning, hierarchy, mobile UX, content clarity and conversion friction.",
      de: "Ein strukturiertes Interface für Positionierung, Hierarchie, Mobile UX, Inhaltsklarheit und Conversion-Reibung.",
    },
    state: "INTERACTIVE PROTOTYPE",
  },
  {
    index: "02",
    title: "BUSINESS SCENARIO",
    body: {
      en: "Translate a sector, constraint and business goal into an actionable AI system concept.",
      de: "Übersetzt Branche, Einschränkung und Geschäftsziel in ein umsetzbares AI-Systemkonzept.",
    },
    state: "PREVIEW",
  },
  {
    index: "03",
    title: "PROJECT BRIEF",
    body: {
      en: "Turn an open conversation into a clear project scope that Volkan can act on.",
      de: "Formt ein offenes Gespräch zu einem klaren Projektumfang, mit dem Volkan arbeiten kann.",
    },
    state: "PREVIEW",
  },
  {
    index: "04",
    title: "COMMUNICATION AGENT",
    body: {
      en: "Prepare context-aware communication while keeping every external action explicit and reviewable.",
      de: "Bereitet kontextbezogene Kommunikation vor und hält jede externe Aktion explizit und überprüfbar.",
    },
    state: "PREVIEW",
  },
] as const;
