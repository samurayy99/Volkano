'use client';

import type { ConvergenceController } from '../core/convergence-controller';
import { useConvergenceTimeline } from './useConvergenceTimeline';

export interface ConvergenceTriggerProps {
  controller: ConvergenceController;
  visible?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export function ConvergenceTrigger({
  controller,
  visible = true,
  disabled = false,
  style,
}: ConvergenceTriggerProps) {
  const { hasTriggered, start } = useConvergenceTimeline(controller);
  const locked = disabled || hasTriggered || !visible;

  return (
    <div
      className={`convergence-trigger${visible && !hasTriggered ? ' is-visible' : ''}${locked ? ' is-locked' : ''}${hasTriggered ? ' is-running' : ''}`}
      aria-hidden={locked ? true : undefined}
      style={style}
    >
      <button
        className="convergence-trigger__button"
        type="button"
        disabled={locked}
        aria-label="Enter"
        tabIndex={locked ? -1 : 0}
        onClick={start}
      >
        <span className="convergence-trigger__ring" />
        <span className="convergence-trigger__surface">
          <span className="convergence-trigger__heat" />
          <span className="convergence-trigger__label">ENTER</span>
        </span>
      </button>
    </div>
  );
}
