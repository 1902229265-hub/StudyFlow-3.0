import type { Task, StudySession } from "./types";
export interface ReloadProof {
  owner: string;
  sessionId: string;
  tab: string;
  at: number;
}
export interface State {
  schema: 1;
  revision: number;
  tasks: Task[];
  sessions: StudySession[];
  activeSlot: string | null;
  owner: string | null;
  heartbeatAt: number | null;
  previousOwner?: string | null;
  reloadProof?: ReloadProof | null;
}
export const stores = ["state", "operations"] as const;
export function fault(code: string, message = code): Error {
  return Object.assign(new Error(message), { code });
}
export function validateTask(t: Task): void {
  const isDate = (value: unknown): value is string => {
    if (
      typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      value < "2020-01-01" ||
      value > "2099-12-31"
    )
      return false;
    const d = new Date(value + "T12:00:00");
    return (
      Number.isFinite(d.getTime()) &&
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` ===
        value
    );
  };
  if (
    !t ||
    typeof t.id !== "string" ||
    !t.id ||
    typeof t.title !== "string" ||
    !t.title.trim() ||
    t.title.length > 120 ||
    !["编程开发", "语言学习", "阅读写作", "通识学习"].includes(t.category) ||
    !isDate(t.date) ||
    !(
      t.time === null ||
      (typeof t.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t.time))
    ) ||
    !Number.isInteger(t.minutes) ||
    t.minutes < 5 ||
    t.minutes > 720 ||
    !["重要", "普通", "低优先"].includes(t.priority) ||
    typeof t.notes !== "string" ||
    t.notes.length > 1000 ||
    typeof t.completed !== "boolean"
  )
    throw fault("INVALID_TASK");
}
export function validate(d: State): void {
  if (
    !d ||
    d.schema !== 1 ||
    !Number.isSafeInteger(d.revision) ||
    d.revision < 0 ||
    !Array.isArray(d.tasks) ||
    !Array.isArray(d.sessions) ||
    !(d.activeSlot === null || typeof d.activeSlot === "string") ||
    !(d.owner === null || typeof d.owner === "string") ||
    !(d.heartbeatAt === null || Number.isFinite(d.heartbeatAt))
  )
    throw fault("CORRUPT_DATABASE");
  if (
    d.previousOwner !== undefined &&
    d.previousOwner !== null &&
    typeof d.previousOwner !== "string"
  )
    throw fault("CORRUPT_DATABASE");
  if (
    d.reloadProof !== undefined &&
    d.reloadProof !== null &&
    (!d.reloadProof ||
      typeof d.reloadProof.owner !== "string" ||
      typeof d.reloadProof.sessionId !== "string" ||
      typeof d.reloadProof.tab !== "string" ||
      !Number.isFinite(d.reloadProof.at))
  )
    throw fault("CORRUPT_DATABASE");
  d.tasks.forEach(validateTask);
  if (
    new Set(d.tasks.map((t) => t.id)).size !== d.tasks.length ||
    new Set(d.sessions.map((s) => s.id)).size !== d.sessions.length
  )
    throw fault("CORRUPT_DATABASE");
  const segmentIds = new Set<string>();
  for (const s of d.sessions) {
    if (
      !s ||
      typeof s.id !== "string" ||
      !s.id ||
      typeof s.taskId !== "string" ||
      !["running", "paused", "ended", "recovering"].includes(s.status) ||
      !Number.isFinite(s.startedAt) ||
      !(s.endedAt === null || Number.isFinite(s.endedAt)) ||
      !Array.isArray(s.segments) ||
      !Number.isSafeInteger(s.revision) ||
      s.revision < 0
    )
      throw fault("CORRUPT_DATABASE");
    validateTask(s.taskSnapshot);
    if (s.taskSnapshot.id !== s.taskId) throw fault("CORRUPT_DATABASE");
    if ((s.status === "ended") !== (s.endedAt !== null))
      throw fault("CORRUPT_DATABASE");
    if ((s.status === "recovering") !== (s.pendingGap !== null))
      throw fault("CORRUPT_DATABASE");
    if (
      s.pendingGap &&
      (!Number.isFinite(s.pendingGap.from) ||
        !Number.isFinite(s.pendingGap.to) ||
        s.pendingGap.to < s.pendingGap.from ||
        typeof s.pendingGap.reason !== "string")
    )
      throw fault("CORRUPT_DATABASE");
    let opens = 0;
    for (const g of s.segments) {
      if (segmentIds.has(g?.id)) throw fault("CORRUPT_DATABASE");
      segmentIds.add(g?.id);
      if (
        !g ||
        typeof g.id !== "string" ||
        !g.id ||
        !Number.isFinite(g.startedAt) ||
        !(g.endedAt === null || Number.isFinite(g.endedAt)) ||
        !Number.isFinite(g.confirmedMs) ||
        g.confirmedMs < 0 ||
        !Number.isFinite(g.checkpointAt) ||
        g.checkpointAt < g.startedAt ||
        !(typeof g.timeZone === "string") ||
        !["measured", "recovered"].includes(g.kind)
      )
        throw fault("CORRUPT_DATABASE");
      try {
        new Intl.DateTimeFormat("en", { timeZone: g.timeZone });
      } catch {
        throw fault("CORRUPT_DATABASE");
      }
      if (g.confirmedMs > g.checkpointAt - g.startedAt + 0.001)
        throw fault("CORRUPT_DATABASE");
      if (g.endedAt === null) opens++;
      else if (
        g.endedAt < g.startedAt ||
        g.checkpointAt > g.endedAt ||
        g.confirmedMs > g.endedAt - g.startedAt + 0.001
      )
        throw fault("CORRUPT_DATABASE");
    }
    if (opens !== (s.status === "running" ? 1 : 0))
      throw fault("CORRUPT_DATABASE");
  }
  const unfinished = d.sessions.filter((s) => s.status !== "ended");
  if (unfinished.length > 1 || d.activeSlot !== (unfinished[0]?.id ?? null))
    throw fault("CORRUPT_DATABASE");
}
export function openDatabase(name: string, seed: Task[]): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(fault("STORAGE_UNAVAILABLE"));
      return;
    }
    const req = indexedDB.open(name, 1);
    let upgradeError: unknown;
    req.onupgradeneeded = (event) => {
      if ((event as IDBVersionChangeEvent).oldVersion !== 0) {
        upgradeError = fault("UNKNOWN_SCHEMA");
        req.transaction!.abort();
        return;
      }
      // Never repair a database: only initialize a genuinely new database.
      try {
        seed.forEach(validateTask);
        if (new Set(seed.map((t) => t.id)).size !== seed.length)
          throw fault("INVALID_TASK");
        const state = req.result.createObjectStore("state");
        req.result.createObjectStore("operations", { keyPath: "id" });
        state.add(
          {
            schema: 1,
            revision: 0,
            tasks: structuredClone(seed),
            sessions: [],
            activeSlot: null,
            owner: null,
            heartbeatAt: null,
          } satisfies State,
          "root",
        );
      } catch (e) {
        upgradeError = e;
        req.transaction!.abort();
      }
    };
    let blocked = false;
    req.onblocked = () => {
      blocked = true;
      reject(
        fault(
          "DATABASE_BLOCKED",
          "IndexedDB upgrade blocked by another tab. Close that tab and retry.",
        ),
      );
    };
    req.onerror = () =>
      reject(upgradeError ?? req.error ?? fault("STORAGE_ERROR"));
    req.onsuccess = () => {
      if (blocked) {
        req.result.close();
        return;
      }
      if (
        req.result.objectStoreNames.length !== 2 ||
        !stores.every((s) => req.result.objectStoreNames.contains(s))
      ) {
        req.result.close();
        reject(fault("UNKNOWN_SCHEMA"));
        return;
      }
      resolve(req.result);
    };
  });
}
export function read(db: IDBDatabase): Promise<State> {
  return new Promise((resolve, reject) => {
    let value: State;
    const tx = db.transaction("state", "readonly");
    const request = tx.objectStore("state").get("root");
    request.onsuccess = () => {
      value = request.result;
    };
    tx.oncomplete = () => {
      try {
        validate(value);
        resolve(value);
      } catch (e) {
        reject(e);
      }
    };
    tx.onabort = () => reject(tx.error ?? fault("STORAGE_ABORTED"));
    tx.onerror = () => {};
  });
}
export function readExport(
  db: IDBDatabase,
): Promise<{ state: State; operations: unknown[] }> {
  return new Promise((resolve, reject) => {
    let state: State,
      operations: unknown[] = [];
    const tx = db.transaction([...stores], "readonly");
    const root = tx.objectStore("state").get("root"),
      audit = tx.objectStore("operations").getAll();
    root.onsuccess = () => {
      state = root.result;
    };
    audit.onsuccess = () => {
      operations = audit.result;
    };
    tx.oncomplete = () => {
      try {
        validate(state);
        resolve({ state, operations });
      } catch (e) {
        reject(e);
      }
    };
    tx.onabort = () => reject(tx.error ?? fault("STORAGE_ABORTED"));
    tx.onerror = () => {};
  });
}
export function change<T>(
  db: IDBDatabase,
  kind: string,
  fn: (state: State) => T,
): Promise<{ state: State; result: T }> {
  return new Promise((resolve, reject) => {
    let state: State, result: T, error: unknown;
    const tx = db.transaction([...stores], "readwrite");
    const req = tx.objectStore("state").get("root");
    req.onsuccess = () => {
      try {
        state = req.result;
        validate(state);
        const previousSession = state.sessions.find(
            (s) => s.id === state.activeSlot,
          ),
          sessionId = previousSession?.id ?? null,
          recoveryGap = previousSession?.pendingGap
            ? structuredClone(previousSession.pendingGap)
            : null;
        result = fn(state);
        state.revision++;
        validate(state);
        const nextSession = state.sessions.find(
          (s) => s.id === state.activeSlot,
        );
        tx.objectStore("state").put(state, "root");
        tx.objectStore("operations").add({
          id: crypto.randomUUID(),
          kind,
          revision: state.revision,
          at: Date.now(),
          sessionId: sessionId ?? nextSession?.id ?? null,
          nextSessionId: nextSession?.id ?? null,
          ...(kind.startsWith("recover-")
            ? {
                recoveryGap,
                decision: kind === "recover-include" ? "include" : "exclude",
              }
            : {}),
        });
      } catch (e) {
        error = e;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve({ state, result });
    tx.onabort = () => reject(error ?? tx.error ?? fault("STORAGE_ABORTED"));
    tx.onerror = () => {};
  });
}
