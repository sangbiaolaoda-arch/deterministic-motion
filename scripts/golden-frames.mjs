#!/usr/bin/env node
// golden-frames.mjs — 黄金帧视觉回归（固定环境）。
//
// 对首帧、末帧、每拍的进入/退出帧做逐像素哈希，与按平台保存的基线比对。
//   node scripts/golden-frames.mjs            # 比对（无基线时逐帧提示）
//   node scripts/golden-frames.mjs --update    # 生成 / 更新基线
//
// 说明：像素级一致强依赖渲染环境（字体栅格化、Canvas 实现）。
// 基线按平台分别保存为 baseline/golden.<platform>.json，只把 CI 的
// Linux 基线当作硬门槛；本地其它平台不一致属预期。
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const UPDATE = process.argv.includes('--update');
const BASELINE = join(HERE, '..', 'baseline', `golden.${process.platform}.json`);

let canvasMod;
try {
  canvasMod = await import('@napi-rs/canvas');
} catch {
  console.error('\u2717 需要 @napi-rs/canvas：npm i -D @napi-rs/canvas');
  process.exit(2);
}
const { createCanvas } = canvasMod;

const core = await import('../src/core.mjs');
const { renderFrame, W, H, TOTAL_FRAMES, BEAT_FRAMES } = core;

// 采样点：首帧、末帧、每拍的进入帧与退出帧
const frames = new Set([0, TOTAL_FRAMES - 1]);
for (const b of BEAT_FRAMES) {
  frames.add(b.startF);
  frames.add(b.endF - 1);
}
const keys = [...frames].filter((f) => f >= 0 && f < TOTAL_FRAMES).sort((a, b) => a - b);

const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
const current = {};
let mismatches = 0;

for (const f of keys) {
  renderFrame(ctx, f);
  const data = ctx.getImageData(0, 0, W, H).data;
  const hash = createHash('sha256').update(Buffer.from(data)).digest('hex');
  current[f] = hash;
  if (UPDATE) continue;
  if (!(f in baseline)) {
    console.log(`\u00b7 frame ${f}: 无基线`);
  } else if (baseline[f] !== hash) {
    mismatches++;
    console.log(`\u2717 frame ${f}: ${hash.slice(0, 12)} \u2260 基线 ${baseline[f].slice(0, 12)}`);
  }
}

if (UPDATE) {
  mkdirSync(dirname(BASELINE), { recursive: true });
  writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n');
  console.log(`\u2713 基线已写入 ${BASELINE}（${keys.length} 帧，平台 ${process.platform}）`);
  process.exit(0);
}

if (mismatches > 0) {
  console.error(`\n黄金帧不一致：${mismatches}/${keys.length} 帧。`);
  process.exit(1);
}
console.log(`\n黄金帧全部一致：${keys.length} 帧（平台 ${process.platform}）。`);
