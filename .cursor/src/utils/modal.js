// Simple reusable confirm modal helper
export function showConfirmModal({
  title = 'Confirm',
  message = 'Are you sure?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmButtonClass = 'cta-lime',
  itemIcon = null,
  cost = null,
  /** Prefix for cost row when `cost` is set (e.g. "Finder's Fee"). */
  costLabel = null,
  confirmButtonIcon = null,
  aboveTutorial = false,
  muteCancelClickSfx = false,
  /** When true, `message` is set as `innerHTML` (caller must supply safe HTML). */
  messageIsHtml = false,
  /** Hide cancel; backdrop and Escape dismiss like OK (informational dialogs). */
  hideCancel = false,
  /** Pin dialog toward the right (same layout as shop purchase confirms). */
  pinDialogRight = false,
  /** When `cost` is set: `'spend'` (default) shows red −$ on confirm; `'gain'` shows green +$ like wave rewards. */
  currencyFloatDirection = 'spend',
} = {}) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirmTitle');
    const msgEl = document.getElementById('confirmMessage');
    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    const choicesRow = okBtn?.parentElement;

    if (!overlay || !titleEl || !msgEl || !okBtn || !cancelBtn) {
      // Fallback: resolve false if modal elements are missing
      resolve(false);
      return;
    }

    // Set content
    titleEl.textContent = title;
    
    // Handle item icon - insert before message if provided
    if (itemIcon) {
      // Check if there's already an icon container, if not create one
      let iconContainer = msgEl.previousElementSibling;
      if (!iconContainer || !iconContainer.classList.contains('modal-item-icon')) {
        iconContainer = document.createElement('div');
        iconContainer.className = 'modal-item-icon';
        iconContainer.style.cssText = 'display: flex; justify-content: center; align-items: center; margin-bottom: 16px; margin-top: 8px;';
        msgEl.parentNode.insertBefore(iconContainer, msgEl);
      }
      iconContainer.innerHTML = itemIcon;
      iconContainer.style.display = 'flex';
    } else {
      // Hide icon container if no icon provided
      const iconContainer = msgEl.previousElementSibling;
      if (iconContainer && iconContainer.classList.contains('modal-item-icon')) {
        iconContainer.style.display = 'none';
      }
    }
    
    // Handle cost display for purchases/upgrades - show prominently with currency icon
    // Remove any existing cost container first
    const existingCostContainer = msgEl.parentNode.querySelector('.modal-cost-display');
    if (existingCostContainer) {
      existingCostContainer.remove();
    }
    
    // Show message (description) for all modals
    msgEl.style.display = 'block';
    if (messageIsHtml) {
      msgEl.innerHTML = message;
    } else {
      msgEl.textContent = message;
    }
    msgEl.style.color = '#FFFFFF';
    
    // Check if this is a purchase or upgrade that should show cost
    const isPurchase = confirmText === 'Purchase';
    const isUpgrade = confirmText === 'Upgrade';
    const isCostedAction = cost !== null;
    
    if (isCostedAction) {
      const costContainer = document.createElement('div');
      costContainer.className = 'modal-cost-display';
      costContainer.style.cssText =
        'display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 12px; margin-bottom: 8px;';

      if (costLabel && String(costLabel).trim()) {
        const labelSpan = document.createElement('span');
        labelSpan.textContent = `${String(costLabel).trim()}:`;
        labelSpan.style.cssText = 'color: #00FF88; font-size: 36px; font-weight: bold;';
        costContainer.appendChild(labelSpan);
      }

      const currencyIcon = document.createElement('img');
      currencyIcon.src = 'assets/images/misc/total_earned.png';
      currencyIcon.style.cssText = 'width: 40px; height: auto; image-rendering: crisp-edges;';

      const amountSpan = document.createElement('span');
      amountSpan.textContent = `$${cost}`;
      amountSpan.style.cssText = 'color: #00FF88; font-size: 36px; font-weight: bold;';

      costContainer.appendChild(currencyIcon);
      costContainer.appendChild(amountSpan);

      msgEl.parentNode.insertBefore(costContainer, msgEl.nextSibling);
    }
    
    // If confirmText is "Purchase", add the total_earned.png image to the left
    if (isPurchase) {
      okBtn.innerHTML = '';
      const img = document.createElement('img');
      img.src = 'assets/images/misc/total_earned.png';
      img.style.cssText = 'margin-right: 8px;';
      okBtn.appendChild(img);
      const textSpan = document.createElement('span');
      textSpan.textContent = confirmText;
      okBtn.appendChild(textSpan);
    } else if (confirmButtonIcon) {
      okBtn.innerHTML = '';
      const img = document.createElement('img');
      img.src = confirmButtonIcon;
      img.style.cssText = 'margin-right: 8px; width: 36px; height: 36px; object-fit: contain;';
      okBtn.appendChild(img);
      const textSpan = document.createElement('span');
      textSpan.textContent = confirmText;
      okBtn.appendChild(textSpan);
    } else {
      okBtn.textContent = confirmText;
    }
    
    cancelBtn.textContent = cancelText;
    if (hideCancel) {
      cancelBtn.style.display = 'none';
      if (choicesRow) choicesRow.classList.add('modal-choices-single');
    } else {
      cancelBtn.style.display = '';
      if (choicesRow) choicesRow.classList.remove('modal-choices-single');
    }
    if (muteCancelClickSfx) {
      cancelBtn.setAttribute('data-no-click-sfx', '1');
    } else {
      cancelBtn.removeAttribute('data-no-click-sfx');
    }
    
    // Update confirm button class
    okBtn.className = `choice-btn cta-button ${confirmButtonClass}`;
    
    // Set dark overlay background and pointer events like other modals
    overlay.style.background = 'rgba(0, 0, 0, 0.85)';
    overlay.style.pointerEvents = 'auto';
    const modalInner = overlay.querySelector('.modal');
    if (modalInner) {
      modalInner.style.pointerEvents = 'auto';
    }

    // Shop purchase/upgrade confirms — pin dialog toward viewport right (CSS .confirm-modal-purchase)
    const useRightPinLayout = isPurchase || isUpgrade || isCostedAction || pinDialogRight;
    if (useRightPinLayout) {
      overlay.classList.add('confirm-modal-purchase');
      if (isPurchase) overlay.dataset.confirmModalKind = 'purchase';
      else if (isUpgrade) overlay.dataset.confirmModalKind = 'upgrade';
      else if (isCostedAction) overlay.dataset.confirmModalKind = 'costed';
      else delete overlay.dataset.confirmModalKind;
    } else {
      delete overlay.dataset.confirmModalKind;
    }

    // Show modal (CSS centers via flex when 'active')
    openModalOverlay(overlay, {
      extraAdd: aboveTutorial ? ['confirm-modal-above-tutorial'] : [],
    });

    let settled = false;

    const detachHandlers = () => {
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKeyDown);
    };

    /** Await close animation so a follow-up showConfirmModal on the same overlay is not dismissed by this close. */
    const cleanup = async () => {
      await closeModalOverlay(overlay, {
        extraRemove: ['confirm-modal-above-tutorial', 'confirm-modal-purchase'],
        onDone: () => {
          delete overlay.dataset.confirmModalKind;
          cancelBtn.removeAttribute('data-no-click-sfx');
          cancelBtn.style.display = '';
          if (choicesRow) choicesRow.classList.remove('modal-choices-single');
          if (messageIsHtml) {
            msgEl.innerHTML = '';
          }
        },
      });
    };

    const onKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onOk();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (hideCancel) {
          onOk();
        } else {
          onCancel();
        }
      }
    };

    const onOk = async () => {
      if (settled) return;
      settled = true;
      detachHandlers();

      if (typeof window !== 'undefined' && window.AudioManager) {
        const isCurrencyGain = isCostedAction && currencyFloatDirection === 'gain';
        if (isPurchase || (isCostedAction && !isCurrencyGain)) {
          window.AudioManager.playSFX('purchase');
        } else {
          window.AudioManager.playSFX('confirm');
        }
      }
      
      if (isCostedAction) {
        const costContainer = msgEl.parentNode.querySelector('.modal-cost-display');
        if (costContainer) {
          if (currencyFloatDirection === 'gain') {
            createModalFloatingText(costContainer, `+$${cost}`, '#00FF88', 48, 1.6875, 40, -45);
          } else {
            createModalFloatingText(costContainer, `-$${cost}`, '#FF3963', 32, 1.5, 50, -20);
          }
        }
      }
      
      await cleanup();
      resolve(true);
    };
    const onCancel = async () => {
      if (settled) return;
      settled = true;
      detachHandlers();
      await cleanup();
      resolve(false);
    };
    const onBackdrop = (e) => {
      if (e.target === overlay) {
        if (hideCancel) {
          onOk();
        } else {
          onCancel();
        }
      }
    };

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKeyDown);
  });
}

