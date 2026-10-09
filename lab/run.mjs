// run.mjs — 一键跑完 lab 试点：单元测试 + 计划校验 + 质量门禁 + 故障注入 + 联系表 + 样片。
// 退出码 0 = 全部通过（含"注入的故障确实被门禁抓住"）。
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

import { validatePlan } from './plan.mjs';
import { SAMPLE } from './sample.mjs';
import { renderPlan } from './render.mjs';
import { runGates } from './gates.mjs';
import { canvasFrameSource, stubFrameSource } from './frames.mjs';
import { buildContactSheet } from './contactsheet.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'dist');
mkdirSync(OUT, { recursive: true });

let failed = 0;
const step = (name, fn) => {
  console.log('\n=== ' + name + ' ===');
  try { fn(); } catch (e) { failed++; console.log('✗ ' + (e && e.message ? e.message : e)); if (e && e.stack) console.log(e.stack.split('\n').slice(1,4).join('\n')); }
};

// 0. 单元测试
step('① 单元测试 plan/motion', () => {
  const r = spawnSync(process.execPath, [join(HERE, 'plan.test.mjs')], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('单元测试失败');
});

// 0b. 空白判定回归测试（曾因背景误判失效）
step('①b 空白判定回归（frames.test）', () => {
  const r = spawnSync(process.execPath, [join(HERE, 'frames.test.mjs')], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('空白判定回归测试失败');
});

// 1. 计划校验
step('② Scene Plan 校验', () => {
  const v = validatePlan(SAMPLE);
  if (!v.ok) throw new Error('样片校验失败：' + JSON.stringify(v.errors));
  console.log(`✓ 样片通过（${SAMPLE.scenes.length} 镜头，警告 ${v.warnings.length} 条）`);
});

// 2. 真实光栅器门禁
let createCanvas = null;
try { ({ createCanvas } = await import('@napi-rs/canvas')); } catch { /* 无 native */ }

step('③ 质量门禁（真实光栅器）', () => {
  if (!createCanvas) throw new Error('@napi-rs/canvas 不可用');
  const fs = canvasFrameSource(SAMPLE, createCanvas, renderPlan);
  const rep = runGates(SAMPLE, fs, {});
  writeFileSync(join(OUT, 'gate-report-sample.json'), JSON.stringify(rep, null, 2));
  console.log(`检查 ${rep.summary.total} 项：失败 ${rep.summary.failed}（确定 ${rep.summary.deterministicFails} / 视觉 ${rep.summary.visualFails} / 运动 ${rep.summary.motionFails}），人工 ${rep.summary.manual}`);
  if (rep.issues.length) rep.issues.slice(0, 8).forEach((i) => console.log('  ✗ [' + i.cat + '] ' + i.msg));
  if (!rep.ok) throw new Error('样片未通过质量门禁');
  console.log('✓ 样片通过全部门禁');
});

// 3. 故障注入：证明门禁有牙齿
step('④ 故障注入（门禁必须失败）', () => {
  if (!createCanvas) throw new Error('@napi-rs/canvas 不可用');
  const fs = canvasFrameSource(SAMPLE, createCanvas, renderPlan);

  // 3a. 视觉错误：把标题移到右上角越出安全边距
  const visErr = JSON.parse(JSON.stringify(SAMPLE));
  visErr.scenes[0].elements[0].layout.x = 1270; visErr.scenes[0].elements[0].layout.y = 30;
  // 关键修正：必须用"修改后的计划"重建帧来源，否则闭包仍渲染原计划，注入形同虚设。
  const fsV = canvasFrameSource(visErr, createCanvas, renderPlan);
  const repV = runGates(visErr, fsV, {});
  writeFileSync(join(OUT, 'gate-report-injected-visual.json'), JSON.stringify(repV, null, 2));
  const caughtV = repV.issues.some((i) => i.cat === 'V' && /越出安全边距/.test(i.msg));
  console.log(`  注入视觉错误（越界）→ 门禁${caughtV ? '捕获 ✓' : '漏报 ✗'}（视觉失败 ${repV.summary.visualFails}）`);
  if (!caughtV) throw new Error('视觉错误未被捕获');

  // 3b. 运动错误：某元素在 1 帧内位移 300px（突变）
  const motErr = JSON.parse(JSON.stringify(SAMPLE));
  const dot = motErr.scenes[0].elements.find((e) => e.id === 'dot');
  dot.tracks = [{ prop: 'x', keyframes: [{ f: 0, v: 200 }, { f: 1, v: 500, ease: 'linear' }, { f: 100, v: 520 }] }];
  const fsM = canvasFrameSource(motErr, createCanvas, renderPlan);
  const repM = runGates(motErr, fsM, {});
  writeFileSync(join(OUT, 'gate-report-injected-motion.json'), JSON.stringify(repM, null, 2));
  const caughtM = repM.issues.some((i) => i.cat === 'M' && /突变/.test(i.msg));
  console.log(`  注入运动错误（突变）→ 门禁${caughtM ? '捕获 ✓' : '漏报 ✗'}（运动失败 ${repM.summary.motionFails}）`);
  if (!caughtM) throw new Error('运动错误未被捕获');

  assert.ok(caughtV && caughtM);
});

// 3c. 检测自检：每项检测都能发现其对应故障
step('④b 检测自检（每项检测捕获对应故障）', () => {
  const r = spawnSync(process.execPath, [join(HERE, 'gates.selftest.mjs')], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('检测自检失败');
});

// 4. 联系表 + 样片
step('⑤ 联系表 + 浏览器样片', () => {
  if (createCanvas) {
    const frames = [0, 30, 60, 119, 120, 128, 185, 249, 250, 300, 355, 359];
    const cs = buildContactSheet(SAMPLE, createCanvas, renderPlan, frames, join(OUT, 'sample-contactsheet.png'), { cols: 4, cellW: 320 });
    console.log(`✓ 联系表 ${cs.cols}×${cs.rows}：${cs.path}`);
  } else {
    console.log('  跳过联系表（无 native canvas）');
  }
  const r = spawnSync(process.execPath, [join(HERE, 'build-sample.mjs')], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('样片构建失败');
});

// 5. 真实浏览器验收（headless chromium）
step('⑥ 真实浏览器验收（headless chromium）', () => {
  const r = spawnSync(process.execPath, [join(HERE, 'browser-acceptance.mjs')], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('浏览器验收失败');
});

console.log('\n' + (failed ? failed + ' 个环节失败' : 'lab 全部环节通过'));
process.exit(failed ? 1 : 0);
