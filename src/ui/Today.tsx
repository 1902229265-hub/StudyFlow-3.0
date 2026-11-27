import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Task } from "../core/types";
import {
  asDate,
  deriveDay,
  localDate,
  monday,
  shift,
  shortDate,
  shortDuration,
  sumMinutes,
} from "./model";
import { Icon } from "./Icon";
import { ActualStats, TimerMain, type TimerActions } from "./TimerUI";
import { useAnimatedNumber, useTodayMotion } from "./motion";
interface TodayProps {
  tasks: Task[];
  date: string;
  setDate: (date: string) => void;
  baseline: boolean;
  actions: TimerActions;
  toggle: (task: Task) => void;
  edit: (task?: Task) => void;
  motionRef: React.MutableRefObject<
    ((completion?: boolean, restoring?: boolean) => void) | null
  >;
}
const TaskRow = memo(function TaskRow({
  task,
  inspect,
  toggle,
  edit,
}: {
  task: Task;
  inspect: (id: string) => void;
  toggle: (task: Task) => void;
  edit: (task: Task) => void;
}) {
  const [menu, setMenu] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null),
    menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const close = (focus = false) => {
    setMenu(false);
    if (focus) trigger.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!menu) return;
    const node = menuRef.current;
    node?.querySelector<HTMLElement>("button")?.focus();
    const onPointer = (e: PointerEvent) => {
      if (
        !node?.contains(e.target as Node) &&
        !trigger.current?.contains(e.target as Node)
      )
        close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(true);
      }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        const items = Array.from(
          node?.querySelectorAll<HTMLButtonElement>("button") || [],
        );
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? items.length - 1
              : (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) %
                items.length;
        items[next]?.focus();
      }
      if (e.key === "Tab") close();
    };
    const onScroll = () => close();
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [menu]);
  const open = () => {
    if (menu) {
      close(true);
      return;
    }
    const rect = trigger.current!.getBoundingClientRect();
    setPos({
      left: Math.max(12, Math.min(innerWidth - 208, rect.right - 196)),
      top: Math.max(12, Math.min(innerHeight - 156, rect.bottom + 5)),
    });
    setMenu(true);
  };
  const choose = (fn: () => void) => {
    close(true);
    fn();
  };
  return (
    <article
      className={"task-row " + (task.completed ? "is-done" : "")}
      data-task-id={task.id}
    >
      <button
        className="task-toggle"
        role="checkbox"
        aria-checked={task.completed}
        aria-label={`${task.completed ? "恢复" : "完成"}任务：${task.title}`}
        data-toggle={task.id}
        onClick={(e) => {
          if (e.detail < 2) toggle(task);
        }}
      >
        <span className="check-shape">
          {task.completed && <Icon name="check" />}
        </span>
      </button>
      <time className="row-time">{task.time}</time>
      <button
        className="row-body"
        data-inspect={task.id}
        onClick={() => inspect(task.id)}
      >
        <span className="task-title">{task.title}</span>
        <span className="mobile-meta">
          <time>{task.time}</time>
          <span>{task.category}</span>
          <span>{shortDuration(task.minutes)}</span>
          {task.priority === "重要" && (
            <span className="mobile-priority">重要</span>
          )}
        </span>
      </button>
      <span
        className={
          "row-priority " + (task.priority === "重要" ? "important" : "")
        }
      >
        {task.priority}
      </span>
      <span className="row-estimate">{shortDuration(task.minutes)}</span>
      <button
        ref={trigger}
        className="icon-button"
        data-task-menu={task.id}
        aria-label={`任务操作：${task.title}`}
        aria-haspopup="menu"
        aria-expanded={menu}
        onClick={open}
      >
        <Icon name="more" />
      </button>
      {menu &&
        createPortal(
          <div
            ref={menuRef}
            className="task-menu"
            role="menu"
            aria-label={`${task.title}的操作`}
            style={{ top: pos.top, left: pos.left }}
          >
            <button
              role="menuitem"
              onClick={() => choose(() => inspect(task.id))}
            >
              查看详情
            </button>
            <button role="menuitem" onClick={() => choose(() => edit(task))}>
              调整安排
            </button>
            <button role="menuitem" onClick={() => choose(() => toggle(task))}>
              {task.completed ? "恢复待办" : "标记完成"}
            </button>
          </div>,
          document.body,
        )}
    </article>
  );
});
function Orbit({
  done,
  total,
  percent,
}: {
  done: number;
  total: number;
  percent: number;
}) {
  const number = useRef<HTMLSpanElement>(null);
  useAnimatedNumber(percent, number);
  const circumference = 2 * Math.PI * 61,
    count = Math.max(1, total),
    segment = Math.max(1, circumference / count - 11);
  return (
    <div
      className="progress-orbit"
      role="progressbar"
      aria-label="所选日期任务完成率"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <svg viewBox="0 0 148 148" aria-hidden="true">
        <g transform="rotate(-90 74 74)">
          {Array.from({ length: count }, (_, i) => (
            <circle
              key={i}
              className={"orbit-piece " + (i < done ? "is-complete" : "")}
              cx="74"
              cy="74"
              r="61"
              fill="none"
              strokeDasharray={`${segment} ${circumference - segment}`}
              strokeDashoffset={(-i * circumference) / count}
            />
          ))}
        </g>
      </svg>
      <div className="orbit-value">
        <strong>
          <span ref={number} data-motion-number>
            {percent}
          </span>
          <small>%</small>
        </strong>
        <span>
          {done} / {total} 项完成
        </span>
      </div>
    </div>
  );
}
function WeekLoad({
  tasks,
  date,
  choose,
}: {
  tasks: Task[];
  date: string;
  choose: (date: string) => void;
}) {
  const first = monday(date);
  const week = Array.from({ length: 7 }, (_, i) => {
    const key = shift(first, i),
      list = tasks.filter((t) => t.date === key);
    return {
      date: key,
      n: list.length,
      done: list.filter((t) => t.completed).length,
      minutes: sumMinutes(list),
    };
  });
  const max = Math.max(1, ...week.map((d) => d.n));
  const [tip, setTip] = useState<string | null>(null),
    [dismissed, setDismissed] = useState<string | null>(null);
  return (
    <section className="week-load" aria-label="本周计划分布">
      <div className="aside-heading">
        <h2>一周的节奏</h2>
        <span>点击日期联动</span>
      </div>
      <div className="load-chart">
        {week.map((d, i) => (
          <button
            key={i}
            className="load-day"
            data-date={d.date}
            data-tip-active={tip === d.date ? "" : undefined}
            data-tip-dismissed={dismissed === d.date ? "" : undefined}
            onPointerEnter={() => {
              setTip(d.date);
              setDismissed(null);
            }}
            onPointerLeave={() => setTip(null)}
            onFocus={() => {
              setTip(d.date);
              setDismissed(null);
            }}
            onBlur={() => setTip(null)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setDismissed(d.date);
                setTip(null);
              }
            }}
            aria-describedby={`load-tip-${d.date}`}
            aria-pressed={d.date === date}
            aria-label={`${d.n} ${["一", "二", "三", "四", "五", "六", "日"][i]} ${shortDate(d.date)} 完成${d.done} · 计划${d.n} 预计${shortDuration(d.minutes)}，选择${d.date}`}
            onClick={() => {
              choose(d.date);
              setTip(d.date);
            }}
          >
            <span className="load-value">{d.n}</span>
            <span className="load-track" aria-hidden="true">
              <i style={{ transform: `scaleY(${d.n / max})` }} />
              <b
                className="load-completed-bar"
                style={{ transform: `scaleY(${d.done / max})` }}
              />
            </span>
            <span className="load-label">
              {["一", "二", "三", "四", "五", "六", "日"][i]}
            </span>
            <span className="load-tip" role="tooltip" id={`load-tip-${d.date}`}>
              {shortDate(d.date)}
              <br />
              完成{d.done} · 计划{d.n}
              <br />
              预计{shortDuration(d.minutes)}
            </span>
          </button>
        ))}
      </div>
      <p className="caption">按计划日期统计，不是实际学习时长。</p>
    </section>
  );
}
export const Today = memo(function Today({
  tasks,
  date,
  setDate,
  baseline,
  actions,
  toggle,
  edit,
  motionRef,
}: TodayProps) {
  const todayKey = baseline ? "2026-11-10" : localDate();
  const day = deriveDay(tasks, date),
    focus = day.focus;
  const first = monday(date);
  const signature = date + JSON.stringify(tasks);
  const { root, capture } = useTodayMotion(signature);
  useLayoutEffect(() => {
    motionRef.current = capture;
    return () => {
      motionRef.current = null;
    };
  }, [motionRef, capture]);
  const choose = (next: string) => {
    if (next === date) return;
    capture();
    setDate(next);
  };
  const orbit = (
    <Orbit
      done={day.done.length}
      total={day.daily.length}
      percent={day.percent}
    />
  );
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>{date === todayKey ? "今日" : "当日任务"}</h1>
          <p className="page-description">
            {asDate(date).getFullYear()}年{shortDate(date)}　
            {asDate(date).toLocaleDateString("zh-CN", { weekday: "long" })} ·{" "}
            {baseline ? "2.3 交互预览" : "3.0 计时实验"}
          </p>
        </div>
        <div className="heading-actions">
          <button className="button primary" data-new onClick={() => edit()}>
            <Icon name="plus" />
            新建任务
          </button>
        </div>
      </header>
      <div ref={root}>
        <div className="v2-calendar">
          <div className="week-navigation">
            <span className="week-label">
              {asDate(first).getFullYear()}年{shortDate(first)} —{" "}
              {shortDate(shift(first, 6))}
            </span>
            <div className="week-arrows">
              <button
                className="icon-button"
                data-week="-1"
                aria-label="上一周"
                onClick={() => choose(shift(date, -7))}
              >
                <Icon name="left" />
              </button>
              <button
                className="button ghost"
                data-today
                onClick={() => choose(todayKey)}
              >
                本周
              </button>
              <button
                className="icon-button"
                data-week="1"
                aria-label="下一周"
                onClick={() => choose(shift(date, 7))}
              >
                <Icon name="right" />
              </button>
            </div>
          </div>
          <div className="week-strip" role="group" aria-label="一周学习日期">
            {Array.from({ length: 7 }, (_, i) => {
              const key = shift(first, i);
              return (
                <button
                  key={i}
                  className={"week-day " + (key === todayKey ? "is-today" : "")}
                  data-date={key}
                  aria-pressed={key === date}
                  aria-label={`${["周一", "周二", "周三", "周四", "周五", "周六", "周日"][i]} ${asDate(key).getDate()}，选择${key}`}
                  onClick={() => choose(key)}
                >
                  <span>
                    {
                      ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][
                        i
                      ]
                    }
                  </span>
                  <strong>{asDate(key).getDate()}</strong>
                </button>
              );
            })}
          </div>
        </div>
        <div className="day-content">
          {focus ? (
            <article
              className="focus-stage"
              data-task-id={focus.id}
              aria-label="当前学习焦点"
            >
              <div className="focus-top">
                <div className="focus-copy">
                  <h2>{focus.title}</h2>
                  <div className="focus-meta">
                    <span>
                      <Icon name="clock" />
                      <time>{focus.time || "未设时间"}</time>
                    </span>
                    <span>预计 {shortDuration(focus.minutes)}</span>
                    <span>{focus.category}</span>
                    <span className="focus-priority">{focus.priority}</span>
                  </div>
                </div>
                {orbit}
              </div>
              <div className="focus-bottom">
                <p className="focus-notes">{focus.notes}</p>
                <div className="focus-actions">
                  <button
                    className="focus-details"
                    data-inspect={focus.id}
                    onClick={() => actions.inspect(focus.id)}
                  >
                    查看详情
                    <Icon name="arrow" />
                  </button>
                  <button
                    className="focus-action"
                    data-toggle={focus.id}
                    onClick={(e) => {
                      if (e.detail < 2) toggle(focus);
                    }}
                  >
                    <Icon name="check" />
                    完成这一项
                  </button>
                </div>
              </div>
              {!baseline && <TimerMain task={focus} actions={actions} />}
            </article>
          ) : (
            <section
              className="focus-stage focus-empty"
              aria-label="当前学习焦点"
            >
              <div className="focus-top">
                <div className="focus-copy">
                  <h2>
                    {day.daily.length
                      ? "这一天的安排，已经完成。"
                      : "为这一天，安排一件具体的事。"}
                  </h2>
                  <p className="focus-notes">
                    {day.daily.length
                      ? "完成记录仍保留在下面，可以恢复或查看。"
                      : "不把其他日期的任务算进今天。"}
                  </p>
                  <button
                    className="focus-action"
                    data-new
                    onClick={() => edit()}
                  >
                    <Icon name="plus" />
                    添加学习安排
                  </button>
                </div>
                {orbit}
              </div>
            </section>
          )}
          {!baseline && <ActualStats compact />}
          <div className="v2-lower">
            <section className="next-list" aria-label="后续学习任务">
              <div className="list-heading">
                <h2>
                  {day.rest.length ? "接下来的安排" : "待办清单"}
                  <span className="count">{day.rest.length} 项</span>
                </h2>
                <span className="caption">与焦点共用同一份任务</span>
              </div>
              {day.rest.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  inspect={actions.inspect}
                  toggle={toggle}
                  edit={edit}
                />
              ))}
              {!day.pending.length && (
                <p className="next-empty">
                  {day.daily.length
                    ? "没有遗漏的待办任务。"
                    : "添加任务后，学习安排会显示在这里。"}
                </p>
              )}
              <details className="completed-group">
                <summary>
                  <Icon name="down" />
                  已完成<span className="count">{day.done.length}</span>
                </summary>
                {day.done.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    inspect={actions.inspect}
                    toggle={toggle}
                    edit={edit}
                  />
                ))}
              </details>
              <div className="list-footer">
                <span>
                  {baseline
                    ? "内存示例 · 刷新还原"
                    : "固定日期样例 · 更改仅存本机"}
                </span>
                <a className="text-action" href="#library">
                  查看全部任务
                  <Icon name="arrow" />
                </a>
              </div>
            </section>
            <aside className="v2-balance" aria-label="当日安排与周计划">
              {baseline ? (
                <>
                  <div className="aside-heading">
                    <h2>留给学习的时间</h2>
                  </div>
                  <dl className="balance-numbers">
                    <div>
                      <dt>待办预计</dt>
                      <dd data-remaining-minutes={sumMinutes(day.pending)}>
                        {shortDuration(sumMinutes(day.pending))}
                      </dd>
                    </div>
                    <div>
                      <dt>全部安排</dt>
                      <dd>{shortDuration(day.plannedMinutes)}</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <ActualStats />
              )}
              <WeekLoad tasks={tasks} date={date} choose={choose} />
              <a className="text-action" href="#plan">
                调整学习计划
                <Icon name="arrow" />
              </a>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
});
