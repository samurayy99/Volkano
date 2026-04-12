# Post-Enter — Referenz (eine eigenständige Datei)

Dieses Dokument **ersetzt** die entfernten Referenzdateien (`POST-ENTER-GOLD-NUGGETS.md`, `MLS-MPM-EXAMPLES.txt`, `docs+examples/GPU_Gems.txt`, `docs+examples/gpu-pipeline.md`, `docs+examples/webgpu-metaballs/NOTES.md`, große Web-Demo-Sammlungen). Alles Relevante für **Post-Enter** (Hold, Freeze, später Intake/Rift) ist hier gebündelt — ohne Verweis auf gelöschte Pfade als Pflichtlektüre.

---

## Inhaltsverzeichnis

1. [Ziel und Leitplanken](#1-ziel-und-leitplanken)
2. [Gold-Nuggets (Technik + Priorität)](#2-gold-nuggets-technik--priorität)
3. [Was nicht übernommen wird](#3-was-nicht-übernommen-wird)
4. [Solver / MLS — übernehmbare Bausteine](#4-solver--mls--übernehmbare-bausteine)
5. [Rendering / GPU-Pipeline — Kurzregeln](#5-rendering--gpu-pipeline--kurzregeln)
6. [GPU-Gems-Ideen (Vulcan / Glow)](#6-gpu-gems-ideen-vulcan--glow)
7. [Metaballs-Referenz (nur Konzept)](#7-metaballs-referenz-nur-konzept)
8. [Ehemalige Web-Demo-TXTs (Explosion / Particle)](#8-ehemalige-web-demo-txts-explosion--particle)
9. [Code im Repo (wo ansetzen)](#9-code-im-repo-wo-ansetzen)

---

## 1. Ziel und Leitplanken

- **Post-Enter** soll lesbar sein: weniger „Krümel“, weniger **stippled / faserig** im **Hold**, klarer **Freeze/Claim**.
- **Pre-enter** bleibt unangetastet (keine globalen Experimente dort).
- Trennung: **Choreografie** vs. **Solver** vs. **Renderer** — z. B. XSPH ist Solver, nicht Flight-Owner.

---

## 2. Gold-Nuggets (Technik + Priorität)

### Jetzt am wertvollsten

| Technik | Wo (Post-Enter) | Owner | Nutzen |
|--------|------------------|-------|--------|
| **XSPH** (Velocity-Glättung auf Grid-Nachbarschaft) | später **Arrest**, direkt vor **Freeze**; nicht im laufenden Pre-enter | **Solver** | Beruhigt faserige Rod-Unruhe **physisch**; besserer Hold-Read ohne neue zentrale Compression |
| **Thickness-driven opacity** | **Hold**-Branch, evtl. später Intake; nicht Pre-enter global | **Renderer** | Volumetrischere Masse; weniger „viele einzelne Rods“ |

### Danach (Intake v3 / Rift)

| Technik | Wo | Owner | Nutzen |
|--------|-----|-------|--------|
| **Collision / Capture** (Reibung, Restitution, SDF) | Rift-Intake, Rückwand | Solver + Renderer (sichtbarer Claim) | Rift als **Material**, nicht nur Zielpunkt; weniger Staub-Gefühl |
| **Emitter binding + Fade** | Intake, Claim entlang Rift | Bridge/Renderer | Kontinuierlicher Strom, weniger lose Partikel |
| **Temporal persistence / After-image** | Intake, Rift-Claim | Renderer/Post | Energie verschwindet nicht hart; filmischer Claim |

### Unterstützende Schicht

| Technik | Wo | Owner |
|--------|-----|-------|
| **Source-masked glow** | Rift, Pressure Seam | Renderer/Post |
| **CFL / dt clamp** + `maxVelocity` | stärkere Felder, Capture | Solver/Stabilität |

**Kurzfazit:** Physische Beruhigung (kleines XSPH) + volumetrischer Hold (Thickness) + Rift als Capture + Intake-Kontinuität (Emitter-ähnlich) + filmischer Claim (temporal persistence statt hartem Cut).

---

## 3. Was nicht übernommen wird

- Audio-reactive Felder  
- Orbit-/Wave-Demo-Motion als Look-Basis  
- HSV-/reines Velocity-Coloring als Hauptlesart  
- Additiv „alles glüht“  
- Sprite-/Billboard-Feuer-Semantik 1:1  
- Grain als Stilpflaster  
- Aus Demo-TXTs: **Themes, Bloom-Demos, Canvas-Feuerwerk** — höchstens **Timing/Easing**-Denke, kein Solver-Ersatz  

---

## 4. Solver / MLS — übernehmbare Bausteine

*(Logik aus dem ehemaligen MLS-MPM-Beispielarchiv; in eigenem Code ggf. an WebGPU/TSL/Struktur anpassen.)*

### Uniforms (Startwerte)

- `collisionRestitution` ≈ `0.6`, `collisionFriction` ≈ `0.2`  
- `xsphEnabled` (uint 0/1), `xsphEps` ≈ `0.08`  
- `maxVelocity` (z. B. 2.5) für Clamp und CFL  
- Optional: `vorticityEnabled` — **nicht** Priorität für ruhigen Hold (kann mehr Wirbel geben); bei Unruhe eher **XSPH**  

### XSPH-ähnlich (6 Nachbarn auf dem Grid)

Mittel aus ±X/±Y/±Z Zellgeschwindigkeiten, Differenz zur Partikelgeschwindigkeit, mit `xsphEps * dt` aufaddieren → **weiche** Geschwindigkeit ohne großen Eingriff.

### Kollision

- **Box:** Normale reflektieren; Tangente mit `(1 - friction)` dämpfen, Normale mit `restitution`.  
- **SDF-Kugel:** Penetration `pen = r - |p-c|`; Position entlang `n` aus der Mitte schieben; gleiches tangential/normal-Material wie oben.  
- Modi-Idee (uint): `0` Box-Wände; `1` Kugel-SDF; `2` Polyhedron-Planes; `3` Wrap statt hartem Clamp (nur wenn bewusst gewollt).

### Stabilität

- **Velocity clamp:** wenn `|v| > maxVelocity` → auf `maxVelocity` normieren.  
- **CFL auf CPU:** `dt = min(dt, max(0.001, cflSafety / max(vmax, ε)))` mit `cflSafety` z. B. `0.5`.  

### Renderer: Thickness → Opacity

- `nView.z` (Blickrichtung) flach → mehr „Körper“-Lesart; mit `|velocity|` mischen.  
- `opacityNode` aus Thickness remappen/clampen → **dichtere** Silhouette bei Hold.

### P2G / Atomics (nur Prinzip)

- Impuls/Masse in Grid-Zellen mit **integer atomics** + **Fixed-Point**-Skalierung (`encode`/`decode`), damit Float-Akkumulation auf WebGPU funktioniert.

---

## 5. Rendering / GPU-Pipeline — Kurzregeln

- CPU schreibt pro Frame vor allem **Uniforms** / kleine Steuerdaten; **Simulation + Render** laufen GPU-lastig.  
- Klare **Pass-Reihenfolge** (Compute-Kette → Partikel → Post); Datenfluss als **DAG** denkbar halten.  
- **Ping-Pong:** nie gleiche Textur gleichzeitig lesen und schreiben; **Swap nach** dem Schreib-Pass.  
- Sim **niedriger** auflösen als den sichtbaren „Dye“/Look — großer Hebel.  
- Instanced Particles: **`frustumCulled = false`** (Three.js-Bounding-Box-Falle).  

---

## 6. GPU-Gems-Ideen (Vulcan / Glow)

- **Alpha statt blindem Additiv** für kontrollierbare Farbe und Mischung mit „Masse“; Sortieren oft billig genug.  
- **Emitter-Gewicht:** jung stark an Quelle gebunden, mit Alter lösen — Kontinuität bei bewegter Rift/Quelle.  
- **Layer composition:** intensive Partikel-Passes in **kleinerem RT** (z. B. Viertel), dann hochcompositen — Budget.  
- **Glow:** nur explizite **Quellen-Maske** (eigenes schwarzes RT + farbige Quellen); Blur **separabel** (horizontal dann vertikal, Kosten ~linear in Durchmesser).  
- **After-image:** vorheriges (gedimmtes) **Glow-Source**-Bild zum aktuellen addieren → Streaking; alternativ geblurrtes Glow von letztem Frame — aufpassen bei Gewichten (kein weißes Auflaufen).  
- **Depth bei anderer RT-Größe:** ggf. **Low-Res-Proxy** ins Effekt-Depth statt voller Szene.  

---

## 7. Metaballs-Referenz (nur Konzept)

- **Mitnehmen:** Eindruck von **geschlossener Oberfläche**, **Volumen**, starke **Silhouette**.  
- **Nicht mitnehmen:** Lava/Slime-Look, Boden-Pfütze, spielerische Blob-Ästhetik, kompletter Pipeline-Tausch.  
- **VOLKANO:** sehr spät gated **implicit shell / surface read** für **Pressure → Freeze → Hold**; Pre-enter unberührt.  

---

## 8. Ehemalige Web-Demo-TXTs (Explosion / Particle)

Die großen Sammlungen waren **HTML/CodePen** (Three.js CDN, GSAP, `UnrealBloomPass`, CSS-Themes). Für **Post-Enter** maximal:

| Idee | Nutzen |
|------|--------|
| **Gestaffelte Delays** / custom Easing | Timing von Phasen / Übergängen (Authoring), nicht Physik |
| **Lerp zu festen Zielrichtungen** | Metapher „jedes Sample hat ein Ziel“ — Choreo, nicht MLS |
| **Bloom in Demos** | nur als Warnung: leicht **global** und unmaskiert — widerspricht selektivem Glow aus Abschnitt 6 |

Alles andere (Themes, `mix-blend-mode: screen`, Partikel-Feuerwerk) ist **optional** für Marketing-Skizzen, nicht für den Post-Enter-Kernpfad.

---

## 9. Code im Repo (wo ansetzen)

- `src/flow-engine/post-enter/PostEnterDirector.ts` — Phasen / Gates  
- `src/flow-engine/post-enter/postEnterFlightSystem.ts` — Bewegung nach Enter  
- `src/flow-engine/mls-mpm/particleRenderer.js` — Opacity, Look, Hold-Branch  
- `src/flow-engine/mls-mpm/mlsMpmSimulator.js` — Solver, `dt`, Grenzen, später XSPH/Collision  

---

*Stand: kompaktes Archiv nach Entfernen der externen Referenzdateien. Bei neuen Experimenten hier zuerst ergänzen statt neue riesige TXTs anzulegen.*
