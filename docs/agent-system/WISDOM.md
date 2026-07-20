# WISDOM — Fables destillierte Lehren (2026-07-18, für lokale Agents)

## Produkt-Wahrheiten
- Die Website IST die AI-Demo; LENOX ist die persistente lebende Oberfläche — nie ins Video backen.
- Drei Ebenen, ein Scroll: Film (hinten) → Live-WebGPU-LENOX (Mitte, transparent) → DOM (vorn).
- Genau EINE Scroll-Autorität (journeyDirector); alles andere ist Ableitung. Kein zweiter Renderer, keine zweite State-Machine.
- Die Welt muss LENOX' Design-DNA tragen (rund, prall, glänzend, Perlmutt) — generisch-schöne Welten fühlen sich fremd an; das war Volkans „Einschlag"-Kriterium.
- Wärme kommt aus Verhalten und Confirm-Momenten, nicht aus aufgemaltem Dauerlächeln.
- Das Finale nie im Hero spoilern — sonst hat die Scroll-Reise kein Ziel.

## Hero-/Keyframe-Pflichten
- Vier Jobs: Materialisierungs-Bühne, Clip-Startframe, Poster/Skip-Ziel, Reduced-Motion-Zustand.
- Helles Wesen vor hellem Licht verliert Kontur — der Kern braucht eine Stufe Tiefe (gold-amber statt weiß).
- Komposition muss ein Vorwärts-Glide FORTSETZEN können (Korridor-Achse, kein geschlossenes Panorama, keine Höhle).
- Silhouetten-Test bei 64–96 px: Kontrast schlägt Zartheit auf Distanz.
- Master-Still = Gesetz des Universums; Hero = ein komponierter Frame darin; können identisch sein, müssen nicht.

## AI-Video-Prompting (Kling/Veo)
- Kamera-Satz ist PFLICHT: „slow continuous forward glide, constant speed/height, never turning/tilting/stopping/pulling back" — ohne ihn improvisiert das Modell Dramatik.
- Lichtkonstanz-Klausel ist PFLICHT: „identical in first and last frame, no shift toward sunset/dusk" — sonst Tag→Dämmerung-Drift (bewiesener Fail).
- Himmelsbeschreibungen werden ZEITLICH gelesen: „violet band with early stars" wird zum Zeitraffer.
- „The world continues far beyond the final frame" macht den Endframe transition-tauglich (kein Ankunfts-Event am Ende).
- Ereignis-Action (Splash, Landung) scrubbt schlecht rückwärts; Kamerafahrt scrubbt gut.
- Feinfiligran kocht/schimmert in i2v; große glatte Formen sind video-stabil. Occlusion = merkmalsarme Frames = tote Grenzframes.
- Negatives beschreibend statt imperativ („fish, text, watermark" statt „no fish") — Veo-Doku-Regel, funktioniert überall.
- Bildmodelle kollabieren „sechs Arme" zu humanoid — explizit bannen: „no torso, no shoulders, no hands, no legs".

## Kling-spezifisch
- v3.0 defaultet auf 4K → Kostenfalle; resolution IMMER explizit setzen.
- `prefer_multi_shots` default TRUE bei v3.0 = versteckte Schnitte; für Scrub-Clips immer false.
- Kling-Clips haben EINEN Keyframe — roh per currentTime unscrubbar; FSV/WebCodecs ist der Shipping-Pfad.
- Produktion nur Image-to-Video aus Stills (ein Universum); Text-to-Video nur zur Look-Findung.
- `tail_image` (v2.5/v2.6, braucht 1080p) steuert aufs Zielbild zu — garantiert aber KEINE Pixel-Identität; Naht deterministisch übers Still lösen.
- Kling-i2i kollabiert Anatomie-Umbauten zu humanoid; `gemini-3-pro-image` (via Kling-CLI) befolgt chirurgische Edit-Anweisungen präzise.
- Detail-Fixes: EDITIEREN, nicht neu würfeln — Regeneration bringt Architektur/Höhlen zurück (zweifach bewiesen).
- Parameter-Fehler kosten nichts (Prüfung vor Abbuchung); Credits-Fehler ebenso.

## Scrub-/Web-Technik
- Seeks seeked-gaten: nächster Seek erst nach Bestätigung — sonst Decode-Stau und Gummiband.
- Event-driven statt rAF-Polling: Progress stößt Seek an, `seeked` kettet den Folge-Seek.
- iOS-Trap: pausiertes, nie gespieltes `<video>` rendert KEINE Frames — `play().then(pause)` in einer User-Geste (WAKE) schaltet frei.
- `requestVideoFrameCallback` = Wahrheit über PRÄSENTIERTE Frames (Latenz messen, Effekte syncen).
- `video.fastSeek()` (Safari) tauscht Präzision gegen Tempo — iPhone-Hebel, ±GOP/2.
- Scroll-Bänder aus echten `section.offsetTop` ableiten, NIE Prozent-Hardcodes — Content-Höhen sind dynamisch („Grenzen kalt, Posen warm").
- `currentTime = duration` wirft Browser auf „ended"/Poster — letzten Moment aussparen.
- Beats sind Dramaturgie, keine Dateien; jede Clip-Naht multipliziert Drift-Risiko; Nähte in helle, bewegungsarme Ruhezonen.
- Vollpage-Screenshots lügen auf fixed/canvas/video-Ebenen — Director Strip (fixe Scroll-Zustände) ist das Abnahme-Instrument.

## Prozess & Team
- Look-Fragen entscheidet Volkans Herz auf SICHTBAREM Material — nie auf Beschreibungen; Gegenvorschläge sofort als Bild liefern.
- Eine Regel zitieren ist kein Argument — der Grund hinter der Regel ist eines (Volkan-Lektion).
- „Allrounder gewinnt Abstimmungen, Einschlag gewinnt Herzen" — beides benennen, Bauch-Frage explizit stellen.
- Zwei unabhängige Rechnungen, ein Ergebnis (Fable+Codex: Himmel statt Wasser) = starkes Signal.
- Eigene Fehler sofort melden (falscher 40-Credit-Lauf wurde nützlicher Bonus); eigene Overclaims selbst korrigieren („pixelidentisch" → deterministische Naht).
- Entscheidungen am selben Tag schriftlich verankern (Contract + CURRENT.md + Memory) — sonst relitigiert die nächste Session.
- Nicht locken um zu locken — aber wenn gelockt, ist es tot; nie als „Default" wiederbeleben.
- Ein Universum: EIN Master gewinnt, kein Mischen zweier Sieger.
- Historische Interaktionsidee, nicht aktiver Produktvertrag: ein bewusstes
  Hold-to-commit kann mehr Gravitas als ein Klick erzeugen. Falls es je zurückkehrt,
  wird es innerhalb der bestehenden State- und Render-Autoritäten gebaut — keine
  zweite State-Machine, kein zweiter rAF und keine per-frame React-Writes.
