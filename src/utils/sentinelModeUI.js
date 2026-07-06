import { CONFIG, getSentinelModeLabel } from '../config.js';

let activeOverlay = null;
/** @type {string|null} Tower id while its mode picker is open (suppresses map tooltip for that tower). */
let activeSentinelModeTowerId = null;

export function getSentinelModeModalTowerId() {
  return activeSentinelModeTowerId;
}

/** True when map tooltips should be suppressed for this hex (sentinel mode picker open on a tower here). */
export function isHexUnderSentinelModeModal(q, r, gameState) {
  const towerId = activeSentinelModeTowerId;
  if (!towerId || q == null || r == null) return false;
  const tower = gameState?.towerSystem?.getTower?.(towerId);
  return !!(tower && tower.q === q && tower.r === r);
}

/** True when a tower click should apply shield/upgrade/sellback/etc., not open the mode picker. */
export function isSentinelModePickerBlocked(gameState, inputHandler = null) {
  const ih = inputHandler ?? gameState?.inputHandler;
  return !!(
    gameState?.isUpgradeSelectionMode ||
    gameState?.isTowerSellbackMode ||
    gameState?.isRepairSelectionMode ||
    gameState?.isPartsRecycleMode ||
    gameState?.isMovementTokenMode ||
    ih?.selectedShieldForPlacement ||
    ih?.selectedTowerForPlacement
  );
}

function hideSentinelModeModal() {
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }
  activeSentinelModeTowerId = null;
}

/**
 * Show the sentinel mode picker near the player's click.
 * @param {Object} gameState
 * @param {Object} tower - Placed sentinel tower data
 * @param {number} clientX
 * @param {number} clientY
 */
export function showSentinelModeModal(gameState, tower, clientX, clientY) {
  if (!tower || tower.type !== CONFIG.TOWER_TYPE_SENTINEL) return;
  if (isSentinelModePickerBlocked(gameState, gameState?.inputHandler)) return;

  gameState?.inputHandler?.tooltipSystem?.hide?.();

  hideSentinelModeModal();
  activeSentinelModeTowerId = tower.id;

  const overlay = document.createElement('div');
  overlay.id = 'sentinelModeOverlay';
  overlay.className = 'sentinel-mode-overlay';
  activeOverlay = overlay;

  const panel = document.createElement('div');
  panel.className = 'sentinel-mode-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Tower mode');

  const title = document.createElement('div');
  title.className = 'sentinel-mode-title';
  title.textContent = 'Sentinel mode:';
  panel.appendChild(title);

  const buttonsWrap = document.createElement('div');
  buttonsWrap.className = 'sentinel-mode-buttons';

  const tooltipSystem = gameState?.inputHandler?.tooltipSystem;
  const currentMode = tower.sentinelMode || CONFIG.SENTINEL_MODE_DEFAULT;
  const modes = CONFIG.SENTINEL_MODES || [];

  modes.forEach((mode) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sentinel-mode-btn';
    btn.dataset.mode = mode.id;
    btn.setAttribute('aria-label', mode.label);
    if (mode.id === currentMode) {
      btn.classList.add('sentinel-mode-btn--active');
    } else {
      btn.classList.add('sentinel-mode-btn--inactive');
    }

    const icon = document.createElement('img');
    icon.src = mode.icon;
    icon.alt = '';
    icon.className = 'sentinel-mode-btn-icon';
    icon.draggable = false;
    const iconScale = mode.iconScale || 1;
    if (iconScale !== 1) {
      icon.style.height = `${Math.round(34 * iconScale)}px`;
      icon.style.maxWidth = `${Math.round(43 * iconScale)}px`;
    }
    if (mode.iconRotateDeg) {
      icon.style.transform = `rotate(${mode.iconRotateDeg}deg)`;
    }
    btn.appendChild(icon);

    btn.addEventListener('mouseenter', (e) => {
      if (!tooltipSystem || !mode.tooltip) return;
      tooltipSystem.show(
        `<div style="color:#fff;font-size:13px;line-height:1.35;max-width:220px;">${mode.tooltip}</div>`,
        e.clientX,
        e.clientY - 12
      );
    });
    btn.addEventListener('mouseleave', () => tooltipSystem?.hide?.());
    btn.addEventListener('mousemove', (e) => {
      if (!tooltipSystem || !mode.tooltip) return;
      tooltipSystem.show(
        `<div style="color:#fff;font-size:13px;line-height:1.35;max-width:220px;">${mode.tooltip}</div>`,
        e.clientX,
        e.clientY - 12
      );
    });

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof window !== 'undefined' && window.AudioManager) {
        window.AudioManager.playSFX('mode_selected');
      }
      if (mode.id === currentMode) {
        hideSentinelModeModal();
        tooltipSystem?.hide?.();
        return;
      }

      const ok = gameState.towerSystem?.setSentinelMode?.(tower.id, mode.id);
      if (ok) {
        const label = getSentinelModeLabel(mode.id);
        gameState.notificationSystem?.showToast?.(
          `Sentinel Tower mode changed to ${label}`,
          3500,
          'neutral'
        );
      }
      hideSentinelModeModal();
      tooltipSystem?.hide?.();
    });

    buttonsWrap.appendChild(btn);
  });

  panel.appendChild(buttonsWrap);
  panel.style.position = 'fixed';
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const margin = 12;
  const rect = panel.getBoundingClientRect();
  let left = clientX - rect.width / 2;
  let top = clientY - rect.height - margin;
  if (top < margin) top = clientY + margin;
  left = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin));
  top = Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin));
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;

  const onDocClick = (e) => {
    if (panel.contains(e.target)) return;
    hideSentinelModeModal();
    tooltipSystem?.hide?.();
    document.removeEventListener('mousedown', onDocClick, true);
  };
  setTimeout(() => document.addEventListener('mousedown', onDocClick, true), 0);
}

export function initSentinelModeUI(gameState) {
  if (typeof window !== 'undefined') {
    window.showSentinelModeModal = (tower, clientX, clientY) => {
      showSentinelModeModal(gameState, tower, clientX, clientY);
    };
    window.hideSentinelModeModal = hideSentinelModeModal;
  }
}
