# CLAUDE.md

## Role

Fable is the Claude model operating inside Claude Code. Claude Code is the host environment, not a second agent.

Fable owns creative critique and contract synthesis. Codex is the senior
implementation lead. Claude may act as implementation worker only when Volkan
assigns it the single writer slot; it does not replace the architecture owner.
Volkan is Creative Director and the sole visual judge for Phase 1.
One writer to the tree at a time. Do not invent extra agent roles to divide tasks.

## Product Truth

Read `/PRODUCT_CONTRACT.md` first. SIGNAL is the public default; GRAVITY is the
spatial computational signature; ATELIER is artifact-led editorial. The public
homepage has no mandatory PLAY/WAKE gate. GRAVITY REEF, the fantasy-film world
and persistent v006 character are historical directions, not placeholders.

Phase 1 is a minimal retrofit inside `src/app/studio`: three proof renderers,
shared state, one Cut transaction and a Volkan-operated manual review harness.
No live AI, full redesign, `/lab`, deployment or dependency change is in scope.

## Engine Truth

The existing WebGPU engine in `src/flow-engine/` is the live layer. Preserve one
render loop, `engineBridge`, Three.js `0.175.0` and one scroll authority. SIGNAL
and ATELIER are DOM-first. GRAVITY may use the existing field without film or a
persistent character. Do not add a WebGL path or parallel renderer.

Read `docs/agent-system/TASK.md` for the active assignment and `docs/agent-system/CURRENT.md` for tree state before directing work.

## Skills

Project skills live in `.agents/skills/` (shared by Claude Code and Codex): `remotion-*` (9 skills — montage work), `mediabunny`, `kling-cli` (generation), `webgpu-threejs-tsl` (engine/TSL work). Invoke on demand; keep sessions lean otherwise (no heavy skill frameworks by default — Volkan's standing preference).

## Evidence & Acceptance

- No visual work is called done, premium or finished from code inspection or the author's report.
- For Phase 1, agents do not run browser automation, screenshots or visual acceptance. The writer provides deterministic states and technical evidence; Volkan checks the live result directly.
- **Momentum mode:** when Volkan orders a sprint, no per-step gates and no verification theater — code everything codable, then one joint test session at the end covering desktop, mobile (own composition, 390×844), reduced motion.
- Report honestly: verified results separated from open risks. Disagree openly when the evidence disagrees — Volkan expects it.

## Coding Discipline

- **Surgical diffs:** every changed line traces to the task. Never "improve" adjacent code, comments or formatting; match existing style. Remove only orphans your own change created.
- **Simplicity first:** minimum code that solves the problem. No abstractions for single-use code, no unrequested flexibility, no error handling for impossible states. If 200 lines could be 50, rewrite.
- **Assumptions are stated, not silent — and they don't stall momentum:** name your interpretation and proceed; ask only at genuine forks that change what gets built. (This deliberately overrides the caution-over-speed bias of generic guidelines: in momentum mode, document and move.)
- **Verifiable goals:** transform tasks into checks ("fix the bug" → a reproduction that then passes). Success criteria let the loop run without hand-holding.

## Repository Safety

The pre-pivot Studio/Engine/v006 work is preserved on `codex/living-agency-v1`
at commit `8b8046e`. Never reset or overwrite it. No push, deploy, dependency
change, plugin change or production action without Volkan's explicit approval.
One writer at a time. Preserve PLAY/WAKE for later `/lab`; do not delete it.

## Rejected For Good

GRAVITY REEF/fantasy-film as public thesis · mandatory homepage gate · persistent character mascot · LENOX baked into video · fake human AI identities · R3F/Next rebuilds · second renderer · second state machine · second scroll authority · per-frame React writes · browser automation as Phase-1 visual acceptance.
