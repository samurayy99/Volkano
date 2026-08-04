import assert from "node:assert/strict";
import { test } from "node:test";
import { mapAllotropFormation } from "./allotropScore.ts";

test("Gate 4 Hero transport remains unchanged", () => {
  assert.deepEqual(mapAllotropFormation("hero", 0, "side"), {
    from: "principle.fullerene",
    to: "principle.continuum",
    progress: 0,
    phase: "hold",
    corridor: "wide",
  });
  const middle = mapAllotropFormation("hero", 0.57, "side");
  assert.equal(middle.from, "principle.fullerene");
  assert.equal(middle.to, "principle.continuum");
  assert.equal(middle.phase, "morph");
  assert.ok(Math.abs(middle.progress - 0.5) < 1e-9);
  assert.equal(mapAllotropFormation("hero", 0.88, "side").progress, 1);
});

test("Gate 5 preloads Continuum to TRI-AXIS before Principle motion", () => {
  const start = mapAllotropFormation("principle", 0, "side");
  assert.deepEqual(start, {
    from: "principle.continuum",
    to: "capability.triaxis",
    progress: 0,
    phase: "hold",
    corridor: "wide",
  });
  assert.deepEqual(mapAllotropFormation("principle", 0.27, "banded"), start);
});

test("Principle owns one reversible Continuum to TRI-AXIS transport", () => {
  const middle = mapAllotropFormation("principle", 0.57, "side");
  assert.equal(middle.from, "principle.continuum");
  assert.equal(middle.to, "capability.triaxis");
  assert.equal(middle.phase, "morph");
  assert.ok(Math.abs(middle.progress - 0.5) < 1e-9);
  assert.deepEqual(mapAllotropFormation("principle", 0.86, "side"), {
    from: "principle.continuum",
    to: "capability.triaxis",
    progress: 1,
    phase: "hold",
    corridor: "wide",
  });
});

test("Gate 6 preloads TRI-AXIS to VECTOR LOOM while Capabilities remain readable", () => {
  assert.deepEqual(mapAllotropFormation("capabilities", 0.4, "side"), {
    from: "capability.triaxis",
    to: "lenox.vectorLoom",
    progress: 0,
    phase: "hold",
    corridor: "narrow",
  });
});

test("Capabilities owns one reversible TRI-AXIS to VECTOR LOOM transport", () => {
  const middle = mapAllotropFormation("capabilities", 0.84, "side");
  assert.equal(middle.from, "capability.triaxis");
  assert.equal(middle.to, "lenox.vectorLoom");
  assert.equal(middle.phase, "morph");
  assert.ok(Math.abs(middle.progress - 0.5) < 1e-9);
  assert.deepEqual(mapAllotropFormation("capabilities", 0.96, "side"), {
    from: "capability.triaxis",
    to: "lenox.vectorLoom",
    progress: 1,
    phase: "hold",
    corridor: "narrow",
  });
});

test("Gate 7 preloads VECTOR LOOM to FORWARD VECTOR while LENOX remains readable", () => {
  assert.deepEqual(mapAllotropFormation("lenox", 0.58, "side"), {
    from: "lenox.vectorLoom",
    to: "contact.forwardVector",
    progress: 0,
    phase: "hold",
    corridor: "right",
  });
});

test("LENOX owns one reversible VECTOR LOOM to FORWARD VECTOR transport", () => {
  const middle = mapAllotropFormation("lenox", 0.81, "side");
  assert.equal(middle.from, "lenox.vectorLoom");
  assert.equal(middle.to, "contact.forwardVector");
  assert.equal(middle.phase, "morph");
  assert.ok(Math.abs(middle.progress - 0.5) < 1e-9);
  assert.deepEqual(mapAllotropFormation("lenox", 0.94, "side"), {
    from: "lenox.vectorLoom",
    to: "contact.forwardVector",
    progress: 1,
    phase: "hold",
    corridor: "right",
  });
});

test("Contact receives the resolved FORWARD VECTOR pair without a visual reset", () => {
  assert.deepEqual(mapAllotropFormation("contact", 0.63, "side"), {
    from: "lenox.vectorLoom",
    to: "contact.forwardVector",
    progress: 1,
    phase: "hold",
    corridor: "narrow",
  });
});

test("reduced motion resolves one static authored target per chapter", () => {
  assert.equal(mapAllotropFormation("hero", 0.7, "banded", true).from, "principle.fullerene");
  assert.equal(mapAllotropFormation("principle", 0.7, "side", true).from, "principle.continuum");
  assert.equal(mapAllotropFormation("capabilities", 0.2, "side", true).from, "capability.triaxis");
  assert.deepEqual(mapAllotropFormation("lenox", 0.8, "side", true), {
    from: "lenox.vectorLoom",
    to: "contact.forwardVector",
    progress: 0,
    phase: "hold",
    corridor: "right",
  });
  assert.deepEqual(mapAllotropFormation("contact", 0.8, "side", true), {
    from: "lenox.vectorLoom",
    to: "contact.forwardVector",
    progress: 1,
    phase: "hold",
    corridor: "narrow",
  });
});

test("score clamps input, is deterministic in reverse and never exposes graphite", () => {
  assert.deepEqual(mapAllotropFormation("principle", -4, "side"), mapAllotropFormation("principle", 0, "side"));
  assert.deepEqual(mapAllotropFormation("principle", 8, "side"), mapAllotropFormation("principle", 1, "side"));
  const forward = mapAllotropFormation("principle", 0.61, "side");
  mapAllotropFormation("contact", 0.9, "banded");
  assert.deepEqual(mapAllotropFormation("principle", 0.61, "side"), forward);
  for (const chapter of ["hero", "principle", "capabilities", "lenox", "contact"] as const) {
    const drive = mapAllotropFormation(chapter, 0.73, "side");
    assert.equal(`${drive.from}:${drive.to}`.includes("graphite"), false);
  }
});
