/**
 * Artifact trader: per-run want list + helpers (UI mount in WaveSystem).
 * Wants: 5 individuals (left), 3 pairs + 2 multi-want rows (right). The last want row is 3 items, or
 * (20% chance) 4 from one of the 4-item sets. Pair/triple/quad set exclusivity: pair sets differ from
 * the two “right column” want sets. Rewards are drawn from CONFIG.ARTIFACT_TRADER_REWARD_POOLS per size.
 */

import {
  CONFIG,
  getArtifactById,
  getArtifactsBySet,
  getSuppressionBombTotalUses,
  getPowerUpGraphicFilename,
  ARTIFACT_SET_IDS,
  applyCurrencyGainBonuses,
} from '../config.js';
import { createModalFloatingImage, createModalFloatingText } from './modal.js';

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Pick `count` distinct artifact ids from a single set (no global uniqueness). */
function pickDistinctIdsFromSet(setId, count) {
  const defs = getArtifactsBySet(setId);
  if (!defs || defs.length < count) return null;
  const ids = defs.map((d) => d.id).filter(Boolean);
  shuffleInPlace(ids);
  return ids.slice(0, count);
}

const TRADER_LAST_ROW_FOUR_PROB = 0.2;

/**
 * A reward bundle: array of parts, each { type, count, ... } — one visual per unit of count.
 * @param {string} poolKey
 * @returns {object[]}
 */
function pickRandomRewardFromPool(poolKey) {
  const pool = CONFIG.ARTIFACT_TRADER_REWARD_POOLS?.[poolKey];
  if (Array.isArray(pool) && pool.length > 0) {
    // Legacy shape: pool is array of reward bundles; uniform random.
    if (Array.isArray(pool[0])) {
      const legacy = pool[Math.floor(Math.random() * pool.length)];
      if (Array.isArray(legacy) && legacy.length > 0) {
        return JSON.parse(JSON.stringify(legacy));
      }
    }
    // Weighted shape: [{ weight, rewards: [...] }, ...]
    const totalWeight = pool.reduce((sum, row) => sum + (row?.weight || 1), 0);
    if (totalWeight > 0) {
      let roll = Math.random() * totalWeight;
      for (const row of pool) {
        roll -= (row?.weight || 1);
        if (roll <= 0) {
          if (Array.isArray(row?.rewards) && row.rewards.length > 0) {
            return JSON.parse(JSON.stringify(row.rewards));
          }
          break;
        }
      }
    }
  }
  return [{ type: 'upgrade_plans', count: 1 }];
}

function isRewardPartOk(p) {
  return p && typeof p === 'object' && typeof p.type === 'string' && p.type.length > 0;
}

/**
 * @returns {{
 *   individuals: { artifactId: string, reward: object[] }[],
 *   pairs: { set: string, ids: [string, string], reward: object[] }[],
 *   triples: { set: string, ids: string[], reward: object[] }[],
 * }}
 */
export function generateArtifactTraderWants() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const tripleAEligible = ARTIFACT_SET_IDS.filter((sid) => getArtifactsBySet(sid).length >= 3);
    if (tripleAEligible.length < 1) break;
    shuffleInPlace(tripleAEligible);
    const tripleSetA = tripleAEligible[0];
    const idsTA = pickDistinctIdsFromSet(tripleSetA, 3);
    if (!idsTA) continue;

    const useFourOnLast = Math.random() < TRADER_LAST_ROW_FOUR_PROB;
    const quadOnlyEligible = ARTIFACT_SET_IDS.filter(
      (sid) => sid !== tripleSetA && getArtifactsBySet(sid).length >= 4
    );
    const tripleBOnlyEligible = ARTIFACT_SET_IDS.filter(
      (sid) => getArtifactsBySet(sid).length >= 3 && sid !== tripleSetA
    );

    let lastSet;
    let lastIds;
    /** @type {'triple' | 'quad'} */
    let lastPoolKey;

    if (useFourOnLast && quadOnlyEligible.length > 0) {
      shuffleInPlace(quadOnlyEligible);
      lastSet = quadOnlyEligible[0];
      const ids4 = pickDistinctIdsFromSet(lastSet, 4);
      if (!ids4) continue;
      lastIds = ids4;
      lastPoolKey = 'quad';
    } else {
      if (tripleBOnlyEligible.length < 1) continue;
      shuffleInPlace(tripleBOnlyEligible);
      lastSet = tripleBOnlyEligible[0];
      const idsB = pickDistinctIdsFromSet(lastSet, 3);
      if (!idsB) continue;
      lastIds = idsB;
      lastPoolKey = 'triple';
    }

    const usedSets = new Set([tripleSetA, lastSet]);
    const pairEligible = ARTIFACT_SET_IDS.filter(
      (sid) => getArtifactsBySet(sid).length >= 2 && !usedSets.has(sid)
    );
    shuffleInPlace(pairEligible);
    if (pairEligible.length < 3) continue;

    const pairs = [];
    let pairFail = false;
    for (let i = 0; i < 3; i++) {
      const setId = pairEligible[i];
      const pids = pickDistinctIdsFromSet(setId, 2);
      if (!pids) {
        pairFail = true;
        break;
      }
      pairs.push({ set: setId, ids: [pids[0], pids[1]], reward: pickRandomRewardFromPool('pair') });
    }
    if (pairFail) continue;

    const allArtifactIds = (CONFIG.ARTIFACTS || [])
      .map((a) => a && a.id)
      .filter((id) => id && getArtifactById(id));
    if (allArtifactIds.length < 5) continue;
    const indPool = [...allArtifactIds];
    shuffleInPlace(indPool);
    const indIds = indPool.slice(0, 5);
    const individuals = indIds.map((artifactId) => ({
      artifactId,
      reward: pickRandomRewardFromPool('single'),
    }));

    return {
      individuals,
      pairs,
      triples: [
        { set: tripleSetA, ids: idsTA, reward: pickRandomRewardFromPool('triple') },
        { set: lastSet, ids: lastIds, reward: pickRandomRewardFromPool(lastPoolKey) },
      ],
    };
  }
  return {
    individuals: [
      { artifactId: 'ace_of_hearts', reward: pickRandomRewardFromPool('single') },
      { artifactId: 'backpack_red', reward: pickRandomRewardFromPool('single') },
      { artifactId: 'book_green', reward: pickRandomRewardFromPool('single') },
      { artifactId: 'die_blue', reward: pickRandomRewardFromPool('single') },
      { artifactId: 'key_1', reward: pickRandomRewardFromPool('single') },
    ],
    pairs: [
      { set: 'keys', ids: ['key_2', 'key_3'], reward: pickRandomRewardFromPool('pair') },
      { set: 'dice', ids: ['die_black', 'die_red'], reward: pickRandomRewardFromPool('pair') },
      { set: 'books', ids: ['book_red', 'book_blue'], reward: pickRandomRewardFromPool('pair') },
    ],
    triples: [
      { set: 'aces', ids: ['ace_of_diamonds', 'ace_of_clubs', 'ace_of_spades'], reward: pickRandomRewardFromPool('triple') },
      { set: 'potions', ids: ['potion_green', 'potion_yellow', 'potion_pink', 'potion_red'], reward: pickRandomRewardFromPool('quad') },
    ],
  };
}

