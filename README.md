# deterministic-motion

> 逐帧纯函数（frame-pure）的确定性 HTML / Canvas 动画引擎。
> **每一帧都是「帧号」的纯函数** —— 同一帧永远得到同一画面。
>
> 演示：一段 **45 秒的《人类的发展史》**，1920×1080 / 30fps / 1350 帧，单文件、离线可播放。

<p align="center">
  <img alt="1920×1080 · 30fps · 1350 frames" src="https://img.shields.io/badge/output-1920%C3%971080%20%C2%B7%2030fps%20%C2%B7%201350%20frames-EBA23C">
  <img alt="license MIT" src="https://img.shields.io/badge/license-MIT-57D2E6">
  <img alt="node >=18" src="https://img.shields.io/badge/node-%3E%3D18-86C05A">
</p>

---

## 这是什么

一个**极简但完整**的确定性动画内核。它不依赖任何运行时框架，只用浏览器原生 Canvas 2D。
核心只有一个函数：

```js
renderFrame(ctx, frame)   // (画布, 帧号) -> 画面
```

只要坚持这条约束，视频就获得了一个关键性质：**可复现**。
预览、暂停、拖动进度条、"渲染成视频"，走的都是同一个纯函数——所见即所得，且跨机器一致。

这也是 Remotion / HyperFrames 这类程序化视频工具的地基思想。本项目把它压到最小，作为可直接阅读、直接改造的参考实现。

## 为什么"确定性"值得单独做一个项目

程序化视频最常见的两类灾难，都来自**不确定性**：

| 症状 | 根因 | 本项目的做法 |
| --- | --- | --- |
| 同样的代码，两次渲染画面不同 | 依赖了墙钟时间 / 未播种的随机 | 帧号是唯一时间来源；随机全部由 `hash(拍标识)` 播种 |
| 渲染到一半闪烁、掉帧 | 动画依赖真实经过的时间，帧间无隔离 | 纯函数：不读 `Date.now()`，不依赖帧的渲染顺序 |
| 预览好看，导出/他人机器上错位 | 预览与导出是两套实现 | 同一函数驱动预览与渲染 |

## 特性

- **frame-pure**：`renderFrame` 无副作用、无外部状态、无墙钟依赖。
- **确定性随机**：`mulberry32(hash(种子字符串))`，跨进程 / 跨机器可复现。
- **数据驱动的"拍表"**：`BEATS` 是唯一真相，各拍起止由**累计时长派生**，天然无缝拼接。
- **零依赖运行**：产物是单个自包含 HTML，双击即可离线播放。
- **自带确定性自检**：`window.__HH.selfTest()` 对同一帧渲染两次并逐像素比对。
- **可测试内核**：纯逻辑在 Node 下即可单测；可选 `@napi-rs/canvas` 做像素级确定性验证。

## 快速开始

```bash
# 直接看效果：双击打开，或
open dist/human-history-45s.html

# 重新构建（由 src 合成单文件 HTML）
npm run build

# 运行测试（18 项：拍表不变量 / 边界帧 / 种子随机 / 全帧扫描）
npm test

# 可选：安装 canvas 后，测试会额外做像素级确定性验证
npm i @napi-rs/canvas
npm test
```

## 播放器内交互

| 操作 | 效果 |
| --- | --- |
| `空格` / 点击画面 | 播放 / 暂停 |
| `←` / `→` | 逐帧步进（`Shift` 加速一秒） |
| `Home` / `End` | 跳到首帧 / 末帧 |
| `R` | 重播 |
| 底部色点条 | 逐拍跳转（数据来自唯一真相 `BEAT_FRAMES`） |

## 项目结构

```
deterministic-motion/
├── src/
│   ├── core.mjs      # 确定性内核：拍表、时间线、7 个场景的纯绘制函数、renderFrame
│   ├── ui.js         # 浏览器端：控件、播放循环、逐拍导航、自检
│   ├── build.mjs     # 把 core + ui 内联合并为单文件 HTML
│   └── test.mjs      # Node 测试（纯逻辑 + 可选像素级）
├── dist/
│   └── human-history-45s.html   # 构建产物：单文件、离线可播放
├── docs/
│   └── DESIGN.md     # 设计契约：不变量、失败点、关键决定
└── package.json
```

