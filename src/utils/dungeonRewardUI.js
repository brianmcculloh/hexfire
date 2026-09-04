/**
 * Mid-wave dungeon flood reward picker — pause, choose 1 of 3 bundles, confirm, grant, resume.
 * Layout mirrors the artifact trader (free-floating header + blurb; framed reward choices).
 */

import { CONFIG, applyCurrencyGainBonuses } from '../config.js';
import { showConfirmModal } from './modal.js';
import {
  applyRewardBundleToPlayer,
  buildRewardStackRow,
  getRewardBundleCurrentShopValue,
  playRewardBundleFloatAnimation,
  wireTraderRewardTooltips,
} from './artifactTrader.js';

let activeOverlay = null;
/** Floods that happen in the same frame wait until the current picker is claimed. */
let pendingRewardQueue = [];

export function isDungeonRewardPickerOpen() {
  return !!activeOverlay;
}

/** Pause the wave for a dungeon flood cinematic or reward picker (idempotent). */
export function beginDungeonRewardPause(gameState, { playPauseSfx = true } = {}) {
  if (!gameState) return;
  const already = !!gameState.isDungeonRewardMode;
  gameState.isDungeonRewardMode = true;
  if (!already) pauseForDungeonRewards(gameState, { playPauseSfx });
}

function hideDungeonRewardOverlay(gameState = null) {
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }
  gameState?.inputHandler?.tooltipSystem?.hide?.();
}

function pauseForDungeonRewards(gameState, { playPauseSfx = true } = {}) {
  if (playPauseSfx && typeof window !== 'undefined' && window.AudioManager) {
    window.AudioManager.playSFX('pause');
  }
  if (typeof window !== 'undefined' && typeof window.pauseGameWithAudio === 'function') {
    window.pauseGameWithAudio();
  } else if (typeof window !== 'undefined' && window.gameLoop && !window.gameLoop.isPaused) {
    window.gameLoop.pause();
    if (gameState) gameState.isPaused = true;
  }
  if (typeof window !== 'undefined' && window.syncPauseButton) {
    window.syncPauseButton();
  }
}

function resumeAfterDungeonRewards(gameState) {
  if (!gameState) return;
  if (typeof window !== 'undefined' && typeof window.resumeGameWithAudio === 'function') {
    if (gameState.wave?.isActive) {
      window.resumeGameWithAudio();
    }
  } else if (typeof window !== 'undefined' && window.gameLoop?.isPaused && gameState.wave?.isActive) {
    window.gameLoop.resume();
    gameState.isPaused = false;
    if (window.AudioManager) {
      window.AudioManager.playSFX('resume');
    }
  }
  if (typeof window !== 'undefined' && window.syncPauseButton) {
    window.syncPauseButton();
  }
}

function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function formatRewardPartLabel(part, gameState) {
  if (!part || !part.type) return '';
  const n = part.count != null && part.count > 0 ? Math.floor(part.count) : 1;

  if (part.type === 'currency') {
    const amt = part.amount != null && part.amount > 0 ? Number(part.amount) : 0;
    const baseTotal = amt * n;
    const total = gameState ? applyCurrencyGainBonuses(baseTotal, gameState) : baseTotal;
    if (total <= 0) return '';
    return `$${Math.round(total).toLocaleString()}`;
  }

  if (part.type === 'upgrade_plans') {
    return n === 1 ? 'Upgrade Plans' : `${n} Upgrade Plans`;
  }

  if (part.type === 'shield') {
    const level = Math.min(4, Math.max(1, Math.round(Number(part.level || 1))));
    return n === 1 ? `Level ${level} Shield` : `${n} Level ${level} Shields`;
  }

  if (part.type === 'suppression_bomb') {
    const level = Math.min(4, Math.max(1, Math.round(Number(part.level || 1))));
    return n === 1
      ? `Level ${level} Suppression Bomb`
      : `${n} Level ${level} Suppression Bombs`;
  }

  if (part.type === 'tree_juice') {
    return n === 1 ? 'Tree Juice' : `${n} Tree Juice`;
  }

  if (part.type === 'movement_token') {
    return `${n} ${pluralize(n, 'Movement Token')}`;
  }

  if (part.type === 'repair_supplies') {
    return n === 1 ? 'Repair Supplies' : `${n} Repair Supplies`;
  }

  if (part.type === 'permanent_power_up') {
    const name = CONFIG.POWER_UPS?.[part.powerUpId]?.name || 'Power-up';
    return n === 1 ? name : `${n} ${name}`;
  }

  return '';
}

