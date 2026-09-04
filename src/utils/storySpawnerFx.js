/**
 * Story panel 2: canvas vent / tongue / crackle FX around the flame spawner graphic.
 * Mirrors Renderer.updateSpawnerEmbers / drawSpawnerEmbers for a flame-type spawner.
 *
 * Performance: pre-baked glow/streak sprites + swap-remove + resize only when dims change.
 */

// Flame spawner: hsl(31, 100%, 55%) → RGB + _fireSparkPaletteFromColor cores
const PALETTE = {
  r: 255,
  g: 144,
  b: 26,
  coreR: 255,
  coreG: 216,
  coreB: 152,
};

const INTENSITY = 1.14; // SPAWNER_FX_RANK.flame = 1 → 1 + 0.14
const VENT_RATE = 16 * INTENSITY;
const TONGUE_RATE = 10 * INTENSITY;
const CRACK_RATE = 20 * INTENSITY;
const TOTAL_RATE = VENT_RATE + TONGUE_RATE + CRACK_RATE;
const INTENSITY_SIZE = 0.95 + INTENSITY * 0.12;
const INTENSITY_SPEED = 0.92 + INTENSITY * 0.18;
const MAX_PARTICLES = 160;

/** Hex neighbor axes: 0=E, 1=NE, 2=NW, 3=W, 4=SW, 5=SE (getDirectionAngle) */
const HEX_ANGLES = [0, -Math.PI / 3, (-2 * Math.PI) / 3, Math.PI, (2 * Math.PI) / 3, Math.PI / 3];

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

let ventDir = 0;
let ventHold = 0.12;

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
  canvas = document.querySelector('#storyPanel2 .story-spawner-fx');
  ctx = canvas?.getContext('2d') || null;
  return canvas;
}

