import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  DEFAULT_DESIGN_ID,
  DESIGN_IDS,
  getDesign,
  isDesignId,
} from "./designRegistry.ts";

test("design registry is the single ordered source of valid design ids", () => {
  assert.ok(DESIGN_IDS.length >= 2);
  assert.equal(DESIGN_IDS[0], DEFAULT_DESIGN_ID);
  for (const id of DESIGN_IDS) assert.equal(isDesignId(id), true);
  assert.equal(isDesignId("obsidian"), false);
  assert.equal(isDesignId("unknown"), false);
});

test("every registered design declares all four rendering axes", () => {
  for (const id of DESIGN_IDS) {
    const design = getDesign(id);
    assert.ok(design.rendererClass);
    assert.ok(design.worldMedia === "film" || design.worldMedia === "none");
    assert.ok(design.lenoxPresence === "full" || design.lenoxPresence === "recessed");
    assert.equal("engineSignature" in design, true);
  }
});

test("every registered renderer class exists in the studio stylesheet", () => {
  const stylesheet = readFileSync(
    new URL("./StudioExperience.module.css", import.meta.url),
    "utf8",
  );
  for (const id of DESIGN_IDS) {
    assert.match(stylesheet, new RegExp(`\\.${getDesign(id).rendererClass}\\b`));
  }
});
