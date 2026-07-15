import type { LenoxSignatureId } from "../../flow-engine/types";
import type { Locale } from "../../i18n/messages";

/**
 * DIE KALIBRIERUNG (DER BEGLEITER, Akt III Weg A).
 *
 * PLAY WITH ME war nie Deko: die Kammer misst still, WIE gespielt wird, und
 * wenn der Besucher LENOX entscheiden lässt, wählt er die Welt daraus — mit
 * einem gesprochenen Grund.
 *
 * Regeln (Storyboard §4, nicht verhandelbar):
 *   – lokal und flüchtig: nichts wird gespeichert, nichts gesendet; das
 *     Objekt lebt im React-Ref einer Session und stirbt mit ihr
 *   – deterministisch: dieselben Daten ⇒ dieselbe Wahl (Prioritätskette unten)
 *   – er kommentiert das SPIEL, nie den Menschen
 *   – ehrlicher Default bei zu wenig Interaktion
 *   – fair über Eingabearten: Touch bewegt sich physikalisch langsamer als
 *     eine Maus, also hat Touch eine eigene Tempo-Schwelle
 */

export type PlayMeter = {
  sample: (x: number, y: number, pointerType: string, nowMs: number) => void;
  finish: () => PlayMetrics;
};

export type PlayMetrics = {
  samples: number;
  /** Zeit mit tatsächlicher Bewegung (Lücken > 350 ms zählen nicht). */
  activeMs: number;
  distancePx: number;
  directionChanges: number;
  pointerType: string;
};

export type CalibrationChoice = {
  id: LenoxSignatureId;
  reason: { de: string; en: string };
};

const GAP_MS = 350;

export function createPlayMeter(): PlayMeter {
  let samples = 0;
  let activeMs = 0;
  let distancePx = 0;
  let directionChanges = 0;
  let pointerType = "mouse";
  let lastX = 0;
  let lastY = 0;
  let lastT = 0;
  let lastDx = 0;
  let lastDy = 0;

  return {
    sample(x, y, type, nowMs) {
      if (type) pointerType = type;
      if (samples > 0) {
        const dt = nowMs - lastT;
        if (dt > 0 && dt < GAP_MS) activeMs += dt;
        const dx = x - lastX;
        const dy = y - lastY;
        distancePx += Math.hypot(dx, dy);
        // Richtungswechsel: das Skalarprodukt kippt negativ.
        if (dx * lastDx + dy * lastDy < 0) directionChanges += 1;
        if (dx !== 0 || dy !== 0) {
          lastDx = dx;
          lastDy = dy;
        }
      }
      lastX = x;
      lastY = y;
      lastT = nowMs;
      samples += 1;
    },
    finish() {
      return { samples, activeMs, distancePx, directionChanges, pointerType };
    },
  };
}

/**
 * Messwerte → Welt + Grund.
 *
 * DAS GESETZ (Video-Verdikt 2026-07-15, einstimmig): **Die autonome Wahl
 * wählt NIEMALS die Welt, in der der Besucher bereits steht.** Der ganze
 * Beat existiert, damit sichtbar etwas passiert — Obsidian→Obsidian war
 * für den Normalbesucher (schnelles Spiel) der Default und damit der Tod
 * des Signature-Moments. Mit nur zwei Welten heisst das: er wählt immer
 * die andere; das Spiel bestimmt nicht mehr WOHIN, sondern WIE er es
 * begründet. (Ab drei Welten bekommt das Spiel die Richtung zurück.)
 *
 * Determinismus bleibt: dieselben Daten + dieselbe Ausgangswelt ⇒ dieselbe
 * Wahl, derselbe Satz.
 */
export function decideSignature(
  metrics: PlayMetrics,
  hour: number,
  current: LenoxSignatureId,
): CalibrationChoice {
  const id: LenoxSignatureId =
    current === "obsidian" ? "alabaster" : "obsidian";
  const toLight = id === "alabaster";

  const barelyPlayed = metrics.samples < 40 || metrics.activeMs < 1200;
  if (barelyPlayed) {
    return {
      id,
      reason: toLight
        ? {
            de: "Du hast mir wenig gegeben. Dann zeige ich dir erst das Licht.",
            en: "You gave me little. Then let me show you the light first.",
          }
        : {
            de: "Du hast mir wenig gegeben. Zurück ins Dunkel.",
            en: "You gave me little. Back into the dark.",
          },
    };
  }

  if (hour >= 22 || hour < 6) {
    return {
      id,
      reason: toLight
        ? {
            de: "Es ist spät. Etwas Licht tut dir gut.",
            en: "It is late. Some light will do you good.",
          }
        : {
            de: "Es ist spät. Komm mit ins Dunkel.",
            en: "It is late. Come into the dark.",
          },
    };
  }

  const speedPxPerSec =
    metrics.activeMs > 0 ? (metrics.distancePx / metrics.activeMs) * 1000 : 0;
  const fastThreshold = metrics.pointerType === "touch" ? 620 : 950;
  if (speedPxPerSec > fastThreshold) {
    return {
      id,
      reason: toLight
        ? {
            de: "Du warst schnell. Sehen wir, was Licht mit dir macht.",
            en: "You were fast. Let us see what light does to you.",
          }
        : {
            de: "Du warst schnell. Das Dunkel passt dir besser.",
            en: "You were fast. The dark suits you better.",
          },
    };
  }

  return {
    id,
    reason: toLight
      ? {
          de: "Du hast dir Zeit gelassen. Also Licht.",
          en: "You took your time. So: light.",
        }
      : {
          de: "Du hast dir Zeit gelassen. Dann trägst du auch das Dunkel.",
          en: "You took your time. Then you can carry the dark.",
        },
  };
}

export function pickReason(
  choice: CalibrationChoice,
  locale: Locale,
): string {
  return locale === "en" ? choice.reason.en : choice.reason.de;
}