function bakeFlame() {
  const size = 64;
  const half = size * 0.5;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const octx = off.getContext('2d');
  const { r, g, b, coreR, coreG, coreB } = PALETTE;
  const grad = octx.createRadialGradient(half, half + half * 0.35, 0, half, half, half);
  grad.addColorStop(0, `rgba(${coreR},${coreG},${coreB},1)`);
  grad.addColorStop(0.45, `rgba(${r},${g},${b},0.7)`);
  grad.addColorStop(0.8, `rgba(${r},${g},${b},0.32)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  octx.fillStyle = grad;
  octx.beginPath();
  octx.ellipse(half, half, half * 0.5, half, 0, 0, Math.PI * 2);
  octx.fill();
  return off;
}

function bakeSoft() {
  const size = 64;
  const half = size * 0.5;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const octx = off.getContext('2d');
  const { r, g, b, coreR, coreG, coreB } = PALETTE;
  const grad = octx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, `rgba(${coreR},${coreG},${coreB},1)`);
  grad.addColorStop(0.5, `rgba(${r},${g},${b},0.52)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  octx.fillStyle = grad;
  octx.beginPath();
  octx.arc(half, half, half, 0, Math.PI * 2);
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
  const { r, g, b } = PALETTE;
  const grad = octx.createLinearGradient(0, cy, w, cy);
  grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
  grad.addColorStop(0.35, `rgba(${r},${g},${b},0.85)`);
  grad.addColorStop(0.5, 'rgba(255,240,230,1)');
  grad.addColorStop(0.65, `rgba(${r},${g},${b},0.85)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  octx.fillStyle = grad;
  octx.beginPath();
  octx.ellipse(w * 0.5, cy, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
  octx.fill();
  return off;
}

function bakeSparkCore() {
  const size = 48;
  const half = size * 0.5;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const octx = off.getContext('2d');
  const { coreR, coreG, coreB } = PALETTE;
  const glow = octx.createRadialGradient(half, half, 0, half, half, half);
  glow.addColorStop(0, `rgba(${coreR},${coreG},${coreB},1)`);
  glow.addColorStop(0.35, `rgba(${coreR},${coreG},${coreB},0.55)`);
  glow.addColorStop(0.7, `rgba(${coreR},${coreG},${coreB},0.15)`);
  glow.addColorStop(1, `rgba(${coreR},${coreG},${coreB},0)`);
  octx.fillStyle = glow;
  octx.beginPath();
  octx.arc(half, half, half, 0, Math.PI * 2);
  octx.fill();
  return off;
}

function ensureSprites() {
  if (flameSprite && softSprite && streakSprite && sparkCoreSprite) return;
  flameSprite = bakeFlame();
  softSprite = bakeSoft();
  streakSprite = bakeStreak();
  sparkCoreSprite = bakeSparkCore();
}

function resizeCanvas() {
  const el = ensureCanvas();
  if (!el || !ctx) return;
  const wrap = el.parentElement;
  if (!wrap) return;

  const cssW = Math.max(1, wrap.clientWidth * 2.8);
  const cssH = Math.max(1, wrap.clientHeight * 2.8);
  const dpr = Math.min(2, window.devicePixelRatio || 1);

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
  spawnCredit += TOTAL_RATE * dt;
  const toSpawn = Math.min(Math.floor(spawnCredit), 18);
  spawnCredit -= toSpawn;

  ventHold -= dt;
  if (ventHold <= 0) {
    ventDir = (ventDir + 1 + (Math.random() < 0.18 ? 1 : 0)) % 6;
    ventHold = 0.12 + Math.random() * 0.1;
  }

  if (toSpawn <= 0 || particles.length >= MAX_PARTICLES) return;

  const size = sizeScale * INTENSITY_SIZE;
  const speed = speedScale * INTENSITY_SPEED;

  for (let s = 0; s < toSpawn && particles.length < MAX_PARTICLES; s++) {
    const roll = Math.random();
    const kind =
      roll < VENT_RATE / TOTAL_RATE
        ? 'vent'
        : roll < (VENT_RATE + TONGUE_RATE) / TOTAL_RATE
          ? 'tongue'
          : 'crack';

    const p = acquire();
    p.kind = kind;
    p.phase = Math.random() * Math.PI * 2;

    if (kind === 'vent') {
      const angle = HEX_ANGLES[ventDir] + (Math.random() - 0.5) * 0.22;
      const birthR = hexR * (0.12 + Math.random() * 0.22);
      p.ox = Math.cos(angle) * birthR;
      p.oy = Math.sin(angle) * birthR * 0.88;
      const outward = (95 + Math.random() * 70) * speed;
      p.vx = Math.cos(angle) * outward + (Math.random() - 0.5) * 18 * speedScale;
      p.vy = Math.sin(angle) * outward * 0.88 - 12 * speedScale;
      p.ax = (Math.random() - 0.5) * 12 * speedScale;
      p.ay = (55 + Math.random() * 40) * speedScale;
      p.friction = 0.955;
      p.life = 0.22 + Math.random() * 0.18;
      p.maxLife = p.life;
      p.size = (2.6 + Math.random() * 3.2) * size;
      p.stretch = 1.9 + Math.random() * 0.8;
      p.ventAngle = angle;
    } else if (kind === 'tongue') {
      p.ox = (Math.random() - 0.5) * hexR * 0.38;
      p.oy = hexR * (0.12 + Math.random() * 0.16);
      p.vx = (Math.random() - 0.5) * 16 * speed;
      p.vy = -(85 + Math.random() * 55) * speed;
      p.ax = (Math.random() - 0.5) * 20 * speedScale;
      p.ay = (110 + Math.random() * 50) * speedScale;
      p.friction = 1;
      p.life = 0.32 + Math.random() * 0.22;
      p.maxLife = p.life;
      p.size = (6.5 + Math.random() * 5.5) * size;
      p.stretch = 1.85 + Math.random() * 0.7;
      p.ventAngle = 0;
    } else {
      const angle = Math.random() * Math.PI * 2;
      const birthR = hexR * (0.28 + Math.random() * 0.38);
      p.ox = Math.cos(angle) * birthR * 0.9;
      p.oy = Math.sin(angle) * birthR * 0.72 + hexR * 0.06;
      const pop = (40 + Math.random() * 70) * speed;
      p.vx = Math.cos(angle) * pop * 0.75 + (Math.random() - 0.5) * 28 * speedScale;
      p.vy = Math.sin(angle) * pop * 0.4 - (50 + Math.random() * 45) * speed;
      p.ax = (Math.random() - 0.5) * 16 * speedScale;
      p.ay = (95 + Math.random() * 55) * speedScale;
      p.friction = 0.978;
      p.life = 0.28 + Math.random() * 0.28;
      p.maxLife = p.life;
      p.size = (1.4 + Math.random() * 3.4) * size;
      p.stretch = 1.6 + Math.random() * 0.7;
      p.ventAngle = angle;
    }

    particles.push(p);
  }
}

function update(dt, hexR, sizeScale, speedScale) {
  const nowSec = performance.now() / 1000;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      swapRemove(particles, i);
      continue;
    }

    if (p.kind === 'tongue') {
      p.vx += Math.sin(nowSec * 14 + (p.phase || 0)) * 28 * speedScale * dt;
      p.vx += (p.ax || 0) * dt;
      p.vy += p.ay * dt;
      p.vx *= 0.94;
      p.vy *= 0.985;
      p.ox += p.vx * dt;
      p.oy += p.vy * dt;
      p.size = Math.max(1.2 * sizeScale, p.size - dt * 7 * sizeScale);
    } else {
      p.vx += p.ax * dt;
      p.vy += p.ay * dt;
      p.vx *= p.friction;
      p.vy *= p.friction;
      p.ox += p.vx * dt;
      p.oy += p.vy * dt;
      if (p.kind === 'crack') {
        p.size = Math.max(0.5 * sizeScale, p.size - dt * 1.8 * sizeScale);
      }
    }
  }
  spawnParticles(dt, hexR, sizeScale, speedScale);
}

function draw(hexR) {
  if (!ctx || !canvas) return;
  ensureSprites();
  const cssW = lastCssW || canvas.clientWidth;
  const cssH = lastCssH || canvas.clientHeight;
  ctx.clearRect(0, 0, cssW, cssH);

  const cx = cssW * 0.5;
  const cy = cssH * 0.5;
  const nowSec = performance.now() / 1000;

  // Pass 0: unstable double-pulse pressure halo
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 0.58 + Math.sin(nowSec * 3.9) * 0.2;
  const flicker = 0.72 + Math.sin(nowSec * 12.5) * 0.28;
  const radius = hexR * (1.08 + pulse * 0.16) * (1.05 + INTENSITY * 0.08);
  const haloY = cy + hexR * 0.08;
  ctx.globalAlpha = Math.min(1, 0.38 * pulse * flicker * (0.95 + INTENSITY * 0.12));
  ctx.drawImage(
    softSprite,
    cx - radius * 0.88,
    haloY - radius * 0.72,
    radius * 1.76,
    radius * 1.44
  );
  const innerR = radius * 0.42;
  ctx.globalAlpha = Math.min(1, 0.28 * flicker);
  ctx.drawImage(
    softSprite,
    cx - innerR,
    haloY - innerR * 0.85,
    innerR * 2,
    innerR * 1.7
  );
  ctx.restore();

  // Pass 1: snapping flame tongues (upright)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.kind !== 'tongue') continue;
    const lifeRatio = Math.max(0, Math.min(1, p.life / p.maxLife));
    const alpha = Math.sin(lifeRatio * Math.PI) * 0.72;
    if (alpha <= 0.02) continue;
    const size = Math.max(1.4, p.size);
    const stretch = p.stretch || 2;
    ctx.globalAlpha = Math.min(1, alpha);
    const drawW = size;
    const drawH = size * 2.15 * stretch;
    ctx.drawImage(flameSprite, cx + p.ox - drawW * 0.5, cy + p.oy - drawH * 0.62, drawW, drawH);
  }
  ctx.restore();

  // Pass 2: directional vent jets
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.kind !== 'vent') continue;
    const alpha = Math.max(0, p.life / p.maxLife);
    if (alpha <= 0.02) continue;
    const size = Math.max(0.6, p.size * (0.55 + alpha * 0.55));
    const angle = p.ventAngle ?? Math.atan2(p.vy, p.vx);
    const stretch = p.stretch || 2;
    const speed = Math.hypot(p.vx, p.vy) || 1;
    const streak = Math.min(14, 3.2 + speed * 0.05);
    const x = cx + p.ox;
    const y = cy + p.oy;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle - Math.PI / 2);
    ctx.globalAlpha = Math.min(1, alpha * 0.7);
    const drawW = size * 1.15;
    const drawH = size * 2.4 * stretch;
    ctx.drawImage(flameSprite, -drawW * 0.5, -drawH * 0.15, drawW, drawH);
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const thick = Math.max(1.15, size * 0.95);
    ctx.globalAlpha = Math.min(1, alpha * 0.95);
    ctx.drawImage(streakSprite, -streak, -thick * 0.5, streak * 2, thick);
    const coreSize = size * 1.65;
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(sparkCoreSprite, -coreSize * 0.5, -coreSize * 0.5, coreSize, coreSize);
    ctx.restore();
  }
  ctx.restore();

  // Pass 3: rim crackle sparks
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.kind !== 'crack') continue;
    const alpha = Math.max(0, p.life / p.maxLife);
    if (alpha <= 0.02) continue;
    const size = Math.max(0.5, p.size * (0.5 + alpha * 0.6));
    const speed = Math.hypot(p.vx, p.vy) || 1;
    const angle = Math.atan2(p.vy, p.vx);
    const streak = Math.min(11, 2.4 + speed * 0.042);
    const thick = Math.max(1.05, size);
    ctx.save();
    ctx.translate(cx + p.ox, cy + p.oy);
    ctx.rotate(angle);
    ctx.globalAlpha = Math.min(1, alpha * 0.92);
    ctx.drawImage(streakSprite, -streak, -thick * 0.5, streak * 2, thick);
    const coreSize = size * 1.75;
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
  // Map hex diameter ≈ 80px; scale to the story icon, then +44% like the vortex graphic.
  const sizeScale = Math.max(0.85, wrapW / 80) * 1.44;
  const speedScale = Math.max(0.9, Math.min(1.75, sizeScale));
  const hexR = wrapW * 0.48;

  update(dt, hexR, sizeScale, speedScale);
  draw(hexR);
  rafId = requestAnimationFrame(tick);
}

/**
 * Start or stop the story-panel spawner particle loop.
 * @param {boolean} active
 */
export function setStorySpawnerFxActive(active) {
  if (active) {
    if (running) return;
    if (!ensureCanvas() || !ctx) return;
    particles.length = 0;
    spawnCredit = 0;
    ventDir = Math.floor(Math.random() * 6);
    ventHold = 0.12;
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