/**
 * Old format: individuals were string[]; rows had no `reward`. Rewrap with default upgrade plan rewards.
 * @returns {object|null} migrated wants, or null if not legacy
 */
function tryMigrateLegacyArtifactTraderWants(w) {
  if (!w || !Array.isArray(w.individuals) || w.individuals.length !== 5) return null;
  const first = w.individuals[0];
  if (first && typeof first === 'object' && first.artifactId) return null;
  if (typeof first !== 'string') return null;
  if (!Array.isArray(w.pairs) || w.pairs.length !== 3) return null;
  if (!Array.isArray(w.triples) || w.triples.length !== 2) return null;
  const def = [{ type: 'upgrade_plans', count: 1 }];
  const defR = () => JSON.parse(JSON.stringify(def));
  return {
    individuals: w.individuals.map((id) => ({ artifactId: id, reward: defR() })),
    pairs: w.pairs.map((p) => ({ set: p.set, ids: p.ids, reward: defR() })),
    triples: w.triples.map((t) => ({ set: t.set, ids: t.ids, reward: defR() })),
  };
}

function artifactTraderWantsShapeOk(w) {
  if (!w || typeof w !== 'object') return false;
  if (!Array.isArray(w.individuals) || w.individuals.length !== 5) return false;
  if (!Array.isArray(w.pairs) || w.pairs.length !== 3) return false;
  if (!Array.isArray(w.triples) || w.triples.length !== 2) return false;

  for (const row of w.individuals) {
    if (!row || typeof row !== 'object' || !row.artifactId || !Array.isArray(row.reward) || !row.reward.length) {
      return false;
    }
    if (!row.reward.every(isRewardPartOk)) return false;
  }
  for (const p of w.pairs) {
    if (!p || !Array.isArray(p.ids) || p.ids.length !== 2 || !p.ids[0] || !p.ids[1]) return false;
    if (!Array.isArray(p.reward) || !p.reward.length || !p.reward.every(isRewardPartOk)) return false;
  }
  const t0 = w.triples[0];
  const t1 = w.triples[1];
  if (!t0 || t0.ids.length !== 3 || !Array.isArray(t0.reward) || !t0.reward.every(isRewardPartOk)) return false;
  if (!t1) return false;
  if (t1.ids.length !== 3 && t1.ids.length !== 4) return false;
  if (!Array.isArray(t1.reward) || !t1.reward.length || !t1.reward.every(isRewardPartOk)) return false;
  return true;
}

export function ensureArtifactTraderWantsForRun(gameState) {
  const inv = gameState?.player?.inventory;
  if (!inv) return null;
  const legacy = tryMigrateLegacyArtifactTraderWants(inv.artifactTraderWants);
  if (legacy) {
    inv.artifactTraderWants = legacy;
  } else if (!artifactTraderWantsShapeOk(inv.artifactTraderWants)) {
    inv.artifactTraderWants = generateArtifactTraderWants();
    inv.artifactTraderCompletedTrades = [];
  }
  if (!Array.isArray(inv.artifactTraderCompletedTrades)) {
    inv.artifactTraderCompletedTrades = [];
  }
  return inv.artifactTraderWants;
}

export function artifactTraderHasUnseenCollectedArtifacts(gameState) {
  const inv = gameState?.player?.inventory;
  if (!inv) return false;
  const col = Array.isArray(inv.collectedArtifactIds) ? inv.collectedArtifactIds : [];
  const ack = new Set(Array.isArray(inv.artifactTraderAcknowledgedIds) ? inv.artifactTraderAcknowledgedIds : []);
  return col.some((id) => id && getArtifactById(id) && !ack.has(String(id)));
}

export function artifactTraderShouldOffer(gameState, waveSystem) {
  if (!gameState || gameState.tutorialMode) return false;
  if (gameState.wave?.isScenario) return false;
  const firstGroup = CONFIG.ARTIFACT_SPAWN?.availableAtWaveGroup ?? 5;
  const wg = waveSystem?.currentWaveGroup ?? gameState.wave?.currentGroup ?? 1;
  // Same wave group where map artifacts unlock (default 5) and onward
  if (wg < firstGroup) return false;
  return artifactTraderHasUnseenCollectedArtifacts(gameState);
}

