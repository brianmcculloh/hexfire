import { CONFIG } from '../config.js';
import { showConfirmModal } from './modal.js';

let activeOverlay = null;

/** @typedef {'all' | 'exclude_jet' | 'exclude_shielded'} AutoShieldMode */

const AUTO_SHIELD_OPTIONS = [
  {
    mode: /** @type {AutoShieldMode} */ ('all'),
    label: 'Apply to all towers',
    tooltip: 'Auto-apply shields to all towers, least shielded to most shielded',
  },
  {
    mode: /** @type {AutoShieldMode} */ ('exclude_jet'),
    label: 'Exclude jet towers',
    tooltip: 'Auto-apply shields to all towers except jet towers, least shielded to most shielded',
  },
  {
    mode: /** @type {AutoShieldMode} */ ('exclude_shielded'),
    label: 'Exclude shielded towers',
    tooltip: 'Auto-apply shields to all towers that currently have no shields, least shielded to most shielded',
  },
];

export function isAutoShieldsPickerOpen() {
  return !!activeOverlay;
}

/** @param {import('../main.js').GameState} gameState */
export function isAutoShieldsPickerBlocked(gameState) {
  return !!(
    gameState?.isUpgradeSelectionMode ||
    gameState?.isDungeonRewardMode ||
    gameState?.isTowerSellbackMode ||
    gameState?.isRepairSelectionMode ||
    gameState?.isPartsRecycleMode ||
    gameState?.isMovementTokenMode
  );
}

/**
 * Add top-left auto-shields control on a shield inventory card.
 * @param {HTMLElement} cardEl
 * @param {import('../main.js').GameState} gameState
 */
export function attachAutoShieldsButton(cardEl, gameState) {
  if (!cardEl) return;

  cardEl.querySelector('.auto-shields-btn')?.remove();

  // Tutorial: hide so players can't take an alternate path mid-step
  if (gameState?.tutorialMode) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'auto-shields-btn';
  btn.setAttribute('aria-label', 'Click to apply shields automatically to all towers');
  btn.innerHTML = '<img src="assets/images/misc/autoshields.png" alt="" draggable="false" />';

  const tooltipSystem = gameState?.inputHandler?.tooltipSystem;
  const tooltipHtml =
    '<div style="color: #FFFFFF; font-size: 13px; line-height: 1.4;">Click to apply shields automatically to all towers</div>';

  const showBtnTooltip = (clientX, clientY) => {
    tooltipSystem?.show?.(tooltipHtml, clientX, clientY - 12);
  };

  const restoreCardTooltipIfNeeded = (relatedTarget) => {
    if (!tooltipSystem || !relatedTarget || !cardEl.contains(relatedTarget) || btn.contains(relatedTarget)) {
      return;
    }
    const levelMatch = cardEl.id?.match(/^shield-to-place-level-(\d+)$/);
    const level = levelMatch ? parseInt(levelMatch[1], 10) : 1;
    const content = tooltipSystem.getLevelUpRewardTooltipContent?.(
      { towerType: 'shield', level },
      gameState,
      { omitShopCost: true }
    );
    if (!content) return;
    const rect = cardEl.getBoundingClientRect();
    tooltipSystem.show(content, rect.left + rect.width / 2, rect.top - 20);
  };

  btn.addEventListener('mouseenter', (e) => {
    showBtnTooltip(e.clientX, e.clientY);
  });
  btn.addEventListener('mouseleave', (e) => {
    tooltipSystem?.hide?.();
    restoreCardTooltipIfNeeded(e.relatedTarget);
  });
  btn.addEventListener('mousemove', (e) => {
    showBtnTooltip(e.clientX, e.clientY);
  });

  // Inventory shield selection uses mousedown — block it so this control only opens the picker.
  btn.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.preventDefault();
  });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (isAutoShieldsPickerBlocked(gameState)) return;
    if (typeof window !== 'undefined' && window.AudioManager) {
      window.AudioManager.playSFX('button1');
    }
    showAutoShieldsModal(gameState, cardEl);
  });

  cardEl.appendChild(btn);
}

function hideAutoShieldsPicker() {
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }
}

