// Supercharger picker — spend tokens to permanently boost a tower type's upgrade tracks

import {
  CONFIG,
  getTowerDisplayName,
  getTowerUnlockStatus,
  getPlayerLevel,
  getSuperchargerCount,
  getSuperchargerTokenCost,
  getSuperchargeOptionsForTower,
  getSuperchargeAttributeDef,
  isTowerAttrSupercharged,
  getTowerSuperchargedAttrs,
  applyTowerSupercharge,
  getTowerRange,
  getSpreadTowerRange,
  getRainRange,
  getTowerPower,
  getSpreadTowerPower,
  getRainPower,
  getPulsingPower,
  getPulsingAttackInterval,
  getBomberAttackInterval,
  getSentinelPower,
  getSentinelAttackInterval,
  getPerimeterPower,
  getChargePerHexPower,
  getChargeAttackInterval,
  getEffectiveDurationTowerAttackIntervalWithHeroPower,
  getEffectivePerimeterAttackInterval,
  formatWaterDamageRate,
  formatDisplayHundredths,
  formatEveryInterval,
  getPowerUpMultiplier,
  getHeroPowerJetMultiplier,
  getHeroPowerSpreadMultiplier,
  getHeroPowerRainTowerMultiplier,
  getHeroPowerBomberDamageMultiplier,
  getHeroPowerPulsingTowerMultiplier,
  getHeroPowerPerimeterTowerMultiplier,
  getHeroPowerChargeTowerMultiplier,
  getBomberImpactZone,
  TOWER_UPGRADE_BASE_MAX_LEVEL,
  TOWER_UPGRADE_SUPERCHARGE_MAX_LEVEL,
  getUpgradePlanCostForStep,
} from '../config.js';
import { isMetaItemUnlocked } from './metaProgression.js';
import { closeModalOverlay, playModalEnterAnimation, showConfirmModal } from './modal.js';
import { getTowerRangeHexBonusForGameState, getTempPowerUpTimeReference } from './tempPowerUpClock.js';
import { assetUrl } from './assetUrl.js';

const MAX_LEVEL = TOWER_UPGRADE_BASE_MAX_LEVEL;
const SUPER_LEVEL = TOWER_UPGRADE_SUPERCHARGE_MAX_LEVEL;
const CHARGE_STATS_MODE = CONFIG.CHARGE_MODE_BALANCED;

const TOWER_TYPES_BY_COST = [
  'jet',
  'spread',
  'rain',
  'pulsing',
  'perimeter',
  'bomber',
  'charge',
  'sentinel',
];

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pluralizeTowerDisplayName(name) {
  if (!name) return 'Towers';
  if (name.endsWith(' Tower')) return `${name}s`;
  if (name.endsWith('Tower')) return `${name}s`;
  return `${name}s`;
}

function isTowerFullyUnlocked(gameState, towerType) {
  if (!isMetaItemUnlocked(gameState, towerType)) return false;
  const playerLevel = gameState?.player?.level ?? getPlayerLevel(gameState?.player?.xp ?? 0);
  return getTowerUnlockStatus(towerType, playerLevel, null, false).unlocked;
}

function getSuperchargerSpriteUrl() {
  return assetUrl(`assets/images/items/${CONFIG.TOWER_SUPERCHARGE?.sprite || 'supercharger.png'}`);
}

function updateSuperchargerBadge(gameState) {
  const badge = document.getElementById('superchargerTokenBadge');
  const icon = document.querySelector('#superchargeModal .specialty-plans-icon');
  if (icon) icon.src = getSuperchargerSpriteUrl();
  if (!badge) return;
  const count = getSuperchargerCount(gameState);
  badge.textContent = count > 0 ? `×${count}` : '';
  badge.hidden = count <= 0;
}

function isTowerFullySupercharged(gameState, towerType) {
  const options = getSuperchargeOptionsForTower(towerType);
  if (!options.length) return true;
  return options.every((id) => isTowerAttrSupercharged(gameState, towerType, id));
}

