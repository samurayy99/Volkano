import gsap from "gsap";
import type { LenoxEmotion, LenoxSignatureId } from "../../flow-engine/types";
import { applySignatureTokens } from "./signatures";

/**
 * DIE VERWANDLUNG (Rescue-Fassung). EINE Uhr, EIN Skalar.
 *
 * Die Timeline tweent genau einen Fortschritt p (0→1, linear über ~5,2 s)
 * und schiebt ihn pro Tick in die Engine (`setTransformProgress`). ALLES
 * Physische — Gather, Zündung, Front-Radius mit Anisotropie, Partikel-Flare,
 * Environment-Blende — leitet die Engine selbst aus p ab (peer-review
 * trap #2: zwei Uhren für einen synchronen Moment driften; ein Skalar kann
 * es nicht). Hier leben nur noch die DOM-Beats:
 *
 *   p 0,00  ACTING · Ziel-Welt hinter der Front geladen
 *   p 0,26  (Engine: Zündung)
 *   p 0,30  (Engine: Front startet an ihm)
 *   p 0,58  DOM-Tokens kippen — die Front hat die Bildmitte passiert
 *   p 1,00  COMMIT · er kommt zu dir zurück
 *
 * Reduced Motion: keine laufende Front — die Welt wechselt hinter einem
 * harten, sauberen Schnitt (gleiches Ergebnis, keine Bewegungslast).
 */
export type TransformOps = {
  setSignatureInstant: (id: LenoxSignatureId) => void;
  setSignatureTarget: (id: LenoxSignatureId) => void;
  setTransformProgress: (p: number) => void;
  commitSignature: () => void;
  onEmotion: (emotion: LenoxEmotion) => void;
  onDone: () => void;
};

/** Dauer des reinen Verwandlungs-Fensters (Entscheidung→Settle), Sekunden. */
const TRANSFORM_SEC = 5.2;

export function transformTimeline(
  signature: LenoxSignatureId,
  ops: TransformOps,
  reduced: boolean,
): gsap.core.Timeline {
  const tl = gsap.timeline({ onComplete: ops.onDone });

  if (reduced) {
    tl.call(() => {
      ops.onEmotion("acting");
      ops.setSignatureInstant(signature);
      applySignatureTokens(signature);
    });
    tl.to({}, { duration: 0.35 });
    tl.call(() => ops.onEmotion("neutral"));
    return tl;
  }

  const progress = { p: 0 };
  let tokensApplied = false;

  tl.call(() => {
    ops.onEmotion("acting");
    ops.setSignatureTarget(signature);
  });
  tl.to(progress, {
    p: 1,
    duration: TRANSFORM_SEC,
    ease: "none", // die Engine shaped; die Uhr liefert nur Zeit
    onUpdate: () => {
      ops.setTransformProgress(progress.p);
      if (!tokensApplied && progress.p >= 0.58) {
        tokensApplied = true;
        applySignatureTokens(signature);
      }
    },
  });
  tl.call(() => {
    ops.commitSignature();
    ops.onEmotion("neutral");
  });
  tl.to({}, { duration: 0.3 });

  return tl;
}
