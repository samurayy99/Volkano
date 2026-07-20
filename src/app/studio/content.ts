import type { CaseId, ChapterId, Locale } from "./experienceState";

type Localized = Record<Locale, string>;

export type CaseStudy = {
  id: CaseId;
  index: string;
  title: string;
  discipline: Localized;
  provenance: Localized;
  imageAlt: Localized;
  image: string;
  color: string;
  evidence: {
    label: "THE PROBLEM" | "THE DECISION" | "THE BUILD" | "THE RESULT";
    text: Localized;
  }[];
};

export const chapters: ReadonlyArray<{
  id: ChapterId;
  nav: Localized;
  spanVh: number;
}> = [
  { id: "hero", nav: { en: "Studio", de: "Studio" }, spanVh: 140 },
  { id: "work", nav: { en: "Work", de: "Arbeiten" }, spanVh: 330 },
  { id: "services", nav: { en: "Web Design", de: "Webdesign" }, spanVh: 180 },
  { id: "lenox", nav: { en: "Lenox", de: "Lenox" }, spanVh: 180 },
  { id: "ai-systems", nav: { en: "AI Systems", de: "AI-Systeme" }, spanVh: 240 },
  { id: "volkan", nav: { en: "Volkan", de: "Volkan" }, spanVh: 140 },
  { id: "recompose", nav: { en: "Recompose", de: "Neu komponieren" }, spanVh: 120 },
  { id: "contact", nav: { en: "Contact", de: "Kontakt" }, spanVh: 120 },
] as const;

export const copy = {
  studioName: "VOLKAN AI STUDIO",
  studioDescriptor: {
    en: "Independent design and AI studio",
    de: "Unabhängiges Design- und AI-Studio",
  },
  gateEyebrow: {
    en: "INDEPENDENT DESIGN & AI STUDIO",
    de: "UNABHÄNGIGES DESIGN- & AI-STUDIO",
  },
  gateTitle: {
    en: "WEBSITES WITH A MIND OF THEIR OWN.",
    de: "WEBSITES MIT EINEM EIGENEN VERSTAND.",
  },
  gateBody: {
    en: "High-end web design, strategic redesign and custom AI systems.",
    de: "High-End-Webdesign, strategisches Redesign und individuelle AI-Systeme.",
  },
  wake: { en: "WAKE LENOX", de: "LENOX WECKEN" },
  skip: { en: "SKIP", de: "ÜBERSPRINGEN" },
  hero: {
    title: {
      en: "WEBSITES PEOPLE REMEMBER.\nAI SYSTEMS THAT KEEP WORKING.",
      de: "WEBSITES, DIE BLEIBEN.\nAI-SYSTEME, DIE WEITERARBEITEN.",
    },
    body: {
      en: "Strategy, art direction, design and engineering, shaped by one accountable mind.",
      de: "Strategie, Art Direction, Design und Engineering, geformt von einer verantwortlichen Person.",
    },
  },
  work: {
    title: { en: "BUILT.\nNOT PITCHED.", de: "GEBAUT.\nNICHT BEHAUPTET." },
    body: {
      en: "Three systems. Three identities. Each decision visible in the work.",
      de: "Drei Systeme. Drei Identitäten. Jede Entscheidung wird in der Arbeit sichtbar.",
    },
  },
  services: {
    title: {
      en: "FROM FORGETTABLE\nTO UNMISSABLE.",
      de: "VON AUSTAUSCHBAR\nZU UNÜBERSEHBAR.",
    },
    body: {
      en: "No templates. No recycled layouts. Every experience is shaped around the identity, ambition and business behind it.",
      de: "Keine Templates. Keine recycelten Layouts. Jede Experience entsteht aus Identität, Ambition und Geschäft der Marke.",
    },
  },
  lenox: {
    title: {
      en: "NOT A CHATBOT.\nA LIVING INTERFACE.",
      de: "KEIN CHATBOT.\nEIN LEBENDIGES INTERFACE.",
    },
    body: {
      en: "LENOX sees context, guides attention and turns intent into the next useful action.",
      de: "LENOX erkennt Kontext, führt Aufmerksamkeit und übersetzt Absicht in die nächste sinnvolle Aktion.",
    },
  },
  ai: {
    title: {
      en: "SYSTEMS THAT\nUNDERSTAND, DECIDE\nAND ACT.",
      de: "SYSTEME, DIE\nVERSTEHEN, ENTSCHEIDEN\nUND HANDELN.",
    },
    body: {
      en: "Start with Website Intelligence. Extend into business scenarios, project intake and communication systems.",
      de: "Start mit Website Intelligence. Danach folgen Business-Szenarien, Projekt-Briefings und Kommunikationssysteme.",
    },
  },
  volkan: {
    title: { en: "ONE PERSON.\nEND TO END.", de: "EINE PERSON.\nEND TO END." },
    body: {
      en: "A direct line from the first strategic question to the last production detail. No layers between the idea and the person building it.",
      de: "Eine direkte Linie von der ersten strategischen Frage bis zum letzten Produktionsdetail. Keine Ebenen zwischen Idee und Umsetzung.",
    },
  },
  recompose: {
    title: {
      en: "YOU HAVE SEEN THE WORLD.\nNOW SEE THE SYSTEM.",
      de: "DU HAST DIE WELT GESEHEN.\nJETZT SIEH DAS SYSTEM.",
    },
    body: {
      en: "Same studio. Same work. A different reality.",
      de: "Dasselbe Studio. Dieselbe Arbeit. Eine andere Realität.",
    },
    action: { en: "RECOMPOSE THE EXPERIENCE", de: "EXPERIENCE NEU KOMPONIEREN" },
    restore: { en: "RETURN TO THE REEF", de: "GRAVITY WIEDERHERSTELLEN" },
  },
  contact: {
    title: {
      en: "LENOX CAN INTRODUCE\nYOU TO VOLKAN.",
      de: "LENOX KANN DICH\nVOLKAN VORSTELLEN.",
    },
    brief: { en: "DESCRIBE YOUR PROJECT", de: "PROJEKT BESCHREIBEN" },
    analysis: { en: "REQUEST AN ANALYSIS", de: "ANALYSE ANFRAGEN" },
    book: { en: "BOOK A CALL", de: "GESPRÄCH ANFRAGEN" },
  },
} as const;

