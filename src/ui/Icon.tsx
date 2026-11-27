import type { CSSProperties } from "react";
const paths: Record<string, string> = {
  book: '<path d="M3 4.5h5a3 3 0 0 1 3 2 3 3 0 0 1 3-2h5v13h-5a3 3 0 0 0-3 2 3 3 0 0 0-3-2H3Z"/><path d="M11 6.5v13"/>',
  today:
    '<rect x="3" y="4" width="16" height="16" rx="3"/><path d="M7 2v4m8-4v4M3 9h16m-12 4h3m-3 3h6"/>',
  calendar:
    '<rect x="3" y="4" width="16" height="16" rx="3"/><path d="M7 2v4m8-4v4M3 9h16M7 13h.01m4 0h.01m4 0h.01M7 16h.01m4 0h.01"/>',
  list: '<rect x="3" y="3" width="16" height="17" rx="3"/><path d="M7 8h8M7 12h8M7 16h5"/>',
  chart: '<path d="M3 3v16h17M7 15v-4m5 4V6m5 9V9"/>',
  search: '<circle cx="9.5" cy="9.5" r="6"/><path d="m14 14 5 5"/>',
  plus: '<path d="M11 4v14m-7-7h14"/>',
  down: '<path d="m6 8 5 5 5-5"/>',
  left: '<path d="m13 5-6 6 6 6"/>',
  right: '<path d="m8 5 6 6-6 6"/>',
  arrow: '<path d="M4 11h14m-5-5 5 5-5 5"/>',
  check: '<path d="m5 11 4 4 8-9"/>',
  more: '<circle cx="5" cy="11" r=".8"/><circle cx="11" cy="11" r=".8"/><circle cx="17" cy="11" r=".8"/>',
  close: '<path d="m5 5 12 12M17 5 5 17"/>',
  sun: '<circle cx="11" cy="11" r="4"/><path d="M11 1v2m0 16v2M1 11h2m16 0h2M4 4l1.5 1.5m11 11L18 18M18 4l-1.5 1.5m-11 11L4 18"/>',
  moon: '<path d="M19 13a8 8 0 0 1-10-10 8 8 0 1 0 10 10Z"/>',
  switch: '<path d="m8 4 3-3 3 3M8 18l3 3 3-3"/>',
  clock: '<circle cx="11" cy="11" r="8"/><path d="M11 6v5l3 2"/>',
  edit: '<path d="m4 15 10-10 3 3L7 18l-4 1Zm9-9 3 3"/>',
  play: '<path d="m8 4 11 7-11 7Z"/>',
  pause: '<path d="M7 4v14M15 4v14"/>',
  stop: '<rect x="5" y="5" width="12" height="12" rx="2"/>',
  reset: '<path d="M4 7a8 8 0 1 1-1 6M3 3v5h5"/>',
};
export function Icon({ name, style }: { name: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
      dangerouslySetInnerHTML={{ __html: paths[name] || paths.more }}
    />
  );
}
