// test.mjs — 纯逻辑测试 + （可选）画布像素确定性测试。
// 运行：node test.mjs
import assert from 'node:assert/strict';
import {
  W, H, FPS, DURATION_S, TOTAL_FRAMES, CROSS,
  BEATS, BEAT_FRAMES, timelineAt, lerpColor, toRgb, mulberry32, hashStr,
  easeOutCubic, easeInOutCubic, smoothstep, clamp, fmtTime, renderFrame,
} from './core.mjs';

let passed = 0;
function ok(name, fn) { fn(); passed++; console.log('  ✓', name); }

console.log('# 1. 拍表拼接不变量 (I5)');
ok('首拍从 0 开始，末拍到 TOTAL_FRAMES', () => {
  assert.equal(BEAT_FRAMES[0].startF, 0);
  assert.equal(BEAT_FRAMES[BEAT_FRAMES.length - 1].endF, TOTAL_FRAMES);
});
ok('各拍无缝相接、无空洞无重叠', () => {
  for (let i = 1; i < BEAT_FRAMES.length; i++) {
    assert.equal(BEAT_FRAMES[i].startF, BEAT_FRAMES[i - 1].endF);
  }
});
ok('总时长 = 45s = 1350 帧', () => {
  const total = BEATS.reduce((a, b) => a + b.dur, 0);
  assert.equal(total, DURATION_S);
  assert.equal(TOTAL_FRAMES, FPS * DURATION_S);
});
ok('每拍 startF 与 round(t*FPS) 一致', () => {
  BEAT_FRAMES.forEach((bf, i) => assert.equal(bf.startF, Math.round(BEATS[i].t * FPS)));
});
ok('每拍时长 > 0', () => BEAT_FRAMES.forEach((bf) => assert.ok(bf.durF > 0)));

console.log('# 2. timelineAt 边界');
ok('frame 0 -> 第 0 拍', () => assert.equal(timelineAt(0).i, 0));
ok('frame TOTAL-1 -> 末拍', () => assert.equal(timelineAt(TOTAL_FRAMES - 1).i, BEAT_FRAMES.length - 1));
ok('越界帧被钳制', () => {
  assert.equal(timelineAt(-50).frame, 0);
  assert.equal(timelineAt(999999).frame, TOTAL_FRAMES - 1);
});
ok('每个拍首帧归入该拍，拍尾前 1 帧仍属该拍', () => {
  BEAT_FRAMES.forEach((bf, i) => {
    assert.equal(timelineAt(bf.startF).i, i);
    assert.equal(timelineAt(bf.endF - 1).i, i);
  });
});
ok('local 进度单调且落在 [0,1]', () => {
  const b = BEAT_FRAMES[3];
  assert.equal(timelineAt(b.startF).local, 0);
  assert.ok(Math.abs(timelineAt(b.endF - 1).local - (b.durF - 1) / b.durF) < 1e-9);
});

console.log('# 3. 颜色与工具');
ok('toRgb 解析 3 位与 6 位 hex、rgb()', () => {
  assert.deepEqual(toRgb('#fff'), [255, 255, 255]);
  assert.deepEqual(toRgb('#EBA23C'), [235, 162, 60]);
  assert.deepEqual(toRgb('rgb(1,2,3)'), [1, 2, 3]);
});
ok('lerpColor 端点正确，中间可解析', () => {
  assert.equal(lerpColor('#000000', '#ffffff', 0), 'rgb(0,0,0)');
  assert.equal(lerpColor('#000000', '#ffffff', 1), 'rgb(255,255,255)');
  assert.deepEqual(toRgb(lerpColor('#000000', '#ffffff', 0.5)), [128, 128, 128]);
});
ok('clamp / easing 边界', () => {
  assert.equal(clamp(5, 0, 1), 1); assert.equal(clamp(-5, 0, 1), 0);
  assert.equal(easeOutCubic(0), 0); assert.equal(easeOutCubic(1), 1);
  assert.equal(easeInOutCubic(0), 0); assert.equal(easeInOutCubic(1), 1);
  assert.equal(smoothstep(0), 0); assert.equal(smoothstep(1), 1);
});
ok('fmtTime 格式正确', () => {
  assert.equal(fmtTime(0), '00:00'); assert.equal(fmtTime(45), '00:45');
  assert.equal(fmtTime(9.9), '00:09'); assert.equal(fmtTime(125), '02:05');
});

