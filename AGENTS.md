# AGENTS.md

## Project Identity
This repository is a signature-level, award-caliber interactive website.

The goal is not generic frontend output.
The goal is strong authorship, controlled pacing, precise material language, and world-class technical execution.

## Stack
- Next.js
- Three.js
- TSL
- WebGL / WebGPU-facing renderer work
- custom interaction sequencing
- HTML / CSS / JS / TS

## Core Principles
- Prefer pragmatism over theory.
- Avoid overengineering.
- Protect working states.
- Be honest when a visual pass is unsuccessful.
- World-class beats clever.

## Mandatory Workflow
1. Define the exact target state.
2. Map ownership before editing.
3. Choose one hypothesis.
4. Make the smallest meaningful change.
5. Verify visually.
6. Stop after the pass.

## Hard Rules
- No blind iteration.
- No fake wins.
- No broad speculative patches.
- No color/glow/bloom as camouflage.
- No mixing unrelated concerns in one patch.
- No architecture inflation without necessity.
- Protect pre-enter, play-state, collapse, proof timing, rotation, and working UI unless explicitly targeted.

## WebGL / Renderer Rules
- Distinguish simulation, renderer, staging, camera, and DOM ownership.
- Prefer renderer-first solutions when the issue is visual read.
- Distinguish micro-detail problems from macro-read problems.
- Do not keep applying micro fixes to macro problems.
- If two phases need different visual language, an explicit late render branch is acceptable if fully inert outside its target phase.

## Visual Review Standard
Judge the image, not the effort.
Call out dominant read and worst offending regions.
Use clear language:
- keep
- revert
- not enough
- right direction, weak effect
- wrong lever

## Output Style
Be concise, exact, and direct.
