/**
 * Story panel 2: canvas ember / spark / wisp FX around the vortex graphic.
 * Mirrors Renderer.updateVortexEmbers / drawVortexEmbers for a fixed level-2 whirlwind.
 *
 * Performance: pre-baked glow/streak sprites + swap-remove + resize only when dims change.
 */

const LEVEL = 2;
const SPIN_RPS = 0.412;
const PALETTE = {
  core: [255, 180, 60],
  mid: [255, 100, 25],
  tip: [230, 40, 15],
  spark: [255, 240, 180],
};

const SPARK_RATE = 14 + LEVEL * 6;
const EMBER_RATE = 4 + LEVEL * 1.5;
const WISP_RATE = 2.5 + LEVEL * 1;
const MAX_PARTICLES = 220;

let canvas = null;
let ctx = null;
let rafId = 0;
let running = false;
let lastTs = 0;
let spawnCredit = 0;
/** @type {object[]} */
let particles = [];
/** @type {object[]} */
const pool = [];

/** @type {HTMLCanvasElement|null} */
let flameSprite = null;
/** @type {HTMLCanvasElement|null} */
let softSprite = null;
/** @type {HTMLCanvasElement|null} */
let streakSprite = null;
/** @type {HTMLCanvasElement|null} */
let sparkCoreSprite = null;
let lastCssW = 0;
let lastCssH = 0;

function acquire() {
  return pool.pop() || {};
}

function release(p) {
  pool.push(p);
}

function swapRemove(arr, i) {
  const p = arr[i];
  const last = arr.length - 1;
  if (i !== last) arr[i] = arr[last];
  arr.pop();
  release(p);
}

function ensureCanvas() {
  if (canvas?.isConnected) return canvas;
  canvas = document.querySelector('#storyPanel2 .story-vortex-fx');
  ctx = canvas?.getContext('2d') || null;
  return canvas;
}

function bakeRadial(size, stops, ellipseWScale = 1, ellipseHScale = 1) {
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const octx = off.getContext('2d');
  const half = size * 0.5;
  const grad = octx.createRadialGradient(half, half + half * 0.2 * (ellipseHScale > 1 ? 1 : 0), 0, half, half, half);
  for (let i = 0; i < stops.length; i++) {
    grad.addColorStop(stops[i][0], stops[i][1]);
  }
  octx.fillStyle = grad;
  octx.beginPath();
  octx.ellipse(half, half, half * ellipseWScale, half * ellipseHScale, 0, 0, Math.PI * 2);
  octx.fill();
  return off;
}

