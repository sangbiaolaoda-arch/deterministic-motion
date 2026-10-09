// build-sample.mjs — 把 plan+motion+render+sample 内联成单文件 HTML（浏览器可看）。
// 手法与仓库 src/build.mjs 一致：去掉行首 export/import，按依赖顺序拼接为一个经典脚本。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

function strip(src) {
  return src
    .split('\n')
    .filter((l) => !/^\s*import\s/.test(l))       // 去掉 import 行
    .map((l) => l.replace(/^export\s+/, ''))      // 去掉行首 export
    .join('\n');
}

const parts = ['plan.mjs', 'motion.mjs', 'render.mjs', 'sample.mjs']
  .map((f) => `// ===== ${f} =====\n` + strip(readFileSync(join(HERE, f), 'utf8')))
  .join('\n\n');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${'最小运动系统 · 12 秒样片'}</title>
<style>
  :root{--bg:#07070A;--panel:#12141b;--line:rgba(255,255,255,.10);--ink:#F4EFE6;--muted:#8E8B84;--accent:#EBA23C}
  *{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);
    font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif}
  .wrap{max-width:1080px;margin:0 auto;padding:26px 20px 56px}
  h1{font-size:22px;margin:0 0 4px}p.sub{color:var(--muted);font-size:13px;margin:0 0 16px}
  .stage{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:#0B0C10}
  canvas{display:block;width:100%;height:auto;background:#0B0C10}
  .bar{display:flex;align-items:center;gap:12px;margin-top:12px;flex-wrap:wrap}
  button{background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:9px;
    padding:8px 14px;font-size:13px;cursor:pointer}
  button:hover{border-color:var(--accent)}
  input[type=range]{flex:1;min-width:220px;accent-color:var(--accent)}
  .t{font-family:monospace;font-size:12px;color:var(--muted);min-width:96px;text-align:right}
  .chips{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
  .chip{font-size:12px;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:5px 11px;cursor:pointer}
  .chip.on{color:var(--accent);border-color:var(--accent)}
</style>
</head>
<body>
<div class="wrap">
  <h1>最小运动系统 · 12 秒样片</h1>
  <p class="sub">Scene Plan 中间层驱动 · 纯数据 → 纯渲染 · 帧号确定性 · 3 镜头（cut + dissolve）</p>
  <div class="stage"><canvas id="stage" width="${'1280'}" height="${'720'}"></canvas></div>
  <div class="bar">
    <button id="play">播放</button>
    <button id="restart">重播</button>
    <input id="scrub" type="range" min="0" max="359" value="0">
    <span class="t" id="time">00:00 / 00:12</span>
  </div>
  <div class="chips" id="chips"></div>
</div>
<script>
${parts}

(function () {
  var canvas = document.getElementById('stage');
  var ctx = canvas.getContext('2d');
  var playBtn = document.getElementById('play');
  var scrub = document.getElementById('scrub');
  var timeEl = document.getElementById('time');
  var chipsEl = document.getElementById('chips');
  var PLAN = SAMPLE;
  var TOTAL = PLAN.film.durationF, FPS = PLAN.film.fps;
  var frame = 0, playing = false, lastTs = 0, rafId = 0;

  function fmt(s){ s=Math.max(0,s); var m=Math.floor(s/60), ss=Math.floor(s%60);
    return String(m).padStart(2,'0')+':'+String(ss).padStart(2,'0'); }
  function draw(){ renderPlan(ctx, PLAN, frame); }
  function hud(){ timeEl.textContent = fmt(frame/FPS)+' / '+fmt(TOTAL/FPS); scrub.value=String(Math.round(frame)); }
  function setFrame(f){ frame=Math.min(Math.max(Math.round(f),0),TOTAL-1); draw(); hud(); }
  function loop(ts){ if(!playing) return; if(!lastTs) lastTs=ts;
    frame += ((ts-lastTs)/1000)*FPS; lastTs=ts;
    if(frame>=TOTAL-1){ frame=TOTAL-1; draw(); hud(); playing=false; playBtn.textContent='播放'; return; }
    draw(); hud(); rafId=requestAnimationFrame(loop); }
  function play(){ if(playing) return; if(frame>=TOTAL-1) frame=0; playing=true; lastTs=0;
    playBtn.textContent='暂停'; rafId=requestAnimationFrame(loop); }
  function pause(){ playing=false; if(rafId) cancelAnimationFrame(rafId); rafId=0; playBtn.textContent='播放'; }

  playBtn.addEventListener('click', function(){ playing?pause():play(); });
  document.getElementById('restart').addEventListener('click', function(){ pause(); setFrame(0); });
  scrub.addEventListener('input', function(){ pause(); setFrame(+scrub.value); });
  canvas.addEventListener('click', function(){ playing?pause():play(); });

  PLAN.scenes.forEach(function(s,i){
    var b=document.createElement('button'); b.className='chip'; b.textContent=(i+1)+'. '+(s.purpose||s.id);
    b.addEventListener('click', function(){ pause(); setFrame(s.range.startF); });
    chipsEl.appendChild(b);
  });

  // 支持 ?f=N 定位到指定帧（浏览器验收脚本用）；?embed=1 只留画布、贴边满屏（截图=纯画布）。
  var q = new URLSearchParams(location.search);
  if (q.get('embed')) {
    document.body.style.margin = '0';
    document.body.style.background = '#0B0C10';
    var wrap = document.querySelector('.wrap');
    if (wrap) { wrap.style.margin = '0'; wrap.style.padding = '0'; wrap.style.maxWidth = 'none'; }
    document.querySelectorAll('h1, p.sub, .bar, .chips').forEach(function(e){ e.style.display = 'none'; });
    var stage = document.querySelector('.stage');
    if (stage) { stage.style.border = 'none'; stage.style.borderRadius = '0'; }
    canvas.style.width = canvas.getAttribute('width') + 'px';
    canvas.style.height = canvas.getAttribute('height') + 'px';
  }
  var f0 = parseInt(q.get('f') || '0', 10);
  setFrame(Number.isFinite(f0) ? f0 : 0);
  window.__LAB = { plan: PLAN, seek: function(f){ pause(); setFrame(f); }, frame: function(){ return frame; } };
})();
</script>
</body>
</html>`;

const out = join(HERE, '..', 'dist', 'sample-motion-12s.html');
writeFileSync(out, html);
console.log('写出浏览器样片： ' + out + ' (' + html.length + ' bytes)');
