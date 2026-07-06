import { CONFIG, applyCurrencyGainBonuses } from '../config.js';
import { showConfirmModal } from './modal.js';

let activeOverlay = null;

export function isMovementTokenSellbackPickerOpen() {
  return !!activeOverlay;
}

/** True when the player has purchased a Token Voucher this run (enables movement-token sellback). */
export function hasTokenVoucherSellbackUnlocked(gameState) {
  return (gameState?.player?.tokenVouchers || 0) > 0;
}

/**
 * Add top-left sellback control on the movement token inventory card (Token Voucher purchased only).
 * @param {HTMLElement} cardEl
 * @param {import('../main.js').GameState} gameState
 */
export function attachMovementTokenSellbackButton(cardEl, gameState) {
  if (!cardEl || !hasTokenVoucherSellbackUnlocked(gameState)) return;

  cardEl.querySelector('.movement-token-sellback-btn')?.remove();

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'movement-token-sellback-btn';
  btn.setAttribute('aria-label', 'Click to sell movement tokens back to the shop');
  btn.innerHTML = '<img src="assets/images/misc/sellback.png" alt="" draggable="false" />';

  const tooltipSystem = gameState?.inputHandler?.tooltipSystem;
  const sellbackTooltipHtml =
    '<div style="color: #FFFFFF; font-size: 13px; line-height: 1.4;">Click to sell movement tokens back to the shop</div>';

  const showSellbackTooltip = (clientX, clientY) => {
    tooltipSystem?.show?.(sellbackTooltipHtml, clientX, clientY - 12);
  };

  const restoreCardTooltipIfNeeded = (relatedTarget) => {
    if (!tooltipSystem || !relatedTarget || !cardEl.contains(relatedTarget) || btn.contains(relatedTarget)) {
      return;
    }
    const content = tooltipSystem.getLevelUpRewardTooltipContent?.(
      { towerType: 'movement_token' },
      gameState,
      { omitShopCost: true }
    );
    if (!content) return;
    const rect = cardEl.getBoundingClientRect();
    tooltipSystem.show(content, rect.left + rect.width / 2, rect.top - 20);
  };

  btn.addEventListener('mouseenter', (e) => {
    showSellbackTooltip(e.clientX, e.clientY);
  });
  btn.addEventListener('mouseleave', (e) => {
    tooltipSystem?.hide?.();
    restoreCardTooltipIfNeeded(e.relatedTarget);
  });
  btn.addEventListener('mousemove', (e) => {
    showSellbackTooltip(e.clientX, e.clientY);
  });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (isMovementTokenSellbackPickerBlocked(gameState)) return;
    if (typeof window !== 'undefined' && window.AudioManager) {
      window.AudioManager.playSFX('button1');
    }
    showMovementTokenSellbackModal(gameState);
  });

  cardEl.appendChild(btn);
}

/** @param {import('../main.js').GameState} gameState */
export function isMovementTokenSellbackPickerBlocked(gameState) {
  return !!(
    gameState?.isUpgradeSelectionMode ||
    gameState?.isTowerSellbackMode ||
    gameState?.isRepairSelectionMode ||
    gameState?.isPartsRecycleMode ||
    gameState?.isMovementTokenMode
  );
}

function hideMovementTokenSellbackPicker() {
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }
}

function buildBundleRowHtml(tokens, payout) {
  return `
    <span class="token-voucher-bundle-part">
      <img src="assets/images/items/movement_token.png" alt="" class="token-voucher-bundle-icon" draggable="false" />
      <span class="token-voucher-bundle-qty">x${tokens}</span>
    </span>
    <span class="token-voucher-bundle-arrow" aria-hidden="true">&gt;&gt;</span>
    <span class="token-voucher-bundle-part">
      <img src="assets/images/misc/total_earned.png" alt="" class="token-voucher-bundle-currency-icon" draggable="false" />
      <span class="token-voucher-bundle-payout">$${payout.toLocaleString()}</span>
    </span>
  `;
}

function getAnchorRect() {
  const el = document.getElementById('movement-token-inventory');
  if (el) return el.getBoundingClientRect();
  const grid = document.getElementById('inventoryGrid');
  if (grid) return grid.getBoundingClientRect();
  return null;
}