export function artifactTraderAcknowledgeAllCollected(gameState) {
  const inv = gameState?.player?.inventory;
  if (!inv) return;
  const col = Array.isArray(inv.collectedArtifactIds) ? inv.collectedArtifactIds.map(String) : [];
  const prev = new Set(Array.isArray(inv.artifactTraderAcknowledgedIds) ? inv.artifactTraderAcknowledgedIds.map(String) : []);
  col.forEach((id) => prev.add(id));
  inv.artifactTraderAcknowledgedIds = [...prev];
}

/** True after the artifact trader modal has been shown this run (want list is visible in tooltips). */
export function artifactTraderWantsAreRevealed(gameState) {
  const inv = gameState?.player?.inventory;
  if (!inv) return false;
  return inv.artifactTraderWantsRevealed === true;
}

/** Call when the artifact trader screen is first displayed (locks in tooltip sought yes/no). */
export function revealArtifactTraderWants(gameState) {
  const inv = gameState?.player?.inventory;
  if (!inv) return;
  inv.artifactTraderWantsRevealed = true;
  if (typeof window !== 'undefined' && typeof window.updateInventory === 'function') {
    window.updateInventory();
  }
}

/**
 * All artifact ids the trader is seeking this run (singles + pair/triple/quad rows).
 * @param {object} [gameState]
 * @returns {Set<string>}
 */
export function getArtifactTraderSoughtArtifactIds(gameState) {
  const wants = gameState?.player?.inventory?.artifactTraderWants;
  const sought = new Set();
  if (!wants || typeof wants !== 'object') return sought;
  (wants.individuals || []).forEach((row) => {
    if (row?.artifactId) sought.add(String(row.artifactId));
  });
  (wants.pairs || []).forEach((row) => {
    (row?.ids || []).forEach((id) => {
      if (id) sought.add(String(id));
    });
  });
  (wants.triples || []).forEach((row) => {
    (row?.ids || []).forEach((id) => {
      if (id) sought.add(String(id));
    });
  });
  return sought;
}

export function isArtifactSoughtByTrader(gameState, artifactId) {
  if (!artifactId) return false;
  return getArtifactTraderSoughtArtifactIds(gameState).has(String(artifactId));
}

/** @returns {string} */
export function getArtifactTradedLabelColor() {
  return '#FF3333';
}

/**
 * Artifact ids surrendered in completed trader bounties this run.
 * @param {object} [gameState]
 * @returns {string[]}
 */
export function getTradedArtifactIds(gameState) {
  const completed = gameState?.player?.inventory?.artifactTraderCompletedTrades;
  if (!Array.isArray(completed)) return [];
  const ids = new Set();
  for (const key of completed) {
    if (key == null || key === '') continue;
    String(key)
      .split('|')
      .forEach((id) => {
        if (id) ids.add(String(id));
      });
  }
  return [...ids];
}

export function isArtifactTradedToTrader(gameState, artifactId) {
  if (!artifactId) return false;
  const s = String(artifactId);
  return getTradedArtifactIds(gameState).some((id) => id === s);
}

/**
 * @returns {{ label: string, value: string, color: string }}
 */
export function getArtifactTraderSoughtTooltipLine(gameState, artifactId) {
  const prefix = 'Sought by artifact trader: ';
  if (!artifactTraderWantsAreRevealed(gameState)) {
    return { label: prefix, value: '???', color: '#FFFFFF' };
  }
  const sought = isArtifactSoughtByTrader(gameState, artifactId);
  return {
    label: prefix,
    value: sought ? 'yes' : 'no',
    color: sought ? '#39FF14' : '#FF3333',
  };
}

function playerOwnsArtifactId(gameState, artifactId) {
  const col = gameState?.player?.inventory?.collectedArtifactIds;
  if (!Array.isArray(col)) return false;
  const s = String(artifactId);
  if (!col.some((id) => String(id) === s)) return false;
  if (isArtifactTradedToTrader(gameState, artifactId)) return false;
  const loaned = gameState?.player?.inventory?.loanedArtifactIds;
  if (Array.isArray(loaned) && loaned.some((id) => String(id) === s)) return false;
  return true;
}

/** Every artifact portrait in the trader uses this pixel height (width auto). */
const TRADER_ARTIFACT_IMG_HEIGHT_PX = 58;
/** Same height for all want boxes; widths scale by set size. */
const TRADER_ARTIFACT_BOX_H = 100;
const TRADER_ARTIFACT_BOX_W_SINGLE = 108;
const TRADER_ARTIFACT_BOX_W_PAIR = 196;
const TRADER_ARTIFACT_BOX_W_TRIPLE = 244;
const TRADER_ARTIFACT_BOX_W_QUAD = 308;
const TRADER_ROW_ARROW_COL_W = 18;
const TRADER_ROW_COL_GAP = 6;
const TRADER_REWARD_ICON_H_PX = 52;
const TRADER_REWARD_COL_MAX_W_PX = 200;
/** ~10% more overlap than the prior 14px default. */
const TRADER_REWARD_OVERLAP_PX = 15;
/** Narrow reward rows still need room for the Claim button. */
const TRADER_CLAIM_BTN_MIN_W_PX = 72;
const TRADER_DIM_FILTER = 'brightness(0.38) saturate(0.92)';
const TRADER_DIM_FILTER_HEAVY = 'brightness(0.32) saturate(0.9)';
const TRADER_SET_PLUS_H_PX = 16;
const TRADER_SET_PLUS_RESERVE_W_PX = 18;

/** Horiz. padding 3+3; innerW uses total 6 so layout math matches the box. */
const TRADER_WANT_BOX_H_PAD_PX = 3;
const TRADER_WANT_BOX_INNER_W_SUB = TRADER_WANT_BOX_H_PAD_PX * 2;

