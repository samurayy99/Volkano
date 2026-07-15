import type { LenoxEmotion } from "../../flow-engine/types";
import type { Region } from "../../i18n/messages";

/**
 * DIE STATIONEN (DER BEGLEITER, Slice 2).
 *
 * Eine Station ist ein Ort auf der Scroll-Strecke: eine Kamera-Pose, eine
 * Präsenzstufe für Lenox und ein Inhalt. Der Scroll-Director interpoliert
 * die Posen zwischen den Stationen — die Kamerafahrt IST das Scrollen.
 *
 * Posen sind frustum-relativ (siehe LenoxJourneyPose): zoom multipliziert
 * die Distanz, shifts sind in Halbbreiten/-höhen. Positive shiftX schiebt
 * ihn im Bild nach RECHTS (Kamera wandert nach Welt-+x).
 *
 * Präsenzstufen (Storyboard §0): er ist immer anwesend, nie gleich laut —
 *   front — nah, frontal, er gehört dir
 *   side  — er begleitet seitlich (die Arbeits-Komposition)
 *   close — die Kamera ist IN seinem Raum, er ist groß und angeschnitten
 *   deep  — zurückgetreten, klein, Silhouette und Augen tragen die Präsenz
 */

export type StationPose = {
  zoom: number;
  shiftX: number;
  shiftY: number;
};

export type Station = {
  id: Region;
  /** Scroll-Strecke dieser Station, in Viewport-Höhen. */
  lengthVh: number;
  pose: { side: StationPose; banded: StationPose };
  presence: "front" | "side" | "close" | "deep";
  /** Sein Zustand, wenn die Station die Führung übernimmt. */
  emotion: LenoxEmotion;
  /** Wohin sein kurzer Blick beim Eintritt geht. */
  glance: "work" | "visitor";
};

/**
 * EXPERIENCE und SYSTEMS sind art-directed (der Qualitätsbeweis); WORK,
 * VOLKAN und CONTACT sind verdrahtet, nicht poliert (Slice-2-Auftrag).
 *
 * Der EXPERIENCE→SYSTEMS-Übergang ist der Payoff: die Kamera fährt an ihm
 * vorbei in seinen Raum — zoom 1.0 → 0.56 —, er wächst zum angeschnittenen
 * Kopf am linken Rand und dreht den Blick zu dir, während sein Inneres
 * (SYSTEMS) rechts vorbeizieht.
 */
export const STATIONS: readonly Station[] = [
  {
    id: "experience",
    lengthVh: 150,
    pose: {
      // Näher als der alte Operator-Stand: er ist Teil der Hero-Komposition,
      // kein Maskottchen neben Karten (Video-Verdikt).
      side: { zoom: 0.88, shiftX: -0.06, shiftY: 0 },
      banded: { zoom: 0.95, shiftX: 0, shiftY: 0 },
    },
    presence: "side",
    emotion: "neutral",
    glance: "visitor",
  },
  {
    id: "systems",
    lengthVh: 170,
    pose: {
      // Monumental und BEWUSST angeschnitten: gut die Hälfte von ihm bleibt
      // im Bild (0.56/−0.38 schnitt ihn fast vollständig — AD-Verdikt
      // "falsches responsive Framing").
      side: { zoom: 0.6, shiftX: -0.3, shiftY: -0.03 },
      banded: { zoom: 0.64, shiftX: 0, shiftY: -0.12 },
    },
    presence: "close",
    emotion: "thinking",
    glance: "visitor",
  },
  {
    id: "work",
    lengthVh: 140,
    pose: {
      side: { zoom: 0.95, shiftX: 0.08, shiftY: 0 },
      banded: { zoom: 0.95, shiftX: 0, shiftY: -0.02 },
    },
    presence: "side",
    emotion: "neutral",
    glance: "work",
  },
  {
    id: "volkan",
    lengthVh: 110,
    pose: {
      side: { zoom: 1.75, shiftX: 0.3, shiftY: 0.04 },
      banded: { zoom: 1.6, shiftX: 0, shiftY: 0.06 },
    },
    presence: "deep",
    emotion: "curious",
    glance: "visitor",
  },
  {
    id: "contact",
    lengthVh: 130,
    pose: {
      side: { zoom: 0.82, shiftX: 0.34, shiftY: 0 },
      banded: { zoom: 0.85, shiftX: 0, shiftY: -0.06 },
    },
    presence: "front",
    emotion: "pleased",
    glance: "visitor",
  },
];

export function lerpPose(a: StationPose, b: StationPose, t: number): StationPose {
  return {
    zoom: a.zoom + (b.zoom - a.zoom) * t,
    shiftX: a.shiftX + (b.shiftX - a.shiftX) * t,
    shiftY: a.shiftY + (b.shiftY - a.shiftY) * t,
  };
}
