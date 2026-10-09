// frames.mjs — 帧来源适配器：把 plan 渲染成像素，供门禁读取。
//
// 两个实现：
//   - canvasFrameSource(plan): 用 @napi-rs/canvas（真实 Skia 光栅器）离屏渲染。
//     这是"真实光栅器"路径，与浏览器 canvas 同一 API。
//   - stubFrameSource(plan): 不依赖 native 模块，用记录型 ctx 估计非空白像素。
// 门禁只依赖接口：{ width, height, hashAt(f), nonBlankPx(f), measureTextWidth(el) }。

import { createHash } from 'node:crypto';

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
      let n = 0;
      for (let k = 0; k < d.length; k += 4) if (d[k] + d[k + 1] + d[k + 2] > 30) n++;
      return n;
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

// 桩：无 native 时仍可跑结构与运动门禁（非空白用粗糙估计）。
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
