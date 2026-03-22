import {
  canRevealInterface,
  canRevealProof,
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
  nudgeProgress(delta: number, source?: ConvergenceInputSource): void;
  reset(): void;
  markFreezeSettled(): void;
  markProofReady(): void;
  showProof(): void;
  markProofSettled(): void;
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
    freezeSettled: false,
    proofReady: false,
    proofVisible: false,
    proofSettled: false,
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
    snapshot = {
      ...snapshot,
      phase: resolveConvergencePhase(snapshot),
    };
    listeners.forEach((listener) => listener());
  };

  const resetDerivedState = () => {
    snapshot = {
      ...snapshot,
      freezeSettled: false,
      proofReady: false,
      proofVisible: false,
      proofSettled: false,
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
      if (snapshot.rotationActive || snapshot.rotationComplete) {
        return;
      }

      const nextProgress = clampConvergenceProgress(progress);
      const nextSnapshot = {
        ...snapshot,
        progress: nextProgress,
        inputSource: source,
      };

      snapshot = nextSnapshot;

      if (nextProgress < 100) {
        resetDerivedState();
      }

      emit();
    },

    nudgeProgress(delta, source = 'programmatic') {
      this.setProgress(snapshot.progress + delta, source);
    },

    reset() {
      snapshot = createSnapshot(0, null);
      emit();
    },

    markFreezeSettled() {
      if (snapshot.progress < 100 || snapshot.freezeSettled || snapshot.rotationComplete) {
        return;
      }

      snapshot = {
        ...snapshot,
        freezeSettled: true,
      };
      emit();
    },

    markProofReady() {
      if (!snapshot.freezeSettled || snapshot.proofReady || snapshot.rotationComplete) {
        return;
      }

      snapshot = {
        ...snapshot,
        proofReady: true,
      };
      emit();
    },

    showProof() {
      if (!canRevealProof(snapshot) || snapshot.proofVisible) {
        return;
      }

      snapshot = {
        ...snapshot,
        proofVisible: true,
      };
      emit();
    },

    markProofSettled() {
      if (!snapshot.proofVisible || snapshot.proofSettled) {
        return;
      }

      snapshot = {
        ...snapshot,
        proofSettled: true,
      };
      emit();
    },

    startRotation() {
      if (!canStartRotation(snapshot)) {
        return;
      }

      snapshot = {
        ...snapshot,
        rotationActive: true,
      };
      emit();
    },

    completeRotation() {
      if (!snapshot.rotationActive || snapshot.rotationComplete) {
        return;
      }

      snapshot = {
        ...snapshot,
        rotationActive: false,
        rotationComplete: true,
      };
      emit();
    },

    markHeroLanded() {
      if (!snapshot.rotationComplete || snapshot.heroLanded) {
        return;
      }

      snapshot = {
        ...snapshot,
        heroLanded: true,
      };
      emit();
    },

    markInterfaceActive() {
      if (!canRevealInterface(snapshot) || snapshot.interfaceActive) {
        return;
      }

      snapshot = {
        ...snapshot,
        interfaceActive: true,
      };
      emit();
    },
  };
}
