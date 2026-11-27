# StudyFlow 3.0 · Phase 2 实验工程

> 当前已追加「开始学习」动效修订：见 `revisions/start-motion-20261113-213855/REPORT.md` 与 `revisions/start-motion-20261113-213855/manifest.json`。计时核心与现有记录未改；页面仍用原本机地址。新演示视频在该修订的 `after/StudyFlow-start-1440.mp4` 和 `after/StudyFlow-start-390.mp4`。下文与根目录 `release-manifest.json` 保留为前一版本交付记录，原文完整副本保存在本次修订的 `before/source-and-release.tar.gz`。


仅实现「今日计时闭环」，等待用户验收；不自动进入第三阶段或迁移正式工程。

## 打开

- 正常入口：<http://127.0.0.1:5183/>
- 2.3 同日期任务对比：<http://127.0.0.1:5183/?date=2026-11-10>
- 真实操作视频：<http://127.0.0.1:5183/media/StudyFlow-3.0-timer.mp4>

如服务已关闭，请在本目录执行 `npm run dev`。开发服务绑定 `127.0.0.1:5183`，没有部署互联网。依赖复用正式工程已有安装，本次未安装新依赖。

## 数据边界

独立 IndexedDB：`studyflow.lab.focus.v1`。正式 `studyflow.data.v1` 不读取、不覆盖、不清理。

23 个原型任务保持原日期和 ID，学习会话初始为空。截图使用 2026-11-10 的任务；右侧实际学习统计按真实本地今天计算。原任务预计时长不算实际学习时长。

非控制标签页计时只读；需要在持有控制权的页面操作。关闭控制页可接管，不确定离线区间默认不计入，等待明确选择。

不要把 localhost、其他端口或其他浏览器当成同一个数据库；没有跨设备同步。

## 交付与验证

- [完整验收报告](REPORT.md)
- `release-manifest.json`：源代码、证据、截图、媒体哈希和验证边界
- `evidence/3.0-1440-light-running.png`：1440×900
- `evidence/3.0-390-dark-running.png`：390×844
- `evidence/comparison-1440-light.png`、`comparison-390-dark.png`
- `public/media/StudyFlow-3.0-timer.mp4`：经过实际 Chrome 播放与 seek 验证的 H.264 版本

运行 `npm run build`、`npm test` 及 `node tests/core.browser.mjs` 可复验，但测试会更新自己产生的证据文件。个人 Chrome profile 不用于测试。原检查点只允许解压到新的空目录，不覆盖已有工程或存储。

报告保留限制、原独立审查中断、三个问题的后续限定复核结果，以及项目外新增通用技能文件的范围偏差记录。没有声称全站认证或稳定 60fps。
