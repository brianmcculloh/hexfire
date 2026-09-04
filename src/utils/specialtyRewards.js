// Specialty path milestone rewards (after levels III, V, and VII)

import { CONFIG, applyCurrencyGainBonuses } from '../config.js';
import {
  applyRewardBundleToPlayer,
  buildRewardStackRow,
  playRewardBundleFloatAnimation,
} from './artifactTrader.js';
import { isMetaItemUnlocked } from './metaProgression.js';
import { rngLoot } from './rng.js';

/** @typedef {'time'|'power'|'money'|'health'} SpecialtyId */

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const POWER_MILESTONE_MAX_UNIQUE = 4;

/** @returns {number[]} */
export function getSpecialtyMilestoneLevels() {
  const raw = CONFIG.SPECIALTY_MILESTONE_LEVELS;
  if (Array.isArray(raw) && raw.length) {
    return raw.map((n) => Math.max(1, Math.floor(Number(n) || 0))).filter((n) => n > 0);
  }
  return [3, 5, 7];
}

/** @param {number} level */
export function isSpecialtyMilestoneLevel(level) {
  return getSpecialtyMilestoneLevels().includes(Math.floor(Number(level) || 0));
}

function collapsePowerMilestonePowerUps(ids) {
  const order = [];
  const counts = new Map();
  for (const id of Array.isArray(ids) ? ids : []) {
    if (!id) continue;
    if (!counts.has(id)) {
      if (order.length >= POWER_MILESTONE_MAX_UNIQUE) continue;
      counts.set(id, 0);
      order.push(id);
    }
    counts.set(id, counts.get(id) + 1);
  }
  return order.map((powerUpId) => ({
    type: 'permanent_power_up',
    powerUpId,
    count: counts.get(powerUpId),
  }));
}

/**
 * Permanent power-ups eligible for Power-path milestone rewards (meta-unlocked only).
 * @param {import('../main.js').GameState | null | undefined} gameState
 * @returns {string[]}
 */
function getPowerMilestonePowerUpPool(gameState) {
  return Object.keys(CONFIG.POWER_UPS || {}).filter((id) => isMetaItemUnlocked(gameState, id));
}

function pickPowerMilestonePowerUps(pool, count) {
  const picks = [];
  const uniques = [];
  while (picks.length < count) {
    const source = uniques.length >= POWER_MILESTONE_MAX_UNIQUE ? uniques : pool;
    if (!source.length) break;
    const id = rngLoot().pick(source);
    picks.push(id);
    if (!uniques.includes(id)) uniques.push(id);
  }
  return picks;
}

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 * @param {number} milestoneLevel
 * @param {number} count
 */
function ensurePowerMilestonePicksForLevel(gameState, milestoneLevel, count) {
  if (!gameState?.player) return;
  const key = String(milestoneLevel);
  if (!gameState.player.specialtyPowerMilestonePowerUps
    || typeof gameState.player.specialtyPowerMilestonePowerUps !== 'object') {
    gameState.player.specialtyPowerMilestonePowerUps = {};
  }
  const store = gameState.player.specialtyPowerMilestonePowerUps;
  const pool = getPowerMilestonePowerUpPool(gameState);
  if (pool.length === 0) {
    store[key] = [];
    return;
  }
  const poolSet = new Set(pool);
  const existing = store[key];
  const existingOk =
    Array.isArray(existing) &&
    existing.length === count &&
    existing.every((id) => poolSet.has(id)) &&
    new Set(existing).size <= POWER_MILESTONE_MAX_UNIQUE;
  if (existingOk) return;
  store[key] = pickPowerMilestonePowerUps(pool, count);
}

/**
 * Pick and persist random permanent power-ups for Power-path milestones (once per run per tier).
 * @param {import('../main.js').GameState | null | undefined} gameState
 */
export function ensureSpecialtyMilestoneRewards(gameState) {
  if (!gameState?.player) return;
  // Legacy Time-path power-up rolls are unused under the new reward layout.
  if (gameState.player.specialtyTimeMilestonePowerUps != null) {
    gameState.player.specialtyTimeMilestonePowerUps = null;
  }
  const powerCfg = CONFIG.SPECIALTY_MILESTONE_REWARDS?.power || {};
  for (const level of getSpecialtyMilestoneLevels()) {
    const count = Math.max(0, Math.floor(Number(powerCfg[level]?.permanentPowerUpCount) || 0));
    if (count > 0) ensurePowerMilestonePicksForLevel(gameState, level, count);
  }
}

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 * @param {SpecialtyId} specialtyId
 * @param {number} milestoneLevel
 * @returns {object[]}
 */
