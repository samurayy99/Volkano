import {
  canRevealInterface,
  canStartRotation,
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
  markConvergenceSettled(): void;
  startRotation(): void;
  completeRotation(): void;
  markHeroLanded(): void;
  markInterfaceActive(): void;
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
    convergenceSettled: false,
    rotationActive: false,
    rotationComplete: false,
    heroLanded: false,
    interfaceActive: false,
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

  const resetDerivedState = () => {
    snapshot = {
      ...snapshot,
      convergenceSettled: false,
      rotationActive: false,
      rotationComplete: false,
      heroLanded: false,
      interfaceActive: false,
    };
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
      if (snapshot.rotationActive || snapshot.rotationComplete) return;

      snapshot = {
        ...snapshot,
        progress: clampConvergenceProgress(progress),
        inputSource: source,
      };
      if (snapshot.progress < 100) resetDerivedState();
      emit();
    },

    markConvergenceSettled() {
      if (snapshot.progress < 100 || snapshot.convergenceSettled || snapshot.rotationComplete) {
        return;
      }
      snapshot = { ...snapshot, convergenceSettled: true };
      emit();
    },

    startRotation() {
      if (!canStartRotation(snapshot)) return;
      snapshot = { ...snapshot, rotationActive: true };
      emit();
    },

    completeRotation() {
      if (!snapshot.rotationActive || snapshot.rotationComplete) return;
      snapshot = { ...snapshot, rotationActive: false, rotationComplete: true };
      emit();
    },

    markHeroLanded() {
      if (!snapshot.rotationComplete || snapshot.heroLanded) return;
      snapshot = { ...snapshot, heroLanded: true };
      emit();
    },

    markInterfaceActive() {
      if (!canRevealInterface(snapshot) || snapshot.interfaceActive) return;
      snapshot = { ...snapshot, interfaceActive: true };
      emit();
    },
  };
}
