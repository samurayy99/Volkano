import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chapterFromHash,
  createInitialExperienceState,
  experienceReducer,
  semanticScrollTarget,
} from "./experienceState.ts";
import { mapScrollToClipProgress } from "./studioTimeline.ts";
import { buildMailtoHref } from "./studioLinks.ts";

const initialExperienceState = createInitialExperienceState("design-01");

test("new and persisted sessions enter the studio directly", () => {
  assert.equal(initialExperienceState.introPhase, "entered");
  const hydrated = experienceReducer(initialExperienceState, {
    type: "HYDRATE",
    state: {
      introPhase: "gate",
      design: "design-02",
      locale: "de",
      activeChapter: "principle",
      localProgress: 0.37,
    },
  });
  assert.equal(hydrated.introPhase, "entered");
  assert.equal(hydrated.design, "design-02");
  assert.equal(hydrated.locale, "de");
  assert.equal(hydrated.activeChapter, "principle");
  assert.equal(hydrated.localProgress, 0.37);
});

test("morph preserves semantic position and interaction state", () => {
  let state = experienceReducer(initialExperienceState, {
    type: "SET_POSITION",
    chapter: "capabilities",
    localProgress: 0.64,
  });
  state = experienceReducer(state, {
    type: "SET_PROJECT_BRIEF",
    brief: {
      ...state.projectBrief,
      open: true,
      message: "A persistent project brief",
    },
  });
  state = experienceReducer(state, { type: "SET_DESIGN", design: "design-02" });

  assert.equal(state.design, "design-02");
  assert.equal(state.activeChapter, "capabilities");
  assert.equal(state.localProgress, 0.64);
  assert.equal(state.projectBrief.open, true);
  assert.equal(state.projectBrief.message, "A persistent project brief");
});

test("semantic restoration maps local progress into a differently sized section", () => {
  assert.equal(semanticScrollTarget(2000, 4000, 1000, 0.5), 3500);
  assert.equal(semanticScrollTarget(2000, 800, 1000, 0.8), 2000);
});

test("only canonical chapter hashes are accepted", () => {
  assert.equal(chapterFromHash("#capabilities"), "capabilities");
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
