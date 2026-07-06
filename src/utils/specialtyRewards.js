// Specialty path mastery rewards (level V milestone bonuses)

import { CONFIG, applyCurrencyGainBonuses } from '../config.js';
import {
  applyRewardBundleToPlayer,
  buildRewardStackRow,
  playRewardBundleFloatAnimation,
} from './artifactTrader.js';

/** @typedef {'time'|'power'|'money'|'health'} SpecialtyId */

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getTimeMilestonePowerUpCount() {
  return Math.max(1, Math.floor(Number(CONFIG.SPECIALTY_MILESTONE_REWARDS?.time?.permanentPowerUpCount) || 5));
}

/**
 * Pick and persist random permanent power-ups for the Time mastery reward (once per run; repeats allowed).
 * @param {import('../main.js').GameState | null | undefined} gameState
 */
export function ensureSpecialtyMilestoneRewards(gameState) {
  if (!gameState?.player) return;
  const count = getTimeMilestonePowerUpCount();
  const existing = gameState.player.specialtyTimeMilestonePowerUps;
  if (Array.isArray(existing) && existing.length === count) return;

  const pool = Object.keys(CONFIG.POWER_UPS || {});
  if (pool.length === 0) {
    gameState.player.specialtyTimeMilestonePowerUps = [];
    return;
  }

  const picks = Array.isArray(existing) ? [...existing] : [];
  while (picks.length < count) {
    picks.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  gameState.player.specialtyTimeMilestonePowerUps = picks.slice(0, count);
}

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 * @param {SpecialtyId} specialtyId
 * @returns {object[]}
 */
export function getSpecialtyMilestoneRewardBundle(gameState, specialtyId) {
  ensureSpecialtyMilestoneRewards(gameState);
  const cfg = CONFIG.SPECIALTY_MILESTONE_REWARDS?.[specialtyId];
  if (!cfg) return [];

  if (specialtyId === 'time') {
    const ids = gameState?.player?.specialtyTimeMilestonePowerUps || [];
    return ids.map((powerUpId) => ({ type: 'permanent_power_up', powerUpId, count: 1 }));
  }
  if (specialtyId === 'power') {
    const n = Math.max(1, Math.floor(Number(cfg.upgradePlans) || 4));
    return [{ type: 'upgrade_plans', count: n }];
  }
  if (specialtyId === 'money') {
    const amt = Math.max(0, Math.floor(Number(cfg.currency) || 15000));
    return [{ type: 'currency', amount: amt, count: 1 }];
  }
  if (specialtyId === 'health') {
    const n = Math.max(1, Math.floor(Number(cfg.treeJuice) || 6));
    return [{ type: 'tree_juice', count: n }];
  }
  return [];
}

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 * @param {SpecialtyId} specialtyId
 * @returns {string}
 */
export function getSpecialtyMilestoneDescription(gameState, specialtyId) {
  ensureSpecialtyMilestoneRewards(gameState);
  if (specialtyId === 'time') {
    const count = getTimeMilestonePowerUpCount();
    const ids = gameState?.player?.specialtyTimeMilestonePowerUps || [];
    const names = ids
      .map((id) => CONFIG.POWER_UPS?.[id]?.name || id)
      .filter(Boolean);
    if (names.length === 0) return `${count} random permanent power-ups.`;
    return `${count} permanent power-ups: ${names.join(', ')}.`;
  }
  if (specialtyId === 'power') {
    const n = CONFIG.SPECIALTY_MILESTONE_REWARDS?.power?.upgradePlans ?? 7;
    return `${n} upgrade plans.`;
  }
  if (specialtyId === 'money') {
    const baseAmt = CONFIG.SPECIALTY_MILESTONE_REWARDS?.money?.currency ?? 15000;
    const amt = applyCurrencyGainBonuses(baseAmt, gameState);
    return `$${amt.toLocaleString()}.`;
  }
  if (specialtyId === 'health') {
    const n = CONFIG.SPECIALTY_MILESTONE_REWARDS?.health?.treeJuice ?? 10;
    return `${n} tree juices.`;
  }
  return '';
}

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 * @param {SpecialtyId} specialtyId
 * @returns {string}
 */
export function getSpecialtyMilestoneTooltipHtml(gameState, specialtyId) {
  const spec = CONFIG.SPECIALTIES?.[specialtyId];
  const name = spec?.name || specialtyId;
  const reward = getSpecialtyMilestoneDescription(gameState, specialtyId);
  const level = gameState?.player?.specialties?.[specialtyId] ?? 0;
  const status = level >= 5
    ? 'Mastery reward claimed.'
    : 'Complete level V to claim this mastery reward.';
  return `
    <div style="font-weight: bold; color: #FFFFFF; margin-bottom: 6px; font-size: 14px;">${escapeHtml(name)} — Mastery</div>
    <div style="color: #FFFFFF; font-size: 13px; line-height: 1.45; margin-bottom: 8px;">${escapeHtml(reward)}</div>
    <div style="font-size: 11px; color: #AAAAAA; margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">${escapeHtml(status)}</div>
  `;
}

const MILESTONE_STAGGERED_ROW_SIZE = 5;
const MILESTONE_STAGGERED_ICON_OVERLAP_PX = 7.5;

/**
 * @param {HTMLElement} parent
 * @param {number} count
 * @param {() => HTMLImageElement} createIcon
 */
function appendMilestoneRewardStack(parent, count, createIcon) {
  const stack = document.createElement('div');
  stack.className = 'artifact-trader-reward-stack';
  for (let i = 0; i < count; i++) {
    const img = createIcon();
    if (count >= 2 && i > 0) {
      img.style.marginLeft = `-${MILESTONE_STAGGERED_ICON_OVERLAP_PX}px`;
      img.style.position = 'relative';
      img.style.zIndex = String(i);
    }
    stack.appendChild(img);
  }
  parent.appendChild(stack);
}

function createTreeJuiceRewardIcon() {
  const img = document.createElement('img');
  img.src = 'assets/images/items/town_defense.png';
  img.alt = 'Tree juice';
  img.className = 'collectible-sprite-smooth';
  img.dataset.traderReward = 'tree_juice';
  return img;
}

function createUpgradePlanRewardIcon() {
  const img = document.createElement('img');
  img.src = 'assets/images/items/upgrade_token.png';
  img.alt = 'Upgrade plans';
  img.className = 'collectible-sprite-smooth';
  img.dataset.traderReward = 'upgrade_plans';
  return img;
}

/**
 * @param {number} total
 * @param {() => HTMLImageElement} createIcon
 * @param {{ row1Size?: number }} [options]
 * @returns {HTMLElement}
 */
function buildStaggeredMilestoneRewardPreview(total, createIcon, options = {}) {
  const count = Math.max(1, Math.floor(Number(total) || 1));
  const row1Size = Math.max(1, Math.floor(Number(options.row1Size) || MILESTONE_STAGGERED_ROW_SIZE));
  const row1Count = Math.min(row1Size, count);
  const row2Count = Math.max(0, count - row1Count);

  const grid = document.createElement('div');
  grid.className = 'specialty-milestone-staggered-grid';

  const inner = document.createElement('div');
  inner.className = 'specialty-milestone-staggered-inner';

  const row1 = document.createElement('div');
  row1.className = 'specialty-milestone-reward-row specialty-milestone-staggered-row specialty-milestone-staggered-row--back';
  appendMilestoneRewardStack(row1, row1Count, createIcon);
  inner.appendChild(row1);

  if (row2Count > 0) {
    const row2 = document.createElement('div');
    row2.className = 'specialty-milestone-reward-row specialty-milestone-staggered-row specialty-milestone-staggered-row--front';
    appendMilestoneRewardStack(row2, row2Count, createIcon);
    inner.appendChild(row2);
  }

  grid.appendChild(inner);
  return grid;
}

function buildHealthMilestoneTreeJuicePreview(gameState) {
  const total = Math.max(1, Math.floor(Number(CONFIG.SPECIALTY_MILESTONE_REWARDS?.health?.treeJuice) || 10));
  return buildStaggeredMilestoneRewardPreview(total, createTreeJuiceRewardIcon);
}

function buildPowerMilestoneUpgradePlansPreview(gameState) {
  const total = Math.max(1, Math.floor(Number(CONFIG.SPECIALTY_MILESTONE_REWARDS?.power?.upgradePlans) || 7));
  return buildStaggeredMilestoneRewardPreview(total, createUpgradePlanRewardIcon, { row1Size: 4 });
}

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 * @param {SpecialtyId} specialtyId
 * @returns {HTMLElement}
 */
export function buildSpecialtyMilestonePreview(gameState, specialtyId) {
  const wrap = document.createElement('div');
  wrap.className = 'specialty-milestone-preview';

  if (specialtyId === 'money') {
    const bundle = getSpecialtyMilestoneRewardBundle(gameState, specialtyId);
    const baseAmt = bundle[0]?.amount ?? CONFIG.SPECIALTY_MILESTONE_REWARDS?.money?.currency ?? 15000;
    const amt = applyCurrencyGainBonuses(baseAmt, gameState);
    const moneyWrap = document.createElement('div');
    moneyWrap.className = 'specialty-milestone-money';
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
    wrap.appendChild(moneyWrap);
    return wrap;
  }

  if (specialtyId === 'health') {
    wrap.appendChild(buildHealthMilestoneTreeJuicePreview(gameState));
    return wrap;
  }

  if (specialtyId === 'power') {
    wrap.appendChild(buildPowerMilestoneUpgradePlansPreview(gameState));
    return wrap;
  }

  const bundle = getSpecialtyMilestoneRewardBundle(gameState, specialtyId);
  const row = buildRewardStackRow(bundle, gameState);
  row.classList.add('specialty-milestone-reward-row');
  wrap.appendChild(row);
  return wrap;
}

/**
 * Apply mastery rewards with artifact-trader-style float animation and SFX.
 * @param {import('../main.js').GameState | null | undefined} gameState
 * @param {SpecialtyId} specialtyId
 * @param {HTMLElement | null | undefined} milestoneCardEl
 */
export function grantSpecialtyMilestoneReward(gameState, specialtyId, milestoneCardEl) {
  if (!gameState?.player) return;
  const bundle = getSpecialtyMilestoneRewardBundle(gameState, specialtyId);
  if (!bundle.length) return;

  const preview = milestoneCardEl?.querySelector('.specialty-milestone-preview');

  // Preview DOM may still show pre-level-V currency amounts; sync float text before animation.
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
