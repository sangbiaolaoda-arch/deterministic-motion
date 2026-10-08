// ui.js — 浏览器端：控件、播放循环、逐拍导航、自检
// 与 core.mjs 同处一个模块作用域（构建时合并），直接引用其中的常量与函数。

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const playBtn = document.getElementById('play');
const scrub = document.getElementById('scrub');
const timeEl = document.getElementById('time');
const restartBtn = document.getElementById('restart');
const chipsEl = document.getElementById('chips');

let playing = false;
let frame = 0;
let lastTs = 0;
let rafId = 0;
let hudBeat = -1;

function draw() { renderFrame(ctx, frame); }

function updateHud(force) {
  const tl = timelineAt(frame);
  timeEl.textContent = fmtTime(frame / FPS) + ' / ' + fmtTime(DURATION_S);
  scrub.value = String(frame);
  if (force || tl.i !== hudBeat) {
    hudBeat = tl.i;
    const kids = chipsEl.children;
    for (let i = 0; i < kids.length; i++) kids[i].classList.toggle('on', i === tl.i);
  }
}

function setFrame(f, force) {
  frame = clamp(Math.round(f), 0, TOTAL_FRAMES - 1);
  draw();
  updateHud(force);
}

function updatePlayBtn() {
  playBtn.setAttribute('aria-label', playing ? '暂停' : '播放');
  playBtn.innerHTML = playing
    ? '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
    : '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
}

function loop(ts) {
  if (!playing) return;
  if (!lastTs) lastTs = ts;
  const dt = (ts - lastTs) / 1000;
  lastTs = ts;
  frame += dt * FPS;
  if (frame >= TOTAL_FRAMES - 1) {
    frame = TOTAL_FRAMES - 1;
    draw(); updateHud(true);
    playing = false; updatePlayBtn();
    return;
  }
  draw(); updateHud(false);
  rafId = requestAnimationFrame(loop);
}

function play() {
  if (playing) return;
  if (frame >= TOTAL_FRAMES - 1) frame = 0; // 播到尾再按 -> 从头
  playing = true;
  lastTs = 0;
  updatePlayBtn();
  rafId = requestAnimationFrame(loop);
}

function pause() {
  playing = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  updatePlayBtn();
}

function toggle() { playing ? pause() : play(); }

// ---- 事件绑定 -------------------------------------------------------------
playBtn.addEventListener('click', toggle);
restartBtn.addEventListener('click', function () { pause(); setFrame(0, true); });
scrub.addEventListener('input', function () { pause(); setFrame(+scrub.value, true); });
canvas.addEventListener('click', toggle);

document.addEventListener('keydown', function (e) {
  if (e.code === 'Space') { e.preventDefault(); toggle(); }
  else if (e.code === 'ArrowRight') { e.preventDefault(); pause(); setFrame(frame + (e.shiftKey ? FPS : 1), true); }
  else if (e.code === 'ArrowLeft') { e.preventDefault(); pause(); setFrame(frame - (e.shiftKey ? FPS : 1), true); }
  else if (e.code === 'Home') { e.preventDefault(); pause(); setFrame(0, true); }
  else if (e.code === 'End') { e.preventDefault(); pause(); setFrame(TOTAL_FRAMES - 1, true); }
  else if (e.code === 'KeyR') { pause(); setFrame(0, true); }
});

// ---- 逐拍导航 chips（数据来自 BEAT_FRAMES，唯一真相）----------------------
(function buildChips() {
  for (let i = 0; i < BEAT_FRAMES.length; i++) {
    const bf = BEAT_FRAMES[i];
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.dataset.i = String(i);
    btn.innerHTML = '<span class="dot" style="background:' + bf.color + '"></span>' +
      '<span class="n">' + bf.index + '</span>' +
      '<span class="t">' + bf.title + '</span>';
    btn.addEventListener('click', function () { pause(); setFrame(bf.startF, true); });
    chipsEl.appendChild(btn);
  }
})();

// ---- 初始化：字体就绪后重绘一帧（readiness gate）----------------------
setFrame(0, true);
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(function () { setFrame(frame, true); });
}

// ---- 对外接口：供逐帧截图 / 自检（不参与交互）-------------------------
window.__HH = {
  W: W, H: H, FPS: FPS, TOTAL_FRAMES: TOTAL_FRAMES, BEAT_FRAMES: BEAT_FRAMES,
  seek: function (f) { pause(); setFrame(f, true); },
  at: function (f) { renderFrame(ctx, f); },
  // 确定性自检：同帧渲染两次比较像素；返回结构化结果
  selfTest: function () {
    const samples = [0, CROSS, 180, 400, 675, 900, 1200, TOTAL_FRAMES - 1];
    const report = { ok: true, frames: [], errors: [] };
    const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
    const tc = tmp.getContext('2d');
    for (let i = 0; i < samples.length; i++) {
      const f = samples[i];
      renderFrame(ctx, f);
      const a = ctx.getImageData(0, 0, W, H).data;
      renderFrame(tc, f);
      const b = tc.getImageData(0, 0, W, H).data;
      let diff = 0, nonBlank = 0;
      for (let k = 0; k < a.length; k += 4) {
        if (a[k] !== b[k] || a[k + 1] !== b[k + 1] || a[k + 2] !== b[k + 2]) diff++;
        if (a[k] + a[k + 1] + a[k + 2] > 24) nonBlank++;
      }
      const entry = { frame: f, pixelDiff: diff, nonBlankPx: nonBlank, deterministic: diff === 0, nonBlank: nonBlank > 1000 };
      if (!entry.deterministic) { report.ok = false; report.errors.push('frame ' + f + ' not deterministic'); }
      report.frames.push(entry);
    }
    renderFrame(ctx, frame);
    return report;
  },
};
