# DER BEGLEITER — Sekunden-Storyboard

> Historical concept source. Superseded as product direction by `docs/product/lenox-design-playground-manifesto.md`. Reuse interaction and engine insights only after they are reconciled with the three-template visual targets.

**Status:** Rev. 2 — Berater-Review (Codex + ChatGPT) eingearbeitet, Machbarkeits-Check bestanden · wartet auf Volkans finales Go
**Datum:** 2026-07-14
**Synthese aus:** Volkans Begleiter-/Look-Wahl-Konzept · noth.in-Dramaturgie · Codex (Auto-Kalibrierung, Zustandspalette) · ChatGPT (Signal-Membran, Scan, Vertical-Slice-Strategie) · 8 CodePen-Mechaniken (siehe Referenz-Memory)

---

## 0. Zweck und Gesetz

Die Seite hat ein Versprechen: **Lenox kann wahrnehmen, denken, gestalten und handeln — live, vor deinen Augen.** Bisher beweist sie das nur bis Sekunde 15. Dieses Storyboard verlängert den Beweis über die gesamte Seite, mit einer Regel über allem:

> **Lenox begleitet.** Er ist nie Maskottchen, nie Ecke, nie Tapete. Er ist immer *anwesend* — aber nicht immer gleich dominant: pro Station eine bewusste Präsenzstufe (frontal · seitlich · in der Tiefe · nur Augen/Silhouette/Glint lesbar). Anwesenheit ohne Stufen wäre nur ein neuer statischer Split. Er spricht zu dem, was du siehst, und er ist jederzeit ansprechbar.

**Abnahme (nicht verhandelbar) — qualitativ zuerst:**
1. Beantwortet das Video eines Fremden diese drei Fragen mit Ja? *(a)* Hat Lenox erkennbar wahrgenommen, entschieden und den Raum verwandelt? *(b)* Sieht die Verwandlung inszeniert, kinematisch und materiell echt aus? *(c)* Fühlt sich die Seite danach wie eine neue Welt an — nicht wie ein Skin?
2. Kein **unbeabsichtigter** visueller Stillstand oder Intensitätsabfall nach READY. Ruhige Momente sind erlaubt — wenn Präsenz, Spannung oder Interaktion sie tragen. (Ein gehaltener, gespannter Moment ist Kino; ein vergessener ist der alte Fehler.)
3. Volkans Video-Urteil bleibt die letzte Instanz (Video-Proof-Regel).
4. **Diagnostisch, nicht Gate:** unterscheidbare Frames/10 s (`/watch`-Dedup) kommen in jeden Slice-Bericht — als Frühwarnung gegen tote Abschnitte, nicht als Ziel (die Zahl ist mit Flackern gewinnbar und mit gutem Hold verlierbar).
5. Performance: Engine-Frame (CPU-Tick, `__LENOX_PERF__.avgMs`) nach Warm-up max. +20 % gegenüber heute; gleicher Viewport/DPR.
6. `prefers-reduced-motion`: jede Choreografie hat eine komprimierte Fassung — gleiche Kausalkette, keine langen Halte.

**Kanon-Wächter (gelten in jeder Signatur):**
1. Lenox selbst ist **nicht themebar**: Obsidian-Silhouette, Silber-Material, Cyan-Signale — immer.
2. **Amber ausschließlich für real bestätigte Aktionen** (heute: der echte Mail-Send). Keine Signatur, kein Effekt, kein Demo-Moment darf Amber zweckentfremden.
3. Kein Chat-Bubble, keine Tabs/Toggles-Chrome, keine Mood-Regenbogenfarben (Magenta/Pink/Grün sind gestrichen).
4. Simuliertes bleibt beschriftet (Replay-Disclosure der Cases bleibt).
5. **Canon-Erweiterung (braucht Volkans explizites Ja in dieser Freigabe):** Der *Raum* darf pro Signatur die Welt wechseln — auch hell. Der bisherige Satz "fullscreen black or graphite space" wird zu "der Raum trägt die gewählte Signatur; OBSIDIAN ist Heimat und Default".

---

## 1. Die Signaturen (Start: 3)

Eine Signatur = Raumstimmung (Licht, Boden, Nebel) + Partikel-Verhalten/Akzent + Typografie + UI-Token-Set. Gleicher Inhalt, andere Welt.

Namen: beide Berater gegen "PORZELLAN" (fragil/dekorativ) — entschieden: **ALABASTER** (identisch in DE und EN, materiell, architektonisch; ChatGPT-Vorschlag). TERMINAL bleibt **Arbeitstitel** — der finale Name folgt dem tatsächlichen Bild (ChatGPT-Einwand akzeptiert).