function bakeStreak() {
  const w = 128;
  const h = 24;
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d');
  const cy = h * 0.5;
  const [r, g, b] = PALETTE.spark;
  const grad = octx.createLinearGradient(0, cy, w, cy);
  grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
  grad.addColorStop(0.4, `rgba(${r},${g},${b},0.9)`);
  grad.addColorStop(0.55, 'rgba(255,255,255,1)');
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  octx.fillStyle = grad;
  octx.beginPath();
  octx.ellipse(w * 0.5, cy, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
  octx.fill();
  return off;
}

function ensureSprites() {
  if (flameSprite && softSprite && streakSprite && sparkCoreSprite) return;
  const [cr, cg, cb] = PALETTE.core;
  const [mr, mg, mb] = PALETTE.mid;
  const [tr, tg, tb] = PALETTE.tip;
  flameSprite = bakeRadial(
    64,
    [
      [0, `rgba(${cr},${cg},${cb},1)`],
      [0.45, `rgba(${mr},${mg},${mb},0.7)`],
      [0.8, `rgba(${tr},${tg},${tb},0.32)`],
      [1, `rgba(${tr},${tg},${tb},0)`],
    ],
    0.5,
    1
  );
  softSprite = bakeRadial(
    64,
    [
      [0, `rgba(${cr},${cg},${cb},1)`],
      [0.5, `rgba(${mr},${mg},${mb},0.52)`],
      [1, `rgba(${mr},${mg},${mb},0)`],
    ],
    1,
    1
  );
  streakSprite = bakeStreak();
  sparkCoreSprite = bakeRadial(
    48,
    [
      [0, 'rgba(255,255,240,1)'],
      [0.35, 'rgba(255,250,200,0.55)'],
      [0.7, 'rgba(255,240,180,0.15)'],
      [1, 'rgba(255,240,180,0)'],
    ],
    1,
    1
  );
}

function resizeCanvas() {
  const el = ensureCanvas();
  if (!el || !ctx) return;
  const wrap = el.parentElement;
  if (!wrap) return;

  const cssW = Math.max(1, wrap.clientWidth * 2.8);
  const cssH = Math.max(1, wrap.clientHeight * 2.8);
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  // Only touch layout/backing-store when the panel actually resized.
  if (cssW !== lastCssW || cssH !== lastCssH) {
    el.style.width = `${cssW}px`;
    el.style.height = `${cssH}px`;
    lastCssW = cssW;
    lastCssH = cssH;
  }

  const pw = Math.round(cssW * dpr);
  const ph = Math.round(cssH * dpr);
  if (el.width !== pw || el.height !== ph) {
    el.width = pw;
    el.height = ph;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

function spawnParticles(dt, hexR, sizeScale, speedScale) {
  spawnCredit += (SPARK_RATE + EMBER_RATE + WISP_RATE) * dt;
  const toSpawn = Math.min(Math.floor(spawnCredit), 16);
  spawnCredit -= toSpawn;
  if (toSpawn <= 0 || particles.length >= MAX_PARTICLES) return;

  const nowSec = performance.now() / 1000;
  const spinAngle = nowSec * SPIN_RPS * Math.PI * 2;
  const totalRate = SPARK_RATE + EMBER_RATE + WISP_RATE;

  for (let s = 0; s < toSpawn && particles.length < MAX_PARTICLES; s++) {
    const roll = Math.random();
    const kind =
      roll < SPARK_RATE / totalRate
        ? 'spark'
        : roll < (SPARK_RATE + EMBER_RATE) / totalRate
          ? 'ember'
          : 'wisp';

    const p = acquire();
    p.kind = kind;

    if (kind === 'spark') {
      const angle = Math.random() * Math.PI * 2;
      const birthR = hexR * (0.12 + Math.random() * 0.5);
      p.ox = Math.cos(angle) * birthR;
      p.oy = Math.sin(angle) * birthR * 0.85;
      const outward = 80 * (0.7 + Math.random() * 0.9) * speedScale;
      const tangent = SPIN_RPS * Math.PI * 2 * birthR * (0.4 + Math.random() * 0.6);
      const tangDir = spinAngle + angle + Math.PI / 2;
      const outDir = angle + (Math.random() - 0.5) * 0.6;
      p.vx = Math.cos(outDir) * outward + Math.cos(tangDir) * tangent;
      p.vy = Math.sin(outDir) * outward * 0.75 + Math.sin(tangDir) * tangent - 8;
      p.ax = 0;
      p.ay = 110;
      p.friction = 0.985;
      p.life = 0.3 + Math.random() * 0.4;
      p.maxLife = p.life;
      p.size = (2 + Math.random() * 3) * sizeScale;
      p.grow = 0;
      p.stretch = 1.8 + Math.random();
      p.r = PALETTE.spark[0];
      p.g = PALETTE.spark[1];
      p.b = PALETTE.spark[2];
      p.coreR = PALETTE.core[0];
      p.coreG = PALETTE.core[1];
      p.coreB = PALETTE.core[2];
      p.tipR = PALETTE.tip[0];
      p.tipG = PALETTE.tip[1];
      p.tipB = PALETTE.tip[2];
    } else {
      p.ox = (Math.random() - 0.5) * hexR * 0.55;
      p.oy = (Math.random() - 0.5) * hexR * 0.25 + hexR * 0.05;
      p.vx = (Math.random() - 0.5) * 12 * speedScale;
      p.vy = (kind === 'ember' ? -(40 + Math.random() * 35) : -(50 + Math.random() * 40)) * speedScale;
      p.ax = (Math.random() - 0.5) * 8 * speedScale;
      p.ay = -18;
      p.friction = 0.98;
      p.life = (kind === 'ember' ? 0.45 + Math.random() * 0.4 : 0.55 + Math.random() * 0.45);
      p.maxLife = p.life;
      p.size = (kind === 'ember' ? 3 + Math.random() * 3.75 : 4.25 + Math.random() * 5.75) * sizeScale;
      p.grow = kind === 'wisp' ? (8.5 + Math.random() * 11.5) : 0;
      p.stretch = kind === 'wisp' ? 1.5 + Math.random() * 0.9 : 1;
      const rgb = kind === 'ember' ? (Math.random() < 0.5 ? PALETTE.core : PALETTE.mid) : PALETTE.mid;
      p.r = rgb[0];
      p.g = rgb[1];
      p.b = rgb[2];
      p.coreR = PALETTE.core[0];
      p.coreG = PALETTE.core[1];
      p.coreB = PALETTE.core[2];
      p.tipR = PALETTE.tip[0];
      p.tipG = PALETTE.tip[1];
      p.tipB = PALETTE.tip[2];
    }

    particles.push(p);
  }
}

function update(dt, hexR, sizeScale, speedScale) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      swapRemove(particles, i);
      continue;
    }
    p.vx += p.ax * dt;
    p.vy += p.ay * dt;
    p.vx *= p.friction;
    p.vy *= p.friction;
    p.ox += p.vx * dt;
    p.oy += p.vy * dt;
    if (p.kind === 'wisp') {
      p.size += dt * (p.grow || 8);
    } else if (p.kind === 'ember') {
      p.size = Math.max(0.5, p.size - dt * 1.35);
    }
  }
  spawnParticles(dt, hexR, sizeScale, speedScale);
}

