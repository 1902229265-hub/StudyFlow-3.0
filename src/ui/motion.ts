import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
export const MotionTokens = {
  fast: 140,
  normal: 220,
  emphasis: 520,
  confirm: 140,
  exit: 120,
  reduced: 80,
  ease: "cubic-bezier(0.16, 1, 0.3, 1)",
} as const;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
type Frame = { rect: DOMRect; clone: HTMLElement; part: string };
function snapshot(el: HTMLElement, part: string): Frame | null {
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const clone = el.cloneNode(true) as HTMLElement;
  const original = [el, ...el.querySelectorAll("*")],
    copies = [clone, ...clone.querySelectorAll("*")];
  original.forEach((node, i) => {
    const style = getComputedStyle(node);
    const target = copies[i] as HTMLElement;
    for (const property of Array.from(style))
      target.style.setProperty(property, style.getPropertyValue(property));
  });
  clone.removeAttribute("id");
  clone.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  clone.setAttribute("aria-hidden", "true");
  clone.inert = true;
  return { rect, clone, part };
}
export function useTodayMotion(signature: string) {
  const root = useRef<HTMLDivElement>(null);
  const before = useRef<{
    parts: Frame[];
    rows: Map<string, DOMRect>;
    completion: boolean;
    restoring: boolean;
    stageId: string | undefined;
    restoreFocus: boolean;
  } | null>(null);
  const animations = useRef<Animation[]>([]),
    ghosts = useRef<HTMLElement[]>([]),
    focusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stop = useCallback(() => {
    animations.current.forEach((a) => a.cancel());
    animations.current = [];
    ghosts.current.forEach((n) => n.remove());
    ghosts.current = [];
    clearTimeout(focusTimer.current);
  }, []);
  const capture = useCallback(
    (completion = false, restoring = false) => {
      stop();
      const node = root.current;
      if (!node) return;
      const rows = new Map<string, DOMRect>();
      node
        .querySelectorAll<HTMLElement>("[data-task-id].task-row")
        .forEach((el) =>
          rows.set(el.dataset.taskId!, el.getBoundingClientRect()),
        );
      const parts = completion
        ? [
            ".focus-copy",
            ".focus-bottom .focus-notes",
            ".focus-bottom .focus-action",
          ].flatMap((s, i) => {
            const el = node.querySelector<HTMLElement>(s);
            const shot = el && snapshot(el, ["copy", "notes", "action"][i]);
            return shot ? [shot] : [];
          })
        : [];
      before.current = {
        parts,
        rows,
        completion,
        restoring,
        stageId:
          node.querySelector<HTMLElement>(".focus-stage")?.dataset.taskId,
        restoreFocus:
          (node.contains(document.activeElement) ||
            !!document.activeElement?.closest(".toast")) &&
          !document.activeElement?.closest(".v2-calendar,.load-chart"),
      };
    },
    [stop],
  );
  useLayoutEffect(() => {
    const old = before.current;
    before.current = null;
    const node = root.current;
    if (!old || !node) return;
    const animate = (
      el: Element,
      frames: Keyframe[],
      duration: number,
      delay = 0,
    ) => {
      const a = el.animate(
        reduced() ? frames.map((_, i) => ({ opacity: i ? 1 : 0.85 })) : frames,
        {
          duration: reduced() ? 80 : duration,
          delay: reduced() ? 0 : delay,
          easing: MotionTokens.ease,
          fill: "backwards",
        },
      );
      animations.current.push(a);
      return a;
    };
    const focusChanged =
      old.stageId !==
      node.querySelector<HTMLElement>(".focus-stage")?.dataset.taskId;
    (focusChanged ? old.parts : []).forEach(({ rect, clone, part }) => {
      Object.assign(clone.style, {
        position: "fixed",
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        margin: "0",
        zIndex: "25",
        pointerEvents: "none",
      });
      clone.classList.add("phase2-motion-ghost");
      clone.dataset.motionFocusPart = part;
      document.body.appendChild(clone);
      ghosts.current.push(clone);
      if (part === "action" && !old.restoring) {
        clone.textContent = "已完成";
        clone.style.background = "var(--v2-progress)";
        clone.style.borderColor = "var(--v2-progress)";
        clone.style.color = "var(--v2-stage)";
      }
      const a = animate(
        clone,
        [
          { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
          { opacity: 0, transform: "translateY(-7px)", filter: "blur(2px)" },
        ],
        MotionTokens.exit,
        old.restoring ? 0 : MotionTokens.confirm,
      );
      a.finished.then(
        () => clone.remove(),
        () => clone.remove(),
      );
    });
    if (old.completion && focusChanged) {
      node
        .querySelectorAll(
          ".focus-copy,.focus-bottom .focus-notes,.focus-bottom .focus-action",
        )
        .forEach((el, i) =>
          animate(
            el,
            [
              { opacity: 0, transform: "translateY(8px)", filter: "blur(2px)" },
              { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
            ],
            MotionTokens.normal,
            old.restoring ? 0 : MotionTokens.confirm + i * 20,
          ),
        );
    } else if (!old.completion) {
      const stage = node.querySelector(".focus-stage");
      if (stage)
        animate(
          stage,
          [
            { opacity: 0.65, transform: "translateY(7px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          MotionTokens.normal,
        );
    }
    node
      .querySelectorAll<HTMLElement>(".task-row[data-task-id]")
      .forEach((el) => {
        const previous = old.rows.get(el.dataset.taskId!);
        const next = el.getBoundingClientRect();
        if (previous) {
          const y = previous.top - next.top;
          if (Math.abs(y) > 1)
            animate(
              el,
              [
                { transform: `translateY(${y}px)` },
                { transform: "translateY(0)" },
              ],
              MotionTokens.emphasis,
            );
        } else
          animate(
            el,
            [
              { opacity: 0, transform: "translateY(8px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
            MotionTokens.normal,
            MotionTokens.exit,
          );
      });
    if (old.completion && old.restoreFocus)
      focusTimer.current = setTimeout(
        () => {
          if (document.querySelector("dialog[open]")) return;
          const target = node.querySelector<HTMLElement>(
            ".focus-action:not(:disabled),.completed-group summary",
          );
          target?.focus({ preventScroll: true });
        },
        reduced() ? 80 : 360,
      );
  }, [signature]);
  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    mq.addEventListener("change", stop);
    const onResize = () => stop();
    window.addEventListener("resize", onResize);
    return () => {
      mq.removeEventListener("change", stop);
      window.removeEventListener("resize", onResize);
      stop();
    };
  }, [stop]);
  return { root, capture, stop };
}
export function useAnimatedNumber(
  value: number,
  ref: React.RefObject<HTMLSpanElement | null>,
) {
  const previous = useRef(value);
  useLayoutEffect(() => {
    const start = previous.current;
    previous.current = value;
    const node = ref.current;
    if (!node || start === value) return;
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const paint = (n: number) => {
      const text = String(Math.round(n));
      if (node.textContent !== text) node.textContent = text;
    };
    if (mq.matches) {
      paint(value);
      return;
    }
    let frame = 0;
    paint(start);
    const driver = node.animate([{ opacity: 0.82 }, { opacity: 1 }], {
      duration: MotionTokens.emphasis,
      easing: MotionTokens.ease,
    });
    const finish = () => {
      cancelAnimationFrame(frame);
      paint(value);
      driver.cancel();
    };
    const tick = () => {
      const p = driver.effect?.getComputedTiming().progress ?? 1;
      paint(start + (value - start) * p);
      if (driver.playState !== "finished") frame = requestAnimationFrame(tick);
      else paint(value);
    };
    frame = requestAnimationFrame(tick);
    mq.addEventListener("change", finish);
    return () => {
      finish();
      mq.removeEventListener("change", finish);
    };
  }, [value, ref]);
}
