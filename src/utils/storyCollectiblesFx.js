/**
 * Story panel (collectibles): shimmer / smoulder FX behind mystery box, dungeon entrance,
 * and water-pressure power-up while they orbit.
 */

import { drawTreasureShimmerAura } from './treasureShimmerAura.js';

/** @type {Array<{ canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, fx: string, particles: object[], spawnCredit: number }>} */
let slots = [];
let rafId = 0;
let running = false;
let lastTs = 0;

const MAX_SMOULDER = 72;
/** Map HEX_RADIUS; dungeon sprite is HEX_RADIUS × 1.2555. */
const MAP_HEX_R = 40;
const MAP_DUNGEON_SPRITE = MAP_HEX_R * 1.2555;

const GLOW_PALS = [
  { r: 180, g: 55, b: 20, coreR: 220, coreG: 90, coreB: 30 },
  { r: 200, g: 85, b: 25, coreR: 235, coreG: 120, coreB: 35 },
  { r: 150, g: 35, b: 25, coreR: 200, coreG: 60, coreB: 30 },
];
const SPARK_PALS = [
  { r: 255, g: 90, b: 35, coreR: 255, coreG: 110, coreB: 40 },
  { r: 255, g: 140, b: 40, coreR: 255, coreG: 155, coreB: 50 },
  { r: 230, g: 55, b: 30, coreR: 255, coreG: 80, coreB: 35 },
];

/** @type {HTMLCanvasElement[]} */
let glowSprites = [];
/** @type {HTMLCanvasElement[]} */
let streakSprites = [];
/** @type {HTMLCanvasElement[]} */
let sparkCoreSprites = [];
/** @type {HTMLCanvasElement|null} */
let haloSprite = null;

function bakeSoftGlow(coreR, coreG, coreB, midR, midG, midB) {
  const size = 64;
  const half = size * 0.5;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const octx = off.getContext('2d');
  const grad = octx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, `rgba(${coreR},${coreG},${coreB},1)`);
  grad.addColorStop(0.5, `rgba(${midR},${midG},${midB},0.52)`);
  grad.addColorStop(1, `rgba(${midR},${midG},${midB},0)`);
  octx.fillStyle = grad;
  octx.beginPath();
  octx.arc(half, half, half, 0, Math.PI * 2);
  octx.fill();
  return off;
}

function bakeStreak(r, g, b) {
  const w = 128;
  const h = 24;
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d');
  const cy = h * 0.5;
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

function bakeSparkCore(r, g, b) {
  const size = 48;
  const half = size * 0.5;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const octx = off.getContext('2d');
  const glow = octx.createRadialGradient(half, half, 0, half, half, half);
  glow.addColorStop(0, `rgba(${r},${g},${b},1)`);
  glow.addColorStop(0.35, `rgba(${r},${g},${b},0.55)`);
  glow.addColorStop(0.7, `rgba(${r},${g},${b},0.15)`);
  glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
  octx.fillStyle = glow;
  octx.beginPath();
  octx.arc(half, half, half, 0, Math.PI * 2);
  octx.fill();
  return off;
}

function ensureSmoulderSprites() {
  if (haloSprite && glowSprites.length) return;
  // Map halo: _getFxGlowSprite(255, 120, 40, 230, 70, 25, 180, 40, 15, 'soft')
  haloSprite = bakeSoftGlow(255, 120, 40, 230, 70, 25);
  glowSprites = GLOW_PALS.map((p) => bakeSoftGlow(p.coreR, p.coreG, p.coreB, p.r, p.g, p.b));
  streakSprites = SPARK_PALS.map((p) => bakeStreak(p.r, p.g, p.b));
  sparkCoreSprites = SPARK_PALS.map((p) => bakeSparkCore(p.coreR, p.coreG, p.coreB));
}

function smoulderPalette(kind) {
  const roll = Math.random();
  if (kind === 'glow') {
    const palIndex = roll < 0.45 ? 0 : roll < 0.8 ? 1 : 2;
    return { ...GLOW_PALS[palIndex], palIndex };
  }
  const palIndex = roll < 0.4 ? 0 : roll < 0.75 ? 1 : 2;
  return { ...SPARK_PALS[palIndex], palIndex };
}

function ensureSlots() {
  if (slots.length && slots.every((s) => s.canvas.isConnected)) return slots;
  slots = [];
  const canvases = document.querySelectorAll('#storyPanel4 .story-collectible-fx');
  canvases.forEach((canvas) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    slots.push({
      canvas,
      ctx,
      fx: canvas.getAttribute('data-fx') || 'mystery',
      particles: [],
      spawnCredit: 0,
    });
  });
  return slots;
}

