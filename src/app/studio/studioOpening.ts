import type { ChapterId } from "./experienceState";

export type StudioOpeningScore = {
  tension: number;
  aperture: number;
  camera: number;
  heroExit: number;
  principleEntry: number;
};

const clamp01 = (value: number) =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

export function mapStudioOpening(
  chapter: ChapterId,
  localProgress: number,
  reducedMotion = false,
): StudioOpeningScore {
  const local = clamp01(localProgress);

  if (reducedMotion) {
    const hero = chapter === "hero";
    return {
      tension: 0,
      aperture: 0,
      camera: 0,
      heroExit: hero ? 0 : 1,
      principleEntry: chapter === "principle" ? 1 : 0,
    };
  }

  if (chapter === "hero") {
    return {
      tension: smoothstep(0.2, 0.4, local),
      aperture: smoothstep(0.4, 0.88, local),
      camera: smoothstep(0.68, 0.96, local),
      heroExit: smoothstep(0.72, 1, local),
      principleEntry: 0,
    };
  }

  if (chapter === "principle") {
    return {
      tension: 1 - smoothstep(0.14, 0.18, local),
      aperture: 1,
      camera: 1,
      heroExit: 1,
      principleEntry: smoothstep(0, 0.14, local),
    };
  }

  return {
    tension: 0,
    aperture: 1,
    camera: 1,
    heroExit: 1,
    principleEntry: 1,
  };
}
