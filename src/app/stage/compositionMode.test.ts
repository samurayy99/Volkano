import assert from "node:assert/strict";
import { test } from "node:test";
import { modeFor } from "./compositionMode.ts";

/**
 * The composition rule is one pure function, and it is the single thing standing
 * between a visitor and a navigation rail drawn across a face. So it gets a table.
 *
 * The regression that made this file necessary: an earlier rule required
 * `width >= 720` before it would go sideways. A 568x320 phone failed that test,
 * fell into BANDED, and the banded geometry then claimed a 48px system bar plus a
 * 240px minimum stage out of 320px of screen — leaving 32px of workspace. The rule
 * was protecting a number instead of the visitor. The last three rows are that bug.
 */
const CASES: Array<[string, number, number, "side" | "banded"]> = [
  // Desktop and laptop — room on both axes.
  ["desktop 1440x900", 1440, 900, "side"],
  ["laptop 1280x800", 1280, 800, "side"],
  ["tall desktop window 1000x900", 1000, 900, "side"],

  // Phone portrait — the horizontal axis does not exist.
  ["iPhone 15 390x844", 390, 844, "banded"],
  ["iPhone 15 Pro Max 430x932", 430, 932, "banded"],
  ["iPhone SE 320x568", 320, 568, "banded"],

  // Tablet — portrait bands (a left third of 768 is 256px), landscape does not.
  ["iPad portrait 768x1024", 768, 1024, "banded"],
  ["iPad landscape 1024x768", 1024, 768, "side"],

  // Big portrait tablets pass both SIZE gates. Shape is what disqualifies them.
  ["iPad Pro portrait 1024x1366", 1024, 1366, "banded"],
  ["large portrait 900x1200", 900, 1200, "banded"],

  // Phone landscape — width is the axis with room. Banding here is destructive.
  ["iPhone 15 landscape 844x390", 844, 390, "side"],
  ["iPhone 8+ landscape 736x414", 736, 414, "side"],
  ["iPhone 8 landscape 667x375", 667, 375, "side"],
  ["iPhone SE landscape 568x320", 568, 320, "side"],
];

test("modeFor picks the axis with room to spare", () => {
  for (const [name, w, h, expected] of CASES) {
    assert.equal(modeFor(w, h), expected, `${name} (${w}x${h})`);
  }
});

/**
 * The invariant behind the table: BANDED must never be chosen where banding cannot
 * physically fit. The banded contract reserves a system bar (min 48px) and a stage
 * (min 240px) before the workspace gets anything at all.
 */
test("banded is never chosen where the bands cannot fit", () => {
  const MIN_BAR = 48;
  const MIN_STAGE = 240;
  const MIN_WORKSPACE = 200; // a heading, a rail and one module: less is a joke.

  for (let h = 300; h <= 1200; h += 4) {
    for (let w = 300; w <= 1400; w += 4) {
      if (modeFor(w, h) !== "banded") continue;
      const workspace = h - MIN_BAR - MIN_STAGE;
      assert.ok(
        workspace >= MIN_WORKSPACE,
        `banded at ${w}x${h} leaves only ${workspace}px of workspace`,
      );
    }
  }
});
