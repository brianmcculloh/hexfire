// Combo System — detects contiguous fire extinguishes within a short time window

import { CONFIG, getComboTierForHexCount, getComboXpForWaveGroup, getComboDisplayText } from '../config.js';
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
    this.batchStartTime = 0;
  }

  /**
   * Record a fully extinguished hex for combo evaluation.
   * @param {number} q
   * @param {number} r
   */
  recordExtinguished(q, r) {
    const now = performance.now();
    if (this.pending.length === 0) {
      this.batchStartTime = now;
    }
    this.pending.push({ q, r, time: now });
    this.lastEventTime = now;
  }

  /**
   * Called each render frame; flushes the batch once idle or max span is reached.
   * @param {number} _deltaTime - Unused; timing uses performance.now()
   */
  updateFrame(_deltaTime) {
    if (this.pending.length === 0) return;

    const idleMs = CONFIG.COMBO_BATCH_WINDOW_MS ?? 150;
    const maxSpanMs = CONFIG.COMBO_BATCH_MAX_SPAN_MS ?? 300;
    const now = performance.now();

    const spanExceeded = now - this.batchStartTime >= maxSpanMs;
    const idleElapsed = now - this.lastEventTime >= idleMs;

    if (spanExceeded) {
      this.flushUpTo(this.batchStartTime + maxSpanMs);
      return;
    }
    if (idleElapsed) {
      this.flush();
    }
  }

  /**
   * Process pending events with time <= cutoff; leave newer events for the next batch.
   * @param {number} cutoffTime - performance.now() upper bound (inclusive)
   */
  flushUpTo(cutoffTime) {
    if (this.pending.length === 0) return;

    const toProcess = [];
    const remaining = [];
    for (const evt of this.pending) {
      if (evt.time <= cutoffTime) toProcess.push(evt);
      else remaining.push(evt);
    }
    this.pending = remaining;

    if (remaining.length > 0) {
      this.batchStartTime = remaining[0].time;
      this.lastEventTime = remaining[remaining.length - 1].time;
    } else {
      this.batchStartTime = 0;
      this.lastEventTime = 0;
    }

    if (toProcess.length > 0) {
      this.evaluateBatch(toProcess);
    }
  }

  flush() {
    if (this.pending.length === 0) return;
    const events = this.pending;
    this.pending = [];
    this.batchStartTime = 0;
    this.lastEventTime = 0;
    this.evaluateBatch(events);
  }

  /**
   * @param {Array<{ q: number, r: number, time: number }>} events
   */
  evaluateBatch(events) {
    if (!events.length) return;

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
    const waveGroup = Math.max(
      1,
      Math.floor(
        Number(this.gameState?.waveSystem?.currentWaveGroup ?? this.gameState?.wave?.currentGroup) || 1,
      ),
    );
    const baseXp = getComboXpForWaveGroup(tier.xp, waveGroup);
    const boostedXp =
      this.gameState?.progressionSystem?.awardComboXP?.(baseXp) ?? baseXp;

    const hexCount = component.length;
    const displayText = getComboDisplayText(tier, hexCount);

    this.gameState?.notificationSystem?.addComboNotification?.(
      center.q,
      center.r,
      displayText,
      tier.color,
      boostedXp,
    );

    this.gameState?.runStats?.recordCombo?.(
      tier.id,
      displayText,
      hexCount,
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
    this.batchStartTime = 0;
  }
}
