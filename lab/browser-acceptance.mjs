// browser-acceptance.mjs — 真实浏览器（headless chromium/google-chrome）验收。
// 与 Node canvas 门禁互补：Node 侧验证「纯函数 / 几何确定性」；浏览器侧验证「真实渲染管线可逐帧出图」。
// 两者是不同光栅器（Skia vs Blink），像素不必逐位一致（README「已知边界」已说明），故本报告显式区分。
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync, rmSync, mkdtempSync, copyFileSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { SAMPLE } from './sample.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'dist');
const BO = join(OUT, 'browser');
mkdirSync(BO, { recursive: true });

function findChrome() {
  const cands = [process.env.CHROME_BIN, 'chromium', 'chromium-browser', 'google-chrome',
    'google-chrome-stable', '/usr/bin/chromium'].filter(Boolean);
  for (const c of cands) {
    const r = spawnSync(c, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return { bin: c, version: (r.stdout || r.stderr || '').trim() };
  }
  return null;
}

const chrome = findChrome();
if (!chrome) {
  console.log('未找到 chromium/google-chrome，跳过浏览器验收（Node canvas 门禁已覆盖确定性）。');
  process.exit(0);
}
console.log(`浏览器：${chrome.bin} — ${chrome.version}`);

// 构建浏览器样片（内联 plan/motion/render/sample）
const br = spawnSync(process.execPath, [join(HERE, 'build-sample.mjs')], { stdio: 'inherit', env: { ...process.env, TMPDIR: OUT } });
if (br.status !== 0) { console.error('样片构建失败'); process.exit(1); }
const base = pathToFileURL(join(OUT, 'sample-motion-12s.html')).href;

const W = SAMPLE.film.width, H = SAMPLE.film.height;

// 采样帧：每镜头 首/中/末 + 每个 dissolve 转场 前/中/后
const plan = [];
const seen = new Set();
const push = (f, label, scene) => {
  const ff = Math.max(0, Math.min(SAMPLE.film.durationF - 1, f));
  if (seen.has(ff)) return;
  seen.add(ff);
  plan.push({ f: ff, label, scene });
};
for (const s of SAMPLE.scenes) {
  const span = s.range.endF - s.range.startF;
  push(s.range.startF, '首帧', s.id);
  push(s.range.startF + Math.floor(span / 2), '中帧', s.id);
  push(s.range.endF - 1, '末帧', s.id);
}
for (let i = 1; i < SAMPLE.scenes.length; i++) {
  const s = SAMPLE.scenes[i];
  if (s.transitionIn && s.transitionIn.type === 'dissolve' && (s.transitionIn.durF || 0) > 0) {
    const d = s.transitionIn.durF;
    push(s.range.startF - 1, '转场前', s.id);
    push(s.range.startF + Math.floor(d / 2), '转场中', s.id);
    push(s.range.startF + d, '转场后', s.id);
  }
}
plan.sort((a, b) => a.f - b.f);

// 复用同一 profile 目录；--disable-dev-shm-usage 规避沙箱 /dev/shm 过小（常见 64MB）导致的
// "No space left on device" 崩溃；TMPDIR 指向可写目录。
// 关键：chromium 的 profile 与截图**必须**写在本地可写目录（os.tmpdir），
// 不能写在 COS 挂载目录（/mnt/cos/artifacts）——在挂载点上写 profile/截图会让 chromium
// 以 SIGTRAP 静默退出且不产出文件（本项目沙箱已对照复现）。截图后再拷回 dist/browser 交付。
const SCRATCH = process.env.LAB_SCRATCH || join(tmpdir(), 'lab-browser');
mkdirSync(SCRATCH, { recursive: true });
const PROFILE = mkdtempSync(join(SCRATCH, 'chrome-'));
const chromeEnv = { ...process.env, TMPDIR: SCRATCH };

function shotOnce(f, outPng) {
  const url = `${base}?f=${f}&embed=1`;
  const r = spawnSync(chrome.bin, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--hide-scrollbars', '--no-first-run', '--disable-extensions',
    `--user-data-dir=${PROFILE}`, `--disk-cache-dir=${join(PROFILE, 'cache')}`,
    '--force-device-scale-factor=1', '--virtual-time-budget=1500',
    `--window-size=${W},${H}`, `--screenshot=${outPng}`, url,
  ], { encoding: 'utf8', env: chromeEnv, timeout: 60000 });
  return r.status === 0 && existsSync(outPng);
}
function shot(f, outPng) {
  rmSync(outPng, { force: true });
  return shotOnce(f, outPng) || shotOnce(f, outPng); // 一次重试，规避偶发启动失败
}
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

