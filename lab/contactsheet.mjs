// contactsheet.mjs — 把抽样帧拼成一张联系表 PNG（人工复核用）。
import { writeFileSync } from 'node:fs';

export function buildContactSheet(plan, createCanvas, renderPlan, frames, outPath, opts = {}) {
  const cols = opts.cols || 4;
  const cellW = opts.cellW || 320;
  const cellH = Math.round(cellW * plan.film.height / plan.film.width);
  const rows = Math.ceil(frames.length / cols);
  const pad = 6, labelH = 22;
  const W = cols * cellW + (cols + 1) * pad;
  const H = rows * (cellH + labelH) + (rows + 1) * pad;

  const sheet = createCanvas(W, H);
  const sctx = sheet.getContext('2d');
  sctx.fillStyle = '#05060a';
  sctx.fillRect(0, 0, W, H);

  // 单帧小画布
  const cell = createCanvas(plan.film.width, plan.film.height);
  const cctx = cell.getContext('2d');

  frames.forEach((f, idx) => {
    const r = Math.floor(idx / cols), c = idx % cols;
    const x = pad + c * (cellW + pad);
    const y = pad + r * (cellH + labelH + pad);
    cctx.save(); cctx.setTransform(1, 0, 0, 1, 0, 0); cctx.globalAlpha = 1;
    cctx.clearRect(0, 0, plan.film.width, plan.film.height); cctx.restore();
    renderPlan(cctx, plan, f);
    sctx.drawImage(cell, 0, 0, plan.film.width, plan.film.height, x, y, cellW, cellH);
    sctx.fillStyle = '#9a978f';
    sctx.font = '12px monospace';
    sctx.fillText(`f=${f}`, x + 2, y + cellH + 15);
  });

  writeFileSync(outPath, sheet.toBuffer('image/png'));
  return { path: outPath, frames, cols, rows, W, H };
}