function artifactTraderBoxStyle(widthPx, heightPx) {
  return `box-sizing: border-box; border: 1px solid rgba(148, 163, 184, 0.5); border-radius: 8px; padding: ${TRADER_WANT_BOX_H_PAD_PX}px; background: #000000; width: ${widthPx}px; height: ${heightPx}px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;`;
}

function artifactImgElement(artifactId, maxWidthPx) {
  const def = getArtifactById(artifactId);
  if (!def) return null;
  const img = document.createElement('img');
  img.dataset.artifactId = String(artifactId);
  img.src = `assets/images/artifacts/${def.sprite}`;
  img.alt = def.name || artifactId;
  const mw = Math.max(40, Math.round(maxWidthPx));
  img.style.cssText = `height: ${TRADER_ARTIFACT_IMG_HEIGHT_PX}px; width: auto; max-width: ${mw}px; min-width: 0; object-fit: contain; cursor: inherit; flex-shrink: 1;`;
  img.classList.add('artifact-sprite-smooth');
  return img;
}

function createSetPlusElement() {
  const img = document.createElement('img');
  img.className = 'artifact-trader-set-plus';
  img.src = 'assets/images/ui/plus.png';
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  img.style.cssText = `height: ${TRADER_SET_PLUS_H_PX}px; width: auto; max-width: ${TRADER_SET_PLUS_RESERVE_W_PX}px; object-fit: contain; image-rendering: crisp-edges; flex-shrink: 0; pointer-events: none; cursor: inherit;`;
  return img;
}

function makeTradeRowKey(artifactIds) {
  return [...artifactIds].map(String).sort().join('|');
}

function isTradeRowCompleted(gameState, key) {
  const arr = gameState?.player?.inventory?.artifactTraderCompletedTrades;
  return Array.isArray(arr) && arr.includes(key);
}

function markTradeRowCompleted(gameState, key) {
  const inv = gameState?.player?.inventory;
  if (!inv) return;
  if (!Array.isArray(inv.artifactTraderCompletedTrades)) inv.artifactTraderCompletedTrades = [];
  if (!inv.artifactTraderCompletedTrades.includes(key)) inv.artifactTraderCompletedTrades.push(key);
}

function createArtifactBoxInnerFlex(direction, gapPx) {
  const inner = document.createElement('div');
  inner.className = 'artifact-trader-want-box-inner';
  inner.style.cssText = `display: flex; flex-direction: ${direction}; align-items: center; justify-content: center; gap: ${gapPx}px; width: 100%; height: 100%; background: #000000; border-radius: 4px;`;
  return inner;
}

function createArtifactWantBox(artifactIds, _gameState, layout, boxWidthPx, boxHeightPx) {
  const n = Math.max(1, artifactIds.length);
  const innerW = Math.max(40, boxWidthPx - TRADER_WANT_BOX_INNER_W_SUB);
  const box = document.createElement('div');
  box.className = 'artifact-trader-want-box';
  box.style.cssText = artifactTraderBoxStyle(boxWidthPx, boxHeightPx);
  const g = layout.gap;

  if (n === 1) {
    const inner = createArtifactBoxInnerFlex(layout.direction, g);
    const el = artifactImgElement(artifactIds[0], Math.floor(innerW));
    if (el) inner.appendChild(el);
    box.appendChild(inner);
    return box;
  }

  const m = n - 1;
  const numGaps = 2 * n - 2;
  const availableForImages = innerW - m * TRADER_SET_PLUS_RESERVE_W_PX - numGaps * g;
  const maxW = Math.max(24, Math.floor(availableForImages / n));

  const inner = createArtifactBoxInnerFlex(layout.direction, g);
  artifactIds.forEach((aid, i) => {
    const el = artifactImgElement(aid, maxW);
    if (el) inner.appendChild(el);
    if (i < n - 1) inner.appendChild(createSetPlusElement());
  });
  box.appendChild(inner);
  return box;
}

function createTradeArrowElement() {
  const img = document.createElement('img');
  img.className = 'artifact-trader-trade-arrow';
  img.src = 'assets/images/ui/trade-arrow.png';
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  img.style.cssText = 'height: 20px; width: auto; object-fit: contain; image-rendering: crisp-edges; flex-shrink: 0; cursor: inherit;';
  return img;
}

function applyRewardBundleToPlayer(gameState, rewardBundle) {
  for (const part of rewardBundle) {
    if (!part || !part.type) continue;
    const n = part.count != null && part.count > 0 ? Math.floor(part.count) : 1;
    if (part.type === 'upgrade_plans') {
      gameState.player.upgradePlans = (gameState.player.upgradePlans || 0) + n;
    } else if (part.type === 'currency') {
      const amt = part.amount != null && part.amount > 0 ? Number(part.amount) : 0;
      if (amt > 0) {
        const granted = applyCurrencyGainBonuses(amt * n, gameState);
        gameState.player.currency = (gameState.player.currency || 0) + granted;
      }
    } else if (part.type === 'permanent_power_up') {
      const powerUpId = part.powerUpId;
      if (!powerUpId || !CONFIG.POWER_UPS?.[powerUpId]) continue;
      if (!gameState.player.powerUps) gameState.player.powerUps = {};
      gameState.player.powerUps[powerUpId] = (gameState.player.powerUps[powerUpId] || 0) + n;
      if (powerUpId === 'tower_speed') {
        gameState.towerSystem?.refreshAllTowerAffectedHexes?.();
      }
      if (powerUpId === 'tower_health') {
        gameState.towerSystem?.refreshAllTowerMaxHealth?.();
      }
    } else if (part.type === 'shield') {
      const level = Math.min(4, Math.max(1, Math.round(Number(part.level || 1))));
      if (!Array.isArray(gameState.player?.inventory?.purchasedShields)) {
        gameState.player.inventory.purchasedShields = [];
      }
      for (let i = 0; i < n; i++) {
        gameState.player.inventory.purchasedShields.push({ type: 'shield', level });
      }
    } else if (part.type === 'suppression_bomb') {
      const level = Math.min(4, Math.max(1, Math.round(Number(part.level || 1))));
      if (!Array.isArray(gameState.player?.inventory?.purchasedSuppressionBombs)) {
        gameState.player.inventory.purchasedSuppressionBombs = [];
      }
      for (let i = 0; i < n; i++) {
        const totalUses = getSuppressionBombTotalUses(level);
        gameState.player.inventory.purchasedSuppressionBombs.push({ type: 'suppression_bomb', level, totalUses, usesRemaining: totalUses });
      }
    } else if (part.type === 'tree_juice') {
      for (let i = 0; i < n; i++) {
        gameState.townLevel = (gameState.townLevel || 1) + 1;
        gameState.gridSystem?.applyTownUpgrade?.(
          CONFIG.TOWN_HEALTH_PER_UPGRADE,
          gameState.townLevel,
        );
      }
    }
  }
}

