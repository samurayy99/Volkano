type RecordingPhase = "ambient" | "lenox";

type RecordingFocus = {
  anisotropy: number;
  focusOffset: [number, number];
  arcCompleteness: number;
  densityFalloff: number;
  direction: number;
  asymmetry: number;
  phaseLag: number;
};

export type PhaseFieldRecordingVariant =
  | "default"
  | "tri-noise"
  | "flat"
  | "shard";

export type PhaseFieldRecordingBeat =
  | "ambient-hold"
  | "slow-pointer"
  | "fast-directions"
  | "stationary-pointer"
  | "ambient-recovery";

export type PhaseFieldRecordingSample = {
  beat: PhaseFieldRecordingBeat;
  phase: RecordingPhase;
  pointer: { x: number; y: number } | null;
};

export const PHASE_FIELD_RECORDING = {
  width: 1280,
  height: 720,
  dpr: 1,
  fps: 60,
  durationMs: 60_000,
  warmupMs: 3_000,
  substance: "pearl",
  environment: "studio",
  environmentRotation: 0,
  environmentIntensity: 1,
  tier: "low",
  particles: 4_096,
  material: { size: 0.68, roughness: 0.3, metalness: 0.85 },
  focus: {
    anisotropy: 2.35,
    focusOffset: [3.4, -1.8],
    arcCompleteness: 0.34,
    densityFalloff: 1.9,
    direction: -0.42,
    asymmetry: 0.63,
    phaseLag: 0.35,
  } satisfies RecordingFocus,
  coherence: 0.34,
  coherenceDebug: false,
  coherenceMotion: true,
} as const;

export const PHASE_FIELD_RECORDING_FILES: Record<
  PhaseFieldRecordingVariant,
  string
> = {
  default: "phase-field-a1-default-billboard-curl-coherence-studio.capture.webm",
  "tri-noise": "phase-field-a1-control-1-tri-noise.capture.webm",
  flat: "phase-field-a1-control-2-flat-material.capture.webm",
  shard: "phase-field-a1-control-3-shard-primitive.capture.webm",
};

export const parsePhaseFieldRecordingVariant = (
  value: string | null,
): PhaseFieldRecordingVariant | null => {
  if (
    value === "default" ||
    value === "tri-noise" ||
    value === "flat" ||
    value === "shard"
  ) {
    return value;
  }
  return null;
};

export const phaseFieldRecordingPreset = (
  variant: PhaseFieldRecordingVariant,
) => ({
  ...PHASE_FIELD_RECORDING,
  phase: "scripted ambient → lenox → ambient" as const,
  primitive: variant === "shard" ? ("shard" as const) : ("billboard" as const),
  curl: variant !== "tri-noise",
  coherenceMaterial: variant !== "flat",
});

const SLOW_START = 5_000;
const FAST_START = 13_000;
const STATIONARY_START = 19_000;
const RECOVERY_START = 44_000;

const FAST_POINTS = [
  { x: 0.7, y: 0.41 },
  { x: 0.38, y: 0.3 },
  { x: 0.75, y: 0.62 },
  { x: 0.3, y: 0.65 },
  { x: 0.68, y: 0.28 },
  { x: 0.44, y: 0.52 },
  { x: 0.62, y: 0.46 },
] as const;

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * One time-based pointer path for all four recordings. Coordinates are
 * normalised viewport fractions; the host converts them to client pixels and
 * sends them through FlowEngineBridge.setPointer(), which remains the sole
 * screen-to-ray projection.
 */
export function samplePhaseFieldRecording(
  elapsedMs: number,
): PhaseFieldRecordingSample {
  const t = Math.max(0, Math.min(PHASE_FIELD_RECORDING.durationMs, elapsedMs));

  if (t < SLOW_START) {
    return { beat: "ambient-hold", phase: "ambient", pointer: null };
  }

  if (t < FAST_START) {
    const u = (t - SLOW_START) / (FAST_START - SLOW_START);
    return {
      beat: "slow-pointer",
      phase: "lenox",
      pointer: {
        x: mix(0.32, 0.7, u),
        y: mix(0.55, 0.41, u) + Math.sin(u * Math.PI * 2) * 0.05,
      },
    };
  }

  if (t < STATIONARY_START) {
    const segmentMs = (STATIONARY_START - FAST_START) / (FAST_POINTS.length - 1);
    const progress = (t - FAST_START) / segmentMs;
    const index = Math.min(FAST_POINTS.length - 2, Math.floor(progress));
    const local = progress - index;
    const from = FAST_POINTS[index];
    const to = FAST_POINTS[index + 1];
    return {
      beat: "fast-directions",
      phase: "lenox",
      pointer: { x: mix(from.x, to.x, local), y: mix(from.y, to.y, local) },
    };
  }

  if (t < RECOVERY_START) {
    return {
      beat: "stationary-pointer",
      phase: "lenox",
      pointer: { ...FAST_POINTS.at(-1)! },
    };
  }

  return { beat: "ambient-recovery", phase: "ambient", pointer: null };
}
