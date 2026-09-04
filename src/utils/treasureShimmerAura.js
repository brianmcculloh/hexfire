/**
 * Shared shimmer aura used by map pickups and dungeon reward cards.
 * Soft radial bloom + rotating light rays + rim sparkles.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} spriteW
 * @param {number} spriteH
 * @param {string} [seedKey] - per-item phase offset so items don't sync-lock
 * @param {{ palette?: 'gold'|'fuchsia'|'blue'|'green', scale?: number }} [options]
 */
export function drawTreasureShimmerAura(ctx, spriteW, spriteH, seedKey = '', options = {}) {
  if (!ctx) return;
  const palette =
    options.palette === 'fuchsia' ||
    options.palette === 'blue' ||
    options.palette === 'green' ||
    options.palette === 'gold'
      ? options.palette
      : 'gold';
  const scale = Number.isFinite(options.scale) ? Math.max(0.1, options.scale) : 1;
  const intensity = palette === 'gold' ? 1.25 : 1;
  const brighten = (rgb) =>
    rgb.map((c) => Math.min(255, Math.round(c + (255 - c) * (intensity - 1))));
  const paletteColors =
    palette === 'fuchsia'
      ? {
          bloom0: [255, 190, 255],
          bloom1: [255, 60, 210],
          bloom2: [255, 20, 180],
          bloom3: [200, 0, 160],
          ray0: [255, 210, 255],
          ray1: [255, 80, 230],
          ray2: [255, 0, 200],
          spark0: [255, 230, 255],
          spark1: [255, 100, 240],
          spark2: [255, 40, 200],
        }
      : palette === 'blue'
        ? {
            bloom0: [200, 235, 255],
            bloom1: [80, 180, 255],
            bloom2: [40, 140, 255],
            bloom3: [20, 90, 220],
            ray0: [220, 245, 255],
            ray1: [90, 190, 255],
            ray2: [40, 140, 255],
            spark0: [235, 250, 255],
            spark1: [120, 210, 255],
            spark2: [50, 160, 255],
          }
        : palette === 'green'
          ? {
              bloom0: [200, 255, 210],
              bloom1: [60, 255, 120],
              bloom2: [20, 230, 80],
              bloom3: [0, 180, 50],
              ray0: [220, 255, 230],
              ray1: [80, 255, 140],
              ray2: [20, 230, 90],
              spark0: [235, 255, 240],
              spark1: [100, 255, 150],
              spark2: [30, 230, 90],
            }
          : {
              bloom0: [255, 236, 150],
              bloom1: [255, 200, 70],
              bloom2: [255, 170, 40],
              bloom3: [255, 140, 20],
              ray0: [255, 245, 180],
              ray1: [255, 210, 80],
              ray2: [255, 180, 40],
              spark0: [255, 250, 210],
              spark1: [255, 215, 90],
              spark2: [255, 180, 40],
            };
  const colors = {
    bloom0: brighten(paletteColors.bloom0),
    bloom1: brighten(paletteColors.bloom1),
    bloom2: brighten(paletteColors.bloom2),
    bloom3: brighten(paletteColors.bloom3),
    ray0: brighten(paletteColors.ray0),
    ray1: brighten(paletteColors.ray1),
    ray2: brighten(paletteColors.ray2),
    spark0: brighten(paletteColors.spark0),
    spark1: brighten(paletteColors.spark1),
    spark2: brighten(paletteColors.spark2),
  };

  const nowSec = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  let phase = 0;
  if (seedKey) {
    let h = 0;
    for (let i = 0; i < seedKey.length; i++) h = (h * 31 + seedKey.charCodeAt(i)) | 0;
    phase = (((h >>> 0) % 1000) / 1000) * Math.PI * 2;
  }
  const t = nowSec * 0.13125 + phase;
  const pulse = 0.82 + Math.sin(nowSec * 0.9 + phase) * 0.18;
  const radius = Math.max(spriteW, spriteH) * (1.05 + pulse * 0.12) * 0.6 * scale;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const bloom = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  bloom.addColorStop(0, `rgba(${colors.bloom0.join(',')},${Math.min(1, 0.58 * pulse * intensity)})`);
  bloom.addColorStop(0.35, `rgba(${colors.bloom1.join(',')},${Math.min(1, 0.4 * pulse * intensity)})`);
  bloom.addColorStop(0.7, `rgba(${colors.bloom2.join(',')},${Math.min(1, 0.2 * pulse * intensity)})`);
  bloom.addColorStop(1, `rgba(${colors.bloom3.join(',')},0)`);
  ctx.fillStyle = bloom;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.98, radius * 0.86, 0, 0, Math.PI * 2);
  ctx.fill();

  const rayCount = 7;
  for (let i = 0; i < rayCount; i++) {
    const angle = t + (i / rayCount) * Math.PI * 2;
    const rayPhase = phase + i * 1.73;
    const fade = 0.35 + Math.sin(nowSec * 1.15 + rayPhase) * 0.35;
    const lengthPulse = 0.88 + Math.sin(nowSec * 0.95 + rayPhase * 1.3) * 0.14;
    if (fade < 0.08) continue;
    const rayLen = radius * (1.05 + Math.sin(nowSec * 0.7 + i + phase) * 0.06) * lengthPulse * 1.4;
    ctx.save();
    ctx.rotate(angle);
    const ray = ctx.createLinearGradient(0, 0, rayLen, 0);
    ray.addColorStop(0, `rgba(${colors.ray0.join(',')},${Math.min(1, 0.5 * pulse * fade * intensity)})`);
    ray.addColorStop(0.35, `rgba(${colors.ray1.join(',')},${Math.min(1, 0.28 * pulse * fade * intensity)})`);
    ray.addColorStop(1, `rgba(${colors.ray2.join(',')},0)`);
    ctx.fillStyle = ray;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.ellipse(rayLen * 0.48, 0, rayLen * 0.55, radius * 0.13 * 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const sparkleCount = 10;
  for (let i = 0; i < sparkleCount; i++) {
    const a = t * 0.7 + (i / sparkleCount) * Math.PI * 2 + phase;
    const orbit = radius * (0.62 + (i % 3) * 0.14);
    const twinkle = 0.45 + Math.sin(nowSec * 2.0 + i * 1.7 + phase) * 0.4;
    if (twinkle < 0.25) continue;
    const sx = Math.cos(a) * orbit;
    const sy = Math.sin(a) * orbit * 0.85;
    const sz = (1.5 + twinkle * 2.6) * 0.6 * 0.5;
    const spark = ctx.createRadialGradient(sx, sy, 0, sx, sy, sz * 2.4);
    spark.addColorStop(0, `rgba(${colors.spark0.join(',')},${Math.min(1, twinkle * 1.15 * intensity)})`);
    spark.addColorStop(0.45, `rgba(${colors.spark1.join(',')},${Math.min(1, twinkle * 0.75 * intensity)})`);
    spark.addColorStop(1, `rgba(${colors.spark2.join(',')},0)`);
    ctx.fillStyle = spark;
    ctx.beginPath();
    ctx.arc(sx, sy, sz * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
