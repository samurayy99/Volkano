/**
 * ENGINE-SIGNATUREN — was der RAUM pro Signatur ist.
 *
 * Eine Signatur färbt nie Lenox selbst (Canon: Obsidian-Silhouette, Silber,
 * Cyan-Signale — immer). Sie definiert die Welt, in der er steht: die Lack-
 * Wand, den flüssigen Boden und die Reflexionswelt, die sein Silber trägt.
 *
 * OBSIDIAN ist byte-identisch mit dem heutigen Look — die Werte hier sind die
 * bisherigen Konstanten aus lenoxBackdrop.js, unverändert. Wer OBSIDIAN lädt,
 * lädt den Ist-Zustand.
 *
 * ALABASTER folgt der Leitplanke aus dem Storyboard: nie SaaS, nie Beige,
 * nie Apple-White. Elfenbein mit Graphit-Härte. Die Physik-Gesetze des
 * Backdrops bleiben (Pool hinter Lenox, Reflexion statt Emission) — nur ist
 * er jetzt das dunkle Objekt auf hellem Grund: seine Boden-Reflexion ist
 * DUNKEL, der Raum hell. Die Inversion ist der Beweis.
 */

export const ENGINE_SIGNATURES = {
  obsidian: {
    env: "void",
    panel: {
      lacquer: 0x05070a,
      reflection: 0x16243a,
      specular: 0x3a4450,
    },
    floor: {
      base: 0x030507,
      reflection: 0x8c98a4,
      sheen: 0x274c55,
    },
    /** Scan-Front-Kante beim VERLASSEN dieser Welt (Farbe der Operation). */
    rim: 0x9fe8f6,
  },
  alabaster: {
    env: "alabaster",
    panel: {
      // Elfenbein-Lack: hell, aber gebrochen — nie reines Weiß.
      lacquer: 0xd8d1c1,
      // Die Reflexion ist wärmeres Licht, kein Blau.
      reflection: 0xb9b09a,
      // Spitzlichter fast weiß, minimal warm.
      specular: 0xfaf5e8,
    },
    floor: {
      base: 0xc9c2b1,
      // Seine Boden-Reflexion ist DUNKEL: Graphit auf Elfenbein.
      reflection: 0x3c3a34,
      // Der Horizont-Schimmer wird stilles Petrol statt Cyan.
      sheen: 0x5d7f82,
    },
    rim: 0xffffff,
  },
};

export const SIGNATURE_IDS = Object.keys(ENGINE_SIGNATURES);

export function isSignatureId(id) {
  return Object.prototype.hasOwnProperty.call(ENGINE_SIGNATURES, id);
}
