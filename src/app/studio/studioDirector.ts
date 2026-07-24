import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { ChapterId } from "./experienceState";
import { semanticScrollTarget } from "./experienceState";
import { mapScrollToClipProgress } from "./studioTimeline";
import type { StationPose } from "../stage/stations";

export type StudioStation = {
  id: ChapterId;
  pose: { side: StationPose; banded: StationPose };
};

export type SemanticPosition = {
  chapter: ChapterId;
  localProgress: number;
};

export type StudioDirector = {
  destroy: () => void;
  getPosition: () => SemanticPosition;
  restore: (position: SemanticPosition) => void;
  scrollToChapter: (chapter: ChapterId) => void;
};

type Hooks = {
  onProgress: (progress: number, clipAProgress: number) => void;
  onPosition: (position: SemanticPosition, changed: boolean) => void;
  setPose: (pose: StationPose, tau: number) => void;
};

let registered = false;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const CLIP_B_START_CHAPTER: ChapterId = "volkan";

function lerpPose(a: StationPose, b: StationPose, t: number): StationPose {
  return {
    zoom: a.zoom + (b.zoom - a.zoom) * t,
    shiftX: a.shiftX + (b.shiftX - a.shiftX) * t,
    shiftY: a.shiftY + (b.shiftY - a.shiftY) * t,
  };
}

export function createStudioDirector(
  scroller: HTMLElement,
  sections: readonly HTMLElement[],
  stations: readonly StudioStation[],
  mode: "side" | "banded",
  reduced: boolean,
  hooks: Hooks,
): StudioDirector {
  if (!registered) {
    gsap.registerPlugin(ScrollTrigger);
    registered = true;
  }

  const poses = stations.map((station) => station.pose[mode]);
  const clipBStartIndex = stations.findIndex((station) => station.id === CLIP_B_START_CHAPTER);
  let activeIndex = -1;
  let position: SemanticPosition = { chapter: stations[0].id, localProgress: 0 };

  const readPosition = () => {
    const y = scroller.scrollTop;
    const maxY = Math.max(scroller.scrollHeight - scroller.clientHeight, 1);
    const globalProgress = clamp01(y / maxY);
    const clipAEndTop = sections[Math.max(clipBStartIndex, 1)]?.offsetTop ?? maxY;
    hooks.onProgress(globalProgress, mapScrollToClipProgress(y, clipAEndTop));

    let index = 0;
    for (let i = 0; i < sections.length; i += 1) {
      if (y >= sections[i].offsetTop) index = i;
      else break;
    }
    const section = sections[index];
    const travel = Math.max(section.offsetHeight - scroller.clientHeight, 1);
    const localProgress = clamp01((y - section.offsetTop) / travel);
    const changed = index !== activeIndex;
    activeIndex = index;
    position = { chapter: stations[index].id, localProgress };

    sections.forEach((item, itemIndex) => {
      item.dataset.live = itemIndex === index ? "true" : "false";
      item.style.setProperty(
        "--sp",
        itemIndex < index ? "1" : itemIndex > index ? "0" : localProgress.toFixed(4),
      );
    });

    if (!reduced) {
      const next = Math.min(index + 1, poses.length - 1);
      const eased = localProgress * localProgress * (3 - 2 * localProgress);
      hooks.setPose(lerpPose(poses[index], poses[next], eased), 0.06);
    } else if (changed) {
      hooks.setPose(poses[index], 0.55);
    }
    hooks.onPosition(position, changed);
  };

  const trigger = ScrollTrigger.create({
    scroller,
    start: 0,
    end: () => Math.max(scroller.scrollHeight - scroller.clientHeight, 1),
    onUpdate: readPosition,
    onRefresh: readPosition,
  });

  let fontRefreshCancelled = false;
  document.fonts?.ready?.then(() => {
    if (!fontRefreshCancelled) ScrollTrigger.refresh();
  });
  readPosition();

  const scrollTo = (next: SemanticPosition, behavior: ScrollBehavior) => {
    const index = stations.findIndex((station) => station.id === next.chapter);
    if (index < 0) return;
    const section = sections[index];
    const top = semanticScrollTarget(
      section.offsetTop,
      section.offsetHeight,
      scroller.clientHeight,
      next.localProgress,
    );
    if (behavior === "auto") {
      const inlineBehavior = scroller.style.scrollBehavior;
      scroller.style.scrollBehavior = "auto";
      scroller.scrollTop = top;
      scroller.style.scrollBehavior = inlineBehavior;
      readPosition();
      return;
    }
    scroller.scrollTo({ top, behavior });
    window.requestAnimationFrame(readPosition);
  };

  return {
    destroy() {
      fontRefreshCancelled = true;
      trigger.kill();
    },
    getPosition: () => position,
    restore: (next) => scrollTo(next, "auto"),
    scrollToChapter: (chapter) =>
      scrollTo({ chapter, localProgress: 0 }, reduced ? "auto" : "smooth"),
  };
}