const RENAME_MODAL_DEFAULTS = {
  title: 'Rename Save',
  subtitle: 'Enter a new name:',
  confirmText: 'Rename',
};

/**
 * Show a custom rename modal prompt
 * @param {string} currentName - Current name to display
 * @param {string} title - Modal title (optional)
 * @param {{ subtitle?: string, confirmText?: string }} [options]
 * @returns {Promise<string|null>} The new name or null if cancelled
 */
export function showRenameModal(currentName = '', title = RENAME_MODAL_DEFAULTS.title, options = {}) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('renameModal');
    const titleEl = document.getElementById('renameTitle');
    const subtitleEl = document.getElementById('renameSubtitle');
    const inputEl = document.getElementById('renameInput');
    const okBtn = document.getElementById('renameOkBtn');
    const cancelBtn = document.getElementById('renameCancelBtn');

    if (!overlay || !titleEl || !inputEl || !okBtn || !cancelBtn) {
      // Fallback: use browser prompt if modal elements are missing
      const result = prompt(title, currentName);
      resolve(result && result.trim() ? result.trim() : null);
      return;
    }

    const subtitleProvided = Object.prototype.hasOwnProperty.call(options, 'subtitle');
    const subtitle = subtitleProvided ? options.subtitle : RENAME_MODAL_DEFAULTS.subtitle;
    const confirmText = options.confirmText ?? RENAME_MODAL_DEFAULTS.confirmText;

    // Set content
    titleEl.textContent = title;
    if (subtitleEl) {
      if (subtitle) {
        subtitleEl.textContent = subtitle;
        subtitleEl.style.display = '';
      } else {
        subtitleEl.style.display = 'none';
      }
    }
    okBtn.textContent = confirmText;
    inputEl.value = currentName;
    inputEl.focus();
    inputEl.select(); // Select all text for easy editing

    // Set dark overlay background and pointer events like other modals
    overlay.style.background = 'rgba(0, 0, 0, 0.85)';
    overlay.style.pointerEvents = 'auto';
    const modalInner = overlay.querySelector('.modal');
    if (modalInner) {
      modalInner.style.pointerEvents = 'auto';
    }

    // Show modal
    openModalOverlay(overlay);

    // Handlers
    const cleanup = () => {
      closeModalOverlay(overlay, {
        onDone: () => {
          titleEl.textContent = RENAME_MODAL_DEFAULTS.title;
          if (subtitleEl) {
            subtitleEl.textContent = RENAME_MODAL_DEFAULTS.subtitle;
            subtitleEl.style.display = '';
          }
          okBtn.textContent = RENAME_MODAL_DEFAULTS.confirmText;
          okBtn.removeEventListener('click', onOk);
          cancelBtn.removeEventListener('click', onCancel);
          overlay.removeEventListener('click', onBackdrop);
          inputEl.removeEventListener('keydown', onKeyDown);
        },
      });
    };

    const onOk = () => {
      if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('confirm');
      const newName = inputEl.value.trim();
      cleanup();
      resolve(newName || null);
    };

    const onCancel = () => {
      cleanup();
      resolve(null);
    };

    const onBackdrop = (e) => {
      if (e.target === overlay) { onCancel(); }
    };

    const onKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onOk();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onBackdrop);
    inputEl.addEventListener('keydown', onKeyDown);
  });
}