function structureSuperchargeVitalsRows(root) {
  const details = root.querySelector('.tower-tooltip-details');
  if (!details) return;
  for (const row of details.children) {
    if (row.querySelector('.supercharge-stat-label')) continue;
    const first = row.firstChild;
    if (first && first.nodeType === Node.TEXT_NODE) {
      const label = document.createElement('span');
      label.className = 'supercharge-stat-label';
      label.textContent = first.textContent.trim();
      row.replaceChild(label, first);
    }
    const boltSpan = [...row.children].find((el) => el.tagName === 'SPAN' && !el.classList.contains('supercharge-stat-label'));
    if (boltSpan) {
      boltSpan.classList.add('supercharge-stat-bolts');
      const valueSpan = boltSpan.nextElementSibling;
      if (valueSpan && valueSpan.tagName === 'SPAN') {
        valueSpan.classList.add('supercharge-stat-value');
      }
    }
    if (!row.querySelector('.supercharge-track-slot')) {
      const slot = document.createElement('span');
      slot.className = 'supercharge-track-slot';
      row.appendChild(slot);
    }
    if (!row.querySelector('.supercharge-stat-metrics')) {
      const metrics = document.createElement('span');
      metrics.className = 'supercharge-stat-metrics';
      const bolts = row.querySelector('.supercharge-stat-bolts');
      const value = row.querySelector('.supercharge-stat-value');
      const slot = row.querySelector('.supercharge-track-slot');
      if (bolts) metrics.appendChild(bolts);
      if (value) metrics.appendChild(value);
      if (slot) metrics.appendChild(slot);
      row.appendChild(metrics);
    }
  }
}

function appendTrackSuperchargerIcons(root, chargedAttrs) {
  if (!root || !chargedAttrs?.length) return;
  const details = root.querySelector('.tower-tooltip-details');
  if (!details) return;
  for (const row of details.children) {
    const text = (row.textContent || '').trim();
    let attrId = null;
    if (text.startsWith('Range:')) attrId = 'range';
    else if (text.startsWith('Speed:')) attrId = 'speed';
    else if (text.startsWith('Impact:')) attrId = 'power';
    else if (text.startsWith('Power:')) attrId = 'power';
    if (!attrId || !chargedAttrs.includes(attrId)) continue;
    const img = document.createElement('img');
    img.src = getSuperchargerSpriteUrl();
    img.className = 'supercharge-track-badge';
    img.alt = '';
    const slot = row.querySelector('.supercharge-track-slot');
    if (slot) slot.appendChild(img);
    else row.appendChild(img);
  }
}

function getTowerVitalsHtml(gameState, towerType) {
  const tooltipSystem = gameState?.inputHandler?.tooltipSystem;
  if (!tooltipSystem?.getTowerTooltipContentForInventory) return '';
  const chargedAttrs = getTowerSuperchargedAttrs(gameState, towerType);
  const rangeCharged = chargedAttrs.includes('range') || chargedAttrs.includes('speed');
  const powerCharged = chargedAttrs.includes('power');
  return tooltipSystem.getTowerTooltipContentForInventory(
    {
      type: towerType,
      rangeLevel: rangeCharged ? SUPER_LEVEL : MAX_LEVEL,
      powerLevel: powerCharged ? SUPER_LEVEL : MAX_LEVEL,
    },
    gameState,
    { vitalsOnly: true }
  );
}

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 */
export function renderSuperchargeModal(gameState) {
  const list = document.getElementById('superchargeTowerList');
  if (!list) return;

  const gs = gameState || (typeof window !== 'undefined' ? window.gameState : null);
  updateSuperchargerBadge(gs);

  const unlockedTypes = TOWER_TYPES_BY_COST.filter((type) => isTowerFullyUnlocked(gs, type));

  list.replaceChildren();

  if (!unlockedTypes.length) {
    const empty = document.createElement('div');
    empty.className = 'supercharge-empty';
    empty.textContent = 'Unlock a tower type to supercharge it.';
    list.appendChild(empty);
    return;
  }

  for (const towerType of unlockedTypes) {
    const chargedAttrs = getTowerSuperchargedAttrs(gs, towerType);
    const name = getTowerDisplayName(towerType) || 'Tower';
    const pluralName = pluralizeTowerDisplayName(name);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'tower-stats-row supercharge-tower-card';
    if (chargedAttrs.length) {
      row.classList.add('supercharge-tower-card--active');
    }
    row.dataset.towerType = towerType;

    const vitals = document.createElement('div');
    vitals.className = 'supercharge-tower-vitals';
    vitals.innerHTML = getTowerVitalsHtml(gs, towerType);
    structureSuperchargeVitalsRows(vitals);
    appendTrackSuperchargerIcons(vitals, chargedAttrs);

    row.appendChild(vitals);

    const fullySupercharged = isTowerFullySupercharged(gs, towerType);
    bindSuperchargeCardTooltip(row, gs, fullySupercharged);

    if (fullySupercharged) {
      row.classList.add('supercharge-tower-card--maxed');
      row.setAttribute('aria-label', `${pluralName} fully supercharged`);
    } else {
      row.setAttribute('aria-label', `Supercharge ${pluralName}`);
    }
    row.addEventListener('click', () => {
      gs?.inputHandler?.tooltipSystem?.hide?.();
      openSuperchargeOptionsModal(gs, towerType);
    });
    list.appendChild(row);
  }
}