export function getSpecialtyMilestoneRewardBundle(gameState, specialtyId, milestoneLevel) {
  ensureSpecialtyMilestoneRewards(gameState);
  const level = Math.floor(Number(milestoneLevel) || 0);
  const cfg = CONFIG.SPECIALTY_MILESTONE_REWARDS?.[specialtyId]?.[level];
  if (!cfg) return [];

  /** @type {object[]} */
  const bundle = [];

  if (specialtyId === 'time') {
    const n = Math.max(0, Math.floor(Number(cfg.upgradePlans) || 0));
    if (n > 0) bundle.push({ type: 'upgrade_plans', count: n });
  } else if (specialtyId === 'power') {
    const count = Math.max(0, Math.floor(Number(cfg.permanentPowerUpCount) || 0));
    const ids = gameState?.player?.specialtyPowerMilestonePowerUps?.[String(level)] || [];
    if (count > 0) bundle.push(...collapsePowerMilestonePowerUps(ids));
  } else if (specialtyId === 'money') {
    const amt = Math.max(0, Math.floor(Number(cfg.currency) || 0));
    if (amt > 0) bundle.push({ type: 'currency', amount: amt, count: 1 });
  } else if (specialtyId === 'health') {
    const n = Math.max(0, Math.floor(Number(cfg.treeJuice) || 0));
    if (n > 0) bundle.push({ type: 'tree_juice', count: n });
  }

  const passes = Array.isArray(cfg.passes) ? cfg.passes : [];
  for (const passId of passes) {
    if (passId) bundle.push({ type: passId, count: 1 });
  }
  return bundle;
}

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 * @param {SpecialtyId} specialtyId
 * @param {number} milestoneLevel
 * @returns {string}
 */
export function getSpecialtyMilestoneDescription(gameState, specialtyId, milestoneLevel) {
  ensureSpecialtyMilestoneRewards(gameState);
  const level = Math.floor(Number(milestoneLevel) || 0);
  const cfg = CONFIG.SPECIALTY_MILESTONE_REWARDS?.[specialtyId]?.[level];
  if (!cfg) return '';

  /** @type {string[]} */
  const parts = [];

  if (specialtyId === 'time') {
    const n = Math.max(0, Math.floor(Number(cfg.upgradePlans) || 0));
    if (n > 0) parts.push(`${n} upgrade plan${n === 1 ? '' : 's'}`);
  } else if (specialtyId === 'power') {
    const count = Math.max(0, Math.floor(Number(cfg.permanentPowerUpCount) || 0));
    const ids = gameState?.player?.specialtyPowerMilestonePowerUps?.[String(level)] || [];
    const rolled = collapsePowerMilestonePowerUps(ids);
    const names = rolled
      .map((part) => {
        const name = CONFIG.POWER_UPS?.[part.powerUpId]?.name || part.powerUpId;
        const n = Math.max(1, Math.floor(Number(part.count) || 1));
        return `${name} x${n}`;
      })
      .filter(Boolean);
    if (names.length > 0) parts.push(`${count} permanent power-up${count === 1 ? '' : 's'}: ${names.join(', ')}`);
    else if (count > 0) parts.push(`${count} random permanent power-up${count === 1 ? '' : 's'}`);
  } else if (specialtyId === 'money') {
    const baseAmt = Math.max(0, Math.floor(Number(cfg.currency) || 0));
    if (baseAmt > 0) {
      const amt = applyCurrencyGainBonuses(baseAmt, gameState);
      parts.push(`$${amt.toLocaleString()}`);
    }
  } else if (specialtyId === 'health') {
    const n = Math.max(0, Math.floor(Number(cfg.treeJuice) || 0));
    if (n > 0) parts.push(`${n} tree juice${n === 1 ? '' : 's'}`);
  }

  const passes = Array.isArray(cfg.passes) ? cfg.passes : [];
  for (const passId of passes) {
    const name = CONFIG.SHOP_PRICE_PASSES?.[passId]?.name || passId;
    if (name) parts.push(name);
  }

  if (parts.length === 0) return '';
  if (parts.length === 1) return `${parts[0]}.`;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}.`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}.`;
}

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 * @param {SpecialtyId} specialtyId
 * @param {number} milestoneLevel
 * @returns {string}
 */
export function getSpecialtyMilestoneTooltipHtml(gameState, specialtyId, milestoneLevel) {
  const spec = CONFIG.SPECIALTIES?.[specialtyId];
  const name = spec?.name || specialtyId;
  const level = Math.floor(Number(milestoneLevel) || 0);
  const def = spec?.levels?.find((l) => l.level === level);
  const roman = def?.roman || String(level);
  const reward = getSpecialtyMilestoneDescription(gameState, specialtyId, level);
  const current = gameState?.player?.specialties?.[specialtyId] ?? 0;
  const status = current >= level
    ? 'Reward claimed.'
    : `Complete level ${roman} to claim this reward.`;
  return `
    <div style="font-weight: bold; color: #FFFFFF; margin-bottom: 6px; font-size: 14px;">${escapeHtml(name)} — Level ${escapeHtml(roman)} Reward</div>
    <div style="color: #FFFFFF; font-size: 13px; line-height: 1.45; margin-bottom: 8px;">${escapeHtml(reward)}</div>
    <div style="font-size: 11px; color: #AAAAAA; margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">${escapeHtml(status)}</div>
  `;
}

