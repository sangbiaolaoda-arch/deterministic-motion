// sample.mjs — 12 秒样片（360 帧 @30fps），演示 Scene Plan 运动系统能力。
//
// 3 个镜头，用 cut 与 dissolve 两种转场；含相机运动、元素轨道、入离场。
// 这是"证明系统能跑"的最小样片，不追求美术，只求把能力用满、可被门禁检验。

export const SAMPLE = {
  version: '1.0',
  film: {
    id: 'sample-12s',
    title: '最小运动系统 · 12 秒样片',
    fps: 30,
    durationF: 360,
    width: 1280,
    height: 720,
    palette: { bg: '#0B0C10', accent: '#EBA23C' },
  },
  scenes: [
    // ---- 镜头 1：冷开场，一个从下方升入的标题 + 缓慢推近的相机 ----
    {
      id: 's1-intro',
      range: { startF: 0, endF: 120 },
      purpose: '冷开场：标题升入，建立基调',
      palette: { bg: '#0B0C10', accent: '#EBA23C' },
      camera: { tracks: [
        { prop: 'zoom', keyframes: [{ f: 0, v: 1.0, ease: 'smoothstep' }, { f: 119, v: 1.12 }] },
      ] },
      transitionIn: { type: 'cut' },
      transitionOut: { type: 'dissolve', durF: 15, ease: 'smoothstep' },
      elements: [
        { id: 'title', kind: 'label', text: '运动系统 v0', role: 'primary',
          layout: { x: 640, y: 360, w: 520, h: 90, z: 2 },
          style: { color: '#EBA23C', font: '700 84px "PingFang SC",sans-serif' },
          enter: { durF: 24, ease: 'easeOutCubic', from: 'below', dist: 90 } },
        { id: 'under', kind: 'line', role: 'support', layout: { x: 640, y: 430, w: 360, h: 4, z: 2 },
          style: { color: '#8E8B84', lw: 3, alpha: 0.9 },
          tracks: [{ prop: 'w', keyframes: [{ f: 24, v: 0, ease: 'easeOutCubic' }, { f: 60, v: 420 }] }] },
        { id: 'dot', kind: 'disc', role: 'accent', layout: { x: 200, y: 200, w: 26, h: 26, z: 1 },
          style: { color: '#57D2E6' },
          tracks: [
            { prop: 'x', keyframes: [{ f: 0, v: 200, ease: 'easeInOutCubic' }, { f: 80, v: 880 }, { f: 119, v: 1010, ease: 'smoothstep' }] },
            { prop: 'y', keyframes: [{ f: 0, v: 200 }, { f: 80, v: 520 }, { f: 119, v: 300 }] },
          ] },
      ],
    },
    // ---- 镜头 2：三根柱状条错峰生长，相机横移 ----
    {
      id: 's2-bars',
      range: { startF: 120, endF: 250 },
      purpose: '数据：三根条错峰生长，展示轨道+缓动',
      palette: { bg: '#0D0F16', accent: '#86C05A' },
      camera: { tracks: [
        { prop: 'x', keyframes: [{ f: 0, v: 80, ease: 'easeInOutCubic' }, { f: 129, v: -80 }] },
      ] },
      transitionIn: { type: 'dissolve', durF: 15, ease: 'smoothstep' },
      // 边界转场必须两侧一致：下一镜头 s3 声明 dissolve，故此处出点也用 dissolve（像素无变化，仅消除声明冲突）。
      transitionOut: { type: 'dissolve', durF: 15, ease: 'smoothstep' },
      elements: [
        bar('b1', 460, 'easeOutCubic', '#86C05A'),
        bar('b2', 640, 'easeOutCubic', '#EBA23C'),
        bar('b3', 820, 'easeOutCubic', '#A97BFF'),
        { id: 'baseline', kind: 'line', role: 'support', layout: { x: 640, y: 600, w: 640, h: 3, z: 1 },
          style: { color: '#3A3F4B', lw: 3 } },
      ],
    },
    // ---- 镜头 3：环路 + 三角指示，相机缓慢旋转归零 ----
    {
      id: 's3-outro',
      range: { startF: 250, endF: 360 },
      purpose: '收束：环路定格 + 指示器，回到主色',
      palette: { bg: '#0B0C10', accent: '#EBA23C' },
      camera: { tracks: [
        { prop: 'rotate', keyframes: [{ f: 0, v: -6, ease: 'smoothstep' }, { f: 109, v: 0 }] },
        { prop: 'zoom', keyframes: [{ f: 0, v: 1.1, ease: 'smoothstep' }, { f: 109, v: 1.0 }] },
      ] },
      transitionIn: { type: 'dissolve', durF: 15, ease: 'smoothstep' },
      transitionOut: { type: 'cut' },
      elements: [
        { id: 'ring', kind: 'ring', role: 'primary', layout: { x: 640, y: 340, w: 220, h: 220, z: 1 },
          style: { color: '#EBA23C', lw: 8 },
          tracks: [{ prop: 'scale', keyframes: [{ f: 0, v: 0.8, ease: 'easeOutCubic' }, { f: 40, v: 1.0 }] }] },
        { id: 'pointer', kind: 'tri', role: 'accent', layout: { x: 640, y: 185, w: 40, h: 40, z: 2 },
          style: { color: '#57D2E6' },
          tracks: [{ prop: 'y', keyframes: [{ f: 0, v: 205, ease: 'easeInOutCubic' }, { f: 55, v: 165 }, { f: 109, v: 205 }] }] },
        { id: 'caption', kind: 'label', text: '确定性 · 可复现', role: 'support',
          layout: { x: 640, y: 560, w: 460, h: 50, z: 2 },
          style: { color: '#F4EFE6', font: '500 40px "PingFang SC",sans-serif', alpha: 0.92 },
          enter: { durF: 20, ease: 'easeOutCubic', from: 'below', dist: 30 } },
      ],
    },
  ],
};