/**
 * Create a floating text animation in a modal (similar to XP notifications on canvas)
 * @param {HTMLElement} targetElement - Element to position the floating text above
 * @param {string} text - Text to display
 * @param {string} color - Text color (e.g., '#FF3963')
 * @param {number} fontSize - Font size in pixels (default: 16)
 * @param {number} duration - Duration in seconds (default: 1.5)
 * @param {number} floatDistance - Distance to float up in pixels (default: 40)
 * @param {number} startOffsetY - Starting Y offset in pixels (default: 0, negative values move up)
 */
export function createModalFloatingText(targetElement, text, color, fontSize = 16, duration = 1.5, floatDistance = 40, startOffsetY = 0) {
  if (!targetElement) return;
  
  // Create floating text element
  const floatingText = document.createElement('div');
  floatingText.textContent = text;
  
  // Get position relative to target element using viewport coordinates
  const targetRect = targetElement.getBoundingClientRect();
  
  // Find modal container (overlay or modal itself)
  const modal = targetElement.closest('.modal-overlay') || targetElement.closest('.modal');
  
  // Use fixed positioning for viewport-relative positioning (works with modals)
  const startX = targetRect.left + (targetRect.width / 2); // Center horizontally
  const startY = targetRect.top + startOffsetY; // Start at top of target, with optional offset
  
  // Calculate timing: opacity stays at 1 for first half, fades in second half
  const fadeStartDelay = duration / 2; // Start fading at halfway point
  const fadeDuration = duration / 2; // Fade duration is second half
  
  floatingText.style.cssText = `
    position: fixed;
    left: ${startX}px;
    top: ${startY}px;
    color: ${color};
    font-size: ${fontSize}px;
    font-weight: bold;
    font-family: 'Exo 2', sans-serif;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
    pointer-events: none;
    white-space: nowrap;
    z-index: 100500;
    opacity: 1;
    transform: translate(-50%, 0);
    transition: transform ${duration}s ease-out, opacity ${fadeDuration}s ease-out ${fadeStartDelay}s;
  `;
  
  // Append to document body (fixed positioning doesn't need parent container context)
  document.body.appendChild(floatingText);
  
  // Trigger animation on next frame
  requestAnimationFrame(() => {
    floatingText.style.transform = `translate(-50%, -${floatDistance}px)`;
    floatingText.style.opacity = '0';
  });
  
  // Remove element after animation completes
  setTimeout(() => {
    if (floatingText.parentNode) {
      floatingText.parentNode.removeChild(floatingText);
    }
  }, duration * 1000 + 100); // Add small buffer
}