function rewardIconsRowWidth(count, unitW = TRADER_REWARD_ICON_H_PX) {
  const n = Math.max(0, Math.floor(count));
  if (n <= 0) return 0;
  if (n === 1) return unitW;
  return unitW + (n - 1) * (unitW - TRADER_REWARD_OVERLAP_PX);
}

function styleTraderRewardIcon(img, stackIndex = 0, stackTotal = 1) {
  img.classList.add('collectible-sprite-smooth');
  img.style.cssText = `height: ${TRADER_REWARD_ICON_H_PX}px; width: auto; flex-shrink: 0; cursor: inherit;`;
  if (stackTotal >= 2 && stackIndex > 0) {
    img.style.marginLeft = `-${TRADER_REWARD_OVERLAP_PX}px`;
    img.style.position = 'relative';
    img.style.zIndex = String(stackIndex);
  }
  return img;
}

/** Count every reward portrait in a bundle (one currency chip = one icon). */
function countRewardBundleIcons(bundle) {
  if (!Array.isArray(bundle)) return 0;
  let total = 0;
  for (const part of bundle) {
    if (!part || !part.type) continue;
    const n = part.count != null && part.count > 0 ? Math.floor(part.count) : 1;
    if (part.type === 'currency') {
      const amt = part.amount != null && part.amount > 0 ? Number(part.amount) : 0;
      if (amt * n > 0) total += 1;
    } else if (['upgrade_plans', 'shield', 'suppression_bomb', 'tree_juice', 'permanent_power_up'].includes(part.type)) {
      total += n;
    }
  }
  return total;
}

/**
 * @param {object} part
 * @param {number} unitIndex - index within a multi-count part (for unique nodes only)
 * @returns {HTMLImageElement|null}
 */
function createTraderRewardIconElement(part, unitIndex = 0, gameState = null) {
  if (!part || !part.type) return null;
  const n = part.count != null && part.count > 0 ? Math.floor(part.count) : 1;

  if (part.type === 'currency') {
    if (unitIndex > 0) return null;
    const amt = part.amount != null && part.amount > 0 ? Number(part.amount) : 0;
    const baseTotal = amt * n;
    const total = gameState ? applyCurrencyGainBonuses(baseTotal, gameState) : baseTotal;
    if (total <= 0) return null;
    const icon = document.createElement('img');
    icon.src = 'assets/images/items/currency.png';
    icon.alt = 'Currency';
    icon.dataset.traderReward = 'currency';
    icon.dataset.traderCurrencyAmount = String(total);
    icon.dataset.traderFloatText = `+$${total}`;
    icon.dataset.traderFloatColor = '#00FF88';
    return icon;
  }

  const img = document.createElement('img');
  if (part.type === 'upgrade_plans') {
    img.src = 'assets/images/items/upgrade_token.png';
    img.alt = 'Upgrade plans';
    img.dataset.traderReward = 'upgrade_plans';
  } else if (part.type === 'shield') {
    const level = Math.min(4, Math.max(1, Math.round(Number(part.level || 1))));
    img.src = `assets/images/items/shield_${level}.png`;
    img.alt = `Shield level ${level}`;
    img.dataset.traderReward = 'shield';
    img.dataset.traderRewardLevel = String(level);
  } else if (part.type === 'suppression_bomb') {
    const level = Math.min(4, Math.max(1, Math.round(Number(part.level || 1))));
    img.src = `assets/images/items/suppression_${level}.png`;
    img.alt = 'Suppression bomb';
    img.dataset.traderReward = 'suppression_bomb';
    img.dataset.traderRewardLevel = String(level);
  } else if (part.type === 'tree_juice') {
    img.src = 'assets/images/items/town_defense.png';
    img.alt = 'Tree juice';
    img.dataset.traderReward = 'tree_juice';
  } else if (part.type === 'permanent_power_up') {
    const powerUpId = part.powerUpId;
    const gfx = powerUpId ? getPowerUpGraphicFilename(powerUpId) : null;
    if (!gfx) return null;
    img.src = `assets/images/power_ups/${gfx}`;
    img.alt = CONFIG.POWER_UPS?.[powerUpId]?.name || 'Power-up';
    img.dataset.traderReward = 'permanent_power_up';
    img.dataset.traderRewardPowerUpId = powerUpId;
  } else {
    return null;
  }
  return img;
}

/**
 * @param {object[]} rewardBundle
 * @returns {HTMLElement}
 */
