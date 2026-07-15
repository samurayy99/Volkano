import assert from "node:assert/strict";
import { test } from "node:test";
import { CASES, resolveCase } from "./cases.ts";

/**
 * The honesty invariants of THE CASES. These are not style checks — each one
 * is a rule the site's own copy promises the visitor:
 *   – a scripted replay can never fire the amber confirm;
 *   – a dossier row never claims a completed outward send;
 *   – every case discloses what it is;
 *   – a case always hands him back to the visitor at the end.
 */

/** The eight PRIME states. Reactions (laugh/startle/tired/confirm) are NOT here. */
const EMOTIONS = new Set([
  "neutral",
  "curious",
  "pleased",
  "concerned",
  "listening",
  "thinking",
  "speaking",
  "acting",
]);

test("no beat can carry a reaction — amber is unreachable from a script", () => {
  const allowedKeys = new Set([
    "at",
    "emotion",
    "gaze",
    "request",
    "step",
    "field",
    "outcome",
  ]);
  for (const c of CASES) {
    for (const b of c.beats) {
      for (const key of Object.keys(b)) {
        assert.ok(
          allowedKeys.has(key),
          `${c.id}: beat at ${b.at} carries unknown channel "${key}"`,
        );
      }
      if (b.emotion !== undefined) {
        assert.ok(
          EMOTIONS.has(b.emotion),
          `${c.id}: "${b.emotion}" is not a PRIME state — reactions are not scriptable`,
        );
      }
    }
  }
});

test("dossier rows describe prepared artifacts, never completed sends", () => {
  // Past-tense outward actions. If a row needs one of these words, the case
  // is claiming something the replay did not do.
  const outwardClaims =
    /\b(gesendet|versendet|verschickt|aufgeboten|beantwortet|sent|dispatched|notified|answered)\b/i;
  for (const c of CASES) {
    for (const b of c.beats) {
      if (!b.field) continue;
      for (const locale of ["de", "en"] as const) {
        const value = b.field.value[locale];
        assert.ok(
          !outwardClaims.test(value),
          `${c.id}: field "${value}" (${locale}) reads as a completed outward action`,
        );
      }
    }
  }
});

test("every case discloses itself and ends released", () => {
  for (const c of CASES) {
    assert.ok(c.disclosure.de.length > 0 && c.disclosure.en.length > 0);
    assert.ok(
      c.beats.some((b) => b.outcome),
      `${c.id}: a case without an outcome beat never shows its disclosure`,
    );

    const last = c.beats[c.beats.length - 1];
    assert.equal(
      last.emotion,
      "neutral",
      `${c.id}: the final beat must return him to neutral`,
    );
    assert.equal(
      last.gaze,
      "visitor",
      `${c.id}: the final beat must release his eyes to the visitor`,
    );
  }
});

test("beats are sorted and step indices stay in range", () => {
  for (const c of CASES) {
    let prev = -Infinity;
    for (const b of c.beats) {
      assert.ok(b.at >= prev, `${c.id}: beat at ${b.at} is out of order`);
      prev = b.at;
      if (b.step !== undefined) {
        assert.ok(
          b.step >= 0 && b.step < c.steps.length,
          `${c.id}: step index ${b.step} outside the rail`,
        );
      }
    }
  }
});

test("resolveCase picks en for en and falls back to de otherwise", () => {
  const c = CASES[0];
  assert.equal(resolveCase(c, "en").title, c.title.en);
  assert.equal(resolveCase(c, "de").title, c.title.de);
  assert.equal(resolveCase(c, "fr").title, c.title.de);
  assert.equal(resolveCase(c, "it").title, c.title.de);
});