export const cases: readonly CaseStudy[] = [
  {
    id: "klein-paris",
    index: "01",
    title: "KLEIN PARIS",
    discipline: { en: "Digital relaunch and booking journey", de: "Digitaler Relaunch und Buchungsreise" },
    provenance: { en: "STUDIO PROJECT · IN DEVELOPMENT", de: "STUDIOPROJEKT · IN ENTWICKLUNG" },
    imageAlt: {
      en: "Klein Paris digital relaunch preview with a cinematic entrance",
      de: "Vorschau des digitalen Klein-Paris-Relaunchs mit cineastischem Einstieg",
    },
    image: "/studio/cases/klein-paris.jpg",
    color: "#d62d76",
    evidence: [
      {
        label: "THE PROBLEM",
        text: {
          en: "A distinctive venue needed a digital presence with clearer orientation and a more deliberate first impression.",
          de: "Ein eigenständiger Ort brauchte einen digitalen Auftritt mit klarerer Orientierung und einem bewussteren ersten Eindruck.",
        },
      },
      {
        label: "THE DECISION",
        text: {
          en: "Build the journey around atmosphere, privacy and direct choices instead of a generic catalogue.",
          de: "Die Journey folgt Atmosphäre, Privatsphäre und direkten Entscheidungen statt einem generischen Katalog.",
        },
      },
      {
        label: "THE BUILD",
        text: {
          en: "A responsive cinematic entry, public-safe content architecture and focused action paths.",
          de: "Ein responsiver cineastischer Einstieg, eine datensichere Inhaltsarchitektur und fokussierte Handlungswege.",
        },
      },
      {
        label: "THE RESULT",
        text: {
          en: "A coherent public experience that makes its tone and next step legible without exposing private operations.",
          de: "Eine kohärente öffentliche Experience, die Ton und nächsten Schritt lesbar macht, ohne interne Abläufe offenzulegen.",
        },
      },
    ],
  },
  {
    id: "manaleaf",
    index: "02",
    title: "MANALEAF",
    discipline: { en: "Brand world and product system", de: "Markenwelt und Produktsystem" },
    provenance: { en: "STUDIO PROJECT · IN DEVELOPMENT", de: "STUDIOPROJEKT · IN ENTWICKLUNG" },
    imageAlt: {
      en: "Manaleaf digital brand world derived from the physical packaging system",
      de: "Digitale Manaleaf-Markenwelt aus dem physischen Packaging-System",
    },
    image: "/studio/cases/manaleaf.webp",
    color: "#e17a40",
    evidence: [
      {
        label: "THE PROBLEM",
        text: {
          en: "A rich packaging identity needed a digital system capable of holding many products without flattening the brand.",
          de: "Eine starke Packaging-Identität brauchte ein digitales System für viele Produkte, ohne die Marke zu verflachen.",
        },
      },
      {
        label: "THE DECISION",
        text: {
          en: "Treat product discovery as a sensory material journey, then impose a precise information hierarchy beneath it.",
          de: "Die Produktsuche wird zur sinnlichen Materialreise und darunter durch eine präzise Informationshierarchie geordnet.",
        },
      },
      {
        label: "THE BUILD",
        text: {
          en: "A cinematic hero, reusable product components and a responsive visual language derived from the physical packs.",
          de: "Ein cineastischer Hero, wiederverwendbare Produktkomponenten und eine responsive Sprache aus dem physischen Packaging.",
        },
      },
      {
        label: "THE RESULT",
        text: {
          en: "A recognisable digital shelf whose structure can grow with the catalogue while preserving the product personalities.",
          de: "Ein wiedererkennbares digitales Regal, das mit dem Sortiment wachsen kann und die Produktpersönlichkeiten bewahrt.",
        },
      },
    ],
  },
  {
    id: "lenox-rnd",
    index: "03",
    title: "LENOX R&D",
    discipline: { en: "Living interface and spatial web", de: "Living Interface und räumliches Web" },
    provenance: { en: "INTERNAL R&D · ACTIVE PROTOTYPE", de: "INTERNES R&D · AKTIVER PROTOTYP" },
    imageAlt: {
      en: "Gravity Reef world created for the LENOX living-interface prototype",
      de: "Gravity-Reef-Welt für den LENOX-Living-Interface-Prototyp",
    },
    image: "/studio/world/hero-keyframe.jpg",
    color: "#69d7c3",
    evidence: [
      {
        label: "THE PROBLEM",
        text: {
          en: "Most AI websites describe intelligence through chat windows while the rest of the interface stays inert.",
          de: "Die meisten AI-Websites beschreiben Intelligenz in Chatfenstern, während der Rest des Interfaces starr bleibt.",
        },
      },
      {
        label: "THE DECISION",
        text: {
          en: "Make the website itself the demonstration and let one persistent character connect cinema, code and action.",
          de: "Die Website selbst wird zur Demonstration und eine persistente Figur verbindet Film, Code und Handlung.",
        },
      },
      {
        label: "THE BUILD",
        text: {
          en: "One scroll authority drives a scrubbed world film, a live WebGPU presence and semantic content layers.",
          de: "Eine Scroll-Autorität steuert Weltfilm, Live-WebGPU-Präsenz und semantische Inhaltsebenen.",
        },
      },
      {
        label: "THE RESULT",
        text: {
          en: "A working research platform where the interface can observe, guide and recompose without faking external automation.",
          de: "Eine funktionierende Forschungsplattform, die beobachten, führen und neu komponieren kann, ohne externe Automation vorzutäuschen.",
        },
      },
    ],
  },
] as const;

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
