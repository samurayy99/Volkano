import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  chapterFromHash,
  createInitialExperienceState,
  experienceReducer,
  serializeExperienceState,
  semanticScrollTarget,
} from "./experienceState.ts";
import { migratePersistedExperience } from "./designRegistry.ts";
import { mapScrollToClipProgress } from "./studioTimeline.ts";
import { buildMailtoHref } from "./studioLinks.ts";

const initialExperienceState = createInitialExperienceState("signal");

test("morph preserves semantic position and interaction state", () => {
  let state = experienceReducer(initialExperienceState, {
    type: "SET_POSITION",
    chapter: "work",
    localProgress: 0.64,
  });
  state = experienceReducer(state, {
    type: "SELECT_CASE",
    selectedCase: "klein-paris",
  });
  state = experienceReducer(state, { type: "SET_LOCALE", locale: "de" });
  state = experienceReducer(state, {
    type: "SET_AUDIT",
    audit: { phase: "complete", url: "https://example.ch" },
  });
  state = experienceReducer(state, {
    type: "SET_PROJECT_BRIEF",
    brief: {
      ...state.projectBrief,
      open: true,
      message: "A persistent project brief",
    },
  });
  state = experienceReducer(state, {
    type: "SET_PROOF_SLICE",
    proofSlice: {
      input: "example.ch",
      analysisOpen: true,
      analysisResult: { fixtureId: "reality-proof-v1" },
    },
  });
  for (const design of ["gravity", "atelier", "signal"] as const) {
    state = experienceReducer(state, { type: "SET_DESIGN", design });
    assert.equal(state.design, design);
    assert.equal(state.locale, "de");
    assert.equal(state.activeChapter, "work");
    assert.equal(state.localProgress, 0.64);
    assert.equal(state.selectedCase, "klein-paris");
    assert.equal(state.audit.url, "https://example.ch");
    assert.equal(state.projectBrief.open, true);
    assert.equal(state.projectBrief.message, "A persistent project brief");
    assert.equal(state.proofSlice.input, "example.ch");
    assert.equal(state.proofSlice.analysisOpen, true);
    assert.equal(state.proofSlice.analysisResult?.fixtureId, "reality-proof-v1");
  }
});

test("v1 sessions migrate shared state without rewriting the historical intro phase", () => {
  const migrated = migratePersistedExperience({
    design: "reef",
    locale: "de",
    introPhase: "gate",
    activeChapter: "ai-systems",
    localProgress: 0.42,
    selectedCase: "klein-paris",
    projectBrief: {
      open: true,
      name: "Volkan",
      email: "",
      company: "VOLKAN AI STUDIO",
      message: "Keep this brief",
    },
  });

  assert.equal(migrated.design, "gravity");
  assert.equal("introPhase" in migrated, false);
  assert.equal(migrated.locale, "de");
  assert.equal(migrated.activeChapter, "ai-systems");
  assert.equal(migrated.localProgress, 0.42);
  assert.equal(migrated.selectedCase, "klein-paris");
  assert.equal(migrated.projectBrief?.message, "Keep this brief");
});

test("v2 persistence omits route-local intro state", () => {
  const state = { ...initialExperienceState, introPhase: "gate" as const };
  const persisted = serializeExperienceState(state);
  assert.equal("introPhase" in persisted, false);
  assert.equal(persisted.design, "signal");
  assert.equal(persisted.proofSlice.analysisResult?.fixtureId, "reality-proof-v1");
});

test("provider never deletes the historical v1 session", () => {
  const provider = readFileSync(new URL("./ExperienceProvider.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(provider, /removeItem\(LEGACY_STORAGE_KEY\)/);
});

test("invalid persisted ids fall back to the SIGNAL initial state", () => {
  const migrated = migratePersistedExperience({ design: "unknown", introPhase: "arrival" });
  const state = experienceReducer(initialExperienceState, { type: "HYDRATE", state: migrated });
  assert.equal(state.design, "signal");
  assert.equal(state.introPhase, "entered");
});

test("semantic restoration maps local progress into a differently sized section", () => {
  assert.equal(semanticScrollTarget(2000, 4000, 1000, 0.5), 3500);
  assert.equal(semanticScrollTarget(2000, 800, 1000, 0.8), 2000);
});

test("only canonical chapter hashes are accepted", () => {
  assert.equal(chapterFromHash("#ai-systems"), "ai-systems");
  assert.equal(chapterFromHash("#unknown"), null);
});

test("audit state remains deterministic and contains no scan payload", () => {
  const state = experienceReducer(initialExperienceState, {
    type: "SET_AUDIT",
    audit: { phase: "complete", url: "example.com" },
  });
  assert.deepEqual(state.audit, { phase: "complete", url: "example.com" });
});

test("film progress follows a measured semantic boundary", () => {
  assert.equal(mapScrollToClipProgress(0, 4000), 0);
  assert.equal(mapScrollToClipProgress(2000, 4000), 0.5);
  assert.equal(mapScrollToClipProgress(5000, 4000), 1);
});

test("mailto bodies use percent encoding instead of form-style plus signs", () => {
  const href = buildMailtoHref("hello@example.com", "Project inquiry", "Hello world\nSecond line");
  assert.match(href, /subject=Project%20inquiry/);
  assert.match(href, /body=Hello%20world%0ASecond%20line/);
  assert.equal(href.includes("+"), false);
});