**Leitplanke für ALABASTER (Codex):** nie SaaS, nie Beige, nie Wellness, nie Apple-White. Fremd, editorial, graphitisch, präzise — Porzellan-Härte, nicht Porzellan-Deko.

| | OBSIDIAN (Heimat) | ALABASTER | TERMINAL *(Arbeitstitel)* |
|---|---|---|---|
| Raum | schwarzer Void, kaltes Bodenglühen | lichtes Elfenbein-Studio, weicher Verlaufshimmel, Boden fast weiß | schwarzer Void, feines Instrumentenraster im Boden |
| Partikel | Silber/Cyan, ruhig-schwer | **Graphit-Staub auf hellem Grund (Inversion — der Maximal-Beweis)** | dichter, nervöser, cyan-mono, kürzere Shards |
| Typo | Display condensed + Mono (heute) | Editorial-Serif-Display, großzügige Läufe, Graphit auf Elfenbein | alles Mono, enger, Versalien-lastig |
| Akzent | Cyan `#4df0ff` | tiefes Petrol-Cyan (kontrastfest auf hell) | Cyan, höhere Signaldichte (Ticks, Raster) |
| Charakter | „sein Zuhause" | „der Beweis, dass er auch Licht kann" | „die Maschine zeigt ihr Inneres" |

Amber ist in allen drei identisch reserviert. Signatur-Definitionen im Detail (exakte Token) sind Design-Arbeit der Slice — hier nur die Welt.

---

## 2. AKT I — PLAY & WAKE (bestehend, plus stille Messung)

**T+0 → frei.** Unverändert: freies Feld, PLAY, WAKE-Button.
**Neu, unsichtbar:** Die Kammer misst das Spiel — mittlere Pointer-Energie, Richtungswechsel-Rate, Pausen, Touch/Maus, lokale Uhrzeit. Kein UI, keine Anzeige. Diese Daten sind Akt III/Weg A.
**WAKE (≈3,5 s):** unverändert. Unser stärkstes Kapitel bleibt unangetastet.

*Reduced Motion / Mobile: wie heute.*

---

## 3. AKT II — FIRST CONTACT MIT FRAGE (≈ 10 s)

| Zeit | Kamera | Lenox | Raum | UI/Text |
|---|---|---|---|---|
| T+0,0 | Präsenz-Framing (heute) | `present`, Blick findet Cursor | ruhig | — (die Stille bleibt tragend) |
| T+1,8 | hält | `speaking`, Mund-Seam pulst | Decode treibt Kammer-Energie leicht | Hairline wächst, Satz dekodiert: **„Ich bin Lenox. Diese Welt ist noch nicht entschieden."** *(ChatGPT-Korrektur: bleibt auch nach dem hundertsten Besuch wahr — die Welt ist wirklich jedes Mal unentschieden)* |
| T+4,5 | minimaler Push-in (Aufmerksamkeit) | `curious` | Partikel sammeln sich eine Spur | zweite Zeile: **„Bevor ich sie baue — wer bestimmt ihre Handschrift?"** |
| T+6,0 | hält | Blick pendelt einmal zwischen den zwei Antworten | — | auf der Hairline zwei Antworten: **[ DU ] · [ LENOX ]** (44px-Ziele, Fokus-Ring cyan) |
| — | | | | Keine dritte Option, kein Menü, kein Sales-Intake. Wartet der Besucher >12 s, neigt Lenox minimal den Kopf — keine Aufforderung, nur Präsenz. |

*Reduced Motion: Stille 0,3 s, Frage sofort gesetzt, keine Decode-Churn (bestehende Regel).*
*Mobile (banded): Hairline + Frage unter ihm, Antworten nebeneinander, gleiche Grammatik.*

---

## 4. AKT III — DIE KALIBRIERUNG

### Weg A — „LENOX" (≈ 6 s)

| Zeit | Lenox | Raum | UI/Text |
|---|---|---|---|
| T+0,0 | `thinking`; Blick senkt sich kurz auf das Feld (die Reste deines Spiels) | dünne diagnostische Teilbögen um seine Silhouette (Cognitive Halo, **temporär**, ≤2 s) | Antworten lösen sich auf |
| T+1,5 | `speaking` | — | Ein Satz, ehrlich aus den Messdaten, z. B.: **„Du warst schnell. Ich baue dir etwas mit Kante."** → TERMINAL · oder **„Du hast dir Zeit gelassen. Also Licht."** → PORZELLAN · nachts default: **„Es ist spät. Ich bleibe im Dunkeln."** → OBSIDIAN |
| T+3,0 | → Akt IV | | Der Satz IST die Begründung. Keine Erklär-UI. |