function resizeSlot(slot) {
  const { canvas, ctx } = slot;
  const wrap = canvas.parentElement;
  if (!wrap) return;
  const overscan = slot.fx === 'dungeon' ? 2.8 : 2.4;
  const cssW = Math.max(1, wrap.clientWidth * overscan);
  const cssH = Math.max(1, wrap.clientHeight * overscan);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const pw = Math.round(cssW * dpr);
  const ph = Math.round(cssH * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function dungeonScale(slot) {
  const wrap = slot.canvas.parentElement;
  const icon = wrap?.querySelector('.story-collectible-icon--dungeon') || wrap?.querySelector('img');
  const iconW = icon?.clientWidth || (wrap?.clientWidth || 80) * 0.78;
  const sizeScale = Math.max(0.85, iconW / MAP_DUNGEON_SPRITE);
  return {
    sizeScale,
    hexR: MAP_HEX_R * sizeScale,
  };
}

function spawnSmoulder(slot, dt, hexR, sizeScale) {
  const dungeonBoost = 1.25;
  const sparkRate = 10 * 1.1;
  const glowRate = 4 * 1.2;
  slot.spawnCredit += (sparkRate + glowRate) * dt;
  const toSpawn = Math.min(Math.floor(slot.spawnCredit), 14);
  slot.spawnCredit -= toSpawn;
  for (let s = 0; s < toSpawn && slot.particles.length < MAX_SMOULDER; s++) {
    const kind = Math.random() < sparkRate / (sparkRate + glowRate) ? 'spark' : 'glow';
    const pal = smoulderPalette(kind);
    const p = { kind, ...pal, phase: Math.random() * Math.PI * 2 };
    if (kind === 'glow') {
      p.ox = (Math.random() - 0.5) * hexR * 0.5;
      p.oy = (Math.random() - 0.5) * hexR * 0.25 + hexR * 0.05;
      p.vx = (Math.random() - 0.5) * 8 * dungeonBoost * sizeScale;
      p.vy = -(10 + Math.random() * 16) * dungeonBoost * sizeScale;
      p.ax = 0;
      p.ay = -4 * dungeonBoost * sizeScale;
      p.friction = 1;
      p.life = 0.85 + Math.random() * 0.85;
      p.size = (10 + Math.random() * 12) * 1.2 * dungeonBoost * sizeScale;
      p.grow = (4 + Math.random() * 6) * 1.2 * dungeonBoost * sizeScale;
      p.stretch = 1.25 + Math.random() * 0.4;
    } else {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.35;
      const birthR = hexR * (0.08 + Math.random() * 0.42) * dungeonBoost;
      const outward = (28 + Math.random() * 55) * dungeonBoost * sizeScale;
      const upBoost = (35 + Math.random() * 50) * dungeonBoost * sizeScale;
      p.ox = Math.cos(angle) * birthR * 0.85;
      p.oy = Math.sin(angle) * birthR * 0.7 + hexR * 0.08;
      p.vx = Math.cos(angle) * outward * 0.85 + (Math.random() - 0.5) * 22 * dungeonBoost * sizeScale;
      p.vy = Math.sin(angle) * outward * 0.55 - upBoost;
      p.ax = (Math.random() - 0.5) * 10 * sizeScale;
      p.ay = (70 + Math.random() * 50) * sizeScale;
      p.friction = 0.984;
      p.life = 0.35 + Math.random() * 0.45;
      p.size = (2 + Math.random() * 3) * 1.1 * dungeonBoost * sizeScale;
      p.grow = 0;
      p.stretch = 1.8 + Math.random();
    }
    p.maxLife = p.life;
    slot.particles.push(p);
  }
}

function updateSmoulder(slot, dt, hexR, sizeScale) {
  const nowSec = performance.now() / 1000;
  for (let i = slot.particles.length - 1; i >= 0; i--) {
    const p = slot.particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      slot.particles.splice(i, 1);
      continue;
    }
    if (p.kind === 'glow') {
      p.vx += Math.sin(nowSec * 1.8 + p.phase) * 8 * sizeScale * dt;
      p.vy += p.ay * dt;
      p.vx *= 0.97;
      p.vy *= 0.995;
      p.ox += p.vx * dt;
      p.oy += p.vy * dt;
      if (p.grow) p.size += p.grow * dt;
    } else {
      p.vx += p.ax * dt;
      p.vy += p.ay * dt;
      p.vx *= p.friction;
      p.vy *= p.friction;
      p.ox += p.vx * dt;
      p.oy += p.vy * dt;
    }
  }
  spawnSmoulder(slot, dt, hexR, sizeScale);
}

function drawSmoulder(slot, cssW, cssH, hexR) {
  const { ctx, particles } = slot;
  ensureSmoulderSprites();
  const cx = cssW * 0.5;
  const cy = cssH * 0.5;
  ctx.clearRect(0, 0, cssW, cssH);

  const nowSec = performance.now() / 1000;
  const pulse = 0.55 + Math.sin(nowSec * 2.4) * 0.15;
  const radius = hexR * (1.05 + pulse * 0.12) * 1.2;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.min(1, 0.34 * pulse * 1.2);
  ctx.drawImage(
    haloSprite,
    cx - radius * 0.85,
    cy + hexR * 0.1 - radius * 0.7,
    radius * 1.7,
    radius * 1.4
  );
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.kind !== 'glow') continue;
    const lifeRatio = Math.max(0, Math.min(1, p.life / p.maxLife));
    const alpha = Math.sin(lifeRatio * Math.PI) * 0.42 * 1.2;
    if (alpha <= 0.02) continue;
    const size = Math.max(1, p.size);
    const stretch = p.stretch || 1.25;
    const sprite = glowSprites[p.palIndex] || glowSprites[1];
    ctx.globalAlpha = Math.min(1, alpha);
    const drawW = size;
    const drawH = size * 1.8 * stretch;
    ctx.drawImage(sprite, cx + p.ox - drawW * 0.5, cy + p.oy - drawH * 0.5, drawW, drawH);
  }
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.kind === 'glow') continue;
    const alpha = Math.max(0, p.life / p.maxLife);
    if (alpha <= 0.02) continue;
    const size = Math.max(0.4, p.size * (0.55 + alpha * 0.55));
    const speed = Math.hypot(p.vx, p.vy) || 1;
    const angle = Math.atan2(p.vy, p.vx);
    const streakLen = Math.min(9.9, (1.8 + speed * 0.035) * 1.1);
    const thick = Math.max(1.0, size);
    const palIndex = p.palIndex || 0;
    ctx.save();
    ctx.translate(cx + p.ox, cy + p.oy);
    ctx.rotate(angle);
    ctx.globalAlpha = Math.min(1, alpha * 0.9);
    ctx.drawImage(streakSprites[palIndex], -streakLen, -thick * 0.5, streakLen * 2, thick);
    const coreSize = size * 1.6;
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(sparkCoreSprites[palIndex], -coreSize * 0.5, -coreSize * 0.5, coreSize, coreSize);
    ctx.restore();
  }
  ctx.restore();
}