/**
 * Show movement-token sellback bundles (requires Token Voucher in inventory).
 * @param {import('../main.js').GameState} gameState
 */
export function showMovementTokenSellbackModal(gameState) {
  if (!hasTokenVoucherSellbackUnlocked(gameState)) return;
  if (isMovementTokenSellbackPickerBlocked(gameState)) return;

  const ownedTokens = gameState.player.movementTokens || 0;
  if (ownedTokens <= 0) {
    gameState.notificationSystem?.showToast?.('No movement tokens to sell.', 3000, 'neutral');
    return;
  }

  gameState?.inputHandler?.tooltipSystem?.hide?.();
  hideMovementTokenSellbackPicker();

  const overlay = document.createElement('div');
  overlay.id = 'tokenVoucherSellbackOverlay';
  overlay.className = 'token-voucher-sellback-overlay';
  activeOverlay = overlay;

  const panel = document.createElement('div');
  panel.className = 'token-voucher-sellback-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Sell movement tokens');

  const title = document.createElement('div');
  title.className = 'token-voucher-sellback-title';
  title.textContent = 'Sell movement tokens:';
  panel.appendChild(title);

  const buttonsWrap = document.createElement('div');
  buttonsWrap.className = 'token-voucher-sellback-buttons';

  const bundles = Array.isArray(CONFIG.MOVEMENT_TOKEN_SELLBACK_BUNDLES)
    ? CONFIG.MOVEMENT_TOKEN_SELLBACK_BUNDLES
    : [];

  bundles.forEach((bundle) => {
    const tokens = Math.max(0, Math.floor(Number(bundle?.tokens) || 0));
    const basePayout = Math.max(0, Math.floor(Number(bundle?.payout) || 0));
    const payout = applyCurrencyGainBonuses(basePayout, gameState);
    if (tokens <= 0 || basePayout <= 0) return;

    const canSell = ownedTokens >= tokens;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'token-voucher-sellback-btn';
    if (!canSell) btn.classList.add('token-voucher-sellback-btn--disabled');
    btn.setAttribute('aria-label', `Sell ${tokens} movement tokens for $${payout}`);
    btn.innerHTML = buildBundleRowHtml(tokens, payout);

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!canSell) return;

      hideMovementTokenSellbackPicker();

      const confirmed = await showConfirmModal({
        title: 'Sell movement tokens?',
        message: '',
        confirmText: 'Sell',
        cancelText: 'Cancel',
        confirmButtonClass: 'cta-lime',
        pinDialogRight: true,
        cost: payout,
        currencyFloatDirection: 'gain',
        itemIcon: `<div class="token-voucher-confirm-exchange">${buildBundleRowHtml(tokens, payout)}</div>`,
      });

      if (!confirmed) return;

      const current = gameState.player.movementTokens || 0;
      if (current < tokens) {
        gameState.notificationSystem?.showToast?.('Not enough movement tokens.', 3000, 'warning');
        return;
      }

      gameState.player.movementTokens = current - tokens;
      gameState.player.currency = (gameState.player.currency || 0) + payout;
      gameState.runStats?.recordShopPurchase?.('movement_token_sellback', {
        tokensSold: tokens,
        currencyGained: payout,
      });

      if (typeof window !== 'undefined' && window.AudioManager) {
        window.AudioManager.playSFX('earn');
      }
      gameState.notificationSystem?.showToast?.(
        `Sold ${tokens} movement token${tokens === 1 ? '' : 's'} for $${payout.toLocaleString()}.`,
        3500,
        'positive'
      );

      if (window.updateInventory) window.updateInventory();
      if (window.updateUI) window.updateUI();
    });

    buttonsWrap.appendChild(btn);
  });

  panel.appendChild(buttonsWrap);
  panel.style.position = 'fixed';
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const anchor = getAnchorRect();
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

  const onDocClick = (e) => {
    if (panel.contains(e.target)) return;
    hideMovementTokenSellbackPicker();
    document.removeEventListener('mousedown', onDocClick, true);
  };
  setTimeout(() => document.addEventListener('mousedown', onDocClick, true), 0);
}

export function initTokenVoucherUI() {
  if (typeof window !== 'undefined') {
    window.hideMovementTokenSellbackPicker = hideMovementTokenSellbackPicker;
  }
}
