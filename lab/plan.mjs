// plan.mjs — Scene Plan 中间层：镜头契约 + 机器校验。
//
// 设计目标（对齐 OpenMontage 的"阶段契约 + 审批门禁"思想，但不照搬其系统）：
//   把"一个镜头里有什么、什么时候出现、怎么动、镜头怎么运"写成机器可读的纯数据，
//   渲染只是这份数据的纯函数。数据可校验、可 diff、可定点返工。
//
// 与现有 core.mjs 的关系：不改 core.mjs；本层是"可选的前置契约"，
//   一个 plan 渲染出的帧与手写场景在语义上等价，但多了可验证性。
//
// 所有时间以"帧"为单位，全部相对 film.startF（0..durationF-1）。

// ---- 允许的取值（白名单，越界即校验失败）----------------------------------
export const EASE_NAMES = ['linear', 'easeOutCubic', 'easeInCubic', 'easeInOutCubic', 'smoothstep'];
export const TRACK_PROPS = ['x', 'y', 'w', 'h', 'scale', 'rotate', 'opacity'];
export const TRANSITION_TYPES = ['cut', 'dissolve', 'morph'];
export const ELEMENT_KINDS = ['bar', 'disc', 'line', 'label', 'tri', 'ring'];

// ---- 校验器 ----------------------------------------------------------------
// 返回 { ok, errors:[{path, msg}], warnings:[...] }。errors 非空 => 不可渲染。
export function validatePlan(plan) {
  const errors = [];
  const warnings = [];
  const E = (path, msg) => errors.push({ path, msg });
  const Wn = (path, msg) => warnings.push({ path, msg });

  if (!plan || typeof plan !== 'object') { E('', 'plan 不是对象'); return { ok: false, errors, warnings }; }
  if (plan.version !== '1.0') E('version', `version 必须是 "1.0"，收到 ${JSON.stringify(plan.version)}`);

  const film = plan.film;
  if (!film) { E('film', '缺少 film'); return { ok: false, errors, warnings }; }
  for (const k of ['id', 'title', 'fps', 'durationF', 'width', 'height']) {
    if (!(k in film)) E(`film.${k}`, `缺少字段 ${k}`);
  }
  if (film && (!Number.isInteger(film.durationF) || film.durationF <= 0)) E('film.durationF', 'durationF 必须是正整数');
  if (film && (!Number.isInteger(film.width) || !Number.isInteger(film.height))) E('film.dim', 'width/height 必须是整数');

  const scenes = plan.scenes;
  if (!Array.isArray(scenes) || scenes.length === 0) { E('scenes', 'scenes 必须是非空数组'); return { ok: false, errors, warnings }; }

  const sceneIds = new Set();
  const elementIdsByScene = new Map();
  // 全片连续覆盖：场景按 range 排序后必须无缝拼满 [0, durationF)
  const ranges = [];
  scenes.forEach((s, si) => {
    const sp = `scenes[${si}]`;
    if (!s.id) E(`${sp}.id`, '缺少 id');
    else if (sceneIds.has(s.id)) E(`${sp}.id`, `重复的 scene id: ${s.id}`);
    else sceneIds.add(s.id);

    if (!s.range || !Number.isInteger(s.range.startF) || !Number.isInteger(s.range.endF)) {
      E(`${sp}.range`, 'range.startF/endF 必须是整数');
    } else {
      if (s.range.endF <= s.range.startF) E(`${sp}.range`, 'range.endF 必须 > startF');
      if (s.range.startF < 0 || s.range.endF > film.durationF) E(`${sp}.range`, `range 越出 [0,${film.durationF})`);
      ranges.push({ id: s.id, ...s.range });
    }
    if (!s.purpose) Wn(`${sp}.purpose`, '缺少叙事目的（推荐填写）');

    // 相机
    if (s.camera) {
      (s.camera.tracks || []).forEach((t, ti) => {
        if (!['x', 'y', 'zoom', 'rotate'].includes(t.prop)) E(`${sp}.camera.tracks[${ti}].prop`, `未知相机属性 ${t.prop}`);
        checkKeyframes(`${sp}.camera.tracks[${ti}]`, t, s, E);
      });
    }

    // 转场
    for (const side of ['transitionIn', 'transitionOut']) {
      const tr = s[side];
      if (!tr) continue;
      if (!TRANSITION_TYPES.includes(tr.type)) E(`${sp}.${side}.type`, `未知转场类型 ${tr.type}`);
      // 声明必须与实现一致：渲染器只实现 cut/dissolve，morph 不得被接受。
      if (tr.type === 'morph') E(`${sp}.${side}.type`, 'morph 尚未实现（渲染器仅支持 cut/dissolve）——声明必须与实现一致');
      if (tr.durF != null && (!Number.isInteger(tr.durF) || tr.durF < 0)) E(`${sp}.${side}.durF`, 'durF 必须是非负整数');
      if (tr.ease && !EASE_NAMES.includes(tr.ease)) E(`${sp}.${side}.ease`, `未知 ease ${tr.ease}`);
    }

    // 元素
    const ids = new Set();
    const els = s.elements || [];
    if (!Array.isArray(els)) E(`${sp}.elements`, 'elements 必须是数组');
    els.forEach((el, ei) => {
      const ep = `${sp}.elements[${ei}]`;
      if (!el.id) E(`${ep}.id`, '缺少 element id');
      else if (ids.has(el.id)) E(`${ep}.id`, `场景内重复 element id: ${el.id}`);
      else ids.add(el.id);
      if (!ELEMENT_KINDS.includes(el.kind)) E(`${ep}.kind`, `未知 kind ${el.kind}`);
      if (!el.layout || ['x', 'y', 'w', 'h'].some((k) => typeof el.layout[k] !== 'number')) E(`${ep}.layout`, 'layout 需要数值 x/y/w/h');
      if (el.layout && typeof el.layout.z !== 'number') Wn(`${ep}.layout.z`, '缺少 z（默认 0）');
      if (el.visible) {
        const v = el.visible;
        const span = s.range.endF - s.range.startF;
        // 单一约定：可见窗口用「场景局部帧」，与 enter/exit/轨道关键帧一致。
        if (v.startF != null || v.endF != null) {
          E(`${ep}.visible`, 'visible 请使用场景局部帧 startLocalF/endLocalF（绝对帧 startF/endF 已废弃，避免声明/应用分叉）');
        }
        for (const key of ['startLocalF', 'endLocalF']) {
          if (v[key] != null && (!Number.isInteger(v[key]) || v[key] < 0 || v[key] > span)) {
            E(`${ep}.visible.${key}`, `${key} 必须是不越出 [0, ${span}] 的整数`);
          }
        }
        if (v.startLocalF != null && v.endLocalF != null && v.endLocalF <= v.startLocalF) E(`${ep}.visible`, 'visible 范围为空');
      }
      // 入场 / 离场
      for (const side of ['enter', 'exit']) {
        const e = el[side];
        if (!e) continue;
        if (e.ease && !EASE_NAMES.includes(e.ease)) E(`${ep}.${side}.ease`, `未知 ease ${e.ease}`);
        if (e.durF != null && (!Number.isInteger(e.durF) || e.durF < 0)) E(`${ep}.${side}.durF`, 'durF 必须是非负整数');
        if (side === 'enter' && e.from && !['below', 'above', 'left', 'right', 'grow', 'none'].includes(e.from)) {
          E(`${ep}.enter.from`, `未知 enter.from ${e.from}`);
        }
      }
      (el.tracks || []).forEach((t, ti) => {
        if (!TRACK_PROPS.includes(t.prop)) E(`${ep}.tracks[${ti}].prop`, `未知轨道属性 ${t.prop}`);
        checkKeyframes(`${ep}.tracks[${ti}]`, t, s, E);
      });
    });
    elementIdsByScene.set(s.id, ids);
  });

  // 连续性引用：transition.morph 需引用存在且持有同名元素的相邻场景
  scenes.forEach((s, si) => {
    const tr = s.transitionOut;
    if (tr && tr.type === 'morph') {
      if (!tr.to) E(`scenes[${si}].transitionOut.to`, 'morph 需要 to 指向目标场景');
      else if (!sceneIds.has(tr.to)) E(`scenes[${si}].transitionOut.to`, `morph 目标场景不存在: ${tr.to}`);
      else if (tr.via) {
        const from = elementIdsByScene.get(s.id) || new Set();
        const to = elementIdsByScene.get(tr.to) || new Set();
        (tr.via || []).forEach((vid, vi) => {
          if (!from.has(vid)) E(`scenes[${si}].transitionOut.via[${vi}]`, `源场景没有元素 ${vid}`);
          if (!to.has(vid)) E(`scenes[${si}].transitionOut.via[${vi}]`, `目标场景没有元素 ${vid}`);
        });
      }
    }
  });

  // 转场一致性：相邻场景的「出」与「入」必须一致——同为 cut，或同为 dissolve 且 durF 相同。
  // 渲染器以「入」为准；若两侧声明冲突，说明计划自相矛盾，必须显式报错。
  for (let i = 0; i + 1 < scenes.length; i++) {
    const a = scenes[i], b = scenes[i + 1];
    const ot = a.transitionOut && a.transitionOut.type ? a.transitionOut.type : 'cut';
    const it = b.transitionIn && b.transitionIn.type ? b.transitionIn.type : 'cut';
    if (ot !== it) {
      E(`scenes[${i}].transitionOut`, `与下一场景 ${b.id} 的 transitionIn 不一致（${ot} vs ${it}）——边界转场两侧必须一致`);
    } else if (ot !== 'cut') {
      const od = a.transitionOut && a.transitionOut.durF != null ? a.transitionOut.durF : 0;
      const idur = b.transitionIn && b.transitionIn.durF != null ? b.transitionIn.durF : 0;
      if (od !== idur) E(`scenes[${i}].transitionOut`, `与下一场景 ${b.id} 的 transitionIn 时长不一致（${od} vs ${idur}）`);
    }
  }

  // 覆盖连续性
  ranges.sort((a, b) => a.startF - b.startF);
  if (ranges.length) {
    if (ranges[0].startF !== 0) E('scenes', `时间线未从 0 开始（首个 startF=${ranges[0].startF}）`);
    if (ranges[ranges.length - 1].endF !== film.durationF) E('scenes', `时间线未覆盖到 durationF（末 endF=${ranges[ranges.length - 1].endF}）`);
    for (let i = 1; i < ranges.length; i++) {
      if (ranges[i].startF !== ranges[i - 1].endF) E('scenes', `场景间隙/重叠：${ranges[i - 1].id}(end ${ranges[i - 1].endF}) 与 ${ranges[i].id}(start ${ranges[i].startF})`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

function checkKeyframes(path, t, scene, E) {
  if (!Array.isArray(t.keyframes) || t.keyframes.length < 1) { E(path + '.keyframes', '至少一个关键帧'); return; }
  let prevF = -Infinity;
  t.keyframes.forEach((k, ki) => {
    if (typeof k.f !== 'number' || typeof k.v !== 'number') E(`${path}.keyframes[${ki}]`, 'kf 需要数值 f 与 v');
    if (k.f <= prevF) E(`${path}.keyframes[${ki}].f`, 'f 必须严格递增');
    prevF = k.f;
    if (k.ease && !EASE_NAMES.includes(k.ease)) E(`${path}.keyframes[${ki}].ease`, `未知 ease ${k.ease}`);
    // 关键帧时间相对场景起点，落在 [0, durF]
    if (typeof k.f === 'number' && (k.f < 0 || k.f > scene.range.endF - scene.range.startF + 1)) {
      E(`${path}.keyframes[${ki}].f`, `关键帧 f=${k.f} 越出场景时长`);
    }
  });
}

// ---- 查询：帧 -> 当前场景 + 局部帧 ----------------------------------------
export function sceneAt(plan, frame) {
  const f = Math.min(Math.max(Math.round(frame), 0), plan.film.durationF - 1);
  const scenes = plan.scenes;
  let i = 0;
  for (let k = 0; k < scenes.length; k++) { if (f < scenes[k].range.endF) { i = k; break; } i = k; }
  const s = scenes[i];
  return { i, scene: s, localF: f - s.range.startF, frame: f };
}
