import { getSourceInteractive } from "../core/convergence-selectors";
import type { ConvergenceSnapshot } from "../core/convergence-types";
import type { FlowEngineApi } from "../../flow-engine/types";

export interface ConvergenceEngineBridge {
  sync(snapshot: ConvergenceSnapshot): void;
}

export function createConvergenceEngineBridge(engine: FlowEngineApi): ConvergenceEngineBridge {
  return {
    sync(snapshot) {
      engine.setConvergenceProgress(snapshot.progress);
      engine.setInteractiveEnabled(getSourceInteractive(snapshot));
    },
  };
}
