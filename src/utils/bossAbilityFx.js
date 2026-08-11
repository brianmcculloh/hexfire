/**
 * Boss ability screen shake helpers.
 * Per-ability `screenShake` flags live on ability defs in patterns.js;
 * global toggle is CONFIG.SCREEN_SHAKE_ENABLED.
 */

import { CONFIG } from '../config.js';

/** @param {Object|null|undefined} ability */
export function abilityWantsScreenShake(ability) {
  return ability?.screenShake !== false;
}

function getCanvas() {
  if (typeof document === 'undefined') return null;
  return document.getElementById('gameCanvas');
}

/** Monotonic id so overlapping / gapped shake segments don't clear each other incorrectly. */
let shakeEpoch = 0;

/** @type {ReturnType<typeof setTimeout>[]} */
const pendingShakeStartTimers = [];

/**
 * Cancel queued delayed shake starts (e.g. on wave end).
 */
export function cancelPendingScreenShakes() {
  for (const id of pendingShakeStartTimers) clearTimeout(id);
  pendingShakeStartTimers.length = 0;
  shakeEpoch += 1;
  const canvas = getCanvas();
  if (!canvas) return;
  if (canvas._bossShakeSustainedTimer) {
    clearTimeout(canvas._bossShakeSustainedTimer);
    canvas._bossShakeSustainedTimer = null;
  }
  canvas.classList.remove('screen-shake-sustained');
  canvas.classList.remove('screen-shake');
}

/**
 * Sustained screen shake for a duration (ms), optionally delayed.
 * Overlapping calls extend the shake; gapped calls (later start after prior end) create a pause.
 *
 * @param {number} durationMs
 * @param {number} [startDelayMs=0]
 */
export function triggerScreenShakeSustained(durationMs, startDelayMs = 0) {
  if (CONFIG.SCREEN_SHAKE_ENABLED === false) return;
  const canvas = getCanvas();
  if (!canvas) return;

  const ms = Math.max(0, Number(durationMs) || 0);
  const delayMs = Math.max(0, Number(startDelayMs) || 0);
  if (ms <= 0) return;

  const start = () => {
    const epoch = ++shakeEpoch;
    canvas.classList.add('screen-shake-sustained');
    if (canvas._bossShakeSustainedTimer) {
      clearTimeout(canvas._bossShakeSustainedTimer);
    }
    canvas._bossShakeSustainedTimer = setTimeout(() => {
      if (epoch !== shakeEpoch) return;
      canvas.classList.remove('screen-shake-sustained');
      canvas._bossShakeSustainedTimer = null;
    }, ms);
  };

  if (delayMs > 0) {
    const timerId = setTimeout(() => {
      const idx = pendingShakeStartTimers.indexOf(timerId);
      if (idx >= 0) pendingShakeStartTimers.splice(idx, 1);
      start();
    }, delayMs);
    pendingShakeStartTimers.push(timerId);
  } else {
    start();
  }
}

/**
 * Trigger screen shake for a boss ability based on its per-ability flag + settings.
 *
 * @param {Object|null|undefined} ability
 * @param {{
 *   shake?: 'sustained'|'none',
 *   shakeDurationMs?: number,
 *   shakeDelayMs?: number,
 * }} [opts]
 */
export function triggerBossAbilityFx(ability, opts = {}) {
  if (!abilityWantsScreenShake(ability)) return;
  const shakeMode = opts.shake ?? 'sustained';
  if (shakeMode === 'sustained') {
    triggerScreenShakeSustained(opts.shakeDurationMs ?? 1000, opts.shakeDelayMs ?? 0);
  }
}
