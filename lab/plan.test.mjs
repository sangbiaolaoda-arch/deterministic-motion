// plan.test.mjs — Scene Plan 中间层 + 运动系统的单元/边界/对照测试。
// 运行： node lab/plan.test.mjs
import assert from 'node:assert/strict';
import { validatePlan, sceneAt, EASE_NAMES } from './plan.mjs';
import { evalTrack, evalElement, cameraAt, transitionProgress, ease } from './motion.mjs';
import { SAMPLE } from './sample.mjs';

let n = 0;
const ok = (msg) => { n++; console.log('  ✓ ' + msg); };

// ---- 1. 合法样片通过校验 ----
{
  const r = validatePlan(SAMPLE);
  assert.equal(r.ok, true, '样片应通过校验：' + JSON.stringify(r.errors));
  ok('样片通过 validatePlan');
  ok(`样片含 ${SAMPLE.scenes.length} 镜头、${SAMPLE.scenes.reduce((a, s) => a + s.elements.length, 0)} 元素`);
}

// ---- 2. 覆盖连续性：间隙 / 重叠 / 未满时长 被抓 ----
{
  const gap = JSON.parse(JSON.stringify(SAMPLE));
  gap.scenes[1].range.startF += 5;
  assert.equal(validatePlan(gap).ok, false);
  ok('场景间隙被抓');

  const dup = JSON.parse(JSON.stringify(SAMPLE));
  dup.scenes[1].id = dup.scenes[0].id;
  assert.equal(validatePlan(dup).ok, false);
  ok('重复 scene id 被抓');

  const short = JSON.parse(JSON.stringify(SAMPLE));
  short.scenes[2].range.endF -= 1;
  assert.equal(validatePlan(short).ok, false);
  ok('时间线未覆盖到 durationF 被抓');
}

// ---- 3. 非法枚举 / 越界关键帧被抓 ----
{
  const badKind = JSON.parse(JSON.stringify(SAMPLE));
  badKind.scenes[0].elements[0].kind = 'blob';
  assert.equal(validatePlan(badKind).ok, false);
  ok('未知 element kind 被抓');

  const badProp = JSON.parse(JSON.stringify(SAMPLE));
  badProp.scenes[0].elements[2].tracks[0].prop = 'z';
  assert.equal(validatePlan(badProp).ok, false);
  ok('未知轨道属性被抓');

  const badEase = JSON.parse(JSON.stringify(SAMPLE));
  badEase.scenes[0].elements[0].enter.ease = 'bounce';
  assert.equal(validatePlan(badEase).ok, false);
  ok('未知 ease 被抓');

  const badF = JSON.parse(JSON.stringify(SAMPLE));
  badF.scenes[0].elements[0].layout.x = 640;
  badF.scenes[0].elements[2].tracks[0].keyframes[0].f = 999;
  assert.equal(validatePlan(badF).ok, false);
  ok('关键帧越出场景时长被抓');
}

// ---- 4. 运动原语：缓动端点 / 单调 ----
{
  for (const name of EASE_NAMES) {
    assert.equal(ease(name, 0), 0, name + ' 起点应为 0');
    assert.equal(ease(name, 1), 1, name + ' 终点应为 1');
  }
  ok('全部缓动端点 0→1');
  const t = { prop: 'x', keyframes: [{ f: 0, v: 0, ease: 'linear' }, { f: 10, v: 100 }] };
  assert.equal(evalTrack(t, 0), 0);
  assert.equal(evalTrack(t, 10), 100);
  assert.equal(evalTrack(t, 5), 50);
  assert.equal(evalTrack(t, -3), 0);   // 夹取
  assert.equal(evalTrack(t, 99), 100); // 夹取
  ok('evalTrack 分段线性 + 端点夹取正确');
}

// ---- 5. 入离场与可见窗口 ----
{
  const el = { id: 'e', kind: 'bar', layout: { x: 0, y: 0, w: 10, h: 10 },
    enter: { durF: 10, ease: 'linear', from: 'below', dist: 100 },
    tracks: [{ prop: 'x', keyframes: [{ f: 0, v: 0 }, { f: 20, v: 40 }] }] };
  const s0 = evalElement(el, 0);
  assert.equal(s0.opacity, 0);        // 入场起点透明
  assert.equal(s0.y, 0 + 100);        // 从下方 100px
  const s10 = evalElement(el, 10);
  assert.equal(Math.round(s10.opacity * 100) / 100, 1);
  assert.equal(s10.y, 0);
  assert.equal(s10.x, 20);
  ok('入场（opacity+位移）与轨道叠加正确');
}

// ---- 6. 确定性：同输入同输出 ----
{
  const a = JSON.stringify(evalElement(SAMPLE.scenes[1].elements[0], 37));
  const b = JSON.stringify(evalElement(SAMPLE.scenes[1].elements[0], 37));
  assert.equal(a, b);
  ok('evalElement 对同 (el,frame) 结果一致');
}

// ---- 7. sceneAt 边界 ----
{
  assert.equal(sceneAt(SAMPLE, 0).scene.id, 's1-intro');
  assert.equal(sceneAt(SAMPLE, 119).scene.id, 's1-intro');
  assert.equal(sceneAt(SAMPLE, 120).scene.id, 's2-bars');
  assert.equal(sceneAt(SAMPLE, 359).scene.id, 's3-outro');
  assert.equal(sceneAt(SAMPLE, 999).scene.id, 's3-outro'); // 夹取
  ok('sceneAt 边界与夹取正确');
}

console.log(`\nplan/motion 单元测试通过：${n} 项`);
