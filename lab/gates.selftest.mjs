// gates.selftest.mjs — 每项检测都能发现其对应故障（"门禁有牙齿"的可回归证明）。
// 对同一份样片注入一种已知故障，断言恰有对应检测项失败；正常样片上则不得误报。
import assert from 'node:assert/strict';
import { validatePlan } from './plan.mjs';
import { SAMPLE } from './sample.mjs';
import { runGates } from './gates.mjs';
import { canvasFrameSource } from './frames.mjs';
import { renderPlan } from './render.mjs';

let n = 0;
const ok = (m) => { n++; console.log('  ✓ ' + m); };
const clone = (o) => JSON.parse(JSON.stringify(o));

let createCanvas = null;
try { ({ createCanvas } = await import('@napi-rs/canvas')); } catch { /* 无 native */ }
if (!createCanvas) { console.log('需要 @napi-rs/canvas 才能跑像素门禁自检'); process.exit(1); }
const mkFs = (p) => canvasFrameSource(p, createCanvas, renderPlan);

// 0) 正常样片：不得误报
{
  const rep = runGates(clone(SAMPLE), mkFs(SAMPLE), {});
  assert.ok(rep.ok, '正常样片被误报失败：' + JSON.stringify(rep.issues.map((i) => i.id)));
  ok('正常样片：全部门禁通过（无误报）');
}

// 1) 空白检测：全空场景（仅背景）必须判 V-blank 失败
{
  const p = clone(SAMPLE);
  for (const s of p.scenes) { s.elements = []; s.transitionIn = { type: 'cut' }; s.transitionOut = { type: 'cut' }; }
  const rep = runGates(p, mkFs(p), {});
  assert.ok(rep.issues.some((i) => i.id.startsWith('V-blank')), '空白帧未被判失败');
  ok('空白检测：仅背景帧 → V-blank 失败');
}

// 2) 越界检测
{
  const p = clone(SAMPLE);
  p.scenes[0].elements[0].layout.x = 1270; p.scenes[0].elements[0].layout.y = 30;
  const rep = runGates(p, mkFs(p), {});
  assert.ok(rep.issues.some((i) => /越出安全边距/.test(i.msg)), '越界未被判失败');
  ok('越界检测：元素出界 → V-oob 失败');
}

// 3) 突变检测（单帧位移）
{
  const p = clone(SAMPLE);
  const dot = p.scenes[0].elements.find((e) => e.id === 'dot');
  dot.tracks = [{ prop: 'x', keyframes: [{ f: 0, v: 200 }, { f: 1, v: 500 }, { f: 100, v: 520 }] }];
  const rep = runGates(p, mkFs(p), {});
  assert.ok(rep.issues.some((i) => i.id.startsWith('M-jump')), '单帧突变未被判失败');
  ok('突变检测：1 帧位移 300px → M-jump 失败');
}

// 4) 加速度检测（速度骤变，但单帧位移未必超大）
{
  const p = clone(SAMPLE);
  const dot = p.scenes[0].elements.find((e) => e.id === 'dot');
  dot.tracks = [{ prop: 'x', keyframes: [
    { f: 0, v: 200, ease: 'linear' }, { f: 10, v: 210 }, { f: 11, v: 500 }, { f: 100, v: 520 }] }];
  const rep = runGates(p, mkFs(p), {});
  assert.ok(rep.issues.some((i) => i.id.startsWith('M-accel')), '加速度突变未被判失败');
  ok('加速度检测：速度骤变 → M-accel 失败');
}

// 5) 声明 vs 实现：morph 必须被 validatePlan 拒绝
{
  const p = clone(SAMPLE);
  p.scenes[0].transitionIn = { type: 'morph' };
  const v = validatePlan(p);
  assert.ok(!v.ok && v.errors.some((e) => /morph/.test(e.msg)), 'morph 未被拒绝');
  ok('声明/实现一致性：morph → validatePlan 报错');
}

// 6) 转场两侧一致性
{
  const p = clone(SAMPLE);
  p.scenes[0].transitionOut = { type: 'cut' }; // 与 s2 的 dissolve 冲突
  const v = validatePlan(p);
  assert.ok(!v.ok && v.errors.some((e) => /不一致/.test(e.msg)), '转场冲突未被拒绝');
  ok('转场一致性：out=cut vs in=dissolve → validatePlan 报错');
}

// 7) 转场混合检测：正常 dissolve 必须被识别为"混合帧"（非误报）
{
  const rep = runGates(clone(SAMPLE), mkFs(SAMPLE), {});
  assert.ok(rep.checks.some((c) => c.id.startsWith('M-trans-blend') && c.ok), '正常溶解未被识别为混合帧');
  ok('转场混合检测：正常 dissolve → M-trans-blend 通过');
}

console.log(`\ngates.selftest 通过：${n} 项`);
