import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  DEFAULT_DESIGN_ID,
  DESIGN_IDS,
  getDesign,
  isDesignId,
  migratePersistedExperience,
  normalizeDesignId,
  writeDesignToUrl,
} from "./designRegistry.ts";

test("design registry is the single ordered source of valid design ids", () => {
  assert.deepEqual(DESIGN_IDS, ["signal", "gravity", "atelier"]);
  assert.equal(DEFAULT_DESIGN_ID, "signal");
  assert.equal(DESIGN_IDS[0], DEFAULT_DESIGN_ID);
  for (const id of DESIGN_IDS) assert.equal(isDesignId(id), true);
  assert.equal(isDesignId("obsidian"), false);
  assert.equal(isDesignId("unknown"), false);
});

test("legacy ids migrate but are never canonical", () => {
  assert.equal(normalizeDesignId("reef"), "gravity");
  assert.equal(normalizeDesignId("gravity"), "gravity");
  assert.equal(normalizeDesignId("unknown"), null);
  assert.equal(isDesignId("reef"), false);

  const url = writeDesignToUrl(
    new URL("https://example.test/?reality=reef&proof=realities"),
    "atelier",
  );
  assert.equal(url.searchParams.get("design"), "atelier");
  assert.equal(url.searchParams.has("reality"), false);
  assert.equal(url.searchParams.get("proof"), "realities");

  const migrated = migratePersistedExperience({ design: "unknown", reality: "reef" });
  assert.equal(migrated.design, "gravity");
});

test("every registered design declares all five rendering axes", () => {
  for (const id of DESIGN_IDS) {
    const design = getDesign(id);
    assert.ok(design.rendererClass);
    assert.ok(design.worldMedia === "film" || design.worldMedia === "none");
    assert.ok(design.lenoxPresence === "full" || design.lenoxPresence === "recessed");
    assert.ok(["off", "field", "character"].includes(design.engineMode));
    assert.equal("engineSignature" in design, true);
  }
  assert.equal(getDesign("signal").engineMode, "off");
  assert.equal(getDesign("gravity").engineMode, "field");
  assert.equal(getDesign("atelier").engineMode, "off");
  assert.equal(DESIGN_IDS.some((id) => getDesign(id).worldMedia === "film"), false);
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