/**
 * @typedef {{
 *   tower: object,
 *   location: 'map' | 'inventory',
 *   kind?: 'stored' | 'purchased',
 *   index?: number,
 *   sortKey: string
 * }} AutoShieldTarget
 */

/** @param {object | null | undefined} tower */
function getTowerShieldAmount(tower) {
  const health = tower?.shield?.health;
  return health > 0 ? health : 0;
}

/**
 * @param {object} tower
 * @param {AutoShieldMode} mode
 * @returns {boolean}
 */
function towerMatchesAutoShieldMode(tower, mode) {
  if (!tower || tower.broken) return false;
  if (mode === 'exclude_jet') {
    return tower.type !== CONFIG.TOWER_TYPE_JET && tower.type !== 'jet';
  }
  if (mode === 'exclude_shielded') {
    return getTowerShieldAmount(tower) <= 0;
  }
  return true;
}

/**
 * Map towers plus inventory towers (stored + purchased / stowed between waves).
 * @param {import('../main.js').GameState} gameState
 * @param {AutoShieldMode} mode
 * @returns {AutoShieldTarget[]}
 */
function getAutoShieldTargetPool(gameState, mode) {
  /** @type {AutoShieldTarget[]} */
  const targets = [];

  const mapTowers = gameState?.towerSystem?.getAllTowers?.() || [];
  for (const tower of mapTowers) {
    if (!towerMatchesAutoShieldMode(tower, mode)) continue;
    targets.push({
      tower,
      location: 'map',
      sortKey: `map:${tower.id ?? ''}`,
    });
  }

  const inv = gameState?.player?.inventory;
  /** @type {Array<'stored' | 'purchased'>} */
  const kinds = ['stored', 'purchased'];
  for (const kind of kinds) {
    const list = kind === 'stored' ? inv?.storedTowers : inv?.purchasedTowers;
    if (!Array.isArray(list)) continue;
    for (let index = 0; index < list.length; index++) {
      const tower = list[index];
      if (!towerMatchesAutoShieldMode(tower, mode)) continue;
      targets.push({
        tower,
        location: 'inventory',
        kind,
        index,
        sortKey: `inv:${kind}:${index}`,
      });
    }
  }

  return targets;
}

/**
 * @param {AutoShieldTarget[]} targets
 * @returns {AutoShieldTarget | null}
 */
function pickLeastShieldedTower(targets) {
  if (!targets.length) return null;
  let best = targets[0];
  let bestAmount = getTowerShieldAmount(best.tower);
  for (let i = 1; i < targets.length; i++) {
    const target = targets[i];
    const amount = getTowerShieldAmount(target.tower);
    if (amount < bestAmount) {
      best = target;
      bestAmount = amount;
      continue;
    }
    if (amount === bestAmount && target.sortKey < best.sortKey) {
      best = target;
      bestAmount = amount;
    }
  }
  return best;
}

/**
 * Strongest → weakest inventory shields (whole items; never split).
 * @param {Array<{ type?: string, level?: number }>} shields
 * @returns {number[]} indices into purchasedShields, strongest first
 */
function getShieldApplyOrderIndices(shields) {
  if (!Array.isArray(shields) || shields.length === 0) return [];
  return shields
    .map((shield, index) => ({ index, level: Math.max(1, Math.floor(Number(shield?.level) || 1)) }))
    .sort((a, b) => b.level - a.level || a.index - b.index)
    .map((entry) => entry.index);
}

/**
 * @param {import('../main.js').GameState} gameState
 * @param {AutoShieldMode} mode
 * @returns {{ applied: number, remaining: number }}
 */
