# StudyFlow 3.0 Focus Lab

## Platform
web — independent React + TypeScript + Vite, loopback only.

## Scope
Approved phase2: reproduce the 2.3 Today visual/motion surface; actual timer start/pause/resume/end, today actual vs planned totals, desktop/global/mobile mini bar, reload/multi-tab/recovery, persistent session history and export API. Other views show scoped navigation stubs only; no phase3 timing integration.

## Data truth
No learning sessions are seeded. Tasks copy 23 original fixed-date 2.3 fixtures without ID/date/title/completed migration. Every session requires a user start action. Pause excluded. Uncertain offline intervals excluded pending user confirmation. End never completes task; task completion never stops timer. All writes only independent IndexedDB studyflow.lab.focus.v1 at the isolated origin. Never access studyflow.data.v1 or studyflow.theme. No cloud/sync/deployment.

## Safety
Original formal project and precision-modern-2 immutable; before-phase checkpoint/protection.json is authority. Tests and captures use fresh isolated browser contexts, never personal profile data. Do not reset existing experimental records without approval. Unknown/corrupt storage is not replaced with empty data.