function buildArtifactTraderRewardRow(rewardBundle, gameState = null) {
  const icons = [];
  for (const part of rewardBundle || []) {
    if (!part || !part.type) continue;
    const n = part.count != null && part.count > 0 ? Math.floor(part.count) : 1;
    if (part.type === 'currency') {
      const icon = createTraderRewardIconElement(part, 0, gameState);
      if (icon) icons.push(icon);
      continue;
    }
    for (let u = 0; u < n; u++) {
      const icon = createTraderRewardIconElement(part, u, gameState);
      if (icon) icons.push(icon);
    }
  }

  if (icons.length === 0) {
    const fallback = document.createElement('img');
    fallback.src = 'assets/images/items/upgrade_token.png';
    fallback.alt = 'Upgrade plans';
    fallback.dataset.traderReward = 'upgrade_plans';
    icons.push(fallback);
  }

  const stackTotal = icons.length;
  const row = document.createElement('div');
  row.className = 'artifact-trader-reward-row';
  if (stackTotal >= 2) row.classList.add('artifact-trader-reward-row--stacked');
  row.style.cssText =
    'display: flex; flex-direction: row; flex-wrap: nowrap; align-items: center; justify-content: center; gap: 0; min-height: 0; max-width: 100%; white-space: nowrap;';

  const stack = document.createElement('div');
  stack.className = 'artifact-trader-reward-stack';
  icons.forEach((img, i) => {
    stack.appendChild(styleTraderRewardIcon(img, i, stackTotal));
  });
  row.appendChild(stack);
  return row;
}

/**
 * Float-up reward visuals from a reward stack row (artifact trader claim, specialty milestone, etc.).
 * @param {ParentNode | null | undefined} rewardWrap
 */
export function playRewardBundleFloatAnimation(rewardWrap) {
  if (!rewardWrap) return;
  const floatTargets = rewardWrap.querySelectorAll("img:not([data-trader-reward='currency']), [data-trader-float-text]");
  floatTargets.forEach((el) => {
    const text = el.getAttribute('data-trader-float-text');
    if (text) {
      const color = el.getAttribute('data-trader-float-color') || '#FFFFFF';
      createModalFloatingText(el, text, color, 34, 1.6875, 40, 0);
      return;
    }
    if (el.tagName === 'IMG') {
      const h = Math.max(24, Math.round(el.getBoundingClientRect().height || 52));
      createModalFloatingImage(el, /** @type {HTMLImageElement} */ (el).src, h, 1.6875, 40, 0);
    }
  });
}

export { applyRewardBundleToPlayer, buildArtifactTraderRewardRow as buildRewardStackRow };

function rewardBundleVisualWidth(bundle) {
  const iconCount = countRewardBundleIcons(bundle);
  if (iconCount <= 0) return TRADER_REWARD_ICON_H_PX;
  return rewardIconsRowWidth(iconCount);
}

function computeRewardColWidth(rewardBundle) {
  const bundle = Array.isArray(rewardBundle) && rewardBundle.length
    ? rewardBundle
    : [{ type: 'upgrade_plans', count: 1 }];
  const stackW = rewardBundleVisualWidth(bundle);
  return Math.min(
    TRADER_REWARD_COL_MAX_W_PX,
    Math.ceil(Math.max(stackW + 6, TRADER_CLAIM_BTN_MIN_W_PX))
  );
}

/** Shared reward-column width for a denomination so rows line up vertically. */
function maxRewardColWidthForBundles(bundles) {
  if (!Array.isArray(bundles) || bundles.length === 0) {
    return computeRewardColWidth(null);
  }
  return Math.max(...bundles.map((b) => computeRewardColWidth(b)));
}

