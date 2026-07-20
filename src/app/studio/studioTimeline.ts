const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function mapScrollToClipProgress(scrollTop: number, clipEndTop: number): number {
  return clamp01(scrollTop / Math.max(clipEndTop, 1));
}
