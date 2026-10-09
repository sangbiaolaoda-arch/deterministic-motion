// gates.mjs — 独立质量门禁（不依赖生成器自证）。
//
// 区分四类判定（对齐 OpenMontage 的阶段门禁思想）：
//   [D] 确定性   —— 同帧两次渲染像素一致（既有 test.mjs 已覆盖，这里复算 1 帧）
//   [V] 视觉回归 —— 首/中/末帧与转场边界非空白、元素不越界、不裁切、不遮挡
//   [M] 运动质量 —— 意外静止、运动缺失、突变、不自然衔接
//   [H] 人工复核 —— 无法自动可靠判断的美学项，显式标记 MANUAL
//
// 输入：plan + 一个帧渲染适配器（真实光栅器或桩）。输出：机器可读 report。
// 关键纪律：门禁只看帧像素与 plan，不调用渲染器的"自检"，避免自我背书。

import { sceneAt } from './plan.mjs';
import { evalElement, evalTrack, cameraAt } from './motion.mjs';
import { visibleBoxes } from './render.mjs';

export const SEVERITY = { ERROR: 'ERROR', MANUAL: 'MANUAL', WARN: 'WARN' };

export function runGates(plan, frameSource, opts = {}) {
  const safeMargin = opts.safeMargin != null ? opts.safeMargin : 24;
  const blankMinPx = opts.blankMinPx != null ? opts.blankMinPx : 1500;
  const jumpPx = opts.jumpPx != null ? opts.jumpPx : 72;      // 相邻帧位移突变阈值
  const jumpOpacity = opts.jumpOpacity != null ? opts.jumpOpacity : 0.6;
  const report = {
    film: plan.film.id, generatedBy: 'lab/gates.mjs', ok: true,
    counts: { D: 0, V: 0, M: 0, H: 0 },
    checks: [], issues: [],
  };
  const add = (cat, ok, id, msg, extra) => {
    report.counts[cat] = (report.counts[cat] || 0) + 1;
    const item = { cat, id, ok, msg, ...(extra || {}) };
    report.checks.push(item);
    if (!ok) {
      report.ok = false;
      report.issues.push(item);
    }
  };

  // ---------- [P] 计划验证 ----------
  // 由调用方先跑 validatePlan；此处仅登记结果（避免重复实现）。

  // ---------- [D] 确定性复算（抽 1 帧两次）----------
  {
    const f = Math.floor(plan.film.durationF / 3);
    const a = frameSource.hashAt(f);
    const b = frameSource.hashAt(f);
    add('D', a === b, 'D-1', `帧 ${f} 两次渲染像素${a === b ? '一致' : '不一致'}`, { frame: f });
  }

  // ---------- [V] 帧边界 + 越界/空白 ----------
  const W = plan.film.width, H = plan.film.height;
  for (let si = 0; si < plan.scenes.length; si++) {
    const s = plan.scenes[si];
    const span = s.range.endF - s.range.startF;
    const rawProbes = [
      ['首帧', s.range.startF],
      ['中帧', s.range.startF + Math.floor(span / 2)],
      ['末帧', s.range.endF - 1],
    ];
    if (s.transitionIn && s.transitionIn.durF) rawProbes.push(['入点后 1 帧', s.range.startF + 1]);
    if (s.transitionOut && s.transitionOut.durF) rawProbes.push(['出点前 1 帧', s.range.endF - 1]);
    const seenFrames = new Set();
    const probes = [];
    for (const p of rawProbes) { if (seenFrames.has(p[1])) continue; seenFrames.add(p[1]); probes.push(p); }

    for (const [label, f] of probes) {
      const nonBlank = frameSource.nonBlankPx(f);
      add('V', nonBlank > blankMinPx, `V-blank-${s.id}-${label}`,
        `${s.id} ${label}(f=${f}) 非空白像素 ${nonBlank}${nonBlank > blankMinPx ? '' : ' ≤ 阈值，疑似空白'}`,
        { scene: s.id, frame: f, nonBlankPx: nonBlank });

      // 元素越界 + 文字裁切
      const boxes = visibleBoxes(plan, f);
      for (const b of boxes) {
        const out = b.x < safeMargin || b.y < safeMargin || b.x + b.w > W - safeMargin || b.y + b.h > H - safeMargin;
        add('V', !out, `V-oob-${b.id}-f${f}`,
          `${b.id}(f=${f}) ${out ? '越出安全边距' : '在安全边距内'} [x=${b.x.toFixed(0)},y=${b.y.toFixed(0)},w=${b.w.toFixed(0)},h=${b.h.toFixed(0)}]`,
          { element: b.id, frame: f, box: b });
      }
      // 同层遮挡
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          if (overlap(boxes[i], boxes[j]) && !allowedOverlap(plan, boxes[i].id, boxes[j].id)) {
            add('V', false, `V-occlude-${boxes[i].id}-${boxes[j].id}-f${f}`,
              `${boxes[i].id} 与 ${boxes[j].id}(f=${f}) 非预期遮挡`,
              { a: boxes[i].id, b: boxes[j].id, frame: f });
          }
        }
      }
    }

    // 文字裁切（用真实 measure）
    for (const el of s.elements || []) {
      if (el.kind !== 'label') continue;
      const mw = frameSource.measureTextWidth(el);
      add('V', mw <= el.layout.w + 1, `V-clip-${el.id}`,
        `${el.id} 文本实测宽 ${mw.toFixed(1)} ${mw <= el.layout.w + 1 ? '≤' : '>'} 容器宽 ${el.layout.w}`,
        { element: el.id, textWidth: mw, boxWidth: el.layout.w });
    }
  }

  // ---------- [M] 运动质量 ----------
  for (const s of plan.scenes) {
    for (const el of s.elements || []) {
      // 声明的运动 vs 观测的运动
      const declared = (el.tracks || []).filter((t) => trackMoves(t));
      const localEnd = s.range.endF - s.range.startF - 1;
      if (declared.length) {
        for (const t of declared) {
          const v0 = evalTrack(t, 0), v1 = evalTrack(t, localEnd);
          const moved = Math.abs(v1 - v0);
          // 若声明会动，但端点几乎相等，视作"回环"，不算静止
          if (moved < 1e-6 && trackHasInteriorMotion(t, localEnd)) continue;
          add('M', moved > 1e-6, `M-still-${el.id}-${t.prop}`,
            `${el.id}.${t.prop} 声明运动，端点位移 ${moved.toFixed(3)}${moved > 1e-6 ? '' : '（意外静止）'}`,
            { element: el.id, prop: t.prop });
        }
      } else if (!declared.length && !el.enter) {
        // 完全静态且无入场——标记为需人工确认（可能是刻意的静止背景）
        add('H', true, `H-static-${el.id}`, `${el.id} 无运动无入场，静态元素（人工确认是否刻意）`, { element: el.id, manual: true });
      }

      // 运动缺失：声明了进入窗口但整段 opacity≈0
      const anyVis = sampleVisible(el, s, localEnd);
      add('M', anyVis, `M-invisible-${el.id}`,
        `${el.id} ${anyVis ? '在其场景内有可见帧' : '整段不可见（运动缺失）'}`, { element: el.id });

      // 突变：相邻帧状态跳变
      for (let lf = 1; lf <= localEnd; lf++) {
        const p = evalElement(el, lf - 1), c = evalElement(el, lf);
        const dxy = Math.hypot(c.x - p.x, c.y - p.y);
        const dop = Math.abs(c.opacity - p.opacity);
        if (dxy > jumpPx || dop > jumpOpacity) {
          add('M', false, `M-jump-${el.id}-f${s.range.startF + lf}`,
            `${el.id} 在局部帧 ${lf} 发生突变 Δxy=${dxy.toFixed(1)} Δop=${dop.toFixed(2)}`,
            { element: el.id, frame: s.range.startF + lf, dxy, dop });
          break;
        }
      }
    }
  }

  // 转场连续性：dissolve 场景的入点，上一场景出点与本场景入点都应有内容
  for (let i = 1; i < plan.scenes.length; i++) {
    const cur = plan.scenes[i];
    if (cur.transitionIn && cur.transitionIn.type === 'dissolve') {
      const f = cur.range.startF + Math.max(1, Math.floor((cur.transitionIn.durF || 0) / 2));
      const nb = frameSource.nonBlankPx(f);
      add('M', nb > blankMinPx, `M-trans-${cur.id}`,
        `${cur.id} 溶解中点(f=${f}) 非空白像素 ${nb}`, { scene: cur.id, frame: f });
    }
  }

  // ---------- [H] 人工复核占位 ----------
  add('H', true, 'H-aesthetic', '整体美学（配色/构图/节奏）无法自动判定 —— 需人工复核', { manual: true });

  report.summary = summarise(report);
  return report;
}

