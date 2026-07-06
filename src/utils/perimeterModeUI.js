import { CONFIG, clampPerimeterRing } from '../config.js';

let activeOverlay = null;
/** @type {string|null} Tower id while its ring picker is open (suppresses map tooltip for that tower). */
let activePerimeterModeTowerId = null;
/** @type {number|null} Ring number highlighted on the map while hovering a picker button. */
let activePerimeterModePreviewRing = null;

export function getPerimeterModeModalTowerId() {
  return activePerimeterModeTowerId;
}

/** Ring hovered in the picker (null = show the tower's current ring on the map). */
export function getPerimeterModePreviewRing() {
  return activePerimeterModePreviewRing;
}

function setPerimeterModePreviewRing(ring) {
  activePerimeterModePreviewRing = ring == null ? null : clampPerimeterRing(ring);
}

/** True when map tooltips should be suppressed for this hex (perimeter ring picker open on a tower here). */
export function isHexUnderPerimeterModeModal(q, r, gameState) {
  const towerId = activePerimeterModeTowerId;
  if (!towerId || q == null || r == null) return false;
  const tower = gameState?.towerSystem?.getTower?.(towerId);
  return !!(tower && tower.q === q && tower.r === r);
}

/** True when a tower click should apply shield/upgrade/sellback/etc., not open the ring picker. */
export function isPerimeterModePickerBlocked(gameState, inputHandler = null) {
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

function hidePerimeterModeModal() {
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }
  activePerimeterModeTowerId = null;
  activePerimeterModePreviewRing = null;
}

/**
 * Show the perimeter ring picker near the player's click.
 * @param {Object} gameState
 * @param {Object} tower - Placed perimeter tower data
 * @param {number} clientX
 * @param {number} clientY
 */
export function showPerimeterModeModal(gameState, tower, clientX, clientY) {
  if (!tower || tower.type !== CONFIG.TOWER_TYPE_PERIMETER) return;
  if (isPerimeterModePickerBlocked(gameState, gameState?.inputHandler)) return;

  gameState?.inputHandler?.tooltipSystem?.hide?.();

  hidePerimeterModeModal();
  activePerimeterModeTowerId = tower.id;

  const overlay = document.createElement('div');
  overlay.id = 'perimeterModeOverlay';
  overlay.className = 'perimeter-mode-overlay';
  activeOverlay = overlay;

  const panel = document.createElement('div');
  panel.className = 'perimeter-mode-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Target ring');

  const title = document.createElement('div');
  title.className = 'perimeter-mode-title';
  title.textContent = 'Target ring:';
  panel.appendChild(title);

  const buttonsWrap = document.createElement('div');
  buttonsWrap.className = 'perimeter-mode-buttons';

  const tooltipSystem = gameState?.inputHandler?.tooltipSystem;
  const currentRing = clampPerimeterRing(tower.perimeterRing ?? CONFIG.PERIMETER_RING_DEFAULT);
  const minRing = CONFIG.PERIMETER_RING_MIN ?? 1;
  const maxRing = CONFIG.PERIMETER_RING_MAX ?? 10;

  for (let ring = minRing; ring <= maxRing; ring++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'perimeter-mode-btn';
    btn.dataset.ring = String(ring);
    btn.setAttribute('aria-label', `Ring ${ring}`);
    if (ring === currentRing) {
      btn.classList.add('perimeter-mode-btn--active');
    } else {
      btn.classList.add('perimeter-mode-btn--inactive');
    }

    const label = document.createElement('span');
    label.className = 'perimeter-mode-btn-label';
    label.textContent = String(ring);
    btn.appendChild(label);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof window !== 'undefined' && window.AudioManager) {
        window.AudioManager.playSFX('mode_selected');
      }
      if (ring === currentRing) {
        hidePerimeterModeModal();
        tooltipSystem?.hide?.();
        return;
      }

      const ok = gameState.towerSystem?.setPerimeterRing?.(tower.id, ring);
      if (ok) {
        gameState.notificationSystem?.showToast?.(
          `Perimeter Tower now targets ring ${ring}`,
          3500,
          'neutral'
        );
      }
      hidePerimeterModeModal();
      tooltipSystem?.hide?.();
    });

    buttonsWrap.appendChild(btn);
  }

  buttonsWrap.addEventListener('mouseover', (e) => {
    const btn = e.target.closest?.('.perimeter-mode-btn');
    if (!btn) return;
    setPerimeterModePreviewRing(Number(btn.dataset.ring));
  });
  buttonsWrap.addEventListener('mouseleave', () => {
    setPerimeterModePreviewRing(null);
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
    hidePerimeterModeModal();
    tooltipSystem?.hide?.();
    document.removeEventListener('mousedown', onDocClick, true);
  };
  setTimeout(() => document.addEventListener('mousedown', onDocClick, true), 0);
}

export function initPerimeterModeUI(gameState) {
  if (typeof window !== 'undefined') {
    window.showPerimeterModeModal = (tower, clientX, clientY) => {
      showPerimeterModeModal(gameState, tower, clientX, clientY);
    };
    window.hidePerimeterModeModal = hidePerimeterModeModal;
  }
}
