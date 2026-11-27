import type { Task } from "../core/types";
export const categories = [
  "编程开发",
  "语言学习",
  "阅读写作",
  "通识学习",
] as const;
export const names = {
  today: "今日",
  library: "任务库",
  plan: "学习计划",
  review: "学习回顾",
};
export type Route = keyof typeof names;
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const asDate = (key: string) => new Date(key + "T12:00:00");
export function shift(key: string, amount: number) {
  const d = asDate(key);
  d.setDate(d.getDate() + amount);
  return localDate(d);
}
export const monday = (key: string) =>
  shift(key, -((asDate(key).getDay() + 6) % 7));
export const shortDate = (key: string) =>
  `${asDate(key).getMonth() + 1}月${asDate(key).getDate()}日`;
export const shortDuration = (minutes: number) =>
  minutes >= 60
    ? `${Math.floor(minutes / 60)}小时${minutes % 60 ? `${minutes % 60}分` : ""}`
    : `${minutes}分钟`;
export const sumMinutes = (tasks: Task[]) =>
  tasks.reduce((n, t) => n + t.minutes, 0);
const priorities = { 重要: 0, 普通: 1, 低优先: 2 };
export function ordered(tasks: Task[], priority = false) {
  return [...tasks].sort(
    (a, b) =>
      (priority ? priorities[a.priority] - priorities[b.priority] : 0) ||
      a.date.localeCompare(b.date) ||
      (a.time || "").localeCompare(b.time || ""),
  );
}
export function deriveDay(tasks: Task[], date: string) {
  const daily = ordered(tasks.filter((t) => t.date === date));
  const pending = ordered(
    daily.filter((t) => !t.completed),
    true,
  );
  const done = daily.filter((t) => t.completed);
  return {
    daily,
    pending,
    done,
    focus: pending[0],
    rest: pending.slice(1),
    percent: daily.length ? Math.round((done.length / daily.length) * 100) : 0,
    plannedMinutes: sumMinutes(daily),
  };
}
export function timerText(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}
export function measuredText(ms: number) {
  if (ms === 0) return "0分钟";
  if (ms < 60000) return `${Math.floor(ms / 1000)}秒`;
  return shortDuration(Math.floor(ms / 60000));
}
export const clockTime = (at: number) =>
  new Date(at).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
export function plannedEnd(time: string | null, minutes: number) {
  if (!time) return "未设时间";
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}${total >= 1440 ? "（次日）" : ""}`;
}
