# StudyFlow 3.0 — 第二阶段验收交付

> 当前已追加「开始学习」动效修订：见 `revisions/start-motion-20261113-213855/REPORT.md` 与 `revisions/start-motion-20261113-213855/manifest.json`。计时核心与现有记录未改；页面仍用原本机地址。新演示视频在该修订的 `after/StudyFlow-start-1440.mp4` 和 `after/StudyFlow-start-390.mp4`。下文与根目录 `release-manifest.json` 保留为前一版本交付记录，原文完整副本保存在本次修订的 `before/source-and-release.tar.gz`。


## 结论与范围

独立 React + TypeScript 工程的「今日计时闭环」已实现并经过实际 Google Chrome 验证。**现在停止开发，等待用户进行视觉、功能和数据安全验收；未迁移正式工程，未进入第三阶段。**

工程：`/Users/sunboming/Projects/studyflow-mac/prototypes/studyflow-3-focus/`

- 正常本机预览：`http://127.0.0.1:5183/`
- 与 2.3 相同任务日期的对比入口：`http://127.0.0.1:5183/?date=2026-11-10`
- 正式工程仍在上两级目录；2.3 原型仍在 `../precision-modern-2/site/`，均未被替换。
- 请固定使用 `127.0.0.1:5183`。换成 localhost、换端口、换浏览器会是不同的存储环境，不会自动共享记录。

23 个固定示例任务沿用原 ID、日期、内容和完成状态，没有把日期批量改成今天。截图选择的是 **2026年11月10日**；右侧「今天实际学习」按实际本地今天 **2026年11月13日**统计。学习会话没有种子数据；示意图里的 25 分钟、2 小时等数字未作为真实历史写入。

## 已实现的行为

- 主卡片开始、暂停、继续、结束；未开始时不常驻大号零计时。
- 主卡片、今日真实时长统计、全局迷你条共享同一服务。切换日期或页面不重置会话。
- 暂停不计时；结束只结束会话，不完成任务；完成任务也不结束计时。
- 每次学习单独保存。同一任务可有多次会话，历史保留任务快照、分段、起止时间及恢复决定。
- 有计划时间时显示开始前/到点提示，但必须手动开始。无计划时间也能手动开始。
- 切换任务要求确认，不静默终止旧会话。
- 手机使用紧凑悬浮条，可展开操作；测量浮条高度并预留底部空间。
- 任务库、计划、回顾仅保留本阶段范围说明和全局计时连续性，未实施第三阶段完整集成。

## 真实存储结构和恢复规则

数据库名为 **`studyflow.lab.focus.v1`**，没有读取或覆盖正式项目的 `studyflow.data.v1`。

实际实现是两个 IndexedDB object store：

1. `state` 的 `root` 记录：实验任务、独立 session 列表、唯一 activeSlot、版本和控制信息。
2. `operations`：与状态在同一事务中提交的操作审计。恢复操作记录 sessionId、原待确认区间和 include/exclude 决定。

这是实现结构，不是把第一阶段规划的每个概念都做成一个独立 store。UI 只在事务成功完成后显示对应成功反馈。原始数据库读回验证中，两次独立会话均为 ended，状态与审计均实际存在；保护键访问记录为空。UI 快照与随后数据库读取不是同一原子时刻，不把两者误称为完全同时的快照。

计时使用时间戳、已确认分段与同生命周期单调时钟比较，不是每秒加一。确认边界是最后一次成功事务。浏览器关闭/异常接管后的不确定区间默认不计入，显示待确认窗口；用户选择计入或排除后先保持暂停，手动继续才重新累计。普通同标签短时刷新有单独的重载证据路径；无法确立连续性的情况进入待确认。

多标签使用 Web Locks 控制权和 IndexedDB 原子事务。消息只是通知，不是锁。非控制标签页仅显示已确认时长，不能开始、暂停、继续、结束或决定恢复；任务编辑/完成与计时控制是不同操作。关闭控制页后，其他页可接管，但不确定区间仍需确认。

后续导出可调用 `TimerService.exportRecords()`，返回真实 tasks、sessions 和 operations；本阶段未伪造一个尚未实现的导出界面。