function bar(id, x, easeName, color) {
  return {
    id, kind: 'bar', role: 'data',
    layout: { x, y: 490, w: 120, h: 320, z: 2 },
    style: { color, radius: 10, alpha: 0.95 },
    // 从底部生长的观感：高度 0->320，中心随之上升
    tracks: [
      { prop: 'h', keyframes: [{ f: 10, v: 0, ease: easeName }, { f: 70, v: 320 }] },
      { prop: 'y', keyframes: [{ f: 10, v: 650, ease: easeName }, { f: 70, v: 490 }] },
    ],
  };
}
// sample.mjs — 12 秒样片（360 帧 @30fps），演示 Scene Plan 运动系统能力。
//
// 3 个镜头，用 cut 与 dissolve 两种转场；含相机运动、元素轨道、入离场。
// 这是"证明系统能跑"的最小样片，不追求美术，只求把能力用满、可被门禁检验。

export const SAMPLE = {
  version: '1.0',
  film: {
    id: 'sample-12s',
    title: '最小运动系统 · 12 秒样片',
    fps: 30,
    durationF: 360,
    width: 1280,
    height: 720,
    palette: { bg: '#0B0C10', accent: '#EBA23C' },
  },
  scenes: [
    // ---- 镜头 1：冷开场，一个从下方升入的标题 + 缓慢推近的相机 ----
    {
      id: 's1-intro',
      range: { startF: 0, endF: 120 },
      purpose: '冷开场：标题升入，建立基调',
      palette: { bg: '#0B0C10', accent: '#EBA23C' },
      camera: { tracks: [
        { prop: 'zoom', keyframes: [{ f: 0, v: 1.0, ease: 'smoothstep' }, { f: 119, v: 1.12 }] },
      ] },
      transitionIn: { type: 'cut' },
      transitionOut: { type: 'dissolve', durF: 15, ease: 'smoothstep' },
      elements: [
        { id: 'title', kind: 'label', text: '运动系统 v0', role: 'primary',
          layout: { x: 640, y: 360, w: 520, h: 90, z: 2 },
          style: { color: '#EBA23C', font: '700 84px "PingFang SC",sans-serif' },
          enter: { durF: 24, ease: 'easeOutCubic', from: 'below', dist: 90 } },
        { id: 'under', kind: 'line', role: 'support', layout: { x: 640, y: 430, w: 360, h: 4, z: 2 },
          style: { color: '#8E8B84', lw: 3, alpha: 0.9 },
          tracks: [{ prop: 'w', keyframes: [{ f: 24, v: 0, ease: 'easeOutCubic' }, { f: 60, v: 420 }] }] },
        { id: 'dot', kind: 'disc', role: 'accent', layout: { x: 200, y: 200, w: 26, h: 26, z: 1 },
          style: { color: '#57D2E6' },
          tracks: [
            { prop: 'x', keyframes: [{ f: 0, v: 200, ease: 'easeInOutCubic' }, { f: 80, v: 880 }, { f: 119, v: 1010, ease: 'smoothstep' }] },
            { prop: 'y', keyframes: [{ f: 0, v: 200 }, { f: 80, v: 520 }, { f: 119, v: 300 }] },
          ] },
      ],
    },
    // ---- 镜头 2：三根柱状条错峰生长，相机横移 ----
    {
      id: 's2-bars',
      range: { startF: 120, endF: 250 },
      purpose: '数据：三根条错峰生长，展示轨道+缓动',
      palette: { bg: '#0D0F16', accent: '#86C05A' },
      camera: { tracks: [
        { prop: 'x', keyframes: [{ f: 0, v: 80, ease: 'easeInOutCubic' }, { f: 129, v: -80 }] },
      ] },
      transitionIn: { type: 'dissolve', durF: 15, ease: 'smoothstep' },
      // 边界转场必须两侧一致：下一镜头 s3 声明 dissolve，故此处出点也用 dissolve（像素无变化，仅消除声明冲突）。
      transitionOut: { type: 'dissolve', durF: 15, ease: 'smoothstep' },
      elements: [
        bar('b1', 460, 'easeOutCubic', '#86C05A'),
        bar('b2', 640, 'easeOutCubic', '#EBA23C'),
        bar('b3', 820, 'easeOutCubic', '#A97BFF'),
        { id: 'baseline', kind: 'line', role: 'support', layout: { x: 640, y: 600, w: 640, h: 3, z: 1 },
          style: { color: '#3A3F4B', lw: 3 } },
      ],
    },
    // ---- 镜头 3：环路 + 三角指示，相机缓慢旋转归零 ----
    {
      id: 's3-outro',
      range: { startF: 250, endF: 360 },
      purpose: '收束：环路定格 + 指示器，回到主色',
      palette: { bg: '#0B0C10', accent: '#EBA23C' },
      camera: { tracks: [
        { prop: 'rotate', keyframes: [{ f: 0, v: -6, ease: 'smoothstep' }, { f: 109, v: 0 }] },
        { prop: 'zoom', keyframes: [{ f: 0, v: 1.1, ease: 'smoothstep' }, { f: 109, v: 1.0 }] },
      ] },
      transitionIn: { type: 'dissolve', durF: 15, ease: 'smoothstep' },
      transitionOut: { type: 'cut' },
      elements: [
        { id: 'ring', kind: 'ring', role: 'primary', layout: { x: 640, y: 340, w: 220, h: 220, z: 1 },
          style: { color: '#EBA23C', lw: 8 },
          tracks: [{ prop: 'scale', keyframes: [{ f: 0, v: 0.8, ease: 'easeOutCubic' }, { f: 40, v: 1.0 }] }] },
        { id: 'pointer', kind: 'tri', role: 'accent', layout: { x: 640, y: 185, w: 40, h: 40, z: 2 },
          style: { color: '#57D2E6' },
          tracks: [{ prop: 'y', keyframes: [{ f: 0, v: 205, ease: 'easeInOutCubic' }, { f: 55, v: 165 }, { f: 109, v: 205 }] }] },
        { id: 'caption', kind: 'label', text: '确定性 · 可复现', role: 'support',
          layout: { x: 640, y: 560, w: 460, h: 50, z: 2 },
          style: { color: '#F4EFE6', font: '500 40px "PingFang SC",sans-serif', alpha: 0.92 },
          enter: { durF: 20, ease: 'easeOutCubic', from: 'below', dist: 30 } },
      ],
    },
  ],
};

function bar(id, x, easeName, color) {
  return {
    id, kind: 'bar', role: 'data',
    layout: { x, y: 490, w: 120, h: 320, z: 2 },
    style: { color, radius: 10, alpha: 0.95 },
    // 从底部生长的观感：高度 0->320，中心随之上升
    tracks: [
      { prop: 'h', keyframes: [{ f: 10, v: 0, ease: easeName }, { f: 70, v: 320 }] },
      { prop: 'y', keyframes: [{ f: 10, v: 650, ease: easeName }, { f: 70, v: 490 }] },
    ],
  };
}
