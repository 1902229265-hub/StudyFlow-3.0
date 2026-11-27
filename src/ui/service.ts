import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createTimerService } from "../core";
import { seedTasks } from "../seed";
import type { TimerSnapshot } from "../core/types";
export const service = createTimerService(seedTasks);
let initialization: Promise<void> | undefined;
export const initService = () => (initialization ||= service.init());
export function useSelected<T>(select: (s: TimerSnapshot) => T): T {
  const cache = useRef<{ key: string; value: T } | null>(null);
  const read = useCallback(() => {
    const value = select(service.getSnapshot());
    const key = JSON.stringify(value);
    if (cache.current?.key === key) return cache.current.value;
    cache.current = { key, value };
    return value;
  }, [select]);
  return useSyncExternalStore(service.subscribe, read, read);
}
export function useTick(active: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => {
      const at = Date.now();
      setNow((previous) =>
        active ||
        new Date(previous).toDateString() !== new Date(at).toDateString()
          ? at
          : previous,
      );
    };
    update();
    const id = setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", update);
    };
  }, [active]);
  return now;
}
export function useMobile() {
  const [mobile, setMobile] = useState(
    () => matchMedia("(max-width:760px)").matches,
  );
  useEffect(() => {
    const query = matchMedia("(max-width:760px)");
    const update = () => setMobile(query.matches);
    query.addEventListener("change", update);
    update();
    return () => query.removeEventListener("change", update);
  }, []);
  return mobile;
}
export const activeSession = (s: TimerSnapshot) =>
  s.sessions.find((session) => session.id === s.activeSessionId) || null;
