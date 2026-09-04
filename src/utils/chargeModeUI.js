import { CONFIG, clampChargeTargetDistance, normalizeChargeMode, getChargeModeLabel } from '../config.js';

let activeOverlay = null;
/** @type {string|null} Tower id while its picker is open. */
let activeChargeModeTowerId = null;
/** @type {number|null} Target distance highlighted on the map while hovering a picker button. */
let activeChargeModePreviewDistance = null;
/** @type {string|null} Impact mode highlighted on the map while hovering a mode button. */
let activeChargeModePreviewImpactMode = null;

export function getChargeModeModalTowerId() {
  return activeChargeModeTowerId;
}

/** Target distance hovered in the picker (null = show the tower's current target on the map). */
export function getChargeModePreviewDistance() {
  return activeChargeModePreviewDistance;
}

/** Impact mode hovered in the picker (null = show the tower's current mode on the map). */
export function getChargeModePreviewImpactMode() {
  return activeChargeModePreviewImpactMode;
}

function setChargeModePreviewDistance(distance) {
  activeChargeModePreviewDistance = distance == null ? null : clampChargeTargetDistance(distance);
}

function setChargeModePreviewImpactMode(mode) {
  activeChargeModePreviewImpactMode = mode == null ? null : normalizeChargeMode(mode);
}

/** True when map tooltips should be suppressed for this hex (charge picker open on a tower here). */
export function isHexUnderChargeModeModal(q, r, gameState) {
  const towerId = activeChargeModeTowerId;
  if (!towerId || q == null || r == null) return false;
  const tower = gameState?.towerSystem?.getTower?.(towerId);
  return !!(tower && tower.q === q && tower.r === r);
}

/** True when a tower click should apply shield/upgrade/sellback/etc., not open the picker. */
export function isChargeModePickerBlocked(gameState, inputHandler = null) {
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

function hideChargeModeModal() {
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }
  activeChargeModeTowerId = null;
  activeChargeModePreviewDistance = null;
  activeChargeModePreviewImpactMode = null;
}

function getChargeImpactModeTooltipHtml(mode) {
  const title = `${String(mode?.label || mode?.id || 'Mode').toUpperCase()} MODE`;
  const body = mode?.tooltip || '';
  return `<div style="color:#fff;font-size:13px;line-height:1.45;max-width:220px;"><div style="font-weight:bold;margin-bottom:6px;">${title}</div>${body}</div>`;
}

/**
 * @param {Object} gameState
 * @param {Object} tower - Placed charge tower data
 * @param {number} clientX
 * @param {number} clientY
 */
