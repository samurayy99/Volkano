/**
 * The uplink's decision core, framework-free so it can be tested as a table.
 *
 * The component owns faces and phases; this module owns the two things that
 * must never be wrong: which of the three truths a response is (sent /
 * unwired / failed), and that one address can never be transmitted twice
 * concurrently.
 */

export type SendOutcome = "sent" | "unwired" | "failed";

/** Everything `transmit` can report; the extra two are non-events for the UI. */
export type TransmitResult = SendOutcome | "duplicate" | "aborted";

export type SendBody = { ok?: boolean; dev?: boolean } | null;

/** Same validity rule the form has always had — presence, not RFC pedantry. */
export function isValidAddress(raw: string): boolean {
  const address = raw.trim();
  return address.includes("@") && address.length >= 5;
}

/**
 * The gate between an HTTP response and the amber signal. `dev: true` means
 * the environment has no live relay — the send did NOT happen, and reporting
 * it as sent would be the exact fake proof this site argues against.
 */
export function classifySendResult(resOk: boolean, body: SendBody): SendOutcome {
  if (resOk && body?.ok && !body.dev) return "sent";
  if (resOk && body?.ok && body.dev) return "unwired";
  return "failed";
}

/**
 * One transmission at a time. The ref is claimed synchronously — before any
 * await — so a double Enter or a click racing a keypress cannot open two
 * requests: the second caller sees the claim and reports "duplicate".
 */
export async function transmit(
  address: string,
  deps: {
    fetchFn: typeof fetch;
    inFlight: { current: AbortController | null };
  },
): Promise<TransmitResult> {
  if (deps.inFlight.current) return "duplicate";

  const controller = new AbortController();
  deps.inFlight.current = controller;
  try {
    const res = await deps.fetchFn("/api/send-overview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: address }),
      signal: controller.signal,
    });
    const body = (await res.json().catch(() => null)) as SendBody;
    return classifySendResult(res.ok, body);
  } catch {
    return controller.signal.aborted ? "aborted" : "failed";
  } finally {
    if (deps.inFlight.current === controller) deps.inFlight.current = null;
  }
}
