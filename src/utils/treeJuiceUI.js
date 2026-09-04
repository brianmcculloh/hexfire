// Tree Juice inventory stack — grant, spend, and use-confirm UI

import { CONFIG, getExpectedTownMaxHealth } from '../config.js';
import { showConfirmModal } from './modal.js';

export const TREE_JUICE_COLOR = '#00FF88';
export const TREE_JUICE_ICON_SRC = 'assets/images/items/town_defense.png';

/**
 * @param {object} [gameState]
 * @returns {number}
 */
export function getTreeJuiceCount(gameState) {
  return Math.max(0, Math.floor(Number(gameState?.player?.treeJuice) || 0));
}

/**
 * Add Tree Juice to inventory (does not change grove health).
 * @param {object} gameState
 * @param {number} [count]
 * @returns {number} New stack count
 */
export function grantTreeJuice(gameState, count = 1) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (!gameState?.player || n <= 0) return getTreeJuiceCount(gameState);
  gameState.player.treeJuice = getTreeJuiceCount(gameState) + n;
  return gameState.player.treeJuice;
}

/**
 * Spend Tree Juice: raise grove max HP and restore current HP to 100%.
 * @param {object} gameState
 * @param {number} [count]
 * @returns {number} Number actually spent
 */
export function spendTreeJuice(gameState, count = 1) {
  const owned = getTreeJuiceCount(gameState);
  const n = Math.min(owned, Math.max(0, Math.floor(Number(count) || 0)));
  if (!gameState?.player || n <= 0) return 0;

  gameState.player.treeJuice = owned - n;
  gameState.townLevel = (gameState.townLevel || 1) + n;
  const newMax = getExpectedTownMaxHealth(gameState.townLevel);
  gameState.gridSystem?.setTownHealth?.(newMax, newMax);

  for (let i = 0; i < n; i++) {
    gameState.runStats?.recordTownHealthUpgrade?.();
  }

  if (typeof window !== 'undefined' && window.AudioManager) {
    window.AudioManager.playSFX('tree_juice', { volumeMultiplier: 4 });
  }

  try {
    gameState.renderer?.hexFlashes?.set('0,0', {
      startTime: performance.now(),
      duration: 800,
      color: 'white',
    });
  } catch (e) {
    // ignore
  }

  const hpGain = n * CONFIG.TOWN_HEALTH_PER_UPGRADE;
  gameState.notificationSystem?.showToast?.(
    n === 1
      ? `Tree Juice used! Grove +${hpGain} max HP and restored to 100%`
      : `${n} Tree Juice used! Grove +${hpGain} max HP and restored to 100%`,
    3500,
    'positive'
  );

  if (typeof window !== 'undefined') {
    window.updateInventory?.();
    window.updateUI?.();
  }

  return n;
}

/**
 * Label + tree-juice icon + x{count} (mirrors upgrade-plan cost buttons, health green).
 * @param {string} label
 * @param {number} count
 * @returns {HTMLElement}
 */
export function createTreeJuiceCostButtonContent(label, count) {
  const row = document.createElement('div');
  row.style.cssText = 'display: flex; align-items: center; justify-content: center; gap: 8px; white-space: nowrap;';

  const labelSpan = document.createElement('span');
  labelSpan.textContent = label;
  labelSpan.style.fontSize = 'inherit';
  row.appendChild(labelSpan);

  const tokenImg = document.createElement('img');
  tokenImg.src = TREE_JUICE_ICON_SRC;
  tokenImg.alt = '';
  tokenImg.style.cssText = 'width: 32px; height: auto; object-fit: contain; image-rendering: crisp-edges;';
  row.appendChild(tokenImg);

  const costSpan = document.createElement('span');
  costSpan.textContent = `x${Math.max(0, Math.floor(Number(count) || 0))}`;
  costSpan.style.color = TREE_JUICE_COLOR;
  costSpan.style.fontWeight = 'bold';
  costSpan.style.fontSize = '24px';
  costSpan.style.textShadow = '0 0 25px rgba(0,0,0,.3), 0 0 10px rgba(0,0,0,.3), 0 0 5px rgba(0,0,0,.5)';
  costSpan.style.marginLeft = '-6px';
  costSpan.style.textTransform = 'none';
  row.appendChild(costSpan);

  return row;
}

/**
 * Inventory click: confirm spending one or all Tree Juice.
 * @param {object} [gameState]
 */
export async function handleTreeJuiceInventoryClick(gameState) {
  const gs = gameState || (typeof window !== 'undefined' ? window.gameState : null);
  if (!gs) return;
  if (
    gs.isUpgradeSelectionMode ||
    gs.isTowerSellbackMode ||
    gs.isRepairSelectionMode ||
    gs.isPartsRecycleMode ||
    gs.isMovementTokenMode
  ) {
    return;
  }

  const owned = getTreeJuiceCount(gs);
  if (owned <= 0) return;

  if (typeof window !== 'undefined' && window.AudioManager) {
    window.AudioManager.playSFX('button1');
  }

  if (typeof window !== 'undefined' && typeof window.pauseGameWithAudio === 'function') {
    window.pauseGameWithAudio();
  }
  if (typeof window !== 'undefined' && typeof window.syncPauseButton === 'function') {
    window.syncPauseButton();
  }

  const hp = CONFIG.TOWN_HEALTH_PER_UPGRADE;
  const useOneLabel = owned > 1 ? 'Use One' : 'Use';
  const result = await showConfirmModal({
    title: 'Use Tree Juice?',
    titleColor: TREE_JUICE_COLOR,
    message:
      `Each Tree Juice permanently adds +${hp} max HP to the Ancient Grove and restores grove health to <span style="color: ${TREE_JUICE_COLOR}; font-weight: bold;">100%</span>.`,
    messageIsHtml: true,
    confirmText: useOneLabel,
    cancelText: 'Cancel',
    confirmButtonClass: 'cta-green',
    confirmButtonContent: createTreeJuiceCostButtonContent(useOneLabel, 1),
    extraConfirmText: owned > 1 ? 'Use All' : null,
    extraConfirmButtonClass: 'cta-green',
    extraConfirmButtonContent: owned > 1 ? createTreeJuiceCostButtonContent('Use All', owned) : null,
    extraConfirmValue: 'all',
    itemIcon: `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
      <img src="${TREE_JUICE_ICON_SRC}" style="width: 64px; height: auto; image-rendering: pixelated;" />
      <div style="color: ${TREE_JUICE_COLOR}; font-size: 28px; font-weight: bold; line-height: 1; text-shadow: 0 0 25px rgba(0,0,0,.3), 0 0 10px rgba(0,0,0,.3), 0 0 5px rgba(0,0,0,.5);">x${owned}</div>
    </div>`,
    pinDialogRight: true,
  });

  const resume = () => {
    if (typeof window !== 'undefined' && typeof window.resumeUnlessPausedByPlayer === 'function') {
      window.resumeUnlessPausedByPlayer({ withAudio: false });
    }
    if (typeof window !== 'undefined' && typeof window.syncPauseButton === 'function') {
      window.syncPauseButton();
    }
  };

  if (!result) {
    resume();
    return;
  }

  const spendCount = result === 'all' ? getTreeJuiceCount(gs) : 1;
  spendTreeJuice(gs, spendCount);
  resume();
}