function createTradeRow(artifactBoxEl, artifactIds, gameState, rowOpts = {}) {
  const wantColWidth = rowOpts.wantColWidth ?? artifactBoxEl.getBoundingClientRect?.().width ?? TRADER_ARTIFACT_BOX_W_SINGLE;
  const rewardColWidth = rowOpts.rewardColWidth ?? computeRewardColWidth(rowOpts.reward);
  const colGap = rowOpts.colGap ?? TRADER_ROW_COL_GAP;
  const maxRow = rowOpts.maxRowWidth
    ?? (Math.round(wantColWidth) + TRADER_ROW_ARROW_COL_W + rewardColWidth + colGap * 2);
  const rewardBundle = rowOpts.reward;
  const key = makeTradeRowKey(artifactIds);
  const row = document.createElement('div');
  row.className = 'artifact-trader-trade-row';
  row.dataset.tradeKey = key;
  row._artifactIds = artifactIds;
  row._tradeKey = key;
  row.style.cssText = `display: grid; grid-template-columns: ${Math.round(wantColWidth)}px ${TRADER_ROW_ARROW_COL_W}px ${rewardColWidth}px; align-items: center; justify-content: start; column-gap: ${colGap}px; width: ${maxRow}px; max-width: ${maxRow}px;`;

  row.appendChild(artifactBoxEl);
  row.appendChild(createTradeArrowElement());

  const rewardCol = document.createElement('div');
  rewardCol.className = 'artifact-trader-reward-col';
  const rewardWrap = buildArtifactTraderRewardRow(
    Array.isArray(rewardBundle) && rewardBundle.length ? rewardBundle : [{ type: 'upgrade_plans', count: 1 }],
    gameState,
  );
  rewardCol.appendChild(rewardWrap);
  const tradeBtn = document.createElement('button');
  tradeBtn.type = 'button';
  tradeBtn.className = 'artifact-trader-trade-btn choice-btn cta-button cta-yellow cta-small';
  tradeBtn.textContent = 'Claim';
  tradeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (tradeBtn.disabled) return;
    // Trigger floating visuals BEFORE row state refresh/hide so anchors keep correct viewport coordinates.
    playRewardBundleFloatAnimation(rewardWrap);

    markTradeRowCompleted(gameState, key);
    applyRewardBundleToPlayer(
      gameState,
      Array.isArray(rewardBundle) && rewardBundle.length ? rewardBundle : [{ type: 'upgrade_plans', count: 1 }]
    );
    if (window.AudioManager && window.AudioManager.playSFX) {
      window.AudioManager.playSFX('purchase');
    }
    if (window.updateUI) window.updateUI();
    if (window.updateInventory) window.updateInventory();
    refresh();
  });
  rewardCol.appendChild(tradeBtn);
  const completedCheckmark = document.createElement('img');
  completedCheckmark.className = 'artifact-trader-completed-check';
  completedCheckmark.src = 'assets/images/ui/trade-checkmark.png';
  completedCheckmark.alt = 'Claimed';
  completedCheckmark.setAttribute('aria-hidden', 'true');
  completedCheckmark.style.cssText = `height: 26px; width: auto; object-fit: contain; image-rendering: crisp-edges; flex-shrink: 0; cursor: inherit; display: none;`;
  rewardCol.appendChild(completedCheckmark);
  rewardCol.style.cssText = `display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: ${TRADER_ARTIFACT_BOX_H}px; width: ${rewardColWidth}px; min-width: ${rewardColWidth}px; max-width: ${rewardColWidth}px; gap: 0;`;
  row.appendChild(rewardCol);

  const refresh = () => {
    const completed = isTradeRowCompleted(gameState, key);
    const allOwned =
      Array.isArray(artifactIds) &&
      artifactIds.length > 0 &&
      artifactIds.every((id) => playerOwnsArtifactId(gameState, id));
    const canExecuteTrade = allOwned && !completed;
    const dimFilter = TRADER_DIM_FILTER;
    const dimFilterHeavy = TRADER_DIM_FILTER_HEAVY;

    const clearPieceDim = () => {
      row.querySelectorAll('.artifact-trader-want-box img[data-artifact-id]').forEach((img) => {
        img.style.filter = '';
      });
      row.querySelectorAll('.artifact-trader-set-plus').forEach((el) => {
        el.style.filter = '';
      });
      row.querySelectorAll('.artifact-trader-trade-arrow').forEach((el) => {
        el.style.filter = '';
      });
      rewardCol.style.filter = '';
      tradeBtn.style.filter = '';
      completedCheckmark.style.filter = '';
    };

    tradeBtn.disabled = !canExecuteTrade;

    artifactBoxEl.classList.remove(
      'artifact-trader-want-box--traded',
      'artifact-trader-want-box--available',
      'artifact-trader-want-box--locked'
    );

    if (completed) {
      artifactBoxEl.classList.add('artifact-trader-want-box--traded');
      clearPieceDim();
      rewardWrap.style.display = 'none';
      tradeBtn.style.display = 'none';
      completedCheckmark.style.display = 'block';
      row.style.filter = dimFilterHeavy;
      return;
    }

    if (canExecuteTrade) {
      artifactBoxEl.classList.add('artifact-trader-want-box--available');
    } else {
      artifactBoxEl.classList.add('artifact-trader-want-box--locked');
    }

    completedCheckmark.style.display = 'none';
    rewardWrap.style.display = '';
    tradeBtn.style.display = '';

    row.style.filter = '';

    if (allOwned) {
      clearPieceDim();
      return;
    }

    row.querySelectorAll('.artifact-trader-want-box img[data-artifact-id]').forEach((img) => {
      const id = img.getAttribute('data-artifact-id');
      img.style.filter = playerOwnsArtifactId(gameState, id) ? '' : dimFilter;
    });
    row.querySelectorAll('.artifact-trader-set-plus').forEach((el) => {
      el.style.filter = dimFilter;
    });
    row.querySelectorAll('.artifact-trader-trade-arrow').forEach((el) => {
      el.style.filter = dimFilter;
    });
    rewardCol.style.filter = dimFilter;
  };
  row._refreshArtifactTraderRow = refresh;
  refresh();
  return row;
}

function createTraderColumn() {
  const col = document.createElement('div');
  col.style.cssText = 'display: flex; flex-direction: column; gap: 10px; align-items: flex-start;';
  return col;
}

function wireTraderItemTooltips(root, gameState) {
  root.querySelectorAll('img[data-artifact-id]').forEach((img) => {
    const id = img.getAttribute('data-artifact-id');
    if (!id) return;
    img.addEventListener('mouseenter', (e) => {
      const ts = gameState?.inputHandler?.tooltipSystem;
      if (!ts) return;
      const html = ts.getArtifactTooltipContentForInventory(id, gameState);
      ts.show(html, e.clientX, e.clientY);
    });
    img.addEventListener('mouseleave', () => {
      gameState?.inputHandler?.tooltipSystem?.hide();
    });
    img.addEventListener('mousemove', (e) => {
      const ts = gameState?.inputHandler?.tooltipSystem;
      if (ts?.isVisible?.()) ts.updateMousePosition(e.clientX, e.clientY);
    });
  });
}

function wireTraderRewardTooltips(root, gameState) {
  root.querySelectorAll('img[data-trader-reward]').forEach((img) => {
    img.addEventListener('mouseenter', (e) => {
      const ts = gameState?.inputHandler?.tooltipSystem;
      if (!ts) return;
      const key = img.getAttribute('data-trader-reward') || 'upgrade_plans';
      const lvl = Math.min(4, Math.max(1, Math.round(Number(img.getAttribute('data-trader-reward-level') || 1))));
      let html = '';
      if (key === 'currency') {
        const amt = Number(img.getAttribute('data-trader-currency-amount') || 0);
        html = `<div style="font-weight:bold; font-size:14px; color:#FFFFFF; margin-bottom:8px;">Currency</div><div style="font-size:14px; color:#00FF88; line-height:1.4;">$${amt > 0 ? amt : 0}</div>`;
      } else if (key === 'upgrade_plans') {
        html = ts.getLevelUpRewardTooltipContent?.({ towerType: 'upgrade_plan' }, gameState, { omitShopCost: true }) || '';
      } else if (key === 'tree_juice') {
        html = ts.getLevelUpRewardTooltipContent?.({ towerType: 'town_health' }, gameState, { omitShopCost: true }) || '';
      } else if (key === 'shield') {
        html = ts.getLevelUpRewardTooltipContent?.({ towerType: 'shield', level: lvl }, gameState, { omitShopCost: true }) || '';
      } else if (key === 'suppression_bomb') {
        html = ts.getSuppressionBombTooltipContentForInventory?.({ level: lvl }, {}) || '';
      }
      if (!html) return;
      ts.show(html, e.clientX, e.clientY);
    });
    img.addEventListener('mouseleave', () => {
      gameState?.inputHandler?.tooltipSystem?.hide();
    });
    img.addEventListener('mousemove', (e) => {
      const ts = gameState?.inputHandler?.tooltipSystem;
      if (ts?.isVisible?.()) ts.updateMousePosition(e.clientX, e.clientY);
    });
  });
}

