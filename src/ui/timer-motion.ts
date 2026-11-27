import { useLayoutEffect, type RefObject } from "react";
import { MotionTokens } from "./motion";

/** Present committed session state; never gates a command or changes its clock. */
export function useTimerEntrance(
  root: RefObject<HTMLElement | null>,
  sessionKey: string | null,
  kind: "main" | "mobile" | "sidebar",
) {
  useLayoutEffect(() => {
    const node = root.current;
    if (!node || !sessionKey || typeof node.animate !== "function") return;
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const targets = kind === "main"
      ? Array.from(node.querySelectorAll<HTMLElement>(":scope > .timer-main-copy, :scope > .timer-actions"))
      : [node];
    const animations = targets.map((target) => target.animate(
      query.matches
        ? [{ opacity: 0.85 }, { opacity: 1 }]
        : [{ opacity: kind === "main" ? 0.8 : 0, transform: `translateY(${kind === "main" ? 3 : kind === "mobile" ? 8 : 6}px)` }, { opacity: 1, transform: "none" }],
      {
        duration: query.matches ? MotionTokens.reduced : MotionTokens.normal,
        delay: query.matches || kind === "main" ? 0 : MotionTokens.reduced,
        easing: MotionTokens.ease,
        fill: "backwards",
      },
    ));
    const finish = () => animations.forEach((animation) => {
      try { animation.finish(); } catch { /* Interrupted effects remain at base styles. */ }
      animation.cancel();
    });
    query.addEventListener("change", finish);
    return () => {
      query.removeEventListener("change", finish);
      animations.forEach((animation) => animation.cancel());
    };
  }, [root, sessionKey, kind]);
}
