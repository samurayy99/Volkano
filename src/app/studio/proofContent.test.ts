import assert from "node:assert/strict";
import { test } from "node:test";
import { PROOF_CONTENT, PROOF_FINDING_IDS, PROOF_PRIORITY_IDS } from "./proofContent.ts";

test("DE and EN expose the same canonical proof facts", () => {
  for (const locale of ["en", "de"] as const) {
    assert.deepEqual(Object.keys(PROOF_CONTENT[locale].findings), [...PROOF_FINDING_IDS]);
    assert.deepEqual(Object.keys(PROOF_CONTENT[locale].priorities), [...PROOF_PRIORITY_IDS]);
    assert.equal(Object.keys(PROOF_CONTENT[locale].decisions).length, 3);
    assert.equal(PROOF_CONTENT[locale].artifact.notes.length, 4);
  }
  assert.deepEqual(
    Object.values(PROOF_CONTENT.en.decisions).map((item) => item.design),
    Object.values(PROOF_CONTENT.de.decisions).map((item) => item.design),
  );
});
