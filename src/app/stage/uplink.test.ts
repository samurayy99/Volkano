import assert from "node:assert/strict";
import { test } from "node:test";
import { classifySendResult, isValidAddress, transmit } from "./uplink.ts";

/**
 * The uplink's two load-bearing guarantees, as tables:
 *   – a response maps to exactly one of the three truths, and `dev: true`
 *     can NEVER classify as sent (that classification is the amber gate);
 *   – one address can never be transmitted twice concurrently.
 */

test("classifySendResult: the three truths", () => {
  // Real success — the only path to amber.
  assert.equal(classifySendResult(true, { ok: true }), "sent");
  // The relay is not wired; nothing left the building. Never "sent".
  assert.equal(classifySendResult(true, { ok: true, dev: true }), "unwired");
  // Everything else is an honest failure.
  assert.equal(classifySendResult(true, { ok: false }), "failed");
  assert.equal(classifySendResult(true, null), "failed");
  assert.equal(classifySendResult(true, {}), "failed");
  assert.equal(classifySendResult(false, { ok: true }), "failed");
  assert.equal(classifySendResult(false, null), "failed");
});

test("isValidAddress: presence, not pedantry", () => {
  assert.equal(isValidAddress("a@b.c"), true);
  assert.equal(isValidAddress("  name@firma.ch  "), true);
  assert.equal(isValidAddress("a@b"), false); // too short
  assert.equal(isValidAddress("hello"), false); // no @
  assert.equal(isValidAddress(""), false);
  assert.equal(isValidAddress("     "), false);
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

test("transmit: maps the route's answers", async () => {
  for (const [body, expected] of [
    [{ ok: true, id: "re_1" }, "sent"],
    [{ ok: true, dev: true }, "unwired"],
  ] as const) {
    const inFlight = { current: null };
    const outcome = await transmit("a@b.ch", {
      fetchFn: async () => jsonResponse(body),
      inFlight,
    });
    assert.equal(outcome, expected);
    assert.equal(inFlight.current, null, "claim must be released");
  }

  const inFlight = { current: null };
  assert.equal(
    await transmit("a@b.ch", {
      fetchFn: async () => jsonResponse({ error: "boom" }, 500),
      inFlight,
    }),
    "failed",
  );
  assert.equal(
    await transmit("a@b.ch", {
      fetchFn: async () => {
        throw new TypeError("network down");
      },
      inFlight,
    }),
    "failed",
  );
  // A 200 with an unparsable body is still not a send.
  assert.equal(
    await transmit("a@b.ch", {
      fetchFn: async () => new Response("not json", { status: 200 }),
      inFlight,
    }),
    "failed",
  );
});

test("transmit: a second concurrent submission is a duplicate, not a send", async () => {
  const inFlight: { current: AbortController | null } = { current: null };
  let calls = 0;
  const slowFetch = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 40));
    return jsonResponse({ ok: true, id: "re_once" });
  };

  // Both fired in the same tick — the race the form's double Enter produces.
  const [first, second] = await Promise.all([
    transmit("a@b.ch", { fetchFn: slowFetch, inFlight }),
    transmit("a@b.ch", { fetchFn: slowFetch, inFlight }),
  ]);

  assert.equal(first, "sent");
  assert.equal(second, "duplicate");
  assert.equal(calls, 1, "exactly one request may leave");
  assert.equal(inFlight.current, null, "claim must be released afterwards");

  // After settling, the address may be transmitted again (retry is allowed).
  assert.equal(
    await transmit("a@b.ch", { fetchFn: slowFetch, inFlight }),
    "sent",
  );
  assert.equal(calls, 2);
});

test("transmit: an aborted request reports aborted, never failed", async () => {
  const inFlight: { current: AbortController | null } = { current: null };
  const outcomePromise = transmit("a@b.ch", {
    fetchFn: (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      }),
    inFlight,
  });
  // The unmount path: the component aborts whatever is in flight.
  inFlight.current?.abort();
  assert.equal(await outcomePromise, "aborted");
  assert.equal(inFlight.current, null);
});
