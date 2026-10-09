// render.mjs — plan 的纯函数渲染器（frame -> pixels）。
//
// 与 core.mjs 的 renderFrame 一样是"纯函数 + 帧号驱动"；不同点：
//   画面完全由 plan 数据描述，本文件不含任何具体片子的硬编码场景。
// 渲染契约：renderPlan(ctx, plan, frame) 对相同 (plan, frame) 必产生相同指令序列。

import { sceneAt } from './plan.mjs';
import { evalElement, cameraAt, transitionProgress, clamp } from './motion.mjs';

function rgba(hex, a) {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

// 一个元素在其"场景局部帧"的屏幕盒（含相机前，场景坐标）。门禁与绘制共用。
export function elementBox(el, localF) {
  const st = evalElement(el, localF);
  const cx = st.x, cy = st.y;
  const w = st.w * st.scale, h = st.h * st.scale;
  return { x: cx - w / 2, y: cy - h / 2, w, h, cx, cy, rotate: st.rotate, opacity: st.opacity, z: st.z, st };
}

function drawElement(ctx, el, st, palette) {
  ctx.save();
  ctx.globalAlpha = clamp(st.opacity, 0, 1) * (ctx.globalAlpha || 1);
  ctx.translate(st.x, st.y);
  if (st.rotate) ctx.rotate((st.rotate * Math.PI) / 180);
  if (st.scale !== 1) ctx.scale(st.scale, st.scale);
  const col = (el.style && el.style.color) || palette.accent;
  switch (el.kind) {
    case 'bar': {
      ctx.fillStyle = rgba(col, el.style && el.style.alpha != null ? el.style.alpha : 1);
      roundRect(ctx, -st.w / 2, -st.h / 2, st.w, st.h, (el.style && el.style.radius) || 0);
      ctx.fill();
      break;
    }
    case 'disc': {
      ctx.beginPath();
      ctx.arc(0, 0, st.w / 2, 0, Math.PI * 2);
      ctx.fillStyle = rgba(col, el.style && el.style.alpha != null ? el.style.alpha : 1);
      ctx.fill();
      break;
    }
    case 'ring': {
      ctx.beginPath();
      ctx.arc(0, 0, st.w / 2, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(col, el.style && el.style.alpha != null ? el.style.alpha : 1);
      ctx.lineWidth = (el.style && el.style.lw) || 6;
      ctx.stroke();
      break;
    }
    case 'line': {
      ctx.beginPath();
      ctx.moveTo(-st.w / 2, 0);
      ctx.lineTo(st.w / 2, 0);
      ctx.strokeStyle = rgba(col, el.style && el.style.alpha != null ? el.style.alpha : 1);
      ctx.lineWidth = (el.style && el.style.lw) || 3;
      ctx.stroke();
      break;
    }
    case 'tri': {
      ctx.beginPath();
      ctx.moveTo(0, -st.h / 2);
      ctx.lineTo(st.w / 2, st.h / 2);
      ctx.lineTo(-st.w / 2, st.h / 2);
      ctx.closePath();
      ctx.fillStyle = rgba(col, el.style && el.style.alpha != null ? el.style.alpha : 1);
      ctx.fill();
      break;
    }
    case 'label': {
      ctx.fillStyle = rgba(col, el.style && el.style.alpha != null ? el.style.alpha : 1);
      ctx.font = (el.style && el.style.font) || '600 64px "PingFang SC",sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(el.text || el.id, 0, 0);
      break;
    }
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawSceneLayer(ctx, plan, scene, localF, alpha) {
  if (alpha <= 0.001) return;
  const W = plan.film.width, H = plan.film.height;
  const palette = scene.palette || (plan.film.palette || { bg: '#0B0C10', accent: '#EBA23C' });
  // 背景
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = palette.bg || '#0B0C10';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  // 相机
  const cam = cameraAt(scene.camera, localF);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(W / 2 + cam.x, H / 2 + cam.y);
  ctx.rotate((cam.rotate * Math.PI) / 180);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-W / 2, -H / 2);
  const els = (scene.elements || []).slice().sort((a, b) => (a.layout.z || 0) - (b.layout.z || 0));
  for (const el of els) {
    const st = evalElement(el, localF);
    if (st.opacity <= 0.001) continue;
    drawElement(ctx, el, st, palette);
  }
  ctx.restore();
}

// 顶层：渲染一帧（含转场）。
export function renderPlan(ctx, plan, frame) {
  const W = plan.film.width, H = plan.film.height;
  const { i, scene, localF } = sceneAt(plan, frame);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, W, H);
  ctx.restore();

  const tp = transitionProgress(scene, localF);
  const prev = i > 0 ? plan.scenes[i - 1] : null;

  if (tp.isTransition && prev) {
    // 出：上一场景在其末态；入：本场景。仅 cut / dissolve 两种转场（morph 已在 validatePlan 阶段拒绝）
    const prevLocal = prev.range.endF - prev.range.startF - 1;
    drawSceneLayer(ctx, plan, prev, prevLocal, tp.outA);
    drawSceneLayer(ctx, plan, scene, localF, tp.inA);
  } else {
    drawSceneLayer(ctx, plan, scene, localF, 1);
  }
  return { sceneIndex: i, sceneId: scene.id, localF, frame };
}

// 便于门禁：取某帧所有可见元素的屏幕盒（含相机）。
export function visibleBoxes(plan, frame) {
  const { scene, localF } = sceneAt(plan, frame);
  const cam = cameraAt(scene.camera, localF);
  const W = plan.film.width, H = plan.film.height;
  const out = [];
  for (const el of scene.elements || []) {
    const b = elementBox(el, localF);
    if (b.opacity <= 0.02) continue;
    const sx = W / 2 + cam.x + (b.cx - W / 2) * cam.zoom;
    const sy = H / 2 + cam.y + (b.cy - H / 2) * cam.zoom;
    out.push({ id: el.id, kind: el.kind, sceneId: scene.id, opacity: b.opacity,
      x: sx - b.w * cam.zoom / 2, y: sy - b.h * cam.zoom / 2,
      w: b.w * cam.zoom, h: b.h * cam.zoom });
  }
  return out;
}
