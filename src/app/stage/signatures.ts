import type { LenoxSignatureId } from "../../flow-engine/types";
import type { Locale } from "../../i18n/messages";

/**
 * STAGE-SIGNATUREN (DER BEGLEITER, Slice 1).
 *
 * Die Engine besitzt den Raum (flow-engine/lenox/signatures.js); die Stage
 * besitzt die DOM-Token-Sets (globals.css, `data-signature`) und die Sprache:
 * wie die Welt heisst, was er sagt, wenn du sie wählst.
 *
 * Namen sind Artefakte, keine Übersetzungen — OBSIDIAN und ALABASTER lesen
 * sich in beiden Sprachen nativ. Genau deshalb wurden sie gewählt.
 */

type L = { de: string; en: string };

export type StageSignature = {
  id: LenoxSignatureId;
  /** Display name — identical in every locale, deliberately. */
  label: string;
  /** One half-sentence under the choice (Weg B, hairline minimal form). */
  hint: L;
  /** What he says when YOU pick it. */
  choiceComment: L;
};

export const STAGE_SIGNATURES: readonly StageSignature[] = [
  {
    id: "obsidian",
    label: "OBSIDIAN",
    hint: { de: "sein Zuhause", en: "his home" },
    choiceComment: {
      de: "Gute Wahl. Meine Heimat.",
      en: "Good choice. My home.",
    },
  },
  {
    id: "alabaster",
    label: "ALABASTER",
    hint: { de: "hell, editorial", en: "light, editorial" },
    choiceComment: {
      de: "Mutig. Nehmen wir.",
      en: "Bold. Let us take it.",
    },
  },
];

export function pickL(l: L, locale: Locale): string {
  return locale === "en" ? l.en : l.de;
}

/**
 * The DOM half of a world. OBSIDIAN is the absence of the attribute — the
 * stylesheet's base values ARE obsidian, so the default page needs no marker.
 */
export function applySignatureTokens(id: LenoxSignatureId): void {
  if (id === "obsidian") {
    delete document.documentElement.dataset.signature;
  } else {
    document.documentElement.dataset.signature = id;
  }
}
