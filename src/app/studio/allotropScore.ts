import type { ChapterId } from "./experienceState";
import type {
  CompositionMode,
  FormationDrive,
  FormationId,
  MatterCorridorId,
} from "../../flow-engine/types";

const clamp01 = (value: number) =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

const smoothstep01 = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const CHAPTER_CORRIDOR: Readonly<Record<ChapterId, MatterCorridorId>> = {
  hero: "wide",
  principle: "wide",
  capabilities: "narrow",
  lenox: "right",
  contact: "narrow",
};
const holdPair = (
  from: FormationId,
  to: FormationId,
  progress: 0 | 1,
  corridor: MatterCorridorId,
): FormationDrive => ({ from, to, progress, phase: "hold", corridor });
const morph = (
  from: FormationId,
  to: FormationId,
  local: number,
  start: number,
  end: number,
  corridor: MatterCorridorId,
): FormationDrive => ({
  from,
  to,
  progress: smoothstep01((local - start) / Math.max(end - start, Number.EPSILON)),
  phase: "morph",
  corridor,
});

/** Gate 7 carries the authored transport system through LENOX. */
export function mapAllotropFormation(
  chapter: ChapterId,
  localProgress: number,
  mode: CompositionMode,
  reducedMotion = false,
): FormationDrive {
  const local = clamp01(localProgress);
  const corridor = CHAPTER_CORRIDOR[chapter];
  void mode;

  if (reducedMotion) {
    if (chapter === "hero") {
      return holdPair("principle.fullerene", "principle.continuum", 0, corridor);
    }
    if (chapter === "principle") {
      return holdPair("principle.continuum", "capability.triaxis", 0, corridor);
    }
    if (chapter === "capabilities") {
      return holdPair("capability.triaxis", "lenox.vectorLoom", 0, corridor);
    }
    if (chapter === "lenox") {
      return holdPair("lenox.vectorLoom", "contact.forwardVector", 0, corridor);
    }
    return holdPair("lenox.vectorLoom", "contact.forwardVector", 1, corridor);
  }
  if (chapter === "hero") {
    if (local < 0.26) {
      return holdPair("principle.fullerene", "principle.continuum", 0, corridor);
    }
    if (local < 0.88) {
      return morph(
        "principle.fullerene",
        "principle.continuum",
        local,
        0.26,
        0.88,
        corridor,
      );
    }
    return holdPair("principle.fullerene", "principle.continuum", 1, corridor);
  }

  if (chapter === "principle") {
    if (local < 0.28) {
      return holdPair("principle.continuum", "capability.triaxis", 0, corridor);
    }
    if (local < 0.86) {
      return morph(
        "principle.continuum",
        "capability.triaxis",
        local,
        0.28,
        0.86,
        corridor,
      );
    }
    return holdPair("principle.continuum", "capability.triaxis", 1, corridor);
  }

  if (chapter === "capabilities") {
    if (local < 0.72) {
      return holdPair("capability.triaxis", "lenox.vectorLoom", 0, corridor);
    }
    if (local < 0.96) {
      return morph(
        "capability.triaxis",
        "lenox.vectorLoom",
        local,
        0.72,
        0.96,
        corridor,
      );
    }
    return holdPair("capability.triaxis", "lenox.vectorLoom", 1, corridor);
  }

  if (chapter === "lenox") {
    if (local < 0.68) {
      return holdPair("lenox.vectorLoom", "contact.forwardVector", 0, corridor);
    }
    if (local < 0.94) {
      return morph(
        "lenox.vectorLoom",
        "contact.forwardVector",
        local,
        0.68,
        0.94,
        corridor,
      );
    }
    return holdPair("lenox.vectorLoom", "contact.forwardVector", 1, corridor);
  }

  return holdPair("lenox.vectorLoom", "contact.forwardVector", 1, corridor);
}