function overlap(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const minArea = Math.min(a.w * a.h, b.w * b.h);
  return minArea > 0 && inter / minArea > 0.35; // 覆盖较小者 35% 以上才算遮挡
}
// 允许的遮挡（如文字压在半透明底板上）需在 plan 里显式声明 el.overlapOk。
function allowedOverlap(plan, idA, idB) {
  for (const s of plan.scenes) {
    for (const el of s.elements || []) {
      if ((el.id === idA || el.id === idB) && el.overlapOk) {
        if ((el.overlapOk || []).includes(idA) || (el.overlapOk || []).includes(idB)) return true;
      }
    }
  }
  return false;
}
function trackMoves(t) {
  const vs = t.keyframes.map((k) => k.v);
  return Math.max(...vs) - Math.min(...vs) > 1e-9;
}
function trackHasInteriorMotion(t, localEnd) {
  // 端点在场景内可能回环（起=止），只要中段有位移就不算静止
  let mn = Infinity, mx = -Infinity;
  for (let f = 0; f <= localEnd; f++) { const v = evalTrack(t, f); mn = Math.min(mn, v); mx = Math.max(mx, v); }
  return mx - mn > 1e-6;
}
function sampleVisible(el, s, localEnd) {
  for (let f = 0; f <= localEnd; f++) { if (evalElement(el, f).opacity > 0.05) return true; }
  return false;
}
function summarise(r) {
  const fails = r.issues.length;
  const manual = r.checks.filter((c) => c.cat === 'H').length;
  return { total: r.checks.length, failed: fails, manual, deterministicFails: r.issues.filter((i) => i.cat === 'D').length,
    visualFails: r.issues.filter((i) => i.cat === 'V').length, motionFails: r.issues.filter((i) => i.cat === 'M').length };
}

// 引用 evalElement/evalTrack/cameraAt/sceneAt，确保 tree-shaking 不影响；导出便于测试。
export { evalElement, evalTrack, cameraAt, sceneAt };