## 最终实际验证

| 检查 | 结果 | 证据 |
|---|---|---|
| TypeScript strict + Vite 生产构建 | 通过 | `evidence/build-delivery.log` |
| Playwright 功能、存储故障、动效边界及复核回归 | 24 项通过，0 跳过、0 flaky、0 unexpected | `evidence/acceptance-delivery.log`、`acceptance-results.json` |
| Google Chrome 核心集成 | 20 项通过 | `evidence/core-delivery.json`、`.log` |
| 普通刷新、关闭后恢复、多标签竞争/接管 | 通过所列用例 | `acceptance-reload.json`、`acceptance-abnormal-recovery.json`、`acceptance-multi-tab.json`及核心结果 |
| IndexedDB 原始读回/事务失败回滚 | 通过所列用例 | `acceptance-lifecycle-indexeddb.json`及故障、核心结果 |
| 3 小时模拟、暂停排除、跨午夜、DST/系统时钟变化 | 通过所列模拟用例，不是个人真实学习历史 | `acceptance-simulated-long-midnight.json`及核心结果 |
| 桌面/手机 × 浅色/深色 | 四组合截图，无横向溢出 | `captures.json`、`3.0-*.png` |
| 手机最后任务可达 | 390px 探针：浮条 65px、底部预留 85px，末项在浮条上方 | `mobile-clearance.json`、`mobile-last-content.png` |
| 自动可访问性扫描 | 8 次扫描，0 violations，保留 8 次渐变对比度 incomplete | `a11y.json` |
| 主卡片文字渐变背景补充核查 | 188 个文字节点实例，最低 8.356793778227297:1，所测实例均满足适用阈值 | `contrast-manual.json`及原始诊断截图 |
| 正式源码/既有原型/历史证据保护 | 1877 项 hash 不变；原 30 成员检查点 SHA 正确 | `protection-final.json` |

没有新增依赖。项目没有另行配置 ESLint 门禁，不能把 TypeScript 构建通过说成通过了 ESLint。

### 复核发现与关闭

第一次独立审查因服务配额中断，**不是完整通过**。保存的实际探针暴露三个 P2：

- P2-01：非控制页可能认证不可靠的墙上时钟区间，详情/恢复按钮也未完全遵守计时只读。
- P2-02：结束/切任务在同次操作刚检测到中断时，可能清掉待确认区间。
- P2-03：空闲或暂停跨本地午夜时，「今天」统计日期不更新。

六条对应回归先实际失败，再最小修复并通过。后续独立审查独立重跑六条，明确将三个 ID 判定为 resolved。**该结论仅关闭这三个问题，不是全站批准。** 原始失败、未完成审查和修复前归档全部保留。

详见 `evidence/review-verdict-post.md`、`.json`、`review-regressions-red.log`。复核锁定了当时的 23 个源文件；复核结束后，仅为视频传输增加 `verified-media.ts` 并接入 Vite 配置。应用/计时源码未再变化。媒体配置单独实际验证并重新构建、运行全套测试，最终绑定见 `release-manifest.json`，不回写或扩大原独立结论。

## 2.3 视觉保留与对比

四份基线 CSS 与 2.3 保持字节一致。保留紫色品牌、深紫灰主卡、薄荷绿完成率环、中文排版、日期选择器和完成/接替/撤销语义；完成确认保留 140ms，撤销接替不追加确认等待；reduced-motion 使用真实目标，不进行空间/数字渐进插值。

四组合的诊断基线模式隐藏新增计时区域，用于隔离 React 迁移的布局差异；其关键几何与采样样式匹配旧原型。**这不是正常功能页全屏像素一致的声明**：正常页面增加了计时区域，主卡自然增高，右侧改为真实/计划统计。

- `evidence/comparison-1440-light.png`
- `evidence/comparison-390-dark.png`

对比标签放在原图之外，原图区域像素保留，未缩放；只对旧全页图裁取同样视口。正常交付截图未使用对比度诊断中的隐藏文字效果。

## 截图和真实操作视频

桌面 1440×900：`evidence/3.0-1440-light-running.png`。