/**
 * @param {HTMLElement} statsDiv
 * @param {ReturnType<typeof generateArtifactTraderWants>} wants
 * @param {object} gameState
 * @param {{ continueButton?: HTMLElement | null }} [opts]
 */
export function mountArtifactTraderModalBody(statsDiv, wants, gameState, opts = {}) {
  statsDiv.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'artifact-trader-body';

  const blurb = document.createElement('p');
  blurb.textContent =
    "You come across a traveling trader who seems to be inquiring about some specific artifacts, and it appears he has posted bounties for them. Claim your reward for your dilligent searching!";
  blurb.style.cssText =
    'color: #E2E8F0; font-size: 15px; line-height: 1.45; margin: 6px auto 10px; max-width: 720px; font-family: "Exo 2", sans-serif;';
  wrap.appendChild(blurb);

  const columns = document.createElement('div');
  columns.className = 'artifact-trader-columns';

  const leftCol = createTraderColumn();
  const leftSinglesMaxRewardW = maxRewardColWidthForBundles(
    wants.individuals.map((ind) => ind.reward)
  );
  wants.individuals.forEach((ind) => {
    const aid = ind.artifactId;
    const box = createArtifactWantBox(
      [aid],
      gameState,
      { direction: 'row', gap: 0 },
      TRADER_ARTIFACT_BOX_W_SINGLE,
      TRADER_ARTIFACT_BOX_H
    );
    leftCol.appendChild(
      createTradeRow(box, [aid], gameState, {
        maxRowWidth: TRADER_ARTIFACT_BOX_W_SINGLE + TRADER_ROW_ARROW_COL_W + leftSinglesMaxRewardW + TRADER_ROW_COL_GAP * 2,
        wantColWidth: TRADER_ARTIFACT_BOX_W_SINGLE,
        rewardColWidth: leftSinglesMaxRewardW,
        reward: ind.reward,
      })
    );
  });

  const rightCol = createTraderColumn();
  const rightPairsMaxRewardW = maxRewardColWidthForBundles(
    wants.pairs.map((pair) => pair.reward)
  );
  wants.pairs.forEach((pair) => {
    const box = createArtifactWantBox(
      pair.ids,
      gameState,
      { direction: 'row', gap: 4 },
      TRADER_ARTIFACT_BOX_W_PAIR,
      TRADER_ARTIFACT_BOX_H
    );
    rightCol.appendChild(
      createTradeRow(box, pair.ids, gameState, {
        maxRowWidth: TRADER_ARTIFACT_BOX_W_PAIR + TRADER_ROW_ARROW_COL_W + rightPairsMaxRewardW + TRADER_ROW_COL_GAP * 2,
        wantColWidth: TRADER_ARTIFACT_BOX_W_PAIR,
        rewardColWidth: rightPairsMaxRewardW,
        reward: pair.reward,
      })
    );
  });

  const tripleWantRows = wants.triples.filter((t) => t.ids.length < 4);
  const quadWantRows = wants.triples.filter((t) => t.ids.length >= 4);
  const rightTriplesMaxRewardW = maxRewardColWidthForBundles(
    tripleWantRows.map((triple) => triple.reward)
  );
  const rightQuadsMaxRewardW = maxRewardColWidthForBundles(
    quadWantRows.map((triple) => triple.reward)
  );
  wants.triples.forEach((triple) => {
    const n = triple.ids.length;
    const isQuad = n >= 4;
    const w = isQuad ? TRADER_ARTIFACT_BOX_W_QUAD : TRADER_ARTIFACT_BOX_W_TRIPLE;
    const rewardW = isQuad ? rightQuadsMaxRewardW : rightTriplesMaxRewardW;
    const box = createArtifactWantBox(
      triple.ids,
      gameState,
      { direction: 'row', gap: 4 },
      w,
      TRADER_ARTIFACT_BOX_H
    );
    rightCol.appendChild(
      createTradeRow(box, triple.ids, gameState, {
        maxRowWidth: w + TRADER_ROW_ARROW_COL_W + rewardW + TRADER_ROW_COL_GAP * 2,
        wantColWidth: w,
        rewardColWidth: rewardW,
        reward: triple.reward,
      })
    );
  });

  columns.appendChild(leftCol);
  columns.appendChild(rightCol);
  const columnsScroll = document.createElement('div');
  columnsScroll.className = 'artifact-trader-columns-scroll';
  columnsScroll.appendChild(columns);
  wrap.appendChild(columnsScroll);

  const btn = opts.continueButton;
  if (btn) {
    const btnWrap = document.createElement('div');
    btnWrap.className = 'artifact-trader-continue-wrap';
    btnWrap.appendChild(btn);
    wrap.appendChild(btnWrap);
  }

  statsDiv.appendChild(wrap);
  wireTraderItemTooltips(wrap, gameState);
  wireTraderRewardTooltips(wrap, gameState);
}