function draw() {
  if (!ctx || !canvas) return;
  ensureSprites();
  const cssW = lastCssW || canvas.clientWidth;
  const cssH = lastCssH || canvas.clientHeight;
  ctx.clearRect(0, 0, cssW, cssH);

  const cx = cssW * 0.5;
  const cy = cssH * 0.5;

  // Pass 1: wisps + embers (sprite blit)
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.kind === 'spark') continue;

    const lifeRatio = Math.max(0, Math.min(1, p.life / p.maxLife));
    const alpha = p.kind === 'wisp'
      ? Math.sin(lifeRatio * Math.PI) * 0.65
      : lifeRatio * lifeRatio * 0.8;
    if (alpha <= 0.02) continue;

    const size = Math.max(0.5, p.size);
    const x = cx + p.ox;
    const y = cy + p.oy;
    const stretch = p.stretch || 1;
    ctx.globalAlpha = Math.min(1, alpha);

    if (p.kind === 'wisp') {
      const drawW = size;
      const drawH = size * 2 * stretch;
      ctx.drawImage(flameSprite, x - drawW * 0.5, y - drawH * 0.5, drawW, drawH);
    } else {
      const draw = size * 2.9;
      ctx.drawImage(softSprite, x - draw * 0.5, y - draw * 0.5, draw, draw);
    }
  }
  ctx.globalAlpha = 1;

  // Pass 2: additive sparks
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.kind !== 'spark') continue;

    const alpha = Math.max(0, p.life / p.maxLife);
    if (alpha <= 0.02) continue;
    const size = Math.max(0.4, p.size * (0.5 + alpha * 0.5));
    const speed = Math.hypot(p.vx, p.vy) || 1;
    const angle = Math.atan2(p.vy, p.vx);
    const x = cx + p.ox;
    const y = cy + p.oy;
    const streak = Math.min(10, 2 + speed * 0.04);
    const thick = Math.max(1.1, size * 1.1);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha = Math.min(1, alpha * 0.95);
    ctx.drawImage(streakSprite, -streak, -thick * 0.5, streak * 2, thick);
    const coreSize = size * 1.8;
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(sparkCoreSprite, -coreSize * 0.5, -coreSize * 0.5, coreSize, coreSize);
    ctx.restore();
  }
  ctx.restore();
}

function tick(now) {
  if (!running) return;
  const dt = Math.max(0, Math.min(0.05, (now - lastTs) / 1000));
  lastTs = now;

  resizeCanvas();
  const wrap = canvas?.parentElement;
  const wrapW = wrap?.clientWidth || 160;
  // Map hex diameter ≈ 80px; scale particle sizes to the story icon, then +44% for this larger graphic.
  const sizeScale = Math.max(0.85, wrapW / 80) * 1.44;
  const speedScale = Math.max(0.9, Math.min(1.75, sizeScale));
  const hexR = wrapW * 0.48;

  update(dt, hexR, sizeScale, speedScale);
  draw();
  rafId = requestAnimationFrame(tick);
}

/**
 * Start or stop the story-panel vortex particle loop.
 * @param {boolean} active
 */
export function setStoryVortexFxActive(active) {
  if (active) {
    if (running) return;
    if (!ensureCanvas() || !ctx) return;
    particles.length = 0;
    spawnCredit = 0;
    lastCssW = 0;
    lastCssH = 0;
    lastTs = performance.now();
    running = true;
    ensureSprites();
    resizeCanvas();
    rafId = requestAnimationFrame(tick);
    return;
  }

  running = false;
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  for (let i = 0; i < particles.length; i++) release(particles[i]);
  particles.length = 0;
  spawnCredit = 0;
  if (ctx && canvas) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}
