// build.mjs — 把 src/core.mjs + src/ui.js 内联合并为单个自包含 HTML。
// core.mjs 以 ES 模块书写以便 Node 直接测试；构建时去掉行首 `export ` 即可。
//
// 用法： node src/build.mjs
// 输出： dist/human-history-45s.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const core = readFileSync(join(__dirname, 'core.mjs'), 'utf8')
  .split('\n')
  .map(function (line) { return line.replace(/^export\s+/, ''); })
  .join('\n');
const ui = readFileSync(join(__dirname, 'ui.js'), 'utf8');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>人类的发展史 · 45 秒确定性动画</title>
<style>
  :root{
    --bg:#07070A; --panel:#111219; --line:rgba(255,255,255,.10);
    --ink:#F4EFE6; --muted:#8E8B84; --accent:#EBA23C;
    --font-display:"Songti SC","STSong","Noto Serif SC",Georgia,serif;
    --font-body:"PingFang SC","Microsoft YaHei","Noto Sans SC",-apple-system,"Segoe UI",sans-serif;
    --font-mono:"SF Mono","JetBrains Mono",Menlo,Consolas,"Courier New",monospace;
  }
  *{box-sizing:border-box}
  html,body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font-body)}
  .wrap{max-width:1080px;margin:0 auto;padding:28px 20px 56px}
  header{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}
  h1{font-family:var(--font-display);font-weight:700;font-size:30px;letter-spacing:.06em;margin:0}
  header p{margin:6px 0 0;color:var(--muted);font-size:13.5px;line-height:1.5;max-width:560px}
  .badge{font-family:var(--font-mono);font-size:11.5px;color:var(--accent);border:1px solid var(--line);border-radius:999px;padding:6px 12px;white-space:nowrap}
  .stage{position:relative;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:#0B0C10;box-shadow:0 24px 60px -30px rgba(0,0,0,.9)}
  canvas{display:block;width:100%;height:auto;aspect-ratio:16/9}
  .bar{display:flex;align-items:center;gap:14px;margin-top:14px;padding:12px 14px;background:var(--panel);border:1px solid var(--line);border-radius:12px}
  .icon-btn{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;flex:0 0 auto;border-radius:10px;border:1px solid var(--line);background:#191A23;color:var(--ink);cursor:pointer;transition:.15s}
  .icon-btn:hover{background:#22232e;border-color:rgba(255,255,255,.2)}
  .icon-btn svg{fill:currentColor}
  #scrub{-webkit-appearance:none;appearance:none;flex:1 1 auto;height:6px;border-radius:3px;background:linear-gradient(90deg,var(--accent),var(--accent)) no-repeat,rgba(255,255,255,.12);background-size:0% 100%;cursor:pointer}
  #scrub::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 0 0 4px rgba(235,162,60,.25)}
  #scrub::-moz-range-thumb{width:16px;height:16px;border:none;border-radius:50%;background:#fff}
  .time{font-family:var(--font-mono);font-size:13px;color:var(--muted);white-space:nowrap;min-width:108px;text-align:right}
  .chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
  .chip{display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--muted);font-size:12.5px;cursor:pointer;transition:.15s;font-family:var(--font-body)}
  .chip:hover{border-color:rgba(255,255,255,.22);color:var(--ink)}
  .chip.on{color:var(--ink);border-color:rgba(255,255,255,.35);background:rgba(255,255,255,.05)}
  .chip .dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto}
  .chip .n{font-family:var(--font-mono);font-size:11px;opacity:.8}
  footer{margin-top:22px;color:var(--muted);font-size:12.5px;line-height:1.7;border-top:1px solid var(--line);padding-top:16px}
  footer b{color:var(--ink);font-weight:600}
  footer code{font-family:var(--font-mono);font-size:11.5px;color:var(--accent)}
  @media (max-width:560px){
    .wrap{padding:18px 12px 40px}
    h1{font-size:23px}
    .time{min-width:88px;font-size:12px}
    .bar{gap:10px;padding:10px}
  }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <div>
        <h1>人类的发展史</h1>
        <p>一段 45 秒的确定性动画：由「拍表」驱动，逐帧纯函数渲染。同一帧永远得到同一画面——这是可复现视频管线的地基。</p>
      </div>
      <div class="badge">1920 × 1080 · 30fps · 1350 帧</div>
    </header>

    <div class="stage">
      <canvas id="stage" width="1920" height="1080" aria-label="人类的发展史 45 秒动画"></canvas>
    </div>

    <div class="bar">
      <button id="play" class="icon-btn" aria-label="播放"></button>
      <input id="scrub" type="range" min="0" max="1349" value="0" step="1" aria-label="进度">
      <span id="time" class="time">00:00 / 00:45</span>
      <button id="restart" class="icon-btn" aria-label="重播">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg>
      </button>
    </div>

    <div id="chips" class="chips" aria-label="逐拍导航"></div>

    <footer>
      <p><b>交互</b>：空格 播放/暂停 · ←/→ 逐帧（Shift 加速一秒） · Home/End 首尾 · R 重播 · 点击画面亦可暂停。<br>
      <b>确定性契约</b>：无墙钟依赖、无未种子随机、固定分辨率与时长、逐帧可 seek；随机元素由 <code>hash(拍标识)</code> 播种，跨机器一致。<br>
      <b>自检</b>：控制台执行 <code>window.__HH.selfTest()</code> 可对同帧渲染两次并比较像素，验证确定性。</p>
    </footer>
  </div>

<script type="module">
${core}

${ui}
</script>
</body>
</html>
`;

const out = join(root, 'dist', 'human-history-45s.html');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html, 'utf8');
console.log('built ->', out, '(' + html.length + ' bytes)');
