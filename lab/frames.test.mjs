// frames.test.mjs — 空白判定回归测试。
// 起因：旧实现用「通道和 > 30」判非空白，而本片背景 #0B0C10 的通道和 = 39，
// 导致整块背景被当作内容（实测非空白像素恒 = 1280×720），blank 门禁形同虚设。
import assert from 'node:assert/strict';
import { hexToRgb, countNonBlank, backgroundColors, canvasFrameSource } from './frames.mjs';
import { SAMPLE } from './sample.mjs';
import { renderPlan } from './render.mjs';

let n = 0;
const ok = (m) => { n++; console.log('  ✓ ' + m); };

const W = SAMPLE.film.width, H = SAMPLE.film.height;
const bg = hexToRgb('#0B0C10');

function solid(rgb) {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < d.length; i += 4) { d[i] = rgb.r; d[i + 1] = rgb.g; d[i + 2] = rgb.b; d[i + 3] = 255; }
  return d;
}

// 1) 纯背景帧 → 0 内容像素
assert.equal(countNonBlank(solid(bg), [bg]), 0, '纯背景帧必须是 0 内容像素');
ok('纯背景帧判定为空白（内容像素 = 0）');

// 2) 旧判据的反例：通道和 > 30（记录这条 bug 的证据）
assert.ok(bg.r + bg.g + bg.b > 30, '背景通道和 > 30');
const d0 = solid(bg);
let oldCount = 0;
for (let i = 0; i < d0.length; i += 4) if (d0[i] + d0[i + 1] + d0[i + 2] > 30) oldCount++;
assert.equal(oldCount, W * H, '旧的 sum>30 判据把整块背景当内容');
ok(`旧判据会把 ${W}×${H}=${W * H} 全判为内容（已修正）`);

// 3) 背景 + 一个小方块 → 只数方块
const d1 = solid(bg);
const boxW = 20, boxH = 20, bx = 10, by = 10;
for (let y = by; y < by + boxH; y++) for (let x = bx; x < bx + boxW; x++) {
  const k = (y * W + x) * 4; d1[k] = 255; d1[k + 1] = 255; d1[k + 2] = 255;
}
assert.equal(countNonBlank(d1, [bg]), boxW * boxH, '只应数出方块像素');
ok('背景上的小方块被正确计数');

// 4) 容差：接近背景的颜色不应计入
const d2 = solid({ r: bg.r + 8, g: bg.g + 8, b: bg.b + 8 });
assert.equal(countNonBlank(d2, [bg]), 0, '容差内的近似背景不应计入');
ok('容差内近似背景不计入内容');

// 5) 转场帧的背景候选包含两侧场景
const mid = SAMPLE.scenes[1].range.startF + Math.floor((SAMPLE.scenes[1].transitionIn.durF || 0) / 2);
assert.equal(backgroundColors(SAMPLE, mid).length, 2, '溶解中点应有两个候选背景');
ok('溶解中点背景候选包含两侧场景');

// 6) 端到端（若 native canvas 可用）：冷开场首帧内容 ≈ 小圆点，而非整块背景
try {
  const { createCanvas } = await import('@napi-rs/canvas');
  const fs = canvasFrameSource(SAMPLE, createCanvas, renderPlan);
  const cnt0 = fs.nonBlankPx(0);
  const cnt60 = fs.nonBlankPx(60);
  assert.notEqual(cnt0, W * H, '首帧不应是"整块背景被判内容"的旧 bug');
  assert.ok(cnt0 > 100 && cnt0 < 3000, `首帧内容应≈小圆点，实测 ${cnt0}`);
  assert.ok(cnt60 > 2000, `中帧内容应较多，实测 ${cnt60}`);
  ok(`端到端：首帧内容像素 ${cnt0}，中帧 ${cnt60}（旧实现恒为 ${W * H}）`);
} catch (e) {
  if (e && e.code === 'ERR_MODULE_NOT_FOUND') console.log('  · 跳过端到端（无 @napi-rs/canvas）');
  else throw e;
}

console.log(`\nframes.test 通过：${n} 项`);