function bindHoverTooltip(el, gameState, text) {
  if (!el || text == null || text === '') return;
  const html = `<div style="color: #FFFFFF; font-size: 13px; line-height: 1.5;">${escapeHtml(text)}</div>`;
  el.addEventListener('mouseenter', (e) => {
    const tooltipSystem = gameState?.inputHandler?.tooltipSystem
      || (typeof window !== 'undefined' ? window.gameState?.inputHandler?.tooltipSystem : null);
    tooltipSystem?.show?.(html, e.clientX, e.clientY);
  });
  el.addEventListener('mouseleave', () => {
    const tooltipSystem = gameState?.inputHandler?.tooltipSystem
      || (typeof window !== 'undefined' ? window.gameState?.inputHandler?.tooltipSystem : null);
    tooltipSystem?.hide?.();
  });
  el.addEventListener('mousemove', (e) => {
    const tooltipSystem = gameState?.inputHandler?.tooltipSystem
      || (typeof window !== 'undefined' ? window.gameState?.inputHandler?.tooltipSystem : null);
    if (tooltipSystem?.currentContent) tooltipSystem.updateMousePosition(e.clientX, e.clientY);
  });
}

function bindSuperchargeCardTooltip(el, gameState, fullySupercharged = false) {
  bindHoverTooltip(
    el,
    gameState,
    fullySupercharged
      ? 'Tower type fully Supercharged'
      : 'Click to Supercharge this tower type'
  );
}

function getRangePreview(gameState, towerType) {
  const tempBonus = getTowerRangeHexBonusForGameState(
    gameState,
    typeof window !== 'undefined' ? window.gameLoop : null
  );
  let unit = 'hexes';
  let currentBase = 0;
  let nextBase = 0;
  if (towerType === 'rain') {
    currentBase = getRainRange(MAX_LEVEL);
    nextBase = getRainRange(SUPER_LEVEL);
    unit = 'hex rings';
  } else if (towerType === 'spread') {
    currentBase = getSpreadTowerRange(MAX_LEVEL);
    nextBase = getSpreadTowerRange(SUPER_LEVEL);
  } else {
    currentBase = getTowerRange(MAX_LEVEL);
    nextBase = getTowerRange(SUPER_LEVEL);
  }
  const current = currentBase + tempBonus;
  const next = nextBase + tempBonus;
  const fmt = (n) => `${formatDisplayHundredths(n)} ${n === 1 ? unit.replace(/s$/, '') : unit}`;
  return { currentText: fmt(current), nextText: fmt(next) };
}

