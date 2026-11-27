import { useLayoutEffect, useRef, useState } from "react";
import { useTimerEntrance } from "./timer-motion";
import type { Task, StudySession } from "../core/types";
import {
  activeSession,
  service,
  useMobile,
  useSelected,
  useTick,
} from "./service";
import {
  clockTime,
  localDate,
  measuredText,
  plannedEnd,
  shortDuration,
  timerText,
} from "./model";
import { Icon } from "./Icon";
export interface TimerActions {
  run: (action: () => Promise<unknown>, message?: string) => Promise<boolean>;
  start: (task: Task) => void;
  inspect: (id: string) => void;
}
function SessionTime({ session }: { session: StudySession }) {
  const at = useTick(session.status === "running");
  return (
    <span className="timer-digits">
      {timerText(service.elapsed(session, at))}
    </span>
  );
}
function PlanStatus({ task }: { task: Task }) {
  const now = useTick(true);
  if (!task.time)
    return (
      <span className="timer-subcopy" data-testid="plan-start-status">
        未设置开始时间，可随时手动开始
      </span>
    );
  const planned = new Date(`${task.date}T${task.time}:00`).getTime(),
    delta = planned - now;
  return (
    <span
      className="timer-subcopy"
      data-testid="plan-start-status"
      data-due={delta <= 0 ? "true" : "false"}
    >
      {delta > 0
        ? `距离计划开始 ${timerText(delta)}`
        : "已到计划时间，可随时开始"}
    </span>
  );
}
export function TimerMain({
  task,
  actions,
}: {
  task: Task;
  actions: TimerActions;
}) {
  const state = useSelected((s) => ({
    session: activeSession(s),
    ready: s.ready,
    controller: s.isController,
    last: s.sessions
      .filter((item) => item.taskId === task.id && item.status === "ended")
      .at(-1),
  }));
  const session = state.session,
    own = session?.taskId === task.id;
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLElement>(null);
  const keyboardStart = useRef(false);
  useTimerEntrance(root, own && session ? session.id : null, "main");
  useLayoutEffect(() => {
    if (own && keyboardStart.current) {
      root.current?.querySelector<HTMLButtonElement>('[data-testid="timer-pause"]')?.focus({preventScroll:true});
      keyboardStart.current=false;
    }
  }, [own, session?.id]);
  const act = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    await actions.run(fn, message);
    setBusy(false);
  };
  return (
    <section
      ref={root}
      className={"timer-main " + (own ? "has-session" : "")}
      data-testid="timer-main"
      aria-label="任务学习计时"
    >
      {own && session ? (
        <>
          <div className="timer-main-copy">
            <span className="timer-state" role="status">
              <i className={session.status === "running" ? "is-running" : ""} />
              {session.status === "running"
                ? "正在学习"
                : session.status === "recovering"
                  ? "等待恢复确认"
                  : "计时已暂停"}
            </span>
            <SessionTime session={session} />
            <span className="timer-subcopy">
              实际开始 {new Date(session.startedAt).toLocaleDateString("zh-CN")}{" "}
              {clockTime(session.startedAt)} · 与任务完成独立
            </span>
          </div>
          <div className="timer-actions">
            {session.status === "running" ? (
              <button
                className="timer-button"
                data-testid="timer-pause"
                aria-label="暂停计时"
                disabled={busy || !state.controller}
                onClick={() => void act(() => service.pause(), "计时已暂停")}
              >
                <Icon name="pause" />
                暂停
              </button>
            ) : (
              <button
                className="timer-button"
                data-testid="timer-resume"
                aria-label="继续计时"
                disabled={
                  busy || !state.controller || session.status === "recovering"
                }
                onClick={() => void act(() => service.resume(), "已继续计时")}
              >
                <Icon name="play" />
                继续
              </button>
            )}
            <button
              className="timer-button timer-end"
              data-testid="timer-end"
              aria-label="结束学习计时"
              disabled={
                busy || !state.controller || session.status === "recovering"
              }
              onClick={() =>
                void act(() => service.end(), "本次计时已结束，任务状态未改变")
              }
            >
              <Icon name="stop" />
              结束学习
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="timer-main-copy">
            <span className="timer-plan">
              <Icon name="clock" />
              计划 {task.time || "未设开始时间"} —{" "}
              {plannedEnd(task.time, task.minutes)}
            </span>
            <span className="timer-subcopy">
              预计 {shortDuration(task.minutes)} · 开始后记录实际学习时长
            </span>
            <PlanStatus task={task} />
            {state.last && (
              <span
                className="timer-subcopy"
                data-testid="last-session-duration"
                data-ms={service.elapsed(state.last)}
              >
                本次学习 {timerText(service.elapsed(state.last))} ·
                已保存
              </span>
            )}
            {session && (
              <span className="timer-other">
                当前计时：{session.taskSnapshot.title}（
                {session.status === "running" ? "进行中" : "已暂停"}）
              </span>
            )}
          </div>
          <button
            className="timer-button timer-start"
            data-testid="timer-start"
            aria-label={session ? "切换到此任务并开始计时" : "开始学习计时"}
            disabled={!state.ready || busy || !state.controller}
            onClick={(event) => { keyboardStart.current=event.detail===0; actions.start(task); }}
          >
            <Icon name="play" />
            {session ? "切换并开始" : "开始学习"}
          </button>
        </>
      )}
    </section>
  );
}
export function ActualStats({ compact = false }: { compact?: boolean }) {
  const mobile = useMobile();
  const snapshot = useSelected((s) => ({
    active: activeSession(s),
    revision: s.revision,
  }));
  const now = useTick(snapshot.active?.status === "running");
  if (compact !== mobile) return null;
  const today = localDate(new Date(now));
  const stats = service.daily(today, now);
  const difference = stats.actualMs - stats.plannedMs;
  return (
    <section
      className={
        "actual-stats " + (compact ? "actual-mobile" : "actual-desktop")
      }
      aria-label="今天实际学习统计"
    >
      <div className="aside-heading">
        <h2>今天实际学习</h2>
        <span>{today.slice(5).replace("-", "月")}日</span>
      </div>
      <dl className="actual-numbers">
        <div>
          <dt>实际用时</dt>
          <dd data-testid="today-actual" data-ms={stats.actualMs}>
            {measuredText(stats.actualMs)}
          </dd>
        </div>
        <div>
          <dt>今日计划</dt>
          <dd data-testid="today-planned" data-ms={stats.plannedMs}>
            {measuredText(stats.plannedMs)}
          </dd>
        </div>
        <div>
          <dt>实际 − 计划</dt>
          <dd>
            {difference === 0
              ? "0分钟"
              : `${difference > 0 ? "+" : "−"}${measuredText(Math.abs(difference))}`}
          </dd>
        </div>
        <div>
          <dt>计时任务</dt>
          <dd>
            {stats.timedTaskCount}
            <small> 项</small>
          </dd>
        </div>
      </dl>
      <p className="caption">
        按本地今天统计，不随所选计划日期变化。仅计入已确认的学习时间。
      </p>
    </section>
  );
}
export function MiniTimer({
  mobile = false,
  actions,
}: {
  mobile?: boolean;
  actions: TimerActions;
}) {
  const isMobile = useMobile();
  const controller = useSelected((s) => s.isController);
  const session = useSelected(activeSession);
  const [expanded, setExpanded] = useState(false),
    [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useTimerEntrance(root, session && mobile === isMobile ? session.id : null, mobile ? "mobile" : "sidebar");
  useLayoutEffect(() => {
    if (!mobile) return;
    const node = root.current;
    const update = () =>
      document.documentElement.style.setProperty(
        "--mini-reserve",
        node
          ? `${Math.ceil(node.getBoundingClientRect().height) + 20}px`
          : "0px",
      );
    update();
    if (!node) return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--mini-reserve");
    };
  }, [mobile, session?.id, expanded, isMobile]);
  if (!session || mobile !== isMobile) return null;
  const act = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    await actions.run(fn, message);
    setBusy(false);
  };
  const controls = (
    <div className="mini-controls">
      {session.status === "running" ? (
        <button
          aria-label="暂停当前计时"
          className="icon-button"
          disabled={busy || !controller}
          onClick={() => void act(() => service.pause(), "计时已暂停")}
        >
          <Icon name="pause" />
        </button>
      ) : (
        <button
          aria-label="继续当前计时"
          className="icon-button"
          disabled={busy || !controller || session.status === "recovering"}
          onClick={() => void act(() => service.resume(), "已继续计时")}
        >
          <Icon name="play" />
        </button>
      )}
      <button
        aria-label="结束当前计时"
        className="icon-button"
        disabled={busy || !controller || session.status === "recovering"}
        onClick={() => void act(() => service.end(), "本次计时已结束")}
      >
        <Icon name="stop" />
      </button>
    </div>
  );
  return (
    <div
      ref={root}
      className={mobile ? "mobile-mini" : "sidebar-mini"}
      role="region"
      aria-label="全局学习计时"
      data-testid="mini-timer"
    >
      <div className="mini-main">
        {mobile ? (
          <div className="mini-summary">
            <button
              className="mini-expand"
              aria-expanded={expanded}
              aria-controls="mobile-timer-panel"
              aria-label={`${session.taskSnapshot.title}，${expanded ? "收起计时面板" : "展开计时面板"}`}
              onClick={() => setExpanded((v) => !v)}
            >
              <span className="mini-title">{session.taskSnapshot.title}</span>
            </button>
            <span className="mini-time">
              <SessionTime session={session} />
              <small>
                {session.status === "running" ? "正在学习" : "已暂停"}
              </small>
            </span>
          </div>
        ) : (
          <>
            <p className="mini-state">
              {session.status === "running" ? "正在学习" : "计时已暂停"}
            </p>
            <span className="mini-title">{session.taskSnapshot.title}</span>
            <SessionTime session={session} />
          </>
        )}
        {(!mobile || !expanded) && controls}
      </div>
      {(!mobile || expanded) && (
        <div
          className="mini-panel"
          id={mobile ? "mobile-timer-panel" : undefined}
        >
          {mobile && (
            <>
              <p className="caption">
                实际开始 {clockTime(session.startedAt)} ·{" "}
                {session.status === "recovering"
                  ? "请先确认恢复区间"
                  : "任务完成不会自动结束计时"}
              </p>
              {controls}
            </>
          )}
          <button
            className="text-action"
            aria-label="查看计时任务详情"
            onClick={() => actions.inspect(session.taskId)}
          >
            查看计时任务
            <Icon name="arrow" />
          </button>
        </div>
      )}
    </div>
  );
}
export function SessionHistory({ taskId }: { taskId: string }) {
  const sessions = useSelected((s) =>
    s.sessions.filter((session) => session.taskId === taskId),
  );
  return (
    <section className="session-history">
      <h3>实际学习记录</h3>
      {sessions.length ? (
        sessions.map((session) => (
          <article className="session-record" key={session.id}>
            <div className="session-heading">
              <strong>
                {new Date(session.startedAt).toLocaleString("zh-CN")}
              </strong>
              <span>
                {session.status === "ended"
                  ? "已结束"
                  : session.status === "running"
                    ? "进行中"
                    : session.status === "recovering"
                      ? "待恢复确认"
                      : "已暂停"}
              </span>
            </div>
            <p>
              已确认{" "}
              {timerText(
                session.segments.reduce(
                  (n, segment) => n + segment.confirmedMs,
                  0,
                ),
              )}
              <span className="muted"> · 不含未确认区间</span>
            </p>
            <ol className="session-trace">
              <li>
                开始：{new Date(session.startedAt).toLocaleString("zh-CN")}
              </li>
              {session.segments.map((segment) => (
                <li key={segment.id}>
                  {segment.kind === "recovered" ? "恢复计入" : "运行区间"}：
                  {new Date(segment.startedAt).toLocaleString("zh-CN")} —{" "}
                  {segment.endedAt
                    ? new Date(segment.endedAt).toLocaleString("zh-CN")
                    : "尚未结束"}
                  <br />
                  <small>
                    已确认 {segment.confirmedMs} ms · 时区 {segment.timeZone}
                  </small>
                  {segment.endedAt && (
                    <span className="trace-pause">
                      {segment.endedAt === session.endedAt ? "结束" : "暂停"}：
                      {new Date(segment.endedAt).toLocaleString("zh-CN")}
                    </span>
                  )}
                </li>
              ))}
              {session.pendingGap && (
                <li>
                  未确认区间：
                  {new Date(session.pendingGap.from).toLocaleString(
                    "zh-CN",
                  )} — {new Date(session.pendingGap.to).toLocaleString("zh-CN")}
                  （尚未计入）
                </li>
              )}
              {session.endedAt && (
                <li>
                  会话结束：{new Date(session.endedAt).toLocaleString("zh-CN")}
                </li>
              )}
            </ol>
          </article>
        ))
      ) : (
        <p className="muted">还没有计时记录。完成计划任务不会生成实际用时。</p>
      )}
    </section>
  );
}