手机 390×844：`evidence/3.0-390-dark-running.png`。

四组合均保留 idle/running/paused/ended，以及部分 full-page 图。视频没有模拟时钟：真实点击开始、等待、暂停、继续、刷新、切页查看迷你条、返回并结束。最终任务仍未被自动完成。

- 原始：`recording/StudyFlow-3.0-timer-post-review.webm`
- 兼容版：`public/media/StudyFlow-3.0-timer.mp4`
- 浏览器预览：`http://127.0.0.1:5183/media/StudyFlow-3.0-timer.mp4`
- 抽帧：`evidence/video-contact-sheet.png`，原尺寸帧位于 `recording/verified-frames/`。

两版均解码为 **1440×900、283 帧、11.32 秒**，逐帧 PTS 完全相同。兼容版使用 H.264/yuv420p，没有补帧、变速、裁切或缩放。接触表缩到 1/3 供浏览，标签注明实际帧号与 PTS，不是用截图拼成的视频。

已在 Chrome 验证兼容版的时长、解码尺寸、实际播放推进，以及从暂停位置准确 seek 至 6.9052 秒再继续播放。HTTP 文件与本地 SHA 相同，普通、开放末尾、后缀 Range 返回准确 206/字节内容，越界返回 416。旧开发服务器错误的后缀 Range 失败日志仍保留；现在精确单文件处理器已通过实际请求和浏览器验证，只开放该媒体路径，不新增任意目录服务。

## 性能与剩余限制

3.2 秒计时稳定运行探针：142 个 rAF 间隔，中位 17.6ms、P95 33.7ms、最大 74.3ms，未观测到 Long Task；主卡、标题、环、日期节点保持连接，根节点替换为 0。该短窗口只测计时 tick，不认证所有交互性能。保留了更早的测量，不以更好的一轮抹去较差采样。

**不宣称稳定 60fps。** 视频编码时间线是 25 帧/秒，不是网页呈现帧率；原始录制也可能保持静态帧。rAF 是调度观察，不是物理显示器呈现保证。

还没有完成：

- 实体手机、Safari/Firefox及全浏览器认证；手机是 Chrome 触控/视口模拟。
- 物理合盖/系统休眠、真实磁盘耗尽、所有升级阻塞情况。现有异常与 quota 测试有明确注入，不能当成真实硬件测试。
- 两个时钟都在休眠期间推进时，单靠它们不能证明用户仍在学习；长时间离开请暂停。历史记录反映主动运行的时段，不是注意力检测。
- 长年大量会话/逐条心跳审计的容量与性能压力验证。浏览器存储也不是跨设备备份；换浏览器不会自动同步。
- 全站可访问性认证、所有动画中间透明度帧的对比度认证。8 项 incomplete 原始结果没有被忽略或改称自动通过。

### 范围偏差记录

StudyFlow 实现和交付产物均在指定工程内，正式应用及已有重要文件未被覆盖。但独立复核子代理额外自动保存了一个通用审查技能：`/Users/sunboming/.hermes/skills/scoped-frozen-review/SKILL.md`。这是一次项目目录外的新增文件，不是任务或学习数据。已如实记录此额外副作用；没有为了清理痕迹擅自删除、移动或覆盖它。如需移除，应先得到用户确认。

## 本地复现与恢复

在本实验目录运行：

```sh
npm run dev
npm run build
TMPDIR="$PWD/.tmp" npm test
TMPDIR="$PWD/.tmp" CORE_EVIDENCE=evidence/core-rerun.json node tests/core.browser.mjs
TMPDIR="$PWD/.tmp" node tests/media-playback.mjs
```

测试使用全新隔离 context，不要改成个人浏览器 profile。复跑会更新测试结果文件；需要保留当前交付时应先复制证据或以 `release-manifest.json` 对照。

原始恢复检查点：`checkpoints/StudyFlow-before-3.0-phase2.tar.gz`。修复前候选另存 `checkpoints/pre-review-fix-20261113/runtime-evidence.tar.gz`。**恢复时仅解压到新的空目录，不能覆盖正式工程、当前实验工程或现有浏览器存储。**