export function showChargeModeModal(gameState, tower, clientX, clientY) {
  if (!tower || tower.type !== CONFIG.TOWER_TYPE_CHARGE) return;
  if (isChargeModePickerBlocked(gameState, gameState?.inputHandler)) return;

  gameState?.inputHandler?.tooltipSystem?.hide?.();

  hideChargeModeModal();
  activeChargeModeTowerId = tower.id;

  const maxReach = gameState.towerSystem?.getMaxChargeStepsInDirection?.(
    tower.q,
    tower.r,
    tower.direction
  ) ?? CONFIG.CHARGE_TARGET_MAX;

  const overlay = document.createElement('div');
  overlay.id = 'chargeModeOverlay';
  overlay.className = 'charge-mode-overlay';
  activeOverlay = overlay;

  const panel = document.createElement('div');
  panel.className = 'charge-mode-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Charge tower settings');

  const tooltipSystem = gameState?.inputHandler?.tooltipSystem;
  const currentMode = normalizeChargeMode(tower.chargeMode ?? CONFIG.CHARGE_MODE_DEFAULT);
  const currentDistance = clampChargeTargetDistance(
    tower.chargeTargetDistance ?? CONFIG.CHARGE_TARGET_DEFAULT,
    maxReach
  );

  const impactTitle = document.createElement('div');
  impactTitle.className = 'charge-mode-title';
  impactTitle.textContent = 'Impact mode:';
  panel.appendChild(impactTitle);

  const impactButtonsWrap = document.createElement('div');
  impactButtonsWrap.className = 'charge-mode-impact-buttons';

  (CONFIG.CHARGE_MODES || []).forEach((mode) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'charge-mode-impact-btn';
    btn.classList.add(`charge-mode-impact-btn--${mode.id}`);
    btn.dataset.mode = mode.id;
    btn.setAttribute('aria-label', mode.label);
    if (mode.id === currentMode) {
      btn.classList.add('charge-mode-impact-btn--active');
    } else {
      btn.classList.add('charge-mode-impact-btn--inactive');
    }

    const icon = document.createElement('img');
    icon.src = mode.icon;
    icon.alt = '';
    icon.className = 'charge-mode-impact-btn-icon';
    icon.draggable = false;
    btn.appendChild(icon);

    btn.addEventListener('mouseenter', (e) => {
      if (!tooltipSystem || !mode.tooltip) return;
      tooltipSystem.show(getChargeImpactModeTooltipHtml(mode), e.clientX, e.clientY - 12);
    });
    btn.addEventListener('mouseleave', () => tooltipSystem?.hide?.());
    btn.addEventListener('mousemove', (e) => {
      if (!tooltipSystem || !mode.tooltip) return;
      tooltipSystem.show(getChargeImpactModeTooltipHtml(mode), e.clientX, e.clientY - 12);
    });

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof window !== 'undefined' && window.AudioManager) {
        window.AudioManager.playSFX('mode_selected');
      }
      if (mode.id === currentMode) {
        hideChargeModeModal();
        tooltipSystem?.hide?.();
        return;
      }

      const ok = gameState.towerSystem?.setChargeMode?.(tower.id, mode.id);
      if (ok) {
        gameState.notificationSystem?.showToast?.(
          `Charge Tower now uses ${getChargeModeLabel(mode.id)} impact`,
          3500,
          'neutral'
        );
      }
      hideChargeModeModal();
      tooltipSystem?.hide?.();
    });

    impactButtonsWrap.appendChild(btn);
  });

  impactButtonsWrap.addEventListener('mouseover', (e) => {
    const btn = e.target.closest?.('.charge-mode-impact-btn');
    if (!btn) return;
    setChargeModePreviewImpactMode(btn.dataset.mode);
  });
  impactButtonsWrap.addEventListener('mouseleave', () => {
    setChargeModePreviewImpactMode(null);
  });

  panel.appendChild(impactButtonsWrap);

  const targetTitle = document.createElement('div');
  targetTitle.className = 'charge-mode-title charge-mode-title--spaced';
  targetTitle.textContent = 'Target hex:';
  panel.appendChild(targetTitle);

  const buttonsWrap = document.createElement('div');
  buttonsWrap.className = 'charge-mode-buttons';

  const minDistance = CONFIG.CHARGE_TARGET_MIN ?? 1;
  const maxDistance = CONFIG.CHARGE_TARGET_MAX ?? 20;

  for (let distance = minDistance; distance <= maxDistance; distance++) {
    const isValid = distance <= maxReach;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'charge-mode-btn';
    btn.dataset.distance = String(distance);
    btn.setAttribute('aria-label', `Hex ${distance}`);
    if (!isValid) {
      btn.setAttribute('aria-disabled', 'true');
    }
    if (distance === currentDistance) {
      btn.classList.add('charge-mode-btn--active');
    } else if (isValid) {
      btn.classList.add('charge-mode-btn--inactive');
    } else {
      btn.classList.add('charge-mode-btn--disabled');
    }

    const label = document.createElement('span');
    label.className = 'charge-mode-btn-label';
    label.textContent = String(distance);
    btn.appendChild(label);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!isValid) return;
      if (typeof window !== 'undefined' && window.AudioManager) {
        window.AudioManager.playSFX('mode_selected');
      }
      if (distance === currentDistance) {
        hideChargeModeModal();
        tooltipSystem?.hide?.();
        return;
      }

      const ok = gameState.towerSystem?.setChargeTargetDistance?.(tower.id, distance);
      if (ok) {
        gameState.notificationSystem?.showToast?.(
          `Charge Tower now targets hex ${distance}`,
          3500,
          'neutral'
        );
      }
      hideChargeModeModal();
      tooltipSystem?.hide?.();
    });

    buttonsWrap.appendChild(btn);
  }

  buttonsWrap.addEventListener('mouseover', (e) => {
    const btn = e.target.closest?.('.charge-mode-btn');
    if (!btn || btn.classList.contains('charge-mode-btn--disabled')) return;
    setChargeModePreviewDistance(Number(btn.dataset.distance));
  });
  buttonsWrap.addEventListener('mouseleave', () => {
    setChargeModePreviewDistance(null);
  });

  panel.appendChild(buttonsWrap);
  panel.style.position = 'fixed';
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const margin = 12;
  const arrowClearance = 75; // Leave room to click the upward rotation arrow
  const rect = panel.getBoundingClientRect();
  let left = clientX - rect.width / 2;
  let top = clientY - rect.height - margin - arrowClearance;
  if (top < margin) top = clientY + margin;
  left = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin));
  top = Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin));
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;

  const onDocClick = (e) => {
    if (panel.contains(e.target)) return;
    hideChargeModeModal();
    tooltipSystem?.hide?.();
    document.removeEventListener('mousedown', onDocClick, true);
  };
  setTimeout(() => document.addEventListener('mousedown', onDocClick, true), 0);
}

export function initChargeModeUI(gameState) {
  if (typeof window !== 'undefined') {
    window.showChargeModeModal = (tower, clientX, clientY) => {
      showChargeModeModal(gameState, tower, clientX, clientY);
    };
    window.hideChargeModeModal = hideChargeModeModal;
  }
}