const frames = [];
let captured = 0;
for (const item of plan) {
  const scratchPng = join(SCRATCH, `f${String(item.f).padStart(3, '0')}.png`);
  const finalPng = join(BO, `f${String(item.f).padStart(3, '0')}.png`);
  const okShot = shot(item.f, scratchPng);
  const rec = { ...item, png: finalPng.replace(ROOT + '/', ''), ok: okShot };
  if (okShot) {
    // 用读+写代替 copyFileSync：COS 挂载不支持 copyfile 的元数据保留，会 EPERM。
    writeFileSync(finalPng, readFileSync(scratchPng));
    rec.bytes = statSync(finalPng).size; rec.sha256 = sha(finalPng); captured++;
  }
  frames.push(rec);
}

// 浏览器内确定性：同帧两次截图应逐字节一致（同浏览器、同环境）
const determinism = [];
for (const f of [0, Math.floor(SAMPLE.film.durationF / 3), SAMPLE.film.durationF - 1]) {
  const a = join(SCRATCH, `det_f${f}_a.png`), b = join(SCRATCH, `det_f${f}_b.png`);
  const okA = shot(f, a), okB = shot(f, b);
  determinism.push({ frame: f, twiceEqual: okA && okB && sha(a) === sha(b) });
}

// 联系表（把浏览器 PNG 拼回一张，便于人工复核）
let sheetPath = null;
try {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const cols = 4, cellW = 320, cellH = Math.round((cellW * H) / W), pad = 6, labelH = 18;
  const rows = Math.ceil(frames.length / cols);
  const cs = createCanvas(cols * cellW + (cols + 1) * pad, rows * (cellH + labelH) + (rows + 1) * pad);
  const cx = cs.getContext('2d');
  cx.fillStyle = '#05060a'; cx.fillRect(0, 0, cs.width, cs.height);
  for (let i = 0; i < frames.length; i++) {
    if (!frames[i].ok) continue;
    const img = await loadImage(join(ROOT, frames[i].png));
    const r = Math.floor(i / cols), c = i % cols;
    const x = pad + c * (cellW + pad), y = pad + r * (cellH + labelH + pad);
    cx.drawImage(img, 0, 0, W, H, x, y, cellW, cellH);
    cx.fillStyle = '#9a978f'; cx.font = '12px monospace';
    cx.fillText(`f=${frames[i].f} ${frames[i].label}`, x + 2, y + cellH + 13);
  }
  sheetPath = join(OUT, 'browser-acceptance-contactsheet.png');
  writeFileSync(sheetPath, cs.toBuffer('image/png'));
} catch (e) {
  console.log('  · 跳过浏览器联系表：' + (e && e.message));
}

// Node canvas 对照（同一帧，不同光栅器）
let nodeContrast = null;
try {
  const { createCanvas } = await import('@napi-rs/canvas');
  const { renderPlan } = await import('./render.mjs');
  const nc = createCanvas(W, H); const nctx = nc.getContext('2d');
  renderPlan(nctx, SAMPLE, 0);
  const d = nctx.getImageData(0, 0, W, H).data;
  nodeContrast = {
    frame: 0, rasterizer: 'node-@napi-rs/canvas(Skia)',
    nodeHash: createHash('sha256').update(Buffer.from(d.buffer, d.byteOffset, d.byteLength)).digest('hex'),
    browserHash: frames.find((x) => x.f === 0)?.sha256 || null,
    note: 'Node(Skia) 与浏览器(Blink) 是不同光栅器，哈希不必一致——仅证明两侧都能对同帧出图。',
  };
} catch { /* 无 native */ }

const failedCaps = frames.filter((f) => !f.ok).length;
const detFail = determinism.filter((d) => !d.twiceEqual).length;

const report = {
  kind: 'browser',
  rasterizer: 'chromium-headless',
  chromium: chrome.version,
  width: W, height: H,
  captured, expected: plan.length,
  frames, determinism, nodeCanvasContrast: nodeContrast,
  note: '真实浏览器渲染验收：证明样片在浏览器管线中可逐帧出图，且同一浏览器内同帧可复现。像素与 Node canvas 不必逐位一致（不同光栅器）。',
};
writeFileSync(join(OUT, 'browser-acceptance-report.json'), JSON.stringify(report, null, 2));

console.log(`浏览器截图：${captured}/${plan.length} 帧 → dist/browser/`);
console.log(`浏览器内确定性：${determinism.length - detFail}/${determinism.length} 帧两次一致`);
if (sheetPath) console.log('浏览器联系表：' + sheetPath.replace(ROOT + '/', ''));
console.log('机器可读报告：dist/browser-acceptance-report.json');
process.exit(failedCaps === 0 && detFail === 0 ? 0 : 1);
