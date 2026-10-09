// motion.mjs — 最小可行运动系统（确定性、帧号驱动）。
//
// 能力：
//   - 元素级帧轨道：x/y/w/h/scale/rotate/opacity，分段关键帧 + 逐段缓动
//   - 统一入场/离场（enter/exit：时长+缓动+方向），与轨道叠加
//   - 镜头级相机变换：x/y/zoom/rotate 轨道
//   - 连续转场原语：cut / dissolve（交叉溶解）/ morph（同名元素跨场景插值）
//
// 确定性契约（与 core.mjs 的 I2/I3 对齐）：
//   所有函数是 (数据, 帧) 的纯函数；不读墙钟、不使用未种子随机、结果与调用顺序无关。

export function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

const EASE = {
  linear: (t) => t,
  easeOutCubic: (t) => { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); },
  easeInCubic: (t) => { t = clamp(t, 0, 1); return t * t * t; },
  easeInOutCubic: (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
  smoothstep: (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); },
};
export const ease = (name, t) => (EASE[name] || EASE.linear)(t);
export const EASE_NAMES = Object.keys(EASE);

function lerp(a, b, t) { return a + (b - a) * t; }

// 分段线性 + 逐段缓动求值。keyframes 已按 f 严格递增（validatePlan 保证）。
// 段 [k_i, k_{i+1}] 的缓动取自 k_i.ease（缺省 linear）。
export function evalTrack(track, f) {
  const kfs = track.keyframes;
  if (f <= kfs[0].f) return kfs[0].v;
  const last = kfs[kfs.length - 1];
  if (f >= last.f) return last.v;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i], b = kfs[i + 1];
    if (f >= a.f && f <= b.f) {
      const span = b.f - a.f;
      const t = span === 0 ? 1 : (f - a.f) / span;
      return lerp(a.v, b.v, ease(a.ease || 'linear', t));
    }
  }
  return last.v;
}

// 元素在某局部帧的完整状态：布局覆盖 + 轨道 + 入离场（都相对场景起点 localF）。
export function evalElement(el, localF) {
  const L = el.layout;
  const st = {
    x: L.x, y: L.y, w: L.w, h: L.h,
    scale: L.scale != null ? L.scale : 1,
    rotate: L.rotate != null ? L.rotate : 0,
    opacity: L.opacity != null ? L.opacity : 1,
    z: L.z != null ? L.z : 0,
  };
  for (const t of el.tracks || []) st[t.prop] = evalTrack(t, localF);

  // 入场/离场
  if (el.enter) {
    const d = el.enter.durF || 0;
    const a = d <= 0 ? 1 : clamp(localF / d, 0, 1);
    const e = ease(el.enter.ease || 'easeOutCubic', a);
    st.opacity *= e;
    if (el.enter.from === 'below') st.y += (1 - e) * (el.enter.dist || 80);
    else if (el.enter.from === 'left') st.x -= (1 - e) * (el.enter.dist || 80);
    else if (el.enter.from === 'right') st.x += (1 - e) * (el.enter.dist || 80);
    else if (el.enter.from === 'grow') st.scale *= lerp(el.enter.scale0 != null ? el.enter.scale0 : 0.6, 1, e);
  }
  if (el.exit) {
    const startLocal = el.exit.startLocalF != null ? el.exit.startLocalF : (el.visible && el.visible.endF != null ? el.visible.endF - elSceneStart(el) : 1e9);
    const d = el.exit.durF || 0;
    const a = d <= 0 ? (localF >= startLocal ? 1 : 0) : clamp((localF - startLocal) / d, 0, 1);
    const e = ease(el.exit.ease || 'easeInCubic', a);
    st.opacity *= (1 - e);
  }

  // 可见窗口硬裁剪
  const vis = el.visible;
  if (vis) {
    // 以元素自身相对窗口（此处以场景局部帧给出）
    if (vis.startLocalF != null && localF < vis.startLocalF) st.opacity = 0;
    if (vis.endLocalF != null && localF >= vis.endLocalF) st.opacity = 0;
  }
  return st;
}
function elSceneStart() { return 0; } // 入场/离场均以场景局部帧计

// 相机：由轨道求 (x,y,zoom,rotate)，局部帧。
export function cameraAt(camera, localF) {
  const c = { x: 0, y: 0, zoom: 1, rotate: 0 };
  if (!camera) return c;
  for (const t of camera.tracks || []) c[t.prop] = evalTrack(t, localF);
  return c;
}

// 转场进度：场景入点处，a∈[0,1]，a=1 表示完全进入本场景。
// 返回 { inA, outA, morphA, isTransition }。
export function transitionProgress(scene, localF) {
  const trIn = scene.transitionIn;
  const durF = (trIn && trIn.durF) || 0;
  if (!trIn || durF <= 0 || trIn.type === 'cut') {
    return { inA: 1, outA: 0, morphA: 1, isTransition: false };
  }
  const a = clamp(localF / durF, 0, 1);
  const e = ease(trIn.ease || 'smoothstep', a);
  return { inA: e, outA: 1 - e, morphA: e, isTransition: true };
}
