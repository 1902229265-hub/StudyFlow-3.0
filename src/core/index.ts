import type {
  Task,
  TimerOptions,
  TimerSnapshot,
  TimerService,
  StudySession,
  RunSegment,
} from "./types";
import {
  openDatabase,
  read,
  readExport,
  change,
  fault,
  validateTask,
  type State,
  type ReloadProof,
} from "./storage";
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
}
const uuid = () => crypto.randomUUID();
export function createTimerService(
  seedTasks: Task[],
  options: TimerOptions = {},
): TimerService {
  const name = options.dbName ?? "studyflow.lab.focus.v1",
    tab = options.tabId ?? uuid(),
    owner = uuid();
  const clock = options.clock ?? {
      wall: () => Date.now(),
      mono: () => performance.now(),
    },
    heartbeat = options.heartbeatMs ?? 1000;
  let db: IDBDatabase | undefined,
    initializing: Promise<void> | undefined,
    disposed = false,
    controller = false,
    pending = 0;
  let release: (() => void) | undefined,
    interval: ReturnType<typeof setInterval> | undefined,
    channel: BroadcastChannel | undefined;
  type Anchor = { id: string; wall: number; mono: number; confirmed: number };
  let anchor: Anchor | null = null;
  let proposedAnchor: Anchor | null = null;
  let snapshot: TimerSnapshot = freeze({
    ready: false,
    tasks: [],
    sessions: [],
    activeSessionId: null,
    revision: 0,
    pendingWrite: false,
    error: null,
    isController: false,
  });
  const listeners = new Set<() => void>();
  const emit = (patch: Partial<TimerSnapshot>) => {
    snapshot = freeze({ ...snapshot, ...patch });
    for (const fn of listeners) {
      try {
        fn();
      } catch {
        /* Subscribers cannot invalidate a committed transaction. */
      }
    }
  };
  function publish(state: State) {
    if (disposed || state.revision < snapshot.revision) return;
    const seg = state.sessions
      .find((s) => s.id === state.activeSlot)
      ?.segments.find((s) => s.endedAt === null);
    if (
      seg &&
      (!anchor ||
        anchor.id !== seg.id ||
        anchor.confirmed !== seg.confirmedMs ||
        anchor.wall !== seg.checkpointAt)
    ) {
      if (
        proposedAnchor?.id === seg.id &&
        proposedAnchor.wall === seg.checkpointAt &&
        proposedAnchor.confirmed === seg.confirmedMs
      ) {
        anchor = proposedAnchor;
        proposedAnchor = null;
      } else
        anchor = {
          id: seg.id,
          wall: seg.checkpointAt,
          mono: clock.mono() - Math.max(0, clock.wall() - seg.checkpointAt),
          confirmed: seg.confirmedMs,
        };
    }
    if (!seg) anchor = null;
    emit({
      ready: true,
      tasks: state.tasks,
      sessions: state.sessions,
      activeSessionId: state.activeSlot,
      revision: state.revision,
      error: null,
      isController: controller,
    });
  }
  const error = (e: unknown) => {
    if (!disposed)
      emit({
        ready: true,
        isController: controller,
        error:
          e instanceof Error
            ? `${typeof (e as Error & { code?: unknown }).code === "string" ? (e as Error & { code: string }).code : e.name}: ${e.message}`
            : String(e),
      });
  };
  function active(state: State) {
    return state.sessions.find((s) => s.id === state.activeSlot);
  }
  function segment(s: StudySession) {
    return s.segments.find((g) => g.endedAt === null);
  }
  function beginSegment(at: number): RunSegment {
    const g: RunSegment = {
      id: uuid(),
      startedAt: at,
      endedAt: null,
      confirmedMs: 0,
      checkpointAt: at,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      kind: "measured",
    };
    proposedAnchor = { id: g.id, wall: at, mono: clock.mono(), confirmed: 0 };
    return g;
  }
  function drift(g: RunSegment, at = clock.wall()) {
    const wallDelta = at - g.checkpointAt;
    const hasMonotonicAnchor = controller && anchor?.id === g.id;
    const monoAt = clock.mono(),
      monoDelta = hasMonotonicAnchor ? monoAt - anchor!.mono : wallDelta;
    const uncertain =
      !hasMonotonicAnchor ||
      !Number.isFinite(wallDelta) ||
      !Number.isFinite(monoDelta) ||
      wallDelta < 0 ||
      monoDelta < 0 ||
      Math.abs(wallDelta - monoDelta) > 2000 ||
      (!hasMonotonicAnchor &&
        Math.max(wallDelta, monoDelta) > Math.max(15000, heartbeat * 3));
    return {
      uncertain,
      delta: uncertain ? 0 : Math.max(0, Math.min(wallDelta, monoDelta)),
      monoAt,
    };
  }
  function recovering(s: StudySession, reason: string, at = clock.wall()) {
    const g = segment(s);
    if (!g) return;
    g.endedAt = g.checkpointAt;
    s.status = "recovering";
    s.pendingGap = {
      from: g.checkpointAt,
      to: Math.max(g.checkpointAt, at),
      reason,
    };
    s.revision++;
  }
  function checkpoint(state: State) {
    const s = active(state);
    if (s?.status !== "running") return;
    const g = segment(s)!;
    const at = clock.wall(),
      d = drift(g, at);
    if (d.uncertain) {
      recovering(s, "clock-or-sleep-discontinuity", at);
      return;
    }
    g.confirmedMs += d.delta;
    g.checkpointAt = Math.max(g.checkpointAt, at);
    proposedAnchor = {
      id: g.id,
      wall: g.checkpointAt,
      mono: d.monoAt,
      confirmed: g.confirmedMs,
    };
    s.revision++;
  }
  function closeRunning(state: State) {
    checkpoint(state);
    const s = active(state);
    if (!s) return;
    const g = segment(s);
    if (g) g.endedAt = g.checkpointAt;
  }
  async function write<T>(kind: string, fn: (state: State) => T): Promise<T> {
    if (!db || disposed) throw fault("STORAGE_CLOSED");
    const timerMutation = [
      "start",
      "pause",
      "resume",
      "end",
      "recover-include",
      "recover-exclude",
    ].includes(kind);
    if (timerMutation && !controller)
      throw fault("NOT_CONTROLLER", "请在持有计时控制的标签页操作。");
    pending++;
    emit({ pendingWrite: true });
    try {
      const result = await change(db, kind, (state) => {
        if (timerMutation && state.owner !== owner)
          throw fault("OWNER_CHANGED");
        return fn(state);
      });
      publish(result.state);
      try {
        if (!disposed)
          channel?.postMessage({ revision: result.state.revision });
      } catch {
        /* Notification is advisory; the transaction has already committed. */
      }
      return result.result;
    } catch (e) {
      error(e);
      throw e;
    } finally {
      pending--;
      emit({ pendingWrite: pending > 0 });
    }
  }
  async function refresh() {
    if (!db || disposed) return;
    try {
      publish(await read(db));
    } catch (e) {
      error(e);
      throw e;
    }
  }
  function freshProof(
    proof: ReloadProof | null | undefined,
    s: StudySession | undefined,
  ) {
    return (
      !!proof &&
      proof.sessionId === s?.id &&
      clock.wall() - proof.at >= 0 &&
      clock.wall() - proof.at < 5000
    );
  }
  function restoreReload(s: StudySession) {
    const g = s.segments.at(-1);
    if (!g || g.kind !== "measured") return false;
    const delta = clock.wall() - g.checkpointAt;
    if (delta < 0 || delta >= 5000) return false;
    g.endedAt = null;
    g.confirmedMs += delta;
    g.checkpointAt = clock.wall();
    s.pendingGap = null;
    s.status = "running";
    s.revision++;
    return true;
  }
  async function confirmReload(proof: ReloadProof) {
    await write("confirm-reload", (state) => {
      const s = active(state);
      if (!freshProof(proof, s)) return;
      if (s?.status === "running" && state.owner === proof.owner)
        state.reloadProof = proof;
      else if (
        s?.status === "recovering" &&
        s.pendingGap?.reason === "owner-disconnected" &&
        state.previousOwner === proof.owner
      ) {
        restoreReload(s);
        state.reloadProof = null;
      }
    });
  }
  async function claim(reloadProof: ReloadProof | null) {
    controller = true;
    await write("claim-owner", (state) => {
      const s = active(state);
      if (s?.status === "running") {
        const g = segment(s)!;
        const delta = clock.wall() - g.checkpointAt;
        const proof = freshProof(reloadProof, s)
          ? reloadProof
          : state.reloadProof;
        if (
          freshProof(proof, s) &&
          proof!.owner === state.owner &&
          delta >= 0 &&
          delta < 5000
        ) {
          g.confirmedMs += delta;
          g.checkpointAt = clock.wall();
          s.revision++;
        } else recovering(s, "owner-disconnected");
      }
      state.previousOwner = state.owner;
      state.owner = owner;
      state.heartbeatAt = clock.wall();
      state.reloadProof = null;
    });
    if (!disposed)
      interval = setInterval(() => {
        if (!disposed && controller && !pending)
          void write("checkpoint", (state) => {
            if (state.owner !== owner) throw fault("OWNER_CHANGED");
            checkpoint(state);
            state.heartbeatAt = clock.wall();
          }).catch(() => {});
      }, heartbeat);
  }
  const markerKey = `studyflow.lab.focus.reload.${name}`;

  // sessionStorage survives a same-tab reload, but is never the source of timer data.
  let stableTab = tab;
  try {
    const key = `${markerKey}.tab`;
    const existing = sessionStorage.getItem(key);
    if (!options.tabId && existing) stableTab = existing;
    else sessionStorage.setItem(key, tab);
  } catch {}
  function canReload(): ReloadProof | null {
    try {
      const value = JSON.parse(sessionStorage.getItem(markerKey) ?? "null");
      sessionStorage.removeItem(markerKey);
      const nav = performance.getEntriesByType("navigation")[0] as
        PerformanceNavigationTiming | undefined;
      return value &&
        nav?.type === "reload" &&
        value.tab === stableTab &&
        typeof value.owner === "string" &&
        typeof value.sessionId === "string" &&
        clock.wall() - value.at >= 0 &&
        clock.wall() - value.at < 5000
        ? value
        : null;
    } catch {
      return null;
    }
  }
  async function ownership(reloadAllowed: ReloadProof | null) {
    if (!navigator.locks)
      throw fault(
        "WEB_LOCKS_UNAVAILABLE",
        "Reliable ownership requires Web Locks.",
      );

    await new Promise<void>((resolve, reject) => {
      void navigator.locks
        .request(`${name}:owner`, { ifAvailable: true }, async (lock) => {
          if (!lock) {
            resolve();
            if (disposed) return;
            void navigator.locks
              .request(`${name}:owner`, async (acquired) => {
                if (!acquired || disposed) return;
                try {
                  await claim(null);
                  if (disposed) return;
                  await new Promise<void>((r) => {
                    release = r;
                  });
                } catch (e) {
                  controller = false;
                  error(e);
                }
              })
              .catch(error);
            return;
          }
          if (disposed) {
            resolve();
            return;
          }
          try {
            await claim(reloadAllowed);
            resolve();
            if (disposed) return;
            await new Promise<void>((r) => {
              release = r;
            });
          } catch (e) {
            controller = false;
            reject(e);
          }
        })
        .catch(reject);
    });
  }
  function pagehide() {
    if (controller) {
      try {
        sessionStorage.setItem(
          markerKey,
          JSON.stringify({
            tab: stableTab,
            at: clock.wall(),
            owner,
            sessionId: snapshot.activeSessionId,
          }),
        );
      } catch {}
      if (db && !disposed)
        void write("pagehide", (state) => {
          if (state.owner === owner) {
            checkpoint(state);
            state.heartbeatAt = clock.wall();
          }
        }).catch(() => {});
    }
  }
  const service: TimerService = {
    init() {
      return (initializing ??= (async () => {
        try {
          db = await openDatabase(name, seedTasks);
          if (disposed) {
            db.close();
            return;
          }
          db.onversionchange = () => {
            db?.close();
            db = undefined;
            controller = false;
            clearInterval(interval);
            release?.();
            error(
              fault(
                "DATABASE_VERSION_CHANGED",
                "Database changed in another tab. Reload to reconnect.",
              ),
            );
          };
          db.onclose = () => {
            if (!disposed) {
              controller = false;
              clearInterval(interval);
              release?.();
              error(fault("DATABASE_CLOSED"));
            }
          };
          const state = await read(db);
          if (disposed) return;
          publish(state);
          if (disposed) return;
          channel = new BroadcastChannel(`${name}:changes`);
          channel.onmessage = () => {
            void refresh().catch(() => {});
          };
          const reload = canReload();
          if (reload) await confirmReload(reload);
          if (disposed) return;
          await ownership(reload);
          if (!disposed) window.addEventListener("pagehide", pagehide);
        } catch (e) {
          if (disposed) return;
          error(e);
          throw e;
        }
      })());
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getSnapshot() {
      return snapshot;
    },
    async start(taskId, opts = {}) {
      await service.init();
      const id = await write("start", (state) => {
        const task = state.tasks.find((t) => t.id === taskId);
        if (!task) throw fault("TASK_NOT_FOUND");
        const old = active(state);
        if (old) {
          if (old.taskId === taskId) return old.id;
          if (!opts.switchExisting) throw fault("ACTIVE_SESSION");
          closeRunning(state);
          if (old.status === "recovering") return null;
          old.status = "ended";
          old.endedAt = Math.max(old.startedAt, clock.wall());
          old.pendingGap = null;
          old.revision++;
        }
        const at = clock.wall(),
          s: StudySession = {
            id: uuid(),
            taskId,
            taskSnapshot: structuredClone(task),
            status: "running",
            startedAt: at,
            endedAt: null,
            segments: [beginSegment(at)],
            pendingGap: null,
            revision: 0,
          };
        state.sessions.push(s);
        state.activeSlot = s.id;
        return s.id;
      });
      if (id === null)
        throw fault("RECOVERY_REQUIRED", "请先确认中断区间，再切换任务。");
      return id;
    },
    async pause() {
      await service.init();
      await write("pause", (state) => {
        const s = active(state);
        if (s?.status !== "running") return;
        closeRunning(state);
        if (s.status === "running") s.status = "paused";
        s.revision++;
      });
    },
    async resume() {
      await service.init();
      await write("resume", (state) => {
        const s = active(state);
        if (!s || s.status === "running") return;
        if (s.status === "recovering") throw fault("RECOVERY_REQUIRED");
        s.status = "running";
        s.segments.push(beginSegment(clock.wall()));
        s.revision++;
      });
    },
    async end() {
      await service.init();
      const needsRecovery = await write("end", (state) => {
        const s = active(state);
        if (!s) return;
        closeRunning(state);
        if (s.status === "recovering") return true;
        s.status = "ended";
        s.pendingGap = null;
        s.endedAt = Math.max(s.startedAt, clock.wall());
        s.revision++;
        state.activeSlot = null;
      });
      if (needsRecovery)
        throw fault("RECOVERY_REQUIRED", "请先确认中断区间，再结束计时。");
    },
    async recover(includeGap) {
      await service.init();
      await write(
        includeGap ? "recover-include" : "recover-exclude",
        (state) => {
          const s = active(state);
          if (s?.status !== "recovering" || !s.pendingGap) return;
          const gap = s.pendingGap;
          if (includeGap && gap.to > gap.from)
            s.segments.push({
              id: uuid(),
              startedAt: gap.from,
              endedAt: gap.to,
              confirmedMs: gap.to - gap.from,
              checkpointAt: gap.to,
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              kind: "recovered",
            });
          s.pendingGap = null;
          s.status = "paused";
          s.revision++;
        },
      );
    },
    async setCompleted(taskId, value) {
      await service.init();
      await write("set-completed", (state) => {
        if (typeof value !== "boolean") throw fault("INVALID_TASK");
        const t = state.tasks.find((t) => t.id === taskId);
        if (!t) throw fault("TASK_NOT_FOUND");
        t.completed = value;
      });
    },
    async saveTask(task) {
      await service.init();
      validateTask(task);
      await write("save-task", (state) => {
        const i = state.tasks.findIndex((t) => t.id === task.id);
        if (i < 0) state.tasks.push(structuredClone(task));
        else state.tasks[i] = structuredClone(task);
      });
    },
    elapsed(session, at = clock.wall()) {
      return session.segments.reduce(
        (sum, g) =>
          sum +
          g.confirmedMs +
          (session.status === "running" && g.endedAt === null
            ? drift(g, at).delta
            : 0),
        0,
      );
    },
    daily(date, at = clock.wall()) {
      const ids = new Set<string>();
      let actualMs = 0;
      for (const s of snapshot.sessions) {
        let amount = 0;
        for (const g of s.segments) {
          const duration =
            g.confirmedMs +
            (s.status === "running" && g.endedAt === null
              ? drift(g, at).delta
              : 0);
          amount += durationOnDate(g.startedAt, duration, g.timeZone, date);
        }
        if (amount > 0) ids.add(s.taskId);
        actualMs += amount;
      }
      return {
        actualMs,
        plannedMs: snapshot.tasks
          .filter((t) => t.date === date)
          .reduce((sum, t) => sum + t.minutes * 60000, 0),
        timedTaskCount: ids.size,
      };
    },
    async exportRecords() {
      await service.init();
      if (!db || disposed) throw fault("STORAGE_CLOSED");
      try {
        const { state, operations } = await readExport(db);
        publish(state);
        return {
          schema: 1,
          database: name,
          exportedAt: clock.wall(),
          tasks: structuredClone(state.tasks),
          sessions: structuredClone(state.sessions),
          activeSessionId: state.activeSlot,
          revision: state.revision,
          operations,
        };
      } catch (e) {
        error(e);
        throw e;
      }
    },
    refresh,
    dispose() {
      disposed = true;
      controller = false;
      clearInterval(interval);
      release?.();
      channel?.close();
      window.removeEventListener("pagehide", pagehide);
      db?.close();
      listeners.clear();
    },
  };
  return service;
}
/** Split confirmed millisecond intervals by the segment's persisted civil timezone. */
export function durationOnDate(
  start: number,
  duration: number,
  timeZone: string,
  date: string,
): number {
  if (duration <= 0) return 0;
  const end = start + duration;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dateAt = (n: number) => {
    const parts = fmt.formatToParts(n);
    return ["year", "month", "day"]
      .map((k) => parts.find((p) => p.type === k)!.value)
      .join("-");
  };
  // Civil dates are monotonic within a segment; locate midnight boundaries by binary search,
  // not by adding a fixed 24 hours (DST days can be 23 or 25 hours).
  let cursor = start,
    total = 0;
  while (cursor < end) {
    const current = dateAt(cursor);
    let hi = Math.min(end, cursor + 26 * 3600000);
    if (dateAt(Math.max(cursor, hi - 0.001)) === current) {
      if (current === date) total += hi - cursor;
      cursor = hi;
      continue;
    }
    let lo = Math.floor(cursor);
    hi = Math.ceil(hi);
    while (hi - lo > 1) {
      const mid = Math.floor((hi + lo) / 2);
      if (dateAt(mid) === current) lo = mid;
      else hi = mid;
    }
    const boundary = hi;
    if (current === date) total += Math.min(boundary, end) - cursor;
    cursor = Math.min(boundary, end);
  }
  return total;
}
export type * from "./types";