## 设计契约（一页速览）

内核以"**先写判断标准，再写实现**"的方式构建，核心不变量：

- **I1** `0 ≤ frame ≤ TOTAL_FRAMES-1`，且 `TOTAL_FRAMES = FPS × DURATION_S = 1350`。
- **I2** `renderFrame(frame)` 是纯函数：同一 `frame` 必得同一画面。
- **I3** 所有随机来自带种子的 PRNG，种子 = `hash(稳定字符串)`，跨机器可复现。
- **I4** 拍的局部进度 `local ∈ [0,1]` 由 `(frame - startF) / durF` 推出，不单独存储。
- **I5** `BEATS` 是唯一真相；`startF/endF` 由累计时长派生，各拍无缝拼满 `[0, TOTAL_FRAMES)`。

详见 [`docs/DESIGN.md`](docs/DESIGN.md)。

## 扩展为自己的动画

1. 改 `src/core.mjs` 顶部的 `BEATS`（增删拍、改时长与时代色）——`startF/endF` 会自动重算。
2. 在 `SCENES` 里加一个场景函数 `(ctx, p, color) => {...}`，只画以原点为中心的画面。
3. `node src/build.mjs` 重新生成单文件。

> 只要守住"帧号是唯一时间来源 + 随机必须播种"，你的动画就保持确定性。

## 已知边界与未验证项

- 本仓库的内核是**渲染与演示**层，不包含 SRT 解析、LLM 导演、编码封装（MP4 导出）等更上层管线。
- 沙箱内若未安装 `@napi-rs/canvas`，像素级确定性测试会被**跳过**（逻辑层与结构层仍完整验证）；此时可在浏览器控制台用 `window.__HH.selfTest()` 补验。

## 许可

[MIT](LICENSE)
# deterministic-motion

> 逐帧纯函数（frame-pure）的确定性 HTML / Canvas 动画引擎。
> **每一帧都是「帧号」的纯函数** —— 同一帧永远得到同一画面。
>
> 演示：一段 **45 秒的《人类的发展史》**，1920×1080 / 30fps / 1350 帧，单文件、离线可播放。

<p align="center">
  <img alt="1920×1080 · 30fps · 1350 frames" src="https://img.shields.io/badge/output-1920%C3%971080%20%C2%B7%2030fps%20%C2%B7%201350%20frames-EBA23C">
  <img alt="license MIT" src="https://img.shields.io/badge/license-MIT-57D2E6">
  <img alt="node >=18" src="https://img.shields.io/badge/node-%3E%3D18-86C05A">
</p>

---

## 这是什么

一个**极简但完整**的确定性动画内核。它不依赖任何运行时框架，只用浏览器原生 Canvas 2D。
核心只有一个函数：

```js
renderFrame(ctx, frame)   // (画布, 帧号) -> 画面
```

只要坚持这条约束，视频就获得了一个关键性质：**可复现**。
预览、暂停、拖动进度条、"渲染成视频"，走的都是同一个纯函数——所见即所得，且跨机器一致。

这也是 Remotion / HyperFrames 这类程序化视频工具的地基思想。本项目把它压到最小，作为可直接阅读、直接改造的参考实现。

## 为什么"确定性"值得单独做一个项目

程序化视频最常见的两类灾难，都来自**不确定性**：

| 症状 | 根因 | 本项目的做法 |
| --- | --- | --- |
| 同样的代码，两次渲染画面不同 | 依赖了墙钟时间 / 未播种的随机 | 帧号是唯一时间来源；随机全部由 `hash(拍标识)` 播种 |
| 渲染到一半闪烁、掉帧 | 动画依赖真实经过的时间，帧间无隔离 | 纯函数：不读 `Date.now()`，不依赖帧的渲染顺序 |
| 预览好看，导出/他人机器上错位 | 预览与导出是两套实现 | 同一函数驱动预览与渲染 |