/**
 * Floating image up + fade (same timing/feel as createModalFloatingText for wave-complete rewards).
 * @param {HTMLElement} targetElement - Element used to anchor the start position (center-top)
 * @param {string} imageSrc - URL for the floating image
 * @param {number} imageHeightPx
 * @param {number} duration - Total seconds (default matches typical wave-complete text)
 * @param {number} floatDistance - Pixels to float upward
 * @param {number} startOffsetY - Extra Y offset from target top (negative = higher)
 */
export function createModalFloatingImage(
  targetElement,
  imageSrc,
  imageHeightPx = 52,
  duration = 1.6875,
  floatDistance = 40,
  startOffsetY = -45
) {
  if (!targetElement) return;

  const img = document.createElement('img');
  img.src = imageSrc;
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');

  const targetRect = targetElement.getBoundingClientRect();
  const startX = targetRect.left + targetRect.width / 2;
  const startY = targetRect.top + startOffsetY;

  const fadeStartDelay = duration / 2;
  const fadeDuration = duration / 2;

  const smoothCollectible = /\/items\/|\/power_ups\/|\/artifacts\//.test(imageSrc);
  if (smoothCollectible) {
    img.classList.add('collectible-sprite-smooth');
  }

  img.style.cssText = `
    position: fixed;
    left: ${startX}px;
    top: ${startY}px;
    height: ${imageHeightPx}px;
    width: auto;
    max-width: 90vw;
    object-fit: contain;
    ${smoothCollectible ? '' : 'image-rendering: pixelated;'}
    pointer-events: none;
    z-index: 100500;
    opacity: 1;
    transform: translate(-50%, 0);
    transition: transform ${duration}s ease-out, opacity ${fadeDuration}s ease-out ${fadeStartDelay}s;
  `;

  document.body.appendChild(img);

  requestAnimationFrame(() => {
    img.style.transform = `translate(-50%, -${floatDistance}px)`;
    img.style.opacity = '0';
  });

  setTimeout(() => {
    if (img.parentNode) {
      img.parentNode.removeChild(img);
    }
  }, duration * 1000 + 100);
}

