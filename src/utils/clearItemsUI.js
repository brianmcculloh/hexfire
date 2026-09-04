let activeOverlay = null;
let onDocClick = null;

export const CLEAR_ITEMS_SCOPES = {
  all: {
    id: 'all',
    label: 'All Placed Items',
    title: 'Clear All Items?',
    message: 'This will move all items placed on the map back to your inventory.',
    confirmText: 'Clear All',
  },
  towers: {
    id: 'towers',
    label: 'All Towers',
    title: 'Clear All Towers?',
    message: 'This will move all towers on the map back to your inventory.',
    confirmText: 'Clear Towers',
  },
  jet: {
    id: 'jet',
    label: 'Jet Towers',
    title: 'Clear Jet Towers?',
    message: 'This will move all Jet Towers on the map back to your inventory.',
    confirmText: 'Clear Jets',
  },
  nonJet: {
    id: 'nonJet',
    label: 'Non-Jet Towers',
    title: 'Clear Non-Jet Towers?',
    message: 'This will move all non-Jet towers on the map back to your inventory.',
    confirmText: 'Clear Towers',
  },
  bombs: {
    id: 'bombs',
    label: 'Suppression Bombs',
    title: 'Clear Suppression Bombs?',
    message: 'This will move all suppression bombs on the map back to your inventory.',
    confirmText: 'Clear Bombs',
  },
};

const SCOPE_ORDER = ['all', 'towers', 'jet', 'nonJet', 'bombs'];

export function isClearItemsPickerOpen() {
  return !!activeOverlay;
}

export function hideClearItemsPicker() {
  if (onDocClick) {
    document.removeEventListener('mousedown', onDocClick, true);
    onDocClick = null;
  }
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }
}

/**
 * Show the clear-items scope picker above the Clear Items button.
 * @param {{ anchorEl: HTMLElement, counts?: Record<string, number>, onSelect: (scopeId: string) => void }} opts
 */
export function showClearItemsPicker({ anchorEl, counts = {}, onSelect }) {
  hideClearItemsPicker();
  if (!anchorEl) return;

  const overlay = document.createElement('div');
  overlay.id = 'clearItemsPickerOverlay';
  overlay.className = 'clear-items-picker-overlay';
  activeOverlay = overlay;

  const panel = document.createElement('div');
  panel.className = 'clear-items-picker-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Clear items');

  const title = document.createElement('div');
  title.className = 'clear-items-picker-title';
  title.textContent = 'Clear:';
  panel.appendChild(title);

  const buttonsWrap = document.createElement('div');
  buttonsWrap.className = 'clear-items-picker-buttons';

  SCOPE_ORDER.forEach((scopeId) => {
    const scope = CLEAR_ITEMS_SCOPES[scopeId];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'clear-items-picker-btn';
    btn.textContent = scope.label;
    const count = counts[scopeId];
    const isEmpty = typeof count === 'number' && count <= 0;
    if (isEmpty) {
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btn.disabled) return;
      if (typeof window !== 'undefined' && window.AudioManager) {
        window.AudioManager.playSFX('mode_selected');
      }
      hideClearItemsPicker();
      onSelect?.(scopeId);
    });

    buttonsWrap.appendChild(btn);
  });

  panel.appendChild(buttonsWrap);
  panel.style.position = 'fixed';
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const margin = 12;
  const gap = 10;
  const rect = panel.getBoundingClientRect();
  const btnRect = anchorEl.getBoundingClientRect();
  let left = btnRect.left + btnRect.width / 2 - rect.width / 2;
  let top = btnRect.top - rect.height - gap;
  if (top < margin) top = btnRect.bottom + gap;
  left = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin));
  top = Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin));
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;

  onDocClick = (e) => {
    if (panel.contains(e.target)) return;
    if (e.target.closest?.('#clearAllItemsBtn')) return;
    hideClearItemsPicker();
  };
  setTimeout(() => document.addEventListener('mousedown', onDocClick, true), 0);
}
