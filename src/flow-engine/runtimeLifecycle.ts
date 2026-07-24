import type { RuntimePauseReason, RuntimeState } from "./types";

export type RuntimeLifecycleEffect = "none" | "start" | "stop";

export class RuntimeLifecycleGate {
  state: RuntimeState = "cold";
  private readonly pauseReasons = new Set<RuntimePauseReason>();

  beginInitializing(): void {
    if (this.state === "cold") this.state = "initializing";
  }

  markReady(): RuntimeLifecycleEffect {
    if (this.state !== "initializing") return "none";
    if (this.pauseReasons.size > 0) {
      this.state = "suspended";
      return "none";
    }
    this.state = "running";
    return "start";
  }

  suspend(reason: RuntimePauseReason): RuntimeLifecycleEffect {
    if (this.state === "failed" || this.state === "disposed") return "none";
    this.pauseReasons.add(reason);
    if (this.state !== "running") return "none";
    this.state = "suspended";
    return "stop";
  }

  resume(reason: RuntimePauseReason): RuntimeLifecycleEffect {
    if (this.state === "failed" || this.state === "disposed") return "none";
    this.pauseReasons.delete(reason);
    if (this.state !== "suspended" || this.pauseReasons.size > 0) return "none";
    this.state = "running";
    return "start";
  }

  fail(): RuntimeLifecycleEffect {
    if (this.state === "failed" || this.state === "disposed") return "none";
    const effect = this.state === "running" ? "stop" : "none";
    this.state = "failed";
    this.pauseReasons.clear();
    return effect;
  }

  dispose(): RuntimeLifecycleEffect {
    if (this.state === "disposed") return "none";
    const effect = this.state === "running" ? "stop" : "none";
    this.state = "disposed";
    this.pauseReasons.clear();
    return effect;
  }
}