const MILESTONE_OVERLAP_PX = 18;
const MILESTONE_WRAP_AT = 0;

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 * @param {SpecialtyId} specialtyId
 * @param {number} milestoneLevel
 * @returns {HTMLElement}
 */
export function buildSpecialtyMilestonePreview(gameState, specialtyId, milestoneLevel) {
  const wrap = document.createElement('div');
  wrap.className = 'specialty-milestone-preview';
  const level = Math.floor(Number(milestoneLevel) || 0);
  const bundle = getSpecialtyMilestoneRewardBundle(gameState, specialtyId, level);

  if (specialtyId === 'money') {
    const currencyPart = bundle.find((p) => p.type === 'currency');
    const baseAmt = currencyPart?.amount ?? CONFIG.SPECIALTY_MILESTONE_REWARDS?.money?.[level]?.currency ?? 0;
    const amt = applyCurrencyGainBonuses(baseAmt, gameState);
    const moneyWrap = document.createElement('div');
    moneyWrap.className = 'specialty-milestone-money artifact-trader-reward-unit';
    const icon = document.createElement('img');
    icon.src = 'assets/images/items/currency.png';
    icon.alt = 'Currency';
    icon.className = 'specialty-milestone-money-icon collectible-sprite-smooth';
    icon.dataset.traderReward = 'currency';
    icon.dataset.traderFloatText = `+$${amt}`;
    icon.dataset.traderFloatColor = '#00FF88';
    const amountEl = document.createElement('div');
    amountEl.className = 'specialty-milestone-money-amount';
    amountEl.textContent = `$${Number(amt).toLocaleString()}`;
    moneyWrap.appendChild(icon);
    moneyWrap.appendChild(amountEl);

    const passParts = bundle.filter((p) => p.type !== 'currency');
    if (passParts.length) {
      const row = buildRewardStackRow(passParts, gameState, { overlapPx: MILESTONE_OVERLAP_PX });
      row.classList.add('specialty-milestone-reward-row');
      const stack = row.querySelector('.artifact-trader-reward-stack');
      if (stack) {
        const units = [...stack.children];
        stack.insertBefore(moneyWrap, stack.firstChild);
        units.forEach((unit, i) => {
          unit.style.marginLeft = `-${MILESTONE_OVERLAP_PX}px`;
          unit.style.position = 'relative';
          unit.style.zIndex = String(i + 2);
        });
      } else {
        wrap.appendChild(moneyWrap);
      }
      wrap.appendChild(row);
    } else {
      wrap.appendChild(moneyWrap);
    }
    return wrap;
  }

  const row = buildRewardStackRow(bundle, gameState, {
    wrapAt: MILESTONE_WRAP_AT,
    overlapPx: MILESTONE_OVERLAP_PX,
    alwaysShowCount: specialtyId === 'power',
  });
  row.classList.add('specialty-milestone-reward-row');
  wrap.appendChild(row);
  return wrap;
}

/**
 * Apply a specialty milestone reward with trader-style float animation and SFX.
 * @param {import('../main.js').GameState | null | undefined} gameState
 * @param {SpecialtyId} specialtyId
 * @param {number} milestoneLevel
 * @param {HTMLElement | null | undefined} milestoneCardEl
 */
export function grantSpecialtyMilestoneReward(gameState, specialtyId, milestoneLevel, milestoneCardEl) {
  if (!gameState?.player) return;
  const level = Math.floor(Number(milestoneLevel) || 0);
  const bundle = getSpecialtyMilestoneRewardBundle(gameState, specialtyId, level);
  if (!bundle.length) return;

  const preview = milestoneCardEl?.querySelector('.specialty-milestone-preview');

  for (const part of bundle) {
    if (part.type !== 'currency') continue;
    const baseAmt = Math.max(0, Math.floor(Number(part.amount) || 0))
      * Math.max(1, Math.floor(Number(part.count) || 1));
    if (baseAmt <= 0) continue;
    const granted = applyCurrencyGainBonuses(baseAmt, gameState);
    const floatText = `+$${granted}`;
    const root = preview || milestoneCardEl;
    root?.querySelectorAll('[data-trader-reward="currency"]').forEach((el) => {
      el.dataset.traderFloatText = floatText;
      el.dataset.traderCurrencyAmount = String(granted);
    });
    root?.querySelectorAll('.specialty-milestone-money-amount').forEach((el) => {
      el.textContent = `$${granted.toLocaleString()}`;
    });
  }

  playRewardBundleFloatAnimation(preview || milestoneCardEl);
  applyRewardBundleToPlayer(gameState, bundle);

  if (typeof window !== 'undefined' && window.AudioManager?.playSFX) {
    window.AudioManager.playSFX('purchase');
    window.AudioManager.playSFX('mastery');
  }
  if (window.updatePowerUpPanel) window.updatePowerUpPanel();
  if (window.updateTempPowerUpPanel) window.updateTempPowerUpPanel();
  if (window.updateBottomEdgePowerUps) window.updateBottomEdgePowerUps();
  if (window.updateUI) window.updateUI();
  if (window.updateInventory) window.updateInventory();
}