**Kalibrierungs-Regeln (ChatGPT, vollständig übernommen):**
- Messdaten sind **lokal und flüchtig** — kein Speichern, kein Senden, kein Fingerprinting. Session-Ende = weg.
- Deterministisch: dieselben Daten ⇒ dieselbe Wahl (Mapping-Tabelle ist Teil der Slice-Definition).
- **Keine Persönlichkeitsdiagnose.** Er kommentiert das *Spiel*, nie den *Menschen*: „Du warst schnell" ✓ — „Du bist impulsiv" ✗.
- Ehrlicher Default bei zu wenig Interaktion: „Du hast mir wenig gegeben. Ich fange dunkel an."
- Fair über Eingabearten: Touch, Maus, Tastatur und Reduced-Motion-Besucher dürfen nicht systematisch andere Welten bekommen.

### Weg B — „DU" (frei, typisch ≈ 8 s)

| Zeit | Lenox | Membran | UI |
|---|---|---|---|
| T+0,0 | weicht 10 % zur Seite (Operator-Move, klein) | **Geburt:** die Hairline verdickt sich, zieht einen Bogen, spannt sich zur Rauchglas-Platte auf (Pen #4-Mechanik, #2-Material: dunkles Glas, zwei maskierte Lichtkanten) | — |
| T+0,8 | `listening` | steht; dockt an seiner Seite an (Seitenwahl nach Komposition, Pen #1-Mechanik) | drei **Signatur-Streifen** vertikal: schmale Lichtspalten, je Name + Akzent angedeutet |
| Hover/Focus | **Blick geht auf den Streifen** | Streifen atmet auf (breiter, Akzent tritt vor) | Ein Halbsatz pro Streifen dekodiert klein: „sein Zuhause" / „hell, editorial" / „die Maschine offen" |
| Wahl | `pleased`, ein kurzer Kommentar: **„Mutig. Nehmen wir."** (pro Signatur ein eigener Satz) | Membran kollabiert zurück in die Linie | → Akt IV |

*Reduced Motion: Membran erscheint gefaltet in 0,2 s, Streifen ohne Atem-Animation, Kommentare sofort.*
*Mobile: Membran als Band unter ihm, Streifen horizontal, Touch-Ziele ≥48 px.*

---

## 5. AKT IV — DIE VERWANDLUNG (≈ 7 s, der Signature-Moment der Seite)

**Kein Theme-Fade. Eine sichtbare Operation, in seiner Physik.**

| Zeit | Kamera | Lenox | Raum/Engine | UI |
|---|---|---|---|---|
| T+0,0 | leichter Pull-back (Platz für den Moment) | `acting` | **Kompression:** die freie Materie zieht sich zu ihm — dieselbe bewiesene Wake-Mechanik, invertiert eingesetzt; Spannung sichtbar | bestehende UI-Hairlines ziehen sich zurück (DrawSVG: Linien laufen rückwärts) |
| T+1,2 | hält | ein kinetischer Blitz (cyan) | **Zündung:** ein Impuls ohne Zerstörung — Recoil sichtbar, wie beim Wake | — |
| T+1,6 | statisch (die Front bewegt sich, nicht die Kamera) | Blick folgt der Front | **Scan:** eine Rekonstruktions-Front läuft einmal durch den Raum (TSL: Position vs. Fortschritts-Uniform). Hinter ihr: neue Signatur — Licht, Boden, Nebel, Partikel-Akzent, Materialstimmung. Vor ihr: die alte. Eine Kante, lesbar, ehrlich. | DOM-Tokens schalten synchron zur Front (der Seitentext „durchläuft" die Kante) |
| T+3,5 | Komposition der Signatur | `acting` → baut | Raum steht in neuer Welt | **Der Build läuft in der Signatur** (bestehende Build-Grammatik: Seam, Rail, Decode — nur in neuer Typo/Farbe) |
| T+6,5 | er kommt zurück zu dir | `neutral`, Blick zum Besucher | ruhig, neue Heimat | Seite steht. Membran-Griff klein an ihm: **„FRAG LENOX"** |

**Wiederholbar:** Über den Griff jederzeit re-kalibrieren; die Verwandlung läuft in Kurzform (~4 s) erneut. Wiederholbarkeit macht das Ding zum Spielzeug — Spielzeuge zeigt man Freunden.

*Reduced Motion: keine laufende Front — harter, sauberer Schnitt hinter einem 0,4-s-Blink seiner Augen (er „blinzelt die Welt um"). Gleiches Ergebnis, keine Bewegungslast.*
*Perf-Wächter: Scan ist ein Uniform-Fade pro Material, keine zweite Szene. Budget siehe §0.*

---

## 6. AKT V — DER BEGLEITER (die restliche Seite)

- **Räumliches Fundament:** Canvas fix und vollflächig; Inhalt scrollt als transparente Ebene darüber. Scroll (geglättet) treibt Kamera-Framing und Raum-Uniforms. **Er bleibt immer im Bild** — pro Station ein eigenes Framing (er groß links / klein oben / halbnah — Komposition pro Station festgelegt, nicht ein statischer Split).
- **Stations-Sätze:** Beim Erreichen einer Station sagt er einen Satz auf seiner Hairline (einmal pro Besuch, nicht bei jedem Vorbeiscrollen): EXPERIENCE „Das hast du gerade erlebt." · SYSTEMS „Woraus ich gemacht bin." · WORK „Sieh mir zu." · VOLKAN „Der Mensch dahinter." · CONTACT „Der einzige echte Knopf hier."
- **Cases (WORK):** bestehende Replays, aber in Signatur-Material und mit Kamera-Beteiligung (Push-in bei `acting`, sein Blick trägt die Beats). Disclosure bleibt.
- **CONTACT:** bestehender echter Send. Der Amber-Confirm läuft zusätzlich als Impuls durch den **Raum** (einmalig, kurz) — die einzige Amber-Raumreaktion der Seite.
- **Konsole (V1, ehrlich):** Der Griff öffnet die Membran mit: Re-Kalibrierung (Signaturen) + 3 geskriptete Fragen („Warum dieser Look?" / „Was kannst du für meine Firma tun?" → führt zu CONTACT / „Wer hat dich gebaut?" → VOLKAN). Beschriftet als das, was es ist — keine vorgetäuschte freie Konversation. **Freitext + echtes Sprachverständnis = V2, separate Kosten-Freigabe (LLM).**
- **Outro:** Klammer zum Intro (noth.in-Lehre): am Seitenende kehrt er zentriert zurück, die Signatur-Frage spiegelt sich als Abschieds-Geste: „Ich kann auch anders aussehen — sag's mir." + CTA.

**Mess-Ziele:** Verwandlungs-Fenster ≥ 8 unterscheidbare Frames/10 s · Begleiter-Scroll ≥ 5/10 s · kein Abschnitt der Seite unter 2/10 s bei aktiver Nutzung.

---

## 7. Slice-Plan

**SLICE 1 — „Der goldene Moment" (baubar nach finalem Go):**
Akt II + III + IV mit **OBSIDIAN + ALABASTER** (der härteste Kontrast) und **einer gemeinsamen Verwandlungs-Pipeline für beide Wege** (ChatGPT-Bedingung — keine zwei Architekturen). Priorität der Dramaturgie (Codex-Bedingung): **erst der goldene Pfad unbestreitbar machen** — Spielmessung → LENOX wählt mit Ein-Satz-Begründung → Kompression/Zündung/Scan → Seite in neuer Signatur.
Der **DU-Pfad existiert in Slice 1 nur in Hairline-Minimalform**: zwei Signatur-Worte direkt auf der Linie (kein toter Button, gleiche Pipeline) — **die Signal-Membran mit Streifen ist bewusst NICHT in Slice 1** (Verdünnungs-Schutz). Endzustand: Seite steht in gewählter Signatur; noch kein Griff, kein Scroll-Umbau.
*Abnahme: die drei qualitativen Fragen aus §0 + Volkans Video. Kennzahl nur im Bericht.*

**SLICE 2:** Begleiter-Scroll (Fundament, Präsenzstufen pro Station, Stations-Sätze).
**SLICE 3:** Signal-Membran + Konsole V1 (Streifen-Auswahl, Re-Kalibrierung, geskriptete Fragen) + dritte Signatur *(Name nach Bild)*.
**SLICE 4:** Cases/Contact in Signatur + Amber-Raumimpuls + Outro-Klammer.

Jede Slice einzeln durch dein Video. Keine Slice beginnt, bevor die vorige sichtbar besteht. Wenn der goldene Moment nicht brutal gut aussieht, wird nichts weiteres gebaut (Codex — einverstanden).

**Sound-Vorbereitung (ChatGPT, übernommen ohne Scope):** Die Choreografie-Uhren bekommen benannte Labels an Kompression/Zündung/Scan/Settlement — das sind die späteren Sound-Hooks. Kein Autoplay je, Toggle-Pflicht, Sounddesign erst nach visueller Abnahme als eigenes Experiment.

---

## 8. System-Zuordnung (Ownership, kein Code)

| Gewerk | Besitzt |
|---|---|
| Engine (`flow-engine`) | Kompression/Zündung (Drive), Scan-Uniform + Material-Umstimmung, Raum-Presets pro Signatur, Kamera-Framings, Halo, Amber-Raumimpuls |
| Stage (React/CSS) | Frage-UI, Membran (DOM-Glas), Signatur-Streifen, Token-Sets pro Signatur, Stations-Sätze, Konsole |
| GSAP | alle Choreografie-Uhren (eine Uhr pro Moment, wie bisher), Scroll-Trigger |
| Messung | Spiel-Metriken (Akt I) im Stage-State; deterministisches Mapping |
| Assets | keine neuen Dependencies; Blender/Higgsfield nur falls Slice 1 konkrete Assets braucht (dann einzeln anfragen) |

---

## 8b. Machbarkeits-Check (read-only, 2026-07-14, gegen den echten Code)

Alle Engine-Berührungspunkte der Verwandlung existieren oder sind lokal erweiterbar — **kein Kern-Umbau nötig:**

| Bedarf | Befund |
|---|---|
| Partikel-Kompression | `compressT`-Uniform + Visual-Reads existieren aus der Wake-Mechanik (`particleRenderer.js`) — wird wiederverwendet, nicht neu gebaut |
| Partikel-Tint pro Signatur | `lenoxTintT`-Uniform existiert bereits im Renderer |
| Reflexionswelt pro Signatur | `voidEnvironment.js` ist prozedural (authored bands, DataTexture) — ALABASTER = zweite generierte Textur; die Umschalt-Infrastruktur existiert (`app.js setLenoxEnvironment`, heute A/B void↔HDRI) |
| Boden/Backdrop umstimmen | `lenoxBackdrop.js` ist TSL mit Uniform-Struktur; Farbkonstanten (LACQUER, FLOOR_*) müssen zu Uniforms werden — lokale, überschaubare Änderung in einem Modul |
| Scan-Front | neuer Fortschritts-Uniform, in bestehende TSL-colorNodes gemischt (Position vs. Uniform); DOM-Seite synchron via clip-path, **eine** GSAP-Uhr treibt beides |
| Spielmessung (Akt I) | Pointer läuft bereits durch die Stage (`LenoxExperience.onPointerMove`) — Metriken sind Stage-State, flüchtig |
| DOM-Signaturen | `globals.css` ist vollständig Custom-Property-basiert — Signatur = Token-Set per Attribut |
| Kamera-Framings | Framing-System (`frameFor`, Operator-Move) existiert; Präsenzstufen = neue Framings im bestehenden System |

## 9. Entscheidungsstand

**Entschieden (Berater-Konsens + meine Synthese — Volkan hat Veto):**
1. **Canon-Erweiterung heller Raum: JA** — mit Codex-Leitplanke (§1) und dem Satz: *Lenox selbst bleibt visuell kanonisch; die Welt um ihn darf durch Signaturen vollständig transformieren.*
2. **Namen:** OBSIDIAN + ALABASTER; dritter Name folgt dem Bild.
3. **Frame-Kennzahl:** diagnostisch, nicht Gate (§0).
4. **Sound:** Hooks ja, Design später (§7).

**Offen (nur Volkan):**
5. **Finales Go für Slice 1** nach dieser Rev. 2.
6. **V2-Konversation (LLM):** nach Abnahme von Verwandlung + Membran — Übersetzung freier Sprache in **begrenzte, kuratierte Welt-Parameter** (nie live generierter CSS-/Shader-Code). Kosten-/API-Freigabe dann.

---

*Rev. 2 eingearbeitet: Codex (goldener Pfad zuerst, qualitative Abnahme, ALABASTER-Leitplanke) · ChatGPT (Welt-statt-Seite-Satz, Kalibrierungs-Ethik, Präsenzstufen, eine Pipeline, Sound-Hooks, LLM-Pfad). Abgelehnt/nuanciert: DU-Pfad nicht komplett verschoben (toter Button wäre gebrochen — Minimalform in Slice 1); Frame-Kennzahl nicht gestrichen, sondern zur Diagnose degradiert.*