## 特性

- **frame-pure**：`renderFrame` 无副作用、无外部状态、无墙钟依赖。
- **确定性随机**：`mulberry32(hash(种子字符串))`，跨进程 / 跨机器可复现。
- **数据驱动的"拍表"**：`BEATS` 是唯一真相，各拍起止由**累计时长派生**，天然无缝拼接。
- **零依赖运行**：产物是单个自包含 HTML，双击即可离线播放。
- **自带确定性自检**：`window.__HH.selfTest()` 对同一帧渲染两次并逐像素比对。
- **可测试内核**：纯逻辑在 Node 下即可单测；可选 `@napi-rs/canvas` 做像素级确定性验证。

## 快速开始

```bash
# 直接看效果：双击打开，或
open dist/human-history-45s.html

# 重新构建（由 src 合成单文件 HTML）
npm run build

# 运行测试（18 项：拍表不变量 / 边界帧 / 种子随机 / 全帧扫描）
npm test

# 可选：安装 canvas 后，测试会额外做像素级确定性验证
npm i @napi-rs/canvas
npm test
```

## 播放器内交互

| 操作 | 效果 |
| --- | --- |
| `空格` / 点击画面 | 播放 / 暂停 |
| `←` / `→` | 逐帧步进（`Shift` 加速一秒） |
| `Home` / `End` | 跳到首帧 / 末帧 |
| `R` | 重播 |
| 底部色点条 | 逐拍跳转（数据来自唯一真相 `BEAT_FRAMES`） |

## 项目结构

```
deterministic-motion/
├── src/
│   ├── core.mjs      # 确定性内核：拍表、时间线、7 个场景的纯绘制函数、renderFrame
│   ├── ui.js         # 浏览器端：控件、播放循环、逐拍导航、自检
│   ├── build.mjs     # 把 core + ui 内联合并为单文件 HTML
│   └── test.mjs      # Node 测试（纯逻辑 + 可选像素级）
├── dist/
│   └── human-history-45s.html   # 构建产物：单文件、离线可播放
├── docs/
│   └── DESIGN.md     # 设计契约：不变量、失败点、关键决定
└── package.json
```

## 设计契约（一页速览）

内核以"**先写判断标准，再写实现**"的方式构建，核心不变量：

- **I1** `0 ≤ frame ≤ TOTAL_FRAMES-1`，且 `TOTAL_FRAMES = FPS × DURATION_S = 1350`。
- **I2** `renderFrame(frame)` 是纯函数：同一 `frame` 必得同一画面。
- **I3** 所有随机来自带种子的 PRNG，种子 = `hash(稳定字符串)`，跨机器可复现。
- **I4** 拍的局部进度 `local ∈ [0,1]` 由 `(frame - startF) / durF` 推出，不单独存储。
- **I5** `BEATS` 是唯一真相；`startF/endF` 由累计时长派生，各拍无缝拼满 `[0, TOTAL_FRAMES)`。

详见 [`docs/DESIGN.md`](docs/DESIGN.md)。

## 扩展为自己的动画

1. 改 `src/core.mjs` 顶部的 `BEATS`（增删拍、改时长与时代色）——`startF/endF` 会自动重算。
2. 在 `SCENES` 里加一个场景函数 `(ctx, p, color) => {...}`，只画以原点为中心的画面。
3. `node src/build.mjs` 重新生成单文件。

> 只要守住"帧号是唯一时间来源 + 随机必须播种"，你的动画就保持确定性。

## 已知边界与未验证项

- 本仓库的内核是**渲染与演示**层，不包含 SRT 解析、LLM 导演、编码封装（MP4 导出）等更上层管线。
- 沙箱内若未安装 `@napi-rs/canvas`，像素级确定性测试会被**跳过**（逻辑层与结构层仍完整验证）；此时可在浏览器控制台用 `window.__HH.selfTest()` 补验。

## 许可

[MIT](LICENSE)
