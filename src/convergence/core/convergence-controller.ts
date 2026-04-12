import {
  clampConvergenceProgress,
  resolveConvergencePhase,
} from './convergence-phases';
import type {
  ConvergenceInputSource,
  ConvergenceSnapshot,
} from './convergence-types';

export interface ConvergenceController {
  getSnapshot(): ConvergenceSnapshot;
  subscribe(listener: () => void): () => void;
  setProgress(progress: number, source?: ConvergenceInputSource): void;
}

export interface CreateConvergenceControllerOptions {
  initialProgress?: number;
  initialSource?: ConvergenceInputSource | null;
}

function createSnapshot(
  progress: number,
  inputSource: ConvergenceInputSource | null,
): ConvergenceSnapshot {
  const snapshot: ConvergenceSnapshot = {
    progress: clampConvergenceProgress(progress),
    phase: 'source',
    inputSource,
  };
  snapshot.phase = resolveConvergencePhase(snapshot);
  return snapshot;
}

export function createConvergenceController(
  options: CreateConvergenceControllerOptions = {},
): ConvergenceController {
  let snapshot = createSnapshot(
    options.initialProgress ?? 0,
    options.initialSource ?? null,
  );
  const listeners = new Set<() => void>();

  const emit = () => {
    snapshot = { ...snapshot, phase: resolveConvergencePhase(snapshot) };
    listeners.forEach((listener) => listener());
  };

  return {
    getSnapshot() {
      return snapshot;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    setProgress(progress, source = 'programmatic') {
      snapshot = {
        ...snapshot,
        progress: clampConvergenceProgress(progress),
        inputSource: source,
      };
      emit();
    },
  };
}
