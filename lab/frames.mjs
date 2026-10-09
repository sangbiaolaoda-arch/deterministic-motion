// frames.mjs — 帧来源适配器：把 plan 渲染成像素，供门禁读取。
//
// 两个实现：
//   - canvasFrameSource(plan, createCanvas, renderPlan): 用 @napi-rs/canvas（真实 Skia 光栅器）离屏渲染。
//     这是"真实光栅器"路径，与浏览器 canvas 同一 API。
//   - stubFrameSource(plan, renderPlan): 不依赖 native 模块，用记录型 ctx 估计"是否有绘制"。
// 门禁只依赖接口：{ width, height, kind, hashAt(f), nonBlankPx(f), measureTextWidth(el) }。
//
// 空白判定（关键修正）：旧实现用「r+g+b > 30」判非空白，但本片背景 #0B0C10 的
//   通道和 = 39 > 30，导致整块背景恒被当作内容（实测非空白像素恒 = 1280×720），
//   blank 门禁形同虚设。现改为「与当前帧预期背景色逐通道比对，超过容差才算内容」。

import { createHash } from 'node:crypto';
import { sceneAt } from './plan.mjs';
import { transitionProgress } from './motion.mjs';

// #RGB / #RRGGBB -> {r,g,b}
export function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// 当前帧可能出现的背景色集合：
//   普通帧 = 当前场景 bg；转场帧 = 上一场景 bg 与当前场景 bg（混合结果落在两者之间）。
export function backgroundColors(plan, frame) {
  const { i, scene, localF } = sceneAt(plan, frame);
  const fallback = plan.film.palette || { bg: '#0B0C10' };
  const cur = (scene.palette || fallback).bg || '#0B0C10';
  const out = [hexToRgb(cur)];
  const tp = transitionProgress(scene, localF);
  if (tp.isTransition && i > 0) {
    const prev = plan.scenes[i - 1];
    const pb = (prev.palette || fallback).bg || '#0B0C10';
    out.push(hexToRgb(pb));
  }
  return out;
}

const BG_TOL = 16; // 每通道容差：吸收抗锯齿与转场混合造成的轻微偏移

// 统计与所有候选背景色都不同的像素（= 真实内容），忽略 alpha。
export function countNonBlank(data, bgs, tol = BG_TOL) {
  let n = 0;
  for (let k = 0; k < data.length; k += 4) {
    const r = data[k], g = data[k + 1], b = data[k + 2];
    let isBg = false;
    for (const bg of bgs) {
      if (Math.abs(r - bg.r) <= tol && Math.abs(g - bg.g) <= tol && Math.abs(b - bg.b) <= tol) { isBg = true; break; }
    }
    if (!isBg) n++;
  }
  return n;
}

export function canvasFrameSource(plan, createCanvas, renderPlan) {
  const W = plan.film.width, H = plan.film.height;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  function render(f) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.clearRect(0, 0, W, H); ctx.restore();
    renderPlan(ctx, plan, f);
    return ctx;
  }
  return {
    width: W, height: H, kind: 'canvas',
    hashAt(f) {
      render(f);
      const d = ctx.getImageData(0, 0, W, H).data;
      return createHash('sha256').update(Buffer.from(d.buffer, d.byteOffset, d.byteLength)).digest('hex');
    },
    nonBlankPx(f) {
      render(f);
      const d = ctx.getImageData(0, 0, W, H).data;
      return countNonBlank(d, backgroundColors(plan, f));
    },
    measureTextWidth(el) {
      ctx.save();
      ctx.font = (el.style && el.style.font) || '600 64px sans-serif';
      const w = ctx.measureText(el.text || el.id).width;
      ctx.restore();
      return w;
    },
  };
}

// 桩：无 native 时仍可跑结构与运动门禁（非空白用"是否发生真实绘制调用"估计）。
export function stubFrameSource(plan, renderPlan) {
  const W = plan.film.width, H = plan.film.height;
  const calls = [];
  const recording = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(W * H * 4) });
      if (prop === 'measureText') return (s) => ({ width: (s || '').length * 32 });
      return (...args) => { calls.push([prop, args]); return undefined; };
    },
    set() { return true; },
  });
  return {
    width: W, height: H, kind: 'stub',
    hashAt(f) { calls.length = 0; renderPlan(recording, plan, f); return 'stub-' + calls.length; },
    nonBlankPx(f) { calls.length = 0; renderPlan(recording, plan, f); return calls.length > 20 ? 999999 : 0; },
    measureTextWidth(el) { return (el.text || el.id).length * 32; },
  };
}
