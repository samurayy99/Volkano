import type { DesignId } from "./designRegistry";
import type { Locale } from "./experienceState";

export const PROOF_FINDING_IDS = ["attention", "proof", "responsibility", "range", "credibility"] as const;
export const PROOF_PRIORITY_IDS = ["promise", "boundaries", "evidence"] as const;

type ProofCopy = {
  claim: string;
  descriptor: string;
  inputLabel: string;
  inputPlaceholder: string;
  runProof: string;
  closeResult: string;
  currentReality: string;
  requestReview: string;
  fixtureLabel: string;
  findingsTitle: string;
  prioritiesTitle: string;
  directionTitle: string;
  findings: Record<(typeof PROOF_FINDING_IDS)[number], string>;
  priorities: Record<(typeof PROOF_PRIORITY_IDS)[number], string>;
  direction: string;
  decisionTitle: string;
  decide: string;
  close: string;
  decisions: Record<"trust" | "innovation" | "character", {
    label: string;
    design: DesignId;
    reason: string;
  }>;
  artifact: {
    label: string;
    alt: string;
    title: string;
    notes: readonly { label: string; body: string }[];
  };
};

export const PROOF_CONTENT: Record<Locale, ProofCopy> = {
  en: {
    claim: "WEBSITES PEOPLE REMEMBER.\nAI SYSTEMS THAT KEEP WORKING.",
    descriptor: "High-end digital products and operational AI systems for Swiss businesses.",
    inputLabel: "Company or website",
    inputPlaceholder: "example.ch",
    runProof: "RUN PROOF",
    closeResult: "CLOSE RESULT",
    currentReality: "CURRENT REALITY",
    requestReview: "REQUEST REVIEW",
    fixtureLabel: "PROOF FIXTURE · NOT FOR PUBLIC RELEASE",
    findingsTitle: "Five Findings",
    prioritiesTitle: "Three Priorities",
    directionTitle: "One Direction",
    findings: {
      attention: "The offer competes with the visual system for first attention.",
      proof: "The primary action is visible but not yet supported by proof.",
      responsibility: "Responsibility is stated later than a trust-first buyer expects.",
      range: "The design system has enough range to support distinct market positions.",
      credibility: "AI capability is described before a live result establishes credibility.",
    },
    priorities: {
      promise: "Make the commercial promise legible before the signature interaction.",
      boundaries: "Connect every AI claim to a visible input, output and approval boundary.",
      evidence: "Use the reality switch as evidence of design range, not as decoration.",
    },
    direction: "Lead with accountable clarity, then let the interface prove range and operational intelligence.",
    decisionTitle: "WHAT MUST YOUR WEBSITE PROVE FIRST?",
    decide: "LET LENOX DECIDE",
    close: "CLOSE",
    decisions: {
      trust: {
        label: "TRUST",
        design: "signal",
        reason: "SIGNAL leads because responsibility and precision must be proven before spectacle.",
      },
      innovation: {
        label: "INNOVATION",
        design: "gravity",
        reason: "GRAVITY leads because a live computational field makes technical ambition observable.",
      },
      character: {
        label: "CHARACTER",
        design: "atelier",
        reason: "ATELIER leads because a real artifact makes editorial judgment visible.",
      },
    },
    artifact: {
      label: "INTERNAL PROTOTYPE · HISTORICAL DESIGN STUDY",
      alt: "Historical VOLKAN AI STUDIO prototype showing an earlier editorial reality composition.",
      title: "A decision, not decoration.",
      notes: [
        { label: "WHY THIS EXISTS", body: "It records an actual attempt to separate the editorial reality from the system-led designs." },
        { label: "WHAT WAS REMOVED", body: "Generic warmth, decorative texture and the assumption that a palette alone creates character." },
        { label: "WHAT CHANGED", body: "The artifact now determines scale, rhythm, cropping and annotation." },
        { label: "WHAT THE BRIEF REQUIRED", body: "One factual story interpreted through a visibly different cultural lens." },
      ],
    },
  },
  de: {
    claim: "WEBSITES, DIE MAN NICHT VERGISST.\nAI-SYSTEME, DIE WEITERARBEITEN.",
    descriptor: "High-End-Digitalprodukte und operative AI-Systeme für Schweizer Unternehmen.",
    inputLabel: "Unternehmen oder Website",
    inputPlaceholder: "beispiel.ch",
    runProof: "PROOF STARTEN",
    closeResult: "ERGEBNIS SCHLIESSEN",
    currentReality: "AKTUELLE REALITY",
    requestReview: "REVIEW ANFRAGEN",
    fixtureLabel: "PROOF FIXTURE · NICHT FÜR DIE VERÖFFENTLICHUNG",
    findingsTitle: "Fünf Befunde",
    prioritiesTitle: "Drei Prioritäten",
    directionTitle: "Eine Richtung",
    findings: {
      attention: "Das Angebot konkurriert mit dem visuellen System um die erste Aufmerksamkeit.",
      proof: "Die primäre Aktion ist sichtbar, wird aber noch nicht durch Beweise gestützt.",
      responsibility: "Verantwortung erscheint später, als ein vertrauensorientierter Käufer erwartet.",
      range: "Das Designsystem besitzt genug Bandbreite für unterschiedliche Marktpositionen.",
      credibility: "AI-Fähigkeit wird beschrieben, bevor ein sichtbares Ergebnis Glaubwürdigkeit schafft.",
    },
    priorities: {
      promise: "Das kommerzielle Versprechen muss vor der Signature-Interaktion verständlich sein.",
      boundaries: "Jede AI-Aussage braucht sichtbare Inputs, Outputs und Freigabegrenzen.",
      evidence: "Der Reality-Wechsel muss Designbandbreite beweisen, nicht nur dekorieren.",
    },
    direction: "Zuerst verantwortbare Klarheit, danach beweist das Interface Bandbreite und operative Intelligenz.",
    decisionTitle: "WAS MUSS IHRE WEBSITE ZUERST BEWEISEN?",
    decide: "LENOX ENTSCHEIDEN LASSEN",
    close: "SCHLIESSEN",
    decisions: {
      trust: {
        label: "VERTRAUEN",
        design: "signal",
        reason: "SIGNAL führt, weil Verantwortung und Präzision vor Spektakel bewiesen werden müssen.",
      },
      innovation: {
        label: "INNOVATION",
        design: "gravity",
        reason: "GRAVITY führt, weil ein reales Computational Field technische Ambition sichtbar macht.",
      },
      character: {
        label: "CHARAKTER",
        design: "atelier",
        reason: "ATELIER führt, weil ein echtes Artefakt redaktionelles Urteilsvermögen sichtbar macht.",
      },
    },
    artifact: {
      label: "INTERNER PROTOTYP · HISTORISCHE DESIGNSTUDIE",
      alt: "Historischer VOLKAN-AI-STUDIO-Prototyp einer früheren redaktionellen Reality-Komposition.",
      title: "Eine Entscheidung, keine Dekoration.",
      notes: [
        { label: "WARUM ES DAS GIBT", body: "Die Studie dokumentiert einen echten Versuch, die redaktionelle Reality von den systemischen Designs zu trennen." },
        { label: "WAS ENTFERNT WURDE", body: "Generische Wärme, dekorative Textur und die Annahme, eine Palette allein erzeuge Charakter." },
        { label: "WAS SICH ÄNDERTE", body: "Das Artefakt bestimmt nun Massstab, Rhythmus, Ausschnitt und Annotation." },
        { label: "WAS DAS BRIEFING VERLANGTE", body: "Eine faktische Geschichte durch eine klar andere kulturelle Perspektive interpretiert." },
      ],
    },
  },
};