function formatRewardBundlePhrase(bundle, gameState) {
  const labels = (Array.isArray(bundle) ? bundle : [])
    .map((part) => formatRewardPartLabel(part, gameState))
    .filter(Boolean);
  if (labels.length === 0) return 'these items';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

function buildRewardShopValueEl(bundle, gameState) {
  const shopValueEl = document.createElement('div');
  shopValueEl.className = 'dungeon-reward-shop-value';
  const shopValue = getRewardBundleCurrentShopValue(bundle, gameState);
  const shopValueLabel = document.createElement('span');
  shopValueLabel.className = 'dungeon-reward-shop-value-label';
  shopValueLabel.textContent = 'Total value: ';
  const shopValueAmount = document.createElement('span');
  shopValueAmount.className = 'dungeon-reward-shop-value-amount';
  shopValueAmount.textContent = `$${shopValue.toLocaleString()}`;
  shopValueEl.appendChild(shopValueLabel);
  shopValueEl.appendChild(shopValueAmount);
  return shopValueEl;
}

/**
 * @param {import('../main.js').GameState} gameState
 * @param {{
 *   level: number,
 *   levelName?: string,
 *   sprite?: string,
 *   choices: object[][],
 * }} opts
 */
export function showDungeonRewardOverlay(gameState, opts) {
  if (!gameState || !Array.isArray(opts?.choices) || opts.choices.length === 0) return;
  if (activeOverlay) {
    pendingRewardQueue.push({
      gameState,
      opts: {
        ...opts,
        choices: opts.choices.map((bundle) =>
          (Array.isArray(bundle) ? bundle : []).map((part) => ({ ...part }))
        ),
      },
    });
    return;
  }
  hideDungeonRewardOverlay(gameState);

  const alreadyInRewardMode = !!gameState.isDungeonRewardMode;
  gameState.isDungeonRewardMode = true;
  if (!alreadyInRewardMode) {
    pauseForDungeonRewards(gameState);
  }

  const overlay = document.createElement('div');
  overlay.className = 'dungeon-reward-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Dungeon flooded — choose a reward');

  const content = document.createElement('div');
  content.className = 'dungeon-reward-content';

  // Same banner header pattern as Artifact Trader
  const headerContainer = document.createElement('div');
  headerContainer.className = 'dungeon-reward-header-banner';
  const headerImage = document.createElement('img');
  headerImage.src = 'assets/images/ui/header-bg-orange.png';
  headerImage.alt = '';
  headerImage.draggable = false;
  headerImage.className = 'dungeon-reward-header-banner-img';
  const headerContentWrapper = document.createElement('div');
  headerContentWrapper.className = 'dungeon-reward-header-banner-text-wrap';
  const headerText = document.createElement('div');
  headerText.className = 'dungeon-reward-header-banner-text';
  headerText.textContent = 'Dungeon Flooded!';
  headerContentWrapper.appendChild(headerText);
  headerContainer.appendChild(headerImage);
  headerContainer.appendChild(headerContentWrapper);

  const blurb = document.createElement('p');
  blurb.className = 'dungeon-reward-blurb';
  blurb.textContent = `${opts.levelName || 'Dungeon Entrance'} — choose a reward cache flushed from below`;

  const choicesRow = document.createElement('div');
  choicesRow.className = 'dungeon-reward-choices';

  let claimed = false;
  let confirmOpen = false;

  opts.choices.forEach((bundle, index) => {
    const frame = document.createElement('div');
    frame.className = 'dungeon-reward-choice-frame';
    frame.setAttribute('role', 'button');
    frame.tabIndex = 0;
    frame.setAttribute('aria-label', `Claim dungeon reward option ${index + 1}`);

    // 3-patch chrome sits behind content so dim/desaturate never touches reward icons / Claim
    const chrome = document.createElement('div');
    chrome.className = 'frame-green dungeon-reward-choice-frame__chrome';
    chrome.setAttribute('aria-hidden', 'true');
    frame.appendChild(chrome);

    const stackWrap = document.createElement('div');
    stackWrap.className = 'dungeon-reward-stack-wrap';
    const row = buildRewardStackRow(bundle, gameState, { wrapAt: 3 });
    stackWrap.appendChild(row);
    stackWrap.appendChild(buildRewardShopValueEl(bundle, gameState));
    frame.appendChild(stackWrap);

    // Visual only — whole frame is the click/keyboard target
    const claimBtn = document.createElement('span');
    claimBtn.className = 'dungeon-reward-claim-btn choice-btn cta-button cta-lime';
    claimBtn.textContent = 'Claim';
    claimBtn.setAttribute('aria-hidden', 'true');

    const grantClaimedReward = () => {
      gameState?.inputHandler?.tooltipSystem?.hide?.();
      playRewardBundleFloatAnimation(stackWrap);
      applyRewardBundleToPlayer(gameState, bundle);

      // Queue two mid-wave replacements 5s after claim (persists into later waves of this group).
      gameState.dungeonEntranceSystem?.scheduleMidWaveSpawnAfterClaim?.();

      if (typeof window !== 'undefined' && window.AudioManager) {
        window.AudioManager.playSFX('purchase', { volume: 0.75, dedupeMs: 200 });
      }
      if (window.updatePowerUpPanel) window.updatePowerUpPanel();
      if (window.updateTempPowerUpPanel) window.updateTempPowerUpPanel();
      if (window.updateBottomEdgePowerUps) window.updateBottomEdgePowerUps();
      if (window.updateUI) window.updateUI();
      if (window.updateInventory) window.updateInventory();

      // Brief beat so float animation is visible, then close — or show the next queued flood.
      window.setTimeout(() => {
        hideDungeonRewardOverlay(gameState);
        const next = pendingRewardQueue.shift();
        if (next) {
          showDungeonRewardOverlay(next.gameState, next.opts);
          return;
        }
        if (gameState.dungeonEntranceSystem?.startNextQueuedFloodCinematic?.()) {
          return;
        }
        gameState.isDungeonRewardMode = false;
        resumeAfterDungeonRewards(gameState);
      }, 420);
    };

    const requestClaim = async () => {
      if (claimed || confirmOpen) return;
      confirmOpen = true;
      gameState?.inputHandler?.tooltipSystem?.hide?.();

      const confirmIcons = buildRewardStackRow(bundle, gameState, { wrapAt: 3 });
      const confirmed = await showConfirmModal({
        title: 'Claim this reward?',
        message: buildRewardShopValueEl(bundle, gameState).outerHTML,
        messageIsHtml: true,
        confirmText: 'Claim',
        cancelText: 'Cancel',
        confirmButtonClass: 'cta-lime',
        itemIcon: confirmIcons.outerHTML,
      });

      confirmOpen = false;
      if (!confirmed || claimed) return;
      claimed = true;
      grantClaimedReward();
    };

    frame.addEventListener('click', (e) => {
      e.preventDefault();
      void requestClaim();
    });
    frame.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      void requestClaim();
    });

    frame.appendChild(claimBtn);
    choicesRow.appendChild(frame);
  });

  content.appendChild(headerContainer);
  content.appendChild(blurb);
  content.appendChild(choicesRow);
  overlay.appendChild(content);
  document.body.appendChild(overlay);
  activeOverlay = overlay;

  wireTraderRewardTooltips(overlay, gameState);
}

export function forceCloseDungeonRewardOverlay(gameState) {
  pendingRewardQueue = [];
  hideDungeonRewardOverlay(gameState);
  gameState?.dungeonEntranceSystem?._clearFloodCinematic?.();
  if (gameState) {
    gameState.isDungeonRewardMode = false;
    if (typeof window !== 'undefined' && window.syncPauseButton) {
      window.syncPauseButton();
    }
  }
}