console.log('# 4. 带种子随机 (I3)');
ok('mulberry32 同种子同序列、异种子异序列', () => {
  const a = mulberry32(12345), b = mulberry32(12345), c = mulberry32(54321);
  let same = true, diff = false;
  for (let i = 0; i < 100; i++) { const x = a(), y = b(), z = c(); if (x !== y) same = false; if (x !== z) diff = true; }
  assert.ok(same, '同种子应完全一致'); assert.ok(diff, '异种子应不同');
});
ok('mulberry32 输出落在 [0,1)', () => {
  const r = mulberry32(hashStr('seed')); for (let i = 0; i < 500; i++) { const v = r(); assert.ok(v >= 0 && v < 1); }
});
ok('hashStr 稳定', () => assert.equal(hashStr('origin|dust'), hashStr('origin|dust')));

console.log('# 5. renderFrame 结构（无画布时用桩上下文）');
function stubCtx() {
  const noop = () => {};
  const ctx = new Proxy({}, {
    get(t, k) {
      if (k === 'createRadialGradient' || k === 'createLinearGradient') {
        return () => ({ addColorStop: noop });
      }
      if (k === 'canvas') return { width: W, height: H };
      return typeof k === 'string' && k.indexOf('line') === 0 ? noop : noop;
    },
    set() { return true; },
  });
  return ctx;
}
ok('全帧扫描不抛错、返回合法拍索引', () => {
  const ctx = stubCtx();
  for (let f = 0; f < TOTAL_FRAMES; f += 7) {
    const tl = renderFrame(ctx, f);
    assert.ok(tl.i >= 0 && tl.i < BEAT_FRAMES.length);
  }
  // 含所有关键边界
  [0, CROSS, 179, 180, 360, 1349].forEach((f) => assert.ok(renderFrame(ctx, f) != null));
});

console.log('# 6. 画布像素确定性（若 @napi-rs/canvas 可用）');
let canvasMod = null;
try { canvasMod = await import('@napi-rs/canvas'); } catch (e) { canvasMod = null; }

if (!canvasMod) {
  console.log('  … 跳过：未安装 @napi-rs/canvas（逻辑层已全部通过）');
} else {
  const { createCanvas } = canvasMod;
  const a = createCanvas(W, H); const ac = a.getContext('2d');
  const b = createCanvas(W, H); const bc = b.getContext('2d');
  const samples = [0, CROSS, 180, 400, 675, 900, 1200, TOTAL_FRAMES - 1];
  let allDet = true, allNonBlank = true;
  for (const f of samples) {
    renderFrame(ac, f);
    renderFrame(bc, f);
    const da = ac.getImageData(0, 0, W, H).data;
    const db = bc.getImageData(0, 0, W, H).data;
    let diff = 0, nonBlank = 0;
    for (let k = 0; k < da.length; k += 4) {
      if (da[k] !== db[k] || da[k + 1] !== db[k + 1] || da[k + 2] !== db[k + 2]) diff++;
      if (da[k] + da[k + 1] + da[k + 2] > 24) nonBlank++;
    }
    const det = diff === 0; const nb = nonBlank > 1000;
    if (!det) allDet = false; if (!nb) allNonBlank = false;
    console.log('    frame ' + String(f).padStart(4) + '  diff=' + diff + '  nonBlankPx=' + nonBlank + '  ' + (det ? 'deterministic' : 'MISMATCH') + (nb ? '' : ' BLANK!'));
  }
  ok('同帧两次渲染像素完全一致', () => assert.ok(allDet, '存在非确定性帧'));
  ok('每个采样帧都有实际内容（非空白）', () => assert.ok(allNonBlank, '存在空白帧'));
  passed += 2;
}

console.log('\n所有测试通过：' + passed + ' 项');
