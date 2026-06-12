// Combo System — detects contiguous fire extinguishes within a short time window

import { CONFIG, getComboTierForHexCount } from '../config.js';
import { getNeighbors, hexKey } from '../utils/hexMath.js';

/**
 * @param {Array<{ q: number, r: number }>} hexes
 * @returns {Array<Array<{ q: number, r: number }>>}
 */
function findContiguousComponents(hexes) {
  if (!hexes.length) return [];

  const keySet = new Set(hexes.map((h) => hexKey(h.q, h.r)));
  const components = [];
  const visited = new Set();

  for (const start of hexes) {
    const startKey = hexKey(start.q, start.r);
    if (visited.has(startKey)) continue;

    const component = [];
    const queue = [start];
    visited.add(startKey);

    while (queue.length > 0) {
      const current = queue.pop();
      component.push(current);

      for (const neighbor of getNeighbors(current.q, current.r)) {
        const nKey = hexKey(neighbor.q, neighbor.r);
        if (!keySet.has(nKey) || visited.has(nKey)) continue;
        visited.add(nKey);
        queue.push(neighbor);
      }
    }

    components.push(component);
  }

  return components;
}

/**
 * @param {Array<{ q: number, r: number }>} hexes
 * @returns {{ q: number, r: number }}
 */
function getComponentCenter(hexes) {
  let sumQ = 0;
  let sumR = 0;
  for (let i = 0; i < hexes.length; i++) {
    sumQ += hexes[i].q;
    sumR += hexes[i].r;
  }
  return { q: sumQ / hexes.length, r: sumR / hexes.length };
}

export class ComboSystem {
  constructor(gameState) {
    this.gameState = gameState;
    /** @type {Array<{ q: number, r: number, time: number }>} */
    this.pending = [];
    this.lastEventTime = 0;
  }

  /**
   * Record a fully extinguished hex for combo evaluation.
   * @param {number} q
   * @param {number} r
   */
  recordExtinguished(q, r) {
    const now = performance.now();
    this.pending.push({ q, r, time: now });
    this.lastEventTime = now;
  }

  /**
   * Called each render frame; flushes the batch once the window has elapsed.
   * @param {number} _deltaTime - Unused; timing uses performance.now()
   */
  updateFrame(_deltaTime) {
    if (this.pending.length === 0) return;
    const windowMs = CONFIG.COMBO_BATCH_WINDOW_MS ?? 200;
    if (performance.now() - this.lastEventTime < windowMs) return;
    this.flush();
  }

  flush() {
    if (this.pending.length === 0) return;

    const events = this.pending;
    this.pending = [];

    const uniqueHexes = [];
    const seen = new Set();
    for (const evt of events) {
      const key = hexKey(evt.q, evt.r);
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueHexes.push({ q: evt.q, r: evt.r });
    }

    const components = findContiguousComponents(uniqueHexes);
    for (const component of components) {
      const tier = getComboTierForHexCount(component.length);
      if (!tier) continue;
      this.triggerCombo(tier, component);
    }
  }

  /**
   * @param {{ minHexes: number, text: string, color: string, sfxKey: string }} tier
   * @param {Array<{ q: number, r: number }>} component
   */
  triggerCombo(tier, component) {
    const center = getComponentCenter(component);
    const baseXp = Math.max(0, Math.round(Number(tier.xp)) || 0);
    const boostedXp =
      this.gameState?.progressionSystem?.awardComboXP?.(baseXp) ?? baseXp;

    this.gameState?.notificationSystem?.addComboNotification?.(
      center.q,
      center.r,
      tier.text,
      tier.color,
      boostedXp,
    );

    this.gameState?.runStats?.recordCombo?.(
      tier.id,
      tier.text,
      component.length,
      boostedXp,
      baseXp,
    );

    if (typeof window !== 'undefined' && window.AudioManager && tier.sfxKey) {
      window.AudioManager.playSFX(tier.sfxKey, { dedupeMs: 150 });
    }
  }

  reset() {
    this.pending = [];
    this.lastEventTime = 0;
  }
}