function getPowerPreview(gameState, towerType) {
  const powerUps = gameState?.player?.powerUps || {};
  const tempPowerUps = gameState?.player?.tempPowerUps || [];
  const water = getPowerUpMultiplier('waterTowerPower', powerUps, tempPowerUps);
  if (towerType === 'bomber') {
    const currentHexes = getBomberImpactZone(0, 0, MAX_LEVEL, 0).length;
    const nextHexes = getBomberImpactZone(0, 0, SUPER_LEVEL, 0).length;
    const fmt = (n) => `${n} hex${n === 1 ? '' : 'es'}`;
    return { currentText: fmt(currentHexes), nextText: fmt(nextHexes) };
  }
  let currentBase = 0;
  let nextBase = 0;
  let hero = 1;
  let suffix = 'HP/s';
  if (towerType === 'jet') {
    currentBase = getTowerPower(MAX_LEVEL);
    nextBase = getTowerPower(SUPER_LEVEL);
    hero = getHeroPowerJetMultiplier(gameState);
  } else if (towerType === 'spread') {
    currentBase = getSpreadTowerPower(MAX_LEVEL);
    nextBase = getSpreadTowerPower(SUPER_LEVEL);
    hero = getHeroPowerSpreadMultiplier(gameState);
  } else if (towerType === 'rain') {
    currentBase = getRainPower(MAX_LEVEL);
    nextBase = getRainPower(SUPER_LEVEL);
    hero = getHeroPowerRainTowerMultiplier(gameState);
  } else if (towerType === 'pulsing') {
    currentBase = getPulsingPower(MAX_LEVEL);
    nextBase = getPulsingPower(SUPER_LEVEL);
    hero = getHeroPowerPulsingTowerMultiplier(gameState);
  } else if (towerType === 'sentinel') {
    currentBase = getSentinelPower(MAX_LEVEL);
    nextBase = getSentinelPower(SUPER_LEVEL);
    hero = getHeroPowerPulsingTowerMultiplier(gameState);
    suffix = 'HP/hex';
  } else if (towerType === 'perimeter') {
    currentBase = getPerimeterPower(MAX_LEVEL);
    nextBase = getPerimeterPower(SUPER_LEVEL);
    hero = getHeroPowerPerimeterTowerMultiplier(gameState);
    suffix = 'HP/hex';
  } else if (towerType === 'charge') {
    currentBase = getChargePerHexPower(MAX_LEVEL, CHARGE_STATS_MODE);
    nextBase = getChargePerHexPower(SUPER_LEVEL, CHARGE_STATS_MODE);
    hero = getHeroPowerBomberDamageMultiplier(gameState) * getHeroPowerChargeTowerMultiplier(gameState);
    suffix = 'HP/hex';
  }
  const current = currentBase * water * hero;
  const next = nextBase * water * hero;
  const fmt = (n) => `${formatWaterDamageRate(n)} ${suffix}`;
  return { currentText: fmt(current), nextText: fmt(next) };
}

function getSpeedPreview(gameState, towerType) {
  const powerUps = gameState?.player?.powerUps || {};
  const tempPowerUps = gameState?.player?.tempPowerUps || [];
  const now = getTempPowerUpTimeReference(
    gameState,
    typeof window !== 'undefined' ? window.gameLoop : null
  );
  const intervalAt = (level) => {
    if (towerType === 'perimeter') {
      return getEffectivePerimeterAttackInterval(level, powerUps, tempPowerUps, now, gameState);
    }
    let base = 1;
    if (towerType === 'pulsing') base = getPulsingAttackInterval(level);
    else if (towerType === 'bomber') base = getBomberAttackInterval(level);
    else if (towerType === 'sentinel') base = getSentinelAttackInterval(level);
    else if (towerType === 'charge') base = getChargeAttackInterval(level);
    return getEffectiveDurationTowerAttackIntervalWithHeroPower(
      base,
      powerUps,
      tempPowerUps,
      towerType,
      gameState,
      now
    );
  };
  return {
    currentText: formatEveryInterval(intervalAt(MAX_LEVEL)),
    nextText: formatEveryInterval(intervalAt(SUPER_LEVEL)),
  };
}

function getAttrPreview(gameState, towerType, attrId) {
  if (attrId === 'range') return getRangePreview(gameState, towerType);
  if (attrId === 'power') return getPowerPreview(gameState, towerType);
  if (attrId === 'speed') return getSpeedPreview(gameState, towerType);
  return { currentText: '—', nextText: '—' };
}

let optionsModalTowerType = null;

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 * @param {string} towerType
 */
