/**
 * Mid-wave dungeon flood reward picker — pause, choose 1 of 3 bundles, grant, resume.
 * Layout mirrors the artifact trader (free-floating header + blurb; framed reward choices).
 */

import {
  applyRewardBundleToPlayer,
  buildRewardStackRow,
  playRewardBundleFloatAnimation,
  wireTraderRewardTooltips,
} from './artifactTrader.js';

let activeOverlay = null;

export function isDungeonRewardPickerOpen() {
  return !!activeOverlay;
}

function hideDungeonRewardOverlay(gameState = null) {
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }
  gameState?.inputHandler?.tooltipSystem?.hide?.();
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
  hideDungeonRewardOverlay(gameState);
  if (!gameState || !Array.isArray(opts?.choices) || opts.choices.length === 0) return;

  gameState.isDungeonRewardMode = true;
  if (typeof window !== 'undefined' && window.gameLoop && !window.gameLoop.isPaused) {
    window.gameLoop.pause();
  }
  if (typeof window !== 'undefined' && window.AudioManager) {
    window.AudioManager.playSFX('pause');
  }
  if (typeof window !== 'undefined' && window.syncPauseButton) {
    window.syncPauseButton();
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
    const row = buildRewardStackRow(bundle, gameState);
    stackWrap.appendChild(row);
    frame.appendChild(stackWrap);

    // Visual only — whole frame is the click/keyboard target
    const claimBtn = document.createElement('span');
    claimBtn.className = 'dungeon-reward-claim-btn choice-btn cta-button cta-yellow';
    claimBtn.textContent = 'Claim';
    claimBtn.setAttribute('aria-hidden', 'true');

    const claimReward = () => {
      if (claimed) return;
      claimed = true;

      gameState?.inputHandler?.tooltipSystem?.hide?.();
      playRewardBundleFloatAnimation(stackWrap);
      applyRewardBundleToPlayer(gameState, bundle);

      // Queue mid-wave replacement 5s after claim (or next wave if <5s remain).
      gameState.dungeonEntranceSystem?.scheduleMidWaveSpawnAfterClaim?.();

      if (typeof window !== 'undefined' && window.AudioManager) {
        window.AudioManager.playSFX('purchase', { volume: 0.75, dedupeMs: 200 });
      }
      if (window.updatePowerUpPanel) window.updatePowerUpPanel();
      if (window.updateTempPowerUpPanel) window.updateTempPowerUpPanel();
      if (window.updateBottomEdgePowerUps) window.updateBottomEdgePowerUps();
      if (window.updateUI) window.updateUI();
      if (window.updateInventory) window.updateInventory();

      // Brief beat so float animation is visible, then close + resume.
      window.setTimeout(() => {
        hideDungeonRewardOverlay(gameState);
        gameState.isDungeonRewardMode = false;
        if (typeof window !== 'undefined' && window.gameLoop?.isPaused && gameState.wave?.isActive) {
          window.gameLoop.resume();
        }
        if (typeof window !== 'undefined' && window.AudioManager) {
          window.AudioManager.playSFX('resume');
        }
        if (typeof window !== 'undefined' && window.syncPauseButton) {
          window.syncPauseButton();
        }
      }, 420);
    };

    frame.addEventListener('click', (e) => {
      e.preventDefault();
      claimReward();
    });
    frame.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      claimReward();
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
  hideDungeonRewardOverlay(gameState);
  if (gameState) {
    gameState.isDungeonRewardMode = false;
    if (typeof window !== 'undefined' && window.syncPauseButton) {
      window.syncPauseButton();
    }
  }
}
