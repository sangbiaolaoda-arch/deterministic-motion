# 确定性契约复核与落地补丁

本文记录一次针对本项目「确定性契约」的外部评审复核结论与对应改动。所有结论均带 `文件:行号` 证据。

## 复核结论速览

| # | 评审观点 | 复核 | 证据 |
| --- | --- | --- | --- |
| 1 | 「跨机器一致」承诺过强且未被验证 | 确认 | `README.md:26`、`README.md:43`；`src/ui.js` selfTest 同进程比对；`src/test.mjs:113` 缺 canvas 即跳过 |
| 2 | 没有 MP4 导出，链路不闭环 | 确认 | `README.md:114`（非目标） |
| 3 | 纯函数约束只靠文档，无自动强制 | 确认（本次已补 lint） | 原仓库无 lint / 无 `.github` |
| 4 | 带状态 PRNG + 模块级缓存与 I2 有张力 | 需修正：当前实现实际确定 | `src/core.mjs:62`（mulberry32 固定种子）、`:107-110`（`_cache` 为纯函数记忆化）、`:178`（`Array.from` 长度固定） |
| 5 | 字体 / 能力降级使同帧跨环境不同 | 确认 | `src/core.mjs:101-104`（系统字体栈）、`:521-522`（letterSpacing 静默忽略） |
| 6 | 工程化与扩展性偏弱 | 确认 | `src/core.mjs:30` 拍表写死；对外接口 `window.__HH` |

关于第 4 点的说明：`mulberry32` 种子固定、`Array.from` 长度固定，因此「生成顺序固定」前提当前成立，**画面不会漂移**。
问题不在正确性，而在①「无外部状态」的表述与实现张力；②正确性被耦合到「顺序与长度不变」，属脆弱设计。
彻底修法是改为按元素标识独立哈希的 `rand(key)`（无状态、免缓存），但会改变现有像素，需与黄金帧基线一起切换。

## 本次落地的改动

1. **README 降低承诺**：把「跨机器一致」改为「同一渲染环境内可复现」，并在「已知边界」补充字体系与黄金帧说明。`README.md`
2. **确定性 lint**：`scripts/check-determinism.mjs`，禁止渲染代码出现 `Date.now / performance.now / Math.random / new Date`，并入 `npm test`。
3. **黄金帧测试**：`scripts/golden-frames.mjs`，对首帧/末帧/每拍交界帧做像素哈希，基线按平台保存于 `baseline/golden.<platform>.json`。
4. **CI**：`.github/workflows/ci.yml`，push/PR 触发 `npm test` + `npm run build` + 黄金帧（初次为 advisory）。

## 未做（建议后续）

- **MP4 导出**：无头捕获（Puppeteer 逐帧截图 → ffmpeg 管道），因帧间独立，可按帧区间分片并行。
- **无状态随机**：以 `rand(key)` 取代顺序流 + 缓存（会改变像素，需与基线同步切换）。
- **字体内嵌**：内嵌开源中文子集并阻塞出帧；导出模式对能力缺失 fail-fast。
- **spec 接口**：抽出 `defineFilm(spec)` / `registerScene()`，让内核与具体片子解耦。