function applyAutoShields(gameState, mode) {
  const inventory = gameState?.player?.inventory;
  const shields = inventory?.purchasedShields;
  if (!Array.isArray(shields) || shields.length === 0) {
    return { applied: 0, remaining: 0 };
  }

  const order = getShieldApplyOrderIndices(shields);
  const planned = order.map((index) => ({
    level: Math.max(1, Math.floor(Number(shields[index]?.level) || 1)),
  }));

  let applied = 0;
  for (const { level } of planned) {
    const pool = getAutoShieldTargetPool(gameState, mode);
    const target = pickLeastShieldedTower(pool);
    if (!target) break;

    const shieldIndex = shields.findIndex((s) => Math.max(1, Math.floor(Number(s?.level) || 1)) === level);
    if (shieldIndex < 0) continue;

    const { tower, location, kind, index } = target;
    const success =
      location === 'inventory'
        ? gameState.shieldSystem?.applyShieldToInventoryTower?.(kind, index, level)
        : gameState.shieldSystem?.applyShieldToTower?.(tower.id, level);
    if (!success) break;

    shields.splice(shieldIndex, 1);
    gameState.runStats?.recordItemPlacedOnMap?.('shield', {
      level,
      q: tower.q,
      r: tower.r,
      targetTowerId: tower.id,
      ...(location === 'inventory' ? { inventoryKind: kind, inventoryIndex: index } : {}),
      autoShield: true,
      autoShieldMode: mode,
    });
    applied += 1;
  }

  return { applied, remaining: shields.length };
}

/**
 * Group owned inventory shields by level (strongest first) for confirm UI.
 * @param {import('../main.js').GameState} gameState
 * @returns {Array<{ level: number, count: number }>}
 */
function getOwnedShieldStacks(gameState) {
  const shields = gameState?.player?.inventory?.purchasedShields;
  const byLevel = new Map();
  if (Array.isArray(shields)) {
    for (const shield of shields) {
      const level = Math.max(1, Math.floor(Number(shield?.level) || 1));
      byLevel.set(level, (byLevel.get(level) || 0) + 1);
    }
  }
  return [...byLevel.entries()]
    .map(([level, count]) => ({ level, count }))
    .sort((a, b) => b.level - a.level);
}

/**
 * Confirm modal icon row: autoshields → trade arrow → owned shield stacks.
 * @param {import('../main.js').GameState} gameState
 * @returns {string}
 */
function buildAutoShieldConfirmIconHtml(gameState) {
  const stacks = getOwnedShieldStacks(gameState);
  const shieldHtml = stacks
    .map(
      ({ level, count }) => `
      <div class="auto-shields-confirm-stack">
        <img src="assets/images/items/shield_${level}.png" alt="" class="auto-shields-confirm-shield-icon" draggable="false" />
        <span class="auto-shields-confirm-count">x${count}</span>
      </div>`
    )
    .join('');

  return `
    <div class="auto-shields-confirm-exchange">
      <img src="assets/images/misc/autoshields.png" alt="" class="auto-shields-confirm-target" draggable="false" />
      <img src="assets/images/ui/trade-arrow.png" alt="" class="auto-shields-confirm-arrow" draggable="false" />
      <div class="auto-shields-confirm-stacks">${shieldHtml}</div>
    </div>
  `;
}

/**
 * @param {DOMRect | null | undefined} preferred
 * @returns {DOMRect | null}
 */
function resolveAnchorRect(preferred) {
  if (preferred && preferred.width > 0 && preferred.height > 0) return preferred;
  const card = document.querySelector('[id^="shield-to-place-level-"]');
  if (card) return card.getBoundingClientRect();
  const grid = document.getElementById('inventoryGrid');
  if (grid) return grid.getBoundingClientRect();
  return null;
}

/**
 * @param {HTMLElement} panel
 * @param {DOMRect | null} anchor
 */
function positionPanelNearAnchor(panel, anchor) {
  const margin = 12;
  const rect = panel.getBoundingClientRect();
  let left;
  let top;
  if (anchor) {
    left = anchor.left + anchor.width / 2 - rect.width / 2;
    top = anchor.top - rect.height - margin;
    if (top < margin) top = anchor.bottom + margin;
  } else {
    left = window.innerWidth / 2 - rect.width / 2;
    top = window.innerHeight / 2 - rect.height / 2;
  }
  left = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin));
  top = Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin));
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}

/**
 * @param {import('../main.js').GameState} gameState
 * @param {HTMLElement | null} [anchorEl]
 */
