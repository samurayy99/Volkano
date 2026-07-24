import type { DesignId } from "./designRegistry";

export function selectVisualBase(
  source: DesignId,
  target: DesignId,
  progress: number,
): DesignId {
  return progress >= 0.5 ? target : source;
}

export function isCurrentMorphToken(token: number, currentToken: number): boolean {
  return token === currentToken;
}
