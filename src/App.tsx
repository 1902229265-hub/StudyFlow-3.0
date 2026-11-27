import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Task } from "./core/types";
import { Icon } from "./ui/Icon";
import { Modal, RecoveryGate, TaskEditor, TaskInspector } from "./ui/Dialogs";
import { Today } from "./ui/Today";
import { MiniTimer, type TimerActions } from "./ui/TimerUI";
import { activeSession, initService, service, useSelected } from "./ui/service";
import { asDate, localDate, names, type Route } from "./ui/model";
import "./ui/styles.css";
import "./ui/today-v2.css";
import "./ui/motion-21.css";
import "./ui/sitewide-motion.css";
import "./ui/phase2.css";
export { service };
const params = new URLSearchParams(location.search),
  baseline = params.get("baseline") === "1";
const initialDate = () => {
  const key = params.get("date");
  return key &&
    /^\d{4}-\d{2}-\d{2}$/.test(key) &&
    localDate(asDate(key)) === key
    ? key
    : localDate();
};
const routeFromHash = (): Route =>
  location.hash.slice(1) in names ? (location.hash.slice(1) as Route) : "today";
type Panel =
  | { kind: "inspect"; id: string }
  | { kind: "edit"; task?: Task }
  | { kind: "switch"; task: Task; previous: string }
  | { kind: "search" };