function drawShimmer(slot, cssW, cssH) {
  const { ctx, fx } = slot;
  ctx.clearRect(0, 0, cssW, cssH);
  const wrap = slot.canvas.parentElement;
  const icon = wrap?.querySelector('img');
  // Aura sized to the visible sprite (map uses ~hex radius scale, not the full glow canvas)
  const spriteW = Math.max(36, (icon?.clientWidth || wrap?.clientWidth || 80) * 0.85);
  const spriteH = Math.max(36, (icon?.clientHeight || wrap?.clientHeight || 80) * 0.85);
  const palette = fx === 'powerup' ? 'blue' : fx === 'artifact' ? 'fuchsia' : 'green';
  // Map: mystery/powerup ~1.15, artifacts ~1.2 — keep story a touch softer
  const scale = fx === 'artifact' ? 1.05 : 1.0;
  ctx.save();
  ctx.translate(cssW * 0.5, cssH * 0.5);
  drawTreasureShimmerAura(ctx, spriteW, spriteH, fx, { palette, scale });
  ctx.restore();
}

function tick(now) {
  if (!running) return;
  const dt = Math.max(0, Math.min(0.05, (now - lastTs) / 1000));
  lastTs = now;

  const list = ensureSlots();
  for (let i = 0; i < list.length; i++) {
    const slot = list[i];
    resizeSlot(slot);
    const cssW = parseFloat(slot.canvas.style.width) || slot.canvas.clientWidth;
    const cssH = parseFloat(slot.canvas.style.height) || slot.canvas.clientHeight;

    if (slot.fx === 'dungeon') {
      const { hexR, sizeScale } = dungeonScale(slot);
      updateSmoulder(slot, dt, hexR, sizeScale);
      drawSmoulder(slot, cssW, cssH, hexR);
    } else {
      drawShimmer(slot, cssW, cssH);
    }
  }

  rafId = requestAnimationFrame(tick);
}

/**
 * Start or stop story-panel collectible particle loops.
 * @param {boolean} active
 */
export function setStoryCollectiblesFxActive(active) {
  if (active) {
    if (running) return;
    const list = ensureSlots();
    if (!list.length) return;
    for (let i = 0; i < list.length; i++) {
      list[i].particles.length = 0;
      list[i].spawnCredit = 0;
    }
    lastTs = performance.now();
    running = true;
    rafId = requestAnimationFrame(tick);
    return;
  }

  running = false;
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    slot.particles.length = 0;
    slot.spawnCredit = 0;
    if (slot.ctx) {
      slot.ctx.setTransform(1, 0, 0, 1, 0, 0);
      slot.ctx.clearRect(0, 0, slot.canvas.width, slot.canvas.height);
    }
  }
}