/** Backdrop fade duration (ms) — keep in sync with style.css game-modal-* rules */
export const MODAL_TRANSITION_MS = 285;

/** Content fade durations (ms) — keep in sync with gameModalContentFade* in style.css */
export const MODAL_CONTENT_FADE_IN_MS = 338;
export const MODAL_CONTENT_FADE_OUT_MS = 263;

/** Story panel crossfade uses the same content fade timings as modal crossfades */
export const STORY_PANEL_FADE_IN_MS = MODAL_CONTENT_FADE_IN_MS;
export const STORY_PANEL_FADE_OUT_MS = MODAL_CONTENT_FADE_OUT_MS;

/**
 * @returns {boolean}
 */
export function prefersReducedModalMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

/**
 * @param {HTMLElement | null | undefined} overlayEl
 */
export function playModalEnterAnimation(overlayEl) {
  if (!overlayEl?.classList?.contains('modal-overlay')) return;
  overlayEl.classList.remove('game-modal-exit');
  overlayEl.classList.remove('game-modal-enter');
  void overlayEl.offsetWidth;
  overlayEl.classList.add('game-modal-enter');
}

/** @deprecated Use playModalEnterAnimation */
export const playGameModalEnterAnimation = playModalEnterAnimation;

/**
 * @param {HTMLElement | null | undefined} overlayEl
 * @param {{ extraAdd?: string[], pointerEvents?: string | false }} [options]
 */
export function openModalOverlay(overlayEl, options = {}) {
  if (!overlayEl) return;
  const { extraAdd = [], pointerEvents = 'auto' } = options;
  overlayEl.classList.add('active', ...extraAdd);
  if (pointerEvents !== false) {
    overlayEl.style.pointerEvents = pointerEvents === true ? 'auto' : pointerEvents;
  }
  playModalEnterAnimation(overlayEl);
}

/**
 * Fade out then hide a full-screen modal overlay.
 * @param {HTMLElement | null | undefined} overlayEl
 * @param {{ extraRemove?: string[], onDone?: (() => void) | null, skipAnimation?: boolean, clearPointerEvents?: boolean }} [options]
 * @returns {Promise<void>}
 */
export function closeModalOverlay(overlayEl, options = {}) {
  const {
    extraRemove = [],
    onDone = null,
    skipAnimation = false,
    clearPointerEvents = true,
  } = options;

  const finish = () => {
    if (!overlayEl) {
      onDone?.();
      return;
    }
    overlayEl.classList.remove('active', 'game-modal-enter', 'game-modal-exit', ...extraRemove);
    if (clearPointerEvents) overlayEl.style.pointerEvents = '';
    onDone?.();
  };

  if (!overlayEl) {
    finish();
    return Promise.resolve();
  }

  const shouldAnimate =
    !skipAnimation &&
    !prefersReducedModalMotion() &&
    overlayEl.classList.contains('active') &&
    !overlayEl.classList.contains('game-modal-exit');

  if (!shouldAnimate) {
    finish();
    return Promise.resolve();
  }

  overlayEl.classList.remove('game-modal-enter');
  overlayEl.classList.add('game-modal-exit');
  overlayEl.style.pointerEvents = 'none';

  return new Promise((resolve) => {
    window.setTimeout(() => {
      finish();
      resolve();
    }, MODAL_TRANSITION_MS);
  });
}

/**
 * Open the next full-screen modal while fading out the current one (no gap showing the map).
 * `openNext` must synchronously show the incoming overlay (active + enter animation).
 * @param {HTMLElement | null | undefined} fromEl
 * @param {() => void} openNext
 * @param {{ toEl?: HTMLElement | null, extraRemoveFrom?: string[], onDone?: (() => void) | null }} [options]
 */
