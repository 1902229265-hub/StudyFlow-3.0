import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Task } from "../core/types";
import { categories, shortDuration } from "./model";
import { MotionTokens } from "./motion";
import { activeSession, service, useSelected } from "./service";
import { Icon } from "./Icon";
import { SessionHistory, type TimerActions } from "./TimerUI";
export function Modal({
  id,
  title,
  children,
  onClose,
  locked = false,
  returnTo,
}: {
  id: string;
  title: string;
  children: ReactNode;
  onClose: () => void;
  locked?: boolean;
  returnTo?: HTMLElement | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const animation = useRef<Animation | null>(null);
  const closing = useRef(false);
  const close = () => {
    if (closing.current || locked) return;
    closing.current = true;
    const el = dialog.current;
    if (!el) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    animation.current?.cancel();
    const a = el.animate(
      [
        { opacity: 1, transform: "translateY(0) scale(1)" },
        {
          opacity: 0,
          transform: reduced ? "none" : "translateY(6px) scale(.99)",
        },
      ],
      { duration: reduced ? 80 : 120, easing: MotionTokens.ease },
    );
    animation.current = a;
    a.finished.then(
      () => onClose(),
      () => {},
    );
  };
  useEffect(() => {
    const el = dialog.current!;
    el.showModal();
    el.classList.add("is-presented");
    animation.current = el.animate(
      [
        { opacity: 0, transform: "translateY(8px) scale(.985)" },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ],
      {
        duration: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 80
          : 220,
        easing: MotionTokens.ease,
      },
    );
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const cancel = () => animation.current?.finish();
    mq.addEventListener("change", cancel);
    return () => {
      animation.current?.cancel();
      mq.removeEventListener("change", cancel);
      el.close();
      requestAnimationFrame(() => {
        if (document.querySelector("dialog[open]")) return;
        const target = returnTo?.isConnected
          ? returnTo
          : document.querySelector<HTMLElement>(
              ".focus-action,[data-new],#page",
            );
        target?.focus({ preventScroll: true });
      });
    };
  }, []);
  return (
    <dialog
      id={id}
      ref={dialog}
      className={
        "dialog " + (id === "task-inspector" ? "inspector-dialog" : "")
      }
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !locked) {
          const rect = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            close();
        }
      }}
    >
      <div className="inspector-content">
        <div className="dialog-header">
          <h2 id={`${id}-title`}>{title}</h2>
          {!locked && (
            <button
              className="icon-button"
              aria-label="关闭对话框"
              onClick={close}
            >
              <Icon name="close" />
            </button>
          )}
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function TaskEditor({
  task,
  date,
  onClose,
  onSaved,
  actions,
  returnTo,
}: {
  task?: Task;
  date: string;
  onClose: () => void;
  onSaved: (task: Task) => void;
  actions: TimerActions;
  returnTo?: HTMLElement | null;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      id="task-editor"
      title={task ? "调整学习安排" : "新建学习任务"}
      onClose={onClose}
      returnTo={returnTo}
    >
      <form
        className="phase2-editor"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const data = new FormData(e.currentTarget);
          const title = String(data.get("title") || "").trim();
          if (!title) {
            setError("请输入任务名称。");
            return;
          }
          const next: Task = {
            id: task?.id || `lab-${crypto.randomUUID()}`,
            title,
            category: data.get("category") as Task["category"],
            priority: data.get("priority") as Task["priority"],
            date: String(data.get("date")),
            time: String(data.get("time")) || null,
            minutes: Number(data.get("minutes")),
            notes: String(data.get("notes") || "").trim(),
            completed: task?.completed || false,
          };
          setBusy(true);
          const ok = await actions.run(
            () => service.saveTask(next),
            task ? "学习安排已保存" : "学习任务已添加",
          );
          setBusy(false);
          if (ok) onSaved(next);
          else setError("未保存，请检查上方错误信息后重试。");
        }}
      >
        <div className="field">
          <label htmlFor="sample-title">任务名称</label>
          <input
            id="sample-title"
            name="title"
            maxLength={120}
            required
            autoFocus
            defaultValue={task?.title || ""}
            placeholder="明确一个具体的学习任务"
          />
        </div>
        <div className="field-columns">
          <div className="field">
            <label htmlFor="sample-category">任务分类</label>
            <select
              id="sample-category"
              name="category"
              defaultValue={task?.category || "编程开发"}
            >
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sample-priority">优先级</label>
            <select
              id="sample-priority"
              name="priority"
              defaultValue={task?.priority || "普通"}
            >
              {["普通", "重要", "低优先"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="field-columns">
          <div className="field">
            <label htmlFor="sample-date">计划日期</label>
            <input
              id="sample-date"
              name="date"
              type="date"
              required
              min="2020-01-01"
              max="2099-12-31"
              defaultValue={task?.date || date}
            />
          </div>
          <div className="field">
            <label htmlFor="sample-time">开始时间</label>
            <input
              id="sample-time"
              name="time"
              type="time"
              defaultValue={task ? (task.time ?? "") : "10:00"}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="sample-minutes">预计用时（分钟）</label>
          <input
            id="sample-minutes"
            name="minutes"
            type="number"
            min="5"
            max="720"
            step="5"
            required
            defaultValue={task?.minutes || 30}
          />
        </div>
        <div className="field">
          <label htmlFor="sample-notes">学习备注</label>
          <textarea
            id="sample-notes"
            name="notes"
            maxLength={1000}
            defaultValue={task?.notes || ""}
            placeholder="补充材料、步骤或想解决的问题"
          />
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-footer">
          <span className="form-note">仅保存在本机实验数据库</span>
          <button type="button" className="button" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? "正在保存…" : task ? "应用调整" : "添加学习任务"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function TaskInspector({
  task,
  onClose,
  onEdit,
  onToggle,
  actions,
  baseline,
  returnTo,
}: {
  task: Task;
  onClose: () => void;
  onEdit: () => void;
  onToggle: () => void;
  actions: TimerActions;
  baseline: boolean;
  returnTo?: HTMLElement | null;
}) {
  const isController = useSelected((s) => s.isController);
  return (
    <Modal
      id="task-inspector"
      title={task.title}
      onClose={onClose}
      returnTo={returnTo}
    >
      <p className="inspector-status">
        <Icon name={task.completed ? "check" : "clock"} />
        {task.completed ? "已完成" : "待完成"}
      </p>
      <dl className="inspector-meta">
        <dt>任务分类</dt>
        <dd>{task.category}</dd>
        <dt>计划安排</dt>
        <dd>
          {task.date}　{task.time || "未设时间"}
        </dd>
        <dt>预计用时</dt>
        <dd>{shortDuration(task.minutes)}</dd>
        <dt>优先级</dt>
        <dd>{task.priority}</dd>
      </dl>
      <section className="inspector-notes">
        <h3>学习备注</h3>
        <p>{task.notes || "暂未添加备注。"}</p>
      </section>
      {!baseline && (
        <>
          <SessionHistory taskId={task.id} />
          <button
            className="button inspector-start"
            disabled={!isController}
            onClick={() => {
              onClose();
              actions.start(task);
            }}
          >
            <Icon name="play" />
            为此任务开始计时
          </button>
        </>
      )}
      <div className="dialog-footer">
        <span className="form-note">仅操作当前实验数据</span>
        <button className="button" onClick={onEdit}>
          <Icon name="edit" />
          调整安排
        </button>
        <button
          className="button primary"
          data-inspector-toggle={task.id}
          onClick={onToggle}
        >
          {task.completed ? "恢复待办" : "标记完成"}
        </button>
      </div>
    </Modal>
  );
}
export function RecoveryGate({ actions }: { actions: TimerActions }) {
  const session = useSelected((s) => {
    const active = activeSession(s);
    return active?.status === "recovering" ? active : null;
  });
  const [busy, setBusy] = useState(false);
  const isController = useSelected((s) => s.isController);
  if (!session?.pendingGap) return null;
  const gap = session.pendingGap;
  const recover = async (include: boolean) => {
    setBusy(true);
    await actions.run(
      () => service.recover(include),
      "恢复选择已保存。计时保持暂停，请手动继续。",
    );
    setBusy(false);
  };
  return (
    <Modal
      key={session.id}
      id="timer-recovery"
      title="确认离开期间的学习时间"
      locked
      onClose={() => {}}
    >
      <p className="recovery-copy">{session.taskSnapshot.title}</p>
      <p className="caption">
        检测到计时中断。下面的区间尚未计入，系统不会替你决定。
      </p>
      <dl className="inspector-meta">
        <dt>未确认区间</dt>
        <dd>
          {new Date(gap.from).toLocaleString("zh-CN")}
          <br />至 {new Date(gap.to).toLocaleString("zh-CN")}
        </dd>
        <dt>中断原因</dt>
        <dd>
          {gap.reason === "owner-disconnected"
            ? "计时页面曾断开"
            : gap.reason === "clock-or-sleep-discontinuity"
              ? "设备休眠或时钟变化"
              : gap.reason}
        </dd>
      </dl>
      <p className="recovery-copy">
        若期间没有持续学习，请选择不计入。两种选择都会先保持暂停。
      </p>
      <div className="dialog-footer">
        <button
          className="button"
          data-testid="recovery-exclude"
          disabled={busy || !isController}
          onClick={() => void recover(false)}
        >
          不计入，保持暂停
        </button>
        <button
          className="button primary"
          data-testid="recovery-include"
          disabled={busy || !isController}
          onClick={() => void recover(true)}
        >
          计入，保持暂停
        </button>
      </div>
    </Modal>
  );
}