export function showAutoShieldsModal(gameState, anchorEl = null) {
  if (isAutoShieldsPickerBlocked(gameState)) return;

  const shields = gameState?.player?.inventory?.purchasedShields;
  if (!Array.isArray(shields) || shields.length === 0) {
    gameState.notificationSystem?.showToast?.('No shields to apply.', 3000, 'neutral');
    return;
  }

  if (getAutoShieldTargetPool(gameState, 'all').length === 0) {
    gameState.notificationSystem?.showToast?.('No towers to shield.', 3000, 'neutral');
    return;
  }

  // Capture before clearShieldSelection → updateInventory detaches the clicked card.
  const preferredAnchorRect = anchorEl?.getBoundingClientRect?.() ?? null;

  gameState?.inputHandler?.tooltipSystem?.hide?.();
  if (typeof window !== 'undefined' && window.hideMovementTokenSellbackPicker) {
    window.hideMovementTokenSellbackPicker();
  }
  hideAutoShieldsPicker();

  if (gameState?.inputHandler?.selectedShieldForPlacement) {
    gameState.inputHandler.clearShieldSelection();
  }

  const overlay = document.createElement('div');
  overlay.id = 'autoShieldsOverlay';
  overlay.className = 'token-voucher-sellback-overlay auto-shields-overlay';
  activeOverlay = overlay;

  const panel = document.createElement('div');
  panel.className = 'token-voucher-sellback-panel auto-shields-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Auto-shields');

  const title = document.createElement('div');
  title.className = 'token-voucher-sellback-title';
  title.textContent = 'Auto-shields';
  panel.appendChild(title);

  const buttonsWrap = document.createElement('div');
  buttonsWrap.className = 'token-voucher-sellback-buttons';

  const tooltipSystem = gameState?.inputHandler?.tooltipSystem;

  AUTO_SHIELD_OPTIONS.forEach((option) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'token-voucher-sellback-btn auto-shields-option-btn';
    btn.setAttribute('aria-label', option.label);
    btn.textContent = option.label;

    const optionTooltipHtml = `<div style="color: #FFFFFF; font-size: 13px; line-height: 1.4;">${option.tooltip}</div>`;
    btn.addEventListener('mouseenter', (e) => {
      tooltipSystem?.show?.(optionTooltipHtml, e.clientX, e.clientY - 12);
    });
    btn.addEventListener('mousemove', (e) => {
      tooltipSystem?.show?.(optionTooltipHtml, e.clientX, e.clientY - 12);
    });
    btn.addEventListener('mouseleave', () => {
      tooltipSystem?.hide?.();
    });

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      tooltipSystem?.hide?.();
      hideAutoShieldsPicker();

      const confirmed = await showConfirmModal({
        title: 'Auto-apply shields?',
        message: option.tooltip,
        confirmText: 'Apply',
        cancelText: 'Cancel',
        confirmButtonClass: 'cta-purple',
        pinDialogRight: true,
        itemIcon: buildAutoShieldConfirmIconHtml(gameState),
      });

      if (!confirmed) return;

      if ((gameState.player.inventory.purchasedShields?.length || 0) <= 0) {
        gameState.notificationSystem?.showToast?.('No shields to apply.', 3000, 'warning');
        return;
      }

      const { applied } = applyAutoShields(gameState, option.mode);

      if (applied > 0 && typeof window !== 'undefined' && window.AudioManager) {
        window.AudioManager.playSFX('shield_applied');
      }

      if (applied <= 0) {
        gameState.notificationSystem?.showToast?.('No matching towers to shield.', 3000, 'neutral');
      } else {
        gameState.notificationSystem?.showToast?.(
          `Applied ${applied} shield${applied === 1 ? '' : 's'} automatically.`,
          3500,
          'positive'
        );
      }

      if (window.updateInventory) window.updateInventory();
      if (window.updateUI) window.updateUI();
    });

    buttonsWrap.appendChild(btn);
  });

  panel.appendChild(buttonsWrap);
  panel.style.position = 'fixed';
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  positionPanelNearAnchor(panel, resolveAnchorRect(preferredAnchorRect));

  const onDocClick = (e) => {
    if (panel.contains(e.target)) return;
    hideAutoShieldsPicker();
    document.removeEventListener('mousedown', onDocClick, true);
  };
  setTimeout(() => document.addEventListener('mousedown', onDocClick, true), 0);
}

export function initAutoShieldsUI() {
  if (typeof window !== 'undefined') {
    window.hideAutoShieldsPicker = hideAutoShieldsPicker;
  }
}