export function crossfadeModalOverlays(fromEl, openNext, options = {}) {
  const { toEl = null, extraRemoveFrom = [], onDone = null } = options;
  const finishFrom = () => {
    if (fromEl) {
      fromEl.classList.remove('active', 'game-modal-enter', 'game-modal-exit', ...extraRemoveFrom);
      fromEl.style.pointerEvents = '';
      fromEl.style.zIndex = '';
    }
    if (toEl) toEl.style.zIndex = '';
    onDone?.();
  };

  openNext?.();

  if (!fromEl?.classList.contains('active')) {
    finishFrom();
    return Promise.resolve();
  }

  if (prefersReducedModalMotion()) {
    finishFrom();
    return Promise.resolve();
  }

  if (toEl) toEl.style.zIndex = '1001';

  fromEl.classList.remove('game-modal-enter');
  fromEl.classList.add('game-modal-exit');
  fromEl.style.pointerEvents = 'none';

  return new Promise((resolve) => {
    window.setTimeout(() => {
      finishFrom();
      resolve();
    }, MODAL_TRANSITION_MS);
  });
}

/** Direct children that participate in same-overlay content crossfades */
function getModalShellSwapTargets(overlayEl) {
  if (!overlayEl) return [];
  return Array.from(
    overlayEl.querySelectorAll(
      ':scope > .modal, :scope > .wave-complete-hero-graphic, :scope > .character-speech-bubble'
    )
  );
}

/** Clear animation classes and inline styles left by shell swap fades. */
export function clearModalShellSwapAnimationState(overlayEl) {
  if (!overlayEl) return;
  overlayEl.classList.remove('game-modal-shell-swap-out', 'game-modal-shell-swap-in');
  getModalShellSwapTargets(overlayEl).forEach((el) => {
    // swap-in prep may set inline opacity: 0; removing it alone leaves the shell invisible
    // once the animation class is torn down, so always restore a visible baseline.
    el.style.opacity = '1';
    el.style.removeProperty('transform');
  });
}

/**
 * Crossfade modal content inside an already-open overlay (backdrop stays opaque).
 * @param {HTMLElement | null | undefined} overlayEl
 * @param {() => void} swapContent
 * @param {{ onDone?: (() => void) | null }} [options]
 * @returns {Promise<void>}
 */
export function crossfadeModalShellContent(overlayEl, swapContent, options = {}) {
  const { onDone = null } = options;

  if (!overlayEl?.classList.contains('active')) {
    swapContent?.();
    clearModalShellSwapAnimationState(overlayEl);
    onDone?.();
    return Promise.resolve();
  }

  if (prefersReducedModalMotion()) {
    swapContent?.();
    clearModalShellSwapAnimationState(overlayEl);
    onDone?.();
    return Promise.resolve();
  }

  overlayEl.classList.remove('game-modal-enter', 'game-modal-exit', 'game-modal-shell-swap-in');
  overlayEl.classList.add('game-modal-shell-swap-out');
  overlayEl.style.pointerEvents = 'none';

  return new Promise((resolve) => {
    window.setTimeout(() => {
      overlayEl.classList.remove('game-modal-shell-swap-out');

      // swap-out ends at opacity: 0 (forwards); clear residue before rebuilding DOM.
      getModalShellSwapTargets(overlayEl).forEach((el) => {
        el.style.animation = 'none';
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
      void overlayEl.offsetWidth;
      getModalShellSwapTargets(overlayEl).forEach((el) => {
        el.style.removeProperty('animation');
        el.style.removeProperty('opacity');
        el.style.removeProperty('transform');
      });

      swapContent?.();

      void overlayEl.offsetWidth;
      overlayEl.classList.add('game-modal-shell-swap-in');
      overlayEl.style.pointerEvents = 'auto';

      window.setTimeout(() => {
        clearModalShellSwapAnimationState(overlayEl);
        onDone?.();
        resolve();
      }, MODAL_CONTENT_FADE_IN_MS);
    }, MODAL_CONTENT_FADE_OUT_MS);
  });
}