export function renderSuperchargeOptionsModal(gameState, towerType) {
  const list = document.getElementById('superchargeOptionsList');
  const titleEl = document.getElementById('superchargeOptionsTitle');
  if (!list) return;

  const gs = gameState || window.gameState;
  const name = getTowerDisplayName(towerType) || 'Tower';
  if (titleEl) titleEl.textContent = `Supercharge ${pluralizeTowerDisplayName(name)}`;

  const tokenCount = getSuperchargerCount(gs);
  const cost = getSuperchargerTokenCost();
  const options = getSuperchargeOptionsForTower(towerType);
  list.replaceChildren();

  options.forEach((attrId) => {
    const def = getSuperchargeAttributeDef(attrId);
    if (!def) return;
    const already = isTowerAttrSupercharged(gs, towerType, attrId);
    const canAfford = tokenCount >= cost;
    const preview = getAttrPreview(gs, towerType, attrId);
    const label = towerType === 'bomber' && attrId === 'power' ? 'Impact' : def.label;

    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'supercharge-option-card';
    if (already) card.classList.add('supercharge-option-card--used');
    else if (!canAfford) card.classList.add('supercharge-option-card--locked');
    else card.classList.add('supercharge-option-card--available');
    card.dataset.attrId = attrId;
    if (already) {
      card.setAttribute('aria-disabled', 'true');
      bindHoverTooltip(card, gs, 'Already Supercharged');
    } else if (!canAfford) {
      card.setAttribute('aria-disabled', 'true');
      bindHoverTooltip(card, gs, `${cost} Supercharges needed, you currently have ${tokenCount}`);
    }

    const icon = document.createElement('img');
    icon.className = 'supercharge-option-icon';
    icon.src = def.icon;
    icon.alt = '';

    const body = document.createElement('div');
    body.className = 'supercharge-option-body';

    const nameRow = document.createElement('div');
    nameRow.className = 'supercharge-option-name';
    nameRow.style.color = def.color;
    nameRow.textContent = label;

    const summary = document.createElement('div');
    summary.className = 'supercharge-option-summary';
    summary.textContent = towerType === 'bomber' && attrId === 'power'
      ? 'Unlocks a 5th Impact level (extra splash ring).'
      : def.summary;

    const values = document.createElement('div');
    values.className = 'supercharge-option-values';
    if (already) {
      values.textContent = `Level 5 unlocked · spend ${getUpgradePlanCostForStep(MAX_LEVEL)} upgrade plans`;
    } else {
      values.innerHTML = `Unlocks level 5: ${escapeHtml(preview.currentText)} <span class="supercharge-option-arrow">→</span> ${escapeHtml(preview.nextText)}`;
    }

    body.appendChild(nameRow);
    body.appendChild(summary);
    body.appendChild(values);

    card.appendChild(icon);
    card.appendChild(body);

    if (already) {
      const badge = document.createElement('img');
      badge.className = 'supercharge-option-track-badge';
      badge.src = getSuperchargerSpriteUrl();
      badge.alt = '';
      card.appendChild(badge);
    }

    if (!already && canAfford) {
      card.addEventListener('click', () => tryConfirmSupercharge(gs, towerType, attrId));
    }

    list.appendChild(card);
  });
}

async function tryConfirmSupercharge(gameState, towerType, attrId) {
  const def = getSuperchargeAttributeDef(attrId);
  if (!def) return;
  const name = getTowerDisplayName(towerType) || 'this tower type';
  const label = towerType === 'bomber' && attrId === 'power' ? 'Impact' : def.label;
  const towerIconHtml = typeof window !== 'undefined' && typeof window.createTowerIconHTML === 'function'
    ? window.createTowerIconHTML(towerType, MAX_LEVEL, MAX_LEVEL, false)
    : '';
  const confirmed = await showConfirmModal({
    title: `Supercharge ${pluralizeTowerDisplayName(name)} ${label}?`,
    message: '',
    confirmText: 'Supercharge',
    cancelText: 'Cancel',
    confirmButtonClass: 'cta-lime',
    confirmButtonIcon: getSuperchargerSpriteUrl(),
    itemIcon: towerIconHtml
      ? `<div class="supercharge-confirm-tower-icon">${towerIconHtml}</div>`
      : null,
    itemIconAboveTitle: true,
  });
  if (!confirmed) return;

  const ok = applyTowerSupercharge(gameState, towerType, attrId);
  if (!ok) return;

  if (typeof window !== 'undefined' && window.AudioManager) {
    window.AudioManager.playSFX('specialty_level_up_1');
    window.AudioManager.playSFX('specialty_level_up_2');
  }

  if (attrId === 'range') {
    gameState.towerSystem?.refreshAllTowerAffectedHexes?.();
  }

  renderSuperchargeModal(gameState);
  renderSuperchargeOptionsModal(gameState, towerType);

  if (window.updateInventory) window.updateInventory();
  if (window.updateUI) window.updateUI();
}

let wasGamePausedBeforeSuperchargeModal = false;
let forceResumeAfterSuperchargeModalClose = false;

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 * @param {{ forceResumeOnClose?: boolean }} [options]
 */
export function openSuperchargeModal(gameState, options = {}) {
  wasGamePausedBeforeSuperchargeModal = !!(typeof window !== 'undefined' && window.gameLoop?.isPaused);
  forceResumeAfterSuperchargeModalClose = options.forceResumeOnClose === true;
  if (typeof window !== 'undefined' && window.pauseGameWithAudio) {
    window.pauseGameWithAudio();
  }
  if (typeof window !== 'undefined' && window.syncPauseButton) {
    window.syncPauseButton();
  }

  const modal = document.getElementById('superchargeModal');
  if (!modal) return;

  renderSuperchargeModal(gameState);
  modal.classList.add('active', 'upgrade-token-mask');
  playModalEnterAnimation(modal);
  modal.style.pointerEvents = 'auto';
  modal.setAttribute('aria-hidden', 'false');
}