function PersistenceStatus() {
  const state = useSelected((s) => ({
    error: s.error,
    ready: s.ready,
    isController: s.isController,
  }));
  return (
    <>
      {state.error && (
        <div className="service-alert" role="alert">
          <strong>实验数据未能保存或读取</strong>
          <p>{state.error}</p>
          <p>
            请保留此页面，检查浏览器是否允许本机存储后重试。失败的操作不会显示为已保存。
          </p>
          <button
            className="button"
            onClick={() => void service.refresh().catch(() => {})}
          >
            重新读取
          </button>
        </div>
      )}
      {state.ready && !state.isController && !state.error && (
        <p className="read-only-note" role="status">
          当前标签页的计时为只读，仅显示已确认时长。计时控制由另一个 StudyFlow
          实验页面持有。
        </p>
      )}
    </>
  );
}
export default function App() {
  const tasks = useSelected((s) => s.tasks);
  const [date, setDate] = useState(initialDate),
    [route, setRoute] = useState<Route>(routeFromHash),
    [theme, setTheme] = useState(
      params.get("theme") === "dark" ? "dark" : "light",
    ),
    [panel, setPanel] = useState<Panel | null>(null),
    [feedback, setFeedback] = useState<{
      text: string;
      error?: boolean;
      undo?: { id: string; value: boolean };
    } | null>(null),
    [query, setQuery] = useState("");
  const motionRef = useRef<
      ((completion?: boolean, restoring?: boolean) => void) | null
    >(null),
    returnTo = useRef<HTMLElement | null>(null),
    toggling = useRef(new Set<string>()),
    [switchBusy, setSwitchBusy] = useState(false);
  useEffect(() => {
    void initService().catch((error) =>
      setFeedback({
        text: `无法打开实验数据库：${String(error)}`,
        error: true,
      }),
    );
  }, []);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add("theme-switching");
    root.dataset.theme = theme;
    void root.getBoundingClientRect();
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() =>
        root.classList.remove("theme-switching"),
      );
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      root.classList.remove("theme-switching");
    };
  }, [theme]);
  useEffect(() => {
    document.title = `${names[route]} · StudyFlow Precision Modern`;
  }, [route]);
  useEffect(() => {
    const change = () => {
      motionRef.current = null;
      setRoute(routeFromHash());
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const open = useCallback((next: Panel) => {
    if (!document.activeElement?.closest("dialog"))
      returnTo.current = document.activeElement as HTMLElement;
    setPanel(next);
  }, []);
  const inspect = useCallback(
    (id: string) => open({ kind: "inspect", id }),
    [open],
  );
  const edit = useCallback(
    (task?: Task) => open({ kind: "edit", task }),
    [open],
  );
  const run = useCallback(
    async (action: () => Promise<unknown>, message?: string) => {
      try {
        await action();
        if (message) setFeedback({ text: message });
        return true;
      } catch (error) {
        setFeedback({
          text: `操作未保存：${error instanceof Error ? error.message : String(error)}。请检查存储状态后重试。`,
          error: true,
        });
        return false;
      }
    },
    [],
  );
  const start = useCallback(
    (task: Task) => {
      if (!service.getSnapshot().isController) return;
      setFeedback(current => current?.undo ? current : null);
      const active = activeSession(service.getSnapshot());
      if (active && active.taskId !== task.id) {
        open({ kind: "switch", task, previous: active.taskSnapshot.title });
        return;
      }
      if (active?.status === "paused") {
        void run(() => service.resume(), "已继续计时");
        return;
      }
      if (active?.status === "recovering") return;
      void run(() => service.start(task.id));
    },
    [open, run],
  );
  const actions = useMemo<TimerActions>(
    () => ({ run, start, inspect }),
    [run, start, inspect],
  );
  const toggle = useCallback(
    async (task: Task) => {
      if (toggling.current.has(task.id)) return;
      toggling.current.add(task.id);
      motionRef.current?.(true, task.completed);
      const value = !task.completed;
      const ok = await run(() => service.setCompleted(task.id, value));
      toggling.current.delete(task.id);
      if (ok)
        setFeedback({
          text: value
            ? "任务已完成，实际计时保持原状态。"
            : "任务已恢复为待办。",
          undo: { id: task.id, value: task.completed },
        });
    },
    [run],
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuery("");
        open({ kind: "search" });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);
  const navigation = (mobile = false) => (
    <nav
      className={mobile ? "mobile-nav" : "desktop-nav"}
      aria-label={mobile ? "手机主导航" : "主导航"}
    >
      {(Object.keys(names) as Route[]).map((key, i) => (
        <a
          key={key}
          href={`#${key}`}
          data-route={key}
          aria-current={key === route ? "page" : undefined}
        >
          {!mobile && (
            <span>
              <Icon name={["today", "list", "calendar", "chart"][i]} />
            </span>
          )}
          <span>{names[key]}</span>
          {!mobile && i < 2 && (
            <span className="nav-count">
              {i === 0
                ? tasks.filter(
                    (t) =>
                      t.date === (baseline ? "2026-11-10" : localDate()) &&
                      !t.completed,
                  ).length
                : tasks.length}
            </span>
          )}
        </a>
      ))}
    </nav>
  );
  const themeControl = (mobile = false) => (
    <button
      className={mobile ? "icon-button" : "theme-control"}
      data-theme-toggle
      aria-label={`${theme === "light" ? "浅色" : "深色"}主题，切换到${theme === "light" ? "深" : "浅"}色主题`}
      onClick={() => setTheme((v) => (v === "light" ? "dark" : "light"))}
    >
      <span>
        <Icon name={theme === "light" ? "sun" : "moon"} />
      </span>
      {!mobile && (
        <>
          <span className="theme-label">
            {theme === "light" ? "浅色" : "深色"}主题
          </span>
          <span>
            <Icon name="switch" />
          </span>
        </>
      )}
    </button>
  );
  const brand = (
    <a className="brand" href="#today">
      <span className="brand-mark">
        <Icon name="book" />
      </span>
      <span>StudyFlow</span>
    </a>
  );
  const inspected =
    panel?.kind === "inspect"
      ? tasks.find((task) => task.id === panel.id)
      : null;
  return (
    <>
      <a className="skip-link" href="#page">
        跳到主要内容
      </a>
      <div
        className={
          "app-shell " + (baseline ? "baseline-comparison" : "phase2-app")
        }
      >
        <aside className="sidebar" aria-label="工作台导航">
          {brand}
          <button
            className="quick-search"
            data-search
            onClick={() => {
              setQuery("");
              open({ kind: "search" });
            }}
          >
            <Icon name="search" />
            <span>搜索任务</span>
            <kbd>⌘ K</kbd>
          </button>
          {navigation()}
          <div className="sidebar-bottom">
            {!baseline && <MiniTimer actions={actions} />} {themeControl()}
            <div className="prototype-note">
              <span className="prototype-dot" />
              <span>{baseline ? "2.3 全站交互" : "3.0 计时实验"}</span>
              {baseline && (
                <button
                  className="reset-demo"
                  title="重新载入对照页面"
                  aria-label="重新载入对照页面"
                  onClick={() => location.reload()}
                >
                  <Icon name="reset" />
                </button>
              )}
              <small>
                {baseline ? "四页交互 · 内存示例" : "Phase 2 · 独立本机数据"}
              </small>
            </div>
          </div>
        </aside>
        <header className="mobile-shell">
          <div className="mobile-brand-row">
            {brand}
            <span className="mobile-prototype">
              {baseline ? "2.3 全站交互" : "3.0 计时实验"}
            </span>
            {themeControl(true)}
          </div>
          {navigation(true)}
        </header>
        <main className="workspace" id="page" tabIndex={-1} data-view={route}>
          <PersistenceStatus />
          {route === "today" ? (
            <Today
              tasks={tasks}
              date={date}
              setDate={setDate}
              baseline={baseline}
              actions={actions}
              toggle={(task) => void toggle(task)}
              edit={edit}
              motionRef={motionRef}
            />
          ) : (
            <>
              <header className="page-heading">
                <div>
                  <h1>{names[route]}</h1>
                  <p className="page-description">
                    Phase 3 尚未集成 · 本阶段仅验证今日与全局计时
                  </p>
                </div>
              </header>
              <section className="phase3-shell">
                <h2>{names[route]}将在下一阶段接入</h2>
                <p>
                  当前计时会继续保留，你可以使用全局计时器暂停、继续或结束。
                </p>
                <a className="button" href="#today">
                  返回今日
                  <Icon name="arrow" />
                </a>
              </section>
            </>
          )}
        </main>
      </div>
      {!baseline && <MiniTimer mobile actions={actions} />}
      {feedback && (
        <div
          className={"toast " + (feedback.error ? "is-error" : "")}
          id="feedback"
        >
          <span id="feedback-text" role={feedback.error ? "alert" : "status"}>
            {feedback.text}
          </span>
          {feedback.undo && (
            <button
              className="undo-complete"
              onClick={async () => {
                const undo = feedback.undo!;
                motionRef.current?.(true, true);
                const ok = await run(() =>
                  service.setCompleted(undo.id, undo.value),
                );
                if (ok) setFeedback({ text: "已撤销任务状态更改。" });
              }}
            >
              撤销
            </button>
          )}
          <button
            className="icon-button"
            aria-label="关闭提示"
            onClick={() => {
              const restore = document.activeElement?.closest(".toast");
              setFeedback(null);
              if (restore)
                document
                  .querySelector<HTMLElement>(
                    ".focus-action,.completed-group summary",
                  )
                  ?.focus({ preventScroll: true });
            }}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      {panel?.kind === "inspect" && inspected && (
        <TaskInspector
          key={inspected.id}
          task={inspected}
          onClose={() => setPanel(null)}
          onEdit={() => setPanel({ kind: "edit", task: inspected })}
          onToggle={() => {
            void toggle(inspected);
            setPanel(null);
          }}
          actions={actions}
          baseline={baseline}
          returnTo={returnTo.current}
        />
      )}
      {panel?.kind === "edit" && (
        <TaskEditor
          task={panel.task}
          date={date}
          onClose={() => setPanel(null)}
          onSaved={(task) => {
            setDate(task.date);
            setPanel(null);
          }}
          actions={actions}
          returnTo={returnTo.current}
        />
      )}
      {panel?.kind === "switch" && (
        <Modal
          id="timer-switch"
          title="切换学习计时？"
          onClose={() => setPanel(null)}
          returnTo={returnTo.current}
        >
          <p className="switch-copy">
            正在计时：<strong>{panel.previous}</strong>
          </p>
          <p className="switch-copy">
            切换后将结束原会话，并为「{panel.task.title}
            」开启新会话。任务完成状态不会改变。
          </p>
          <div className="dialog-footer">
            <button
              className="button"
              data-testid="switch-cancel"
              disabled={switchBusy}
              onClick={() => setPanel(null)}
            >
              取消，保留原计时
            </button>
            <button
              className="button primary"
              data-testid="switch-confirm"
              disabled={switchBusy}
              onClick={async () => {
                setSwitchBusy(true);
                const ok = await run(
                  () => service.start(panel.task.id, { switchExisting: true }),
                  "已结束原会话并开始新的学习计时",
                );
                setSwitchBusy(false);
                if (ok) setPanel(null);
              }}
            >
              结束原计时并开始
            </button>
          </div>
        </Modal>
      )}
      {panel?.kind === "search" && (
        <Modal
          id="task-search"
          title="搜索实验任务"
          onClose={() => setPanel(null)}
          returnTo={returnTo.current}
        >
          <label htmlFor="global-search">任务名称或学习备注</label>
          <input
            id="global-search"
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索任务名称或备注"
          />
          <div className="search-results">
            {tasks
              .filter((task) =>
                `${task.title} ${task.notes}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((task) => (
                <button
                  key={task.id}
                  onClick={() => setPanel({ kind: "inspect", id: task.id })}
                >
                  <strong>{task.title}</strong>
                  <span>
                    {task.date} · {task.category}
                  </span>
                </button>
              ))}
          </div>
        </Modal>
      )}
      {!baseline && <RecoveryGate actions={actions} />}
    </>
  );
}
