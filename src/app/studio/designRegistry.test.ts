import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  DEFAULT_DESIGN_ID,
  DESIGN_IDS,
  PUBLIC_DESIGN_IDS,
  buildDesignBootstrapScript,
  getDesign,
  isDesignId,
  migratePersistedExperience,
  normalizeDesignId,
  resolveAvailableDesign,
  writeDesignToUrl,
} from "./designRegistry.ts";

test("design registry is the single ordered source of valid design ids", () => {
  assert.deepEqual(DESIGN_IDS, ["signal", "gravity", "atelier"]);
  assert.equal(DEFAULT_DESIGN_ID, "signal");
  assert.equal(DESIGN_IDS[0], DEFAULT_DESIGN_ID);
  assert.deepEqual(PUBLIC_DESIGN_IDS, ["signal"]);
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

test("every registered design declares availability and all rendering axes", () => {
  for (const id of DESIGN_IDS) {
    const design = getDesign(id);
    assert.ok(design.rendererClass);
    assert.ok(design.availability === "public" || design.availability === "proof");
    assert.ok(design.worldMedia === "film" || design.worldMedia === "none");
    assert.ok(design.lenoxPresence === "full" || design.lenoxPresence === "recessed");
    assert.ok(["off", "field", "character"].includes(design.engineMode));
    assert.equal("engineSignature" in design, true);
  }
  assert.equal(getDesign("signal").engineMode, "off");
  assert.equal(getDesign("signal").availability, "public");
  assert.equal(getDesign("gravity").availability, "proof");
  assert.equal(getDesign("gravity").engineMode, "field");
  assert.equal(getDesign("atelier").engineMode, "off");
  assert.equal(DESIGN_IDS.some((id) => getDesign(id).worldMedia === "film"), false);
});

test("availability is identical before and after hydration", () => {
  assert.equal(resolveAvailableDesign({ requested: "gravity", environment: "production", proofMode: false }), "signal");
  assert.equal(resolveAvailableDesign({ requested: "atelier", environment: "development", proofMode: false }), "signal");
  assert.equal(resolveAvailableDesign({ requested: "reef", environment: "development", proofMode: true }), "gravity");

  const runBootstrap = (environment: "development" | "production", search: string) => {
    const document = { documentElement: { dataset: {} as Record<string, string>, lang: "" } };
    const storage = { getItem: () => null };
    const location = { search };
    Function("sessionStorage", "location", "URLSearchParams", "document", buildDesignBootstrapScript(environment))(
      storage,
      location,
      URLSearchParams,
      document,
    );
    return document.documentElement.dataset.design;
  };
  assert.equal(runBootstrap("production", "?design=gravity"), "signal");
  assert.equal(runBootstrap("development", "?design=gravity&proof=realities"), "gravity");
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