function resumeAfterSuperchargeModalIfNeeded() {
  if (wasGamePausedBeforeSuperchargeModal && !forceResumeAfterSuperchargeModalClose) return;
  if (typeof window !== 'undefined' && window.resumeGameAfterModalClose) {
    window.resumeGameAfterModalClose({ withAudio: false });
  }
  if (typeof window !== 'undefined' && window.syncPauseButton) {
    window.syncPauseButton();
  }
  wasGamePausedBeforeSuperchargeModal = false;
  forceResumeAfterSuperchargeModalClose = false;
}

export function closeSuperchargeOptionsModal(onDone) {
  const modal = document.getElementById('superchargeOptionsModal');
  if (!modal) {
    onDone?.();
    return;
  }
  const gs = window.gameState;
  gs?.inputHandler?.tooltipSystem?.hide?.();
  closeModalOverlay(modal, {
    extraRemove: ['upgrade-token-mask'],
    onDone: () => {
      modal.setAttribute('aria-hidden', 'true');
      optionsModalTowerType = null;
      onDone?.();
    },
  });
}

export function closeSuperchargeModal(onDone) {
  closeSuperchargeOptionsModal(() => {
    const modal = document.getElementById('superchargeModal');
    if (!modal) {
      resumeAfterSuperchargeModalIfNeeded();
      onDone?.();
      return;
    }
    const gs = window.gameState;
    gs?.inputHandler?.tooltipSystem?.hide?.();
    closeModalOverlay(modal, {
      extraRemove: ['upgrade-token-mask'],
      onDone: () => {
        modal.setAttribute('aria-hidden', 'true');
        resumeAfterSuperchargeModalIfNeeded();
        onDone?.();
      },
    });
  });
}

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 * @param {string} towerType
 */
export function openSuperchargeOptionsModal(gameState, towerType) {
  const modal = document.getElementById('superchargeOptionsModal');
  if (!modal) return;
  optionsModalTowerType = towerType;
  renderSuperchargeOptionsModal(gameState, towerType);
  modal.classList.add('active', 'upgrade-token-mask');
  playModalEnterAnimation(modal);
  modal.style.pointerEvents = 'auto';
  modal.setAttribute('aria-hidden', 'false');
  if (typeof window !== 'undefined' && window.AudioManager) {
    window.AudioManager.playSFX('button1');
  }
}

export function wireSuperchargeModal(gameState) {
  const picker = document.getElementById('superchargeModal');
  const options = document.getElementById('superchargeOptionsModal');
  const closePicker = document.getElementById('closeSuperchargeBtn');
  const closeOptions = document.getElementById('closeSuperchargeOptionsBtn');

  if (closePicker && closePicker.dataset.superchargeBound !== '1') {
    closePicker.dataset.superchargeBound = '1';
    closePicker.addEventListener('click', () => closeSuperchargeModal());
  }
  if (closeOptions && closeOptions.dataset.superchargeBound !== '1') {
    closeOptions.dataset.superchargeBound = '1';
    closeOptions.addEventListener('click', () => closeSuperchargeOptionsModal());
  }
  if (picker && picker.dataset.superchargeBound !== '1') {
    picker.dataset.superchargeBound = '1';
    picker.addEventListener('click', (e) => {
      if (e.target !== picker) return;
      closeSuperchargeModal();
    });
  }
  if (options && options.dataset.superchargeBound !== '1') {
    options.dataset.superchargeBound = '1';
    options.addEventListener('click', (e) => {
      if (e.target !== options) return;
      closeSuperchargeOptionsModal();
    });
  }
}

/**
 * @param {import('../main.js').GameState | null | undefined} gameState
 */
export function handleSuperchargerInventoryClick(gameState) {
  const gs = gameState || window.gameState;
  if (!gs) return;
  const cost = getSuperchargerTokenCost();
  if (getSuperchargerCount(gs) < cost) return;
  if (typeof window !== 'undefined' && window.AudioManager) {
    window.AudioManager.playSFX('button1');
  }
  openSuperchargeModal(gs);
}

export { TOWER_TYPES_BY_COST };
