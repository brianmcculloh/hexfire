const SHOP_QUANTITY_HARD_CAP = 999;

/**
 * Total cost for `quantity` units at a flat unit price.
 * @param {number} unitCost
 * @param {number} quantity
 */
function flatPurchaseTotalCost(unitCost, quantity) {
  const unit = Math.max(0, Number(unitCost) || 0);
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  return unit * qty;
}

/**
 * Max units affordable for the given currency / cost function.
 * @param {number} currency
 * @param {(quantity: number) => number} getTotalCost
 * @param {number} [hardMax]
 */
function maxAffordablePurchaseQuantity(currency, getTotalCost, hardMax = SHOP_QUANTITY_HARD_CAP) {
  const money = Math.max(0, Number(currency) || 0);
  const cap = Math.max(0, Math.floor(Number(hardMax) || 0));
  if (cap <= 0 || typeof getTotalCost !== 'function') return 0;

  let maxQty = 0;
  for (let qty = 1; qty <= cap; qty++) {
    const total = Number(getTotalCost(qty)) || 0;
    if (total > money) break;
    maxQty = qty;
  }
  return maxQty;
}

/**
 * Format the cost line for quantity purchases.
 * Flat prices show `$400 × 2 = $800` when qty > 1; escalating totals show `$total` only.
 * @param {number} unitCost
 * @param {number} quantity
 * @param {number} totalCost
 * @param {boolean} isFlatPricing
 */
function formatPurchaseCostLabel(unitCost, quantity, totalCost, isFlatPricing) {
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  const total = Math.max(0, Math.floor(Number(totalCost) || 0));
  if (qty > 1 && isFlatPricing) {
    const unit = Math.max(0, Math.floor(Number(unitCost) || 0));
    return `$${unit} × ${qty} = $${total}`;
  }
  return `$${total}`;
}

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
  /**
   * Shop multi-buy quantity selector.
   * - `true` / `false` force on/off
   * - default: on for `confirmText === 'Purchase'` with a spend `cost`
   */
  allowQuantity = null,
  /** Player currency for affordability cap (defaults to `window.gameState.player.currency`). */
  playerCurrency = null,
  /** Optional hard max (e.g. 1 for one-time items). */
  maxQuantity = null,
  /** Optional `(quantity) => totalCost` for escalating prices. Defaults to `cost * quantity`. */
  getPurchaseTotalCost = null,
  /** Initial selected quantity (clamped to affordability). */
  initialQuantity = 1,
  /**
   * When true, quantity stays fixed (e.g. tutorial shield purchase).
   * Up/down clicks still fire but show the tutorial-blocked notice instead of changing qty.
   */
  lockQuantity = false,
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

    // Clear prior purchase-item / quantity / cost UI from previous opens
    msgEl.parentNode.querySelector('.modal-purchase-item-row')?.remove();
    msgEl.parentNode.querySelector('.modal-quantity-selector')?.remove();
    msgEl.parentNode.querySelector('.modal-cost-display')?.remove();
    const priorIcon = msgEl.previousElementSibling;
    if (priorIcon?.classList?.contains('modal-item-icon')) {
      priorIcon.remove();
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
    const isCurrencyGain = isCostedAction && currencyFloatDirection === 'gain';
    const resolvedCurrency = Number(
      playerCurrency ??
        (typeof window !== 'undefined' ? window.gameState?.player?.currency : 0) ??
        0
    ) || 0;
    const enableQuantity =
      allowQuantity === true ||
      (allowQuantity !== false && isPurchase && isCostedAction && !isCurrencyGain);

    // Item icon (standalone, or later wrapped with quantity as: icon × qty)
    let iconContainer = null;
    if (itemIcon) {
      iconContainer = document.createElement('div');
      iconContainer.className = 'modal-item-icon';
      iconContainer.innerHTML = itemIcon;
      msgEl.parentNode.insertBefore(iconContainer, msgEl);
    }

    const unitCost = isCostedAction ? Math.max(0, Number(cost) || 0) : 0;
    const isFlatPricing = typeof getPurchaseTotalCost !== 'function';
    const resolveTotalCost = (quantity) => {
      if (typeof getPurchaseTotalCost === 'function') {
        return Math.max(0, Math.floor(Number(getPurchaseTotalCost(quantity)) || 0));
      }
      return flatPurchaseTotalCost(unitCost, quantity);
    };

    const hardMax =
      maxQuantity != null
        ? Math.min(SHOP_QUANTITY_HARD_CAP, Math.max(0, Math.floor(Number(maxQuantity) || 0)))
        : SHOP_QUANTITY_HARD_CAP;
    const maxAffordable = enableQuantity
      ? maxAffordablePurchaseQuantity(resolvedCurrency, resolveTotalCost, hardMax)
      : hardMax;

    let selectedQuantity = enableQuantity
      ? Math.min(maxAffordable, Math.max(0, Math.floor(Number(initialQuantity) || 0)))
      : 1;
    // Prefer starting at 1 when the player can afford at least one
    if (enableQuantity && selectedQuantity === 0 && maxAffordable >= 1) {
      selectedQuantity = 1;
    } else if (enableQuantity && selectedQuantity < 1 && maxAffordable >= 1) {
      selectedQuantity = Math.min(1, maxAffordable);
    }

    let amountSpan = null;
    let qtyValueEl = null;
    let qtyUpBtn = null;
    let qtyDownBtn = null;
    let currentTotalCost = isCostedAction ? resolveTotalCost(enableQuantity ? selectedQuantity : 1) : 0;

    const syncQuantityUi = () => {
      if (!enableQuantity) return;
      currentTotalCost = resolveTotalCost(selectedQuantity);
      if (qtyValueEl) qtyValueEl.textContent = String(selectedQuantity);
      if (qtyUpBtn) {
        // Tutorial lock: keep arrows clickable so we can show the blocked notice
        const canIncrease = lockQuantity
          ? true
          : selectedQuantity < maxAffordable &&
            resolveTotalCost(selectedQuantity + 1) <= resolvedCurrency;
        qtyUpBtn.disabled = !canIncrease;
        qtyUpBtn.classList.toggle('is-disabled', !canIncrease && !lockQuantity);
      }
      if (qtyDownBtn) {
        // Minimum purchase quantity is 1 (never allow 0 via the stepper)
        const canDecrease = lockQuantity ? true : selectedQuantity > 1;
        qtyDownBtn.disabled = !canDecrease;
        qtyDownBtn.classList.toggle('is-disabled', !canDecrease && !lockQuantity);
      }
      if (amountSpan) {
        const label = formatPurchaseCostLabel(
          unitCost,
          selectedQuantity,
          currentTotalCost,
          isFlatPricing
        );
        amountSpan.textContent = label;
        // Slightly smaller when showing "$unit × qty = $total"
        amountSpan.style.fontSize =
          selectedQuantity > 1 && isFlatPricing && label.includes('×') ? '28px' : '36px';
      }
      const canPurchase = selectedQuantity > 0 && currentTotalCost <= resolvedCurrency;
      okBtn.disabled = !canPurchase;
      okBtn.classList.toggle('is-disabled', !canPurchase);
      okBtn.style.opacity = canPurchase ? '' : '0.45';
      okBtn.style.pointerEvents = canPurchase ? '' : 'none';
    };

    if (enableQuantity) {
      const qtyWrap = document.createElement('div');
      qtyWrap.className = 'modal-quantity-selector';
      qtyWrap.setAttribute('role', 'group');
      qtyWrap.setAttribute('aria-label', 'Purchase quantity');

      qtyUpBtn = document.createElement('button');
      qtyUpBtn.type = 'button';
      qtyUpBtn.className = 'modal-quantity-btn modal-quantity-btn-up';
      qtyUpBtn.setAttribute('aria-label', 'Increase quantity');
      qtyUpBtn.setAttribute('data-no-click-sfx', '1');
      qtyUpBtn.innerHTML = '<span aria-hidden="true">▲</span>';

      qtyValueEl = document.createElement('div');
      qtyValueEl.className = 'modal-quantity-value';
      qtyValueEl.setAttribute('aria-live', 'polite');
      qtyValueEl.textContent = String(selectedQuantity);

      qtyDownBtn = document.createElement('button');
      qtyDownBtn.type = 'button';
      qtyDownBtn.className = 'modal-quantity-btn modal-quantity-btn-down';
      qtyDownBtn.setAttribute('aria-label', 'Decrease quantity');
      qtyDownBtn.setAttribute('data-no-click-sfx', '1');
      qtyDownBtn.innerHTML = '<span aria-hidden="true">▼</span>';

      qtyWrap.appendChild(qtyUpBtn);
      qtyWrap.appendChild(qtyValueEl);
      qtyWrap.appendChild(qtyDownBtn);

      // Layout: [item icon] × [qty stepper] on one row
      const itemRow = document.createElement('div');
      itemRow.className = 'modal-purchase-item-row';

      if (iconContainer) {
        iconContainer.classList.add('modal-item-icon--with-qty');
        itemRow.appendChild(iconContainer);
      }

      const timesEl = document.createElement('span');
      timesEl.className = 'modal-quantity-times';
      timesEl.setAttribute('aria-hidden', 'true');
      timesEl.textContent = '×';
      itemRow.appendChild(timesEl);
      itemRow.appendChild(qtyWrap);
      msgEl.parentNode.insertBefore(itemRow, msgEl);

      const notifyQuantityLocked = (e) => {
        const notify = typeof window !== 'undefined'
          ? window.gameState?.showTutorialBlockedNotification
          : null;
        if (typeof notify === 'function') {
          notify(e?.clientX ?? 0, e?.clientY ?? 0);
        }
      };

      qtyUpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (lockQuantity) {
          notifyQuantityLocked(e);
          return;
        }
        if (qtyUpBtn.disabled) return;
        if (typeof window !== 'undefined' && window.AudioManager) {
          window.AudioManager.playSFX('button1');
        }
        selectedQuantity = Math.min(maxAffordable, selectedQuantity + 1);
        syncQuantityUi();
      });
      qtyDownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (lockQuantity) {
          notifyQuantityLocked(e);
          return;
        }
        if (qtyDownBtn.disabled) return;
        if (typeof window !== 'undefined' && window.AudioManager) {
          window.AudioManager.playSFX('button1');
        }
        selectedQuantity = Math.max(1, selectedQuantity - 1);
        syncQuantityUi();
      });
    }
    
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

      amountSpan = document.createElement('span');
      amountSpan.className = 'modal-cost-amount';
      amountSpan.textContent = enableQuantity
        ? formatPurchaseCostLabel(unitCost, selectedQuantity, currentTotalCost, isFlatPricing)
        : `$${cost}`;
      amountSpan.style.cssText = 'color: #00FF88; font-size: 36px; font-weight: bold;';

      costContainer.appendChild(currencyIcon);
      costContainer.appendChild(amountSpan);

      // Keep order: item row (icon × qty) → message → cost
      msgEl.parentNode.insertBefore(costContainer, msgEl.nextSibling);
    }

    if (enableQuantity) {
      syncQuantityUi();
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
    if (enableQuantity) {
      // Re-apply disabled styling after class reset
      syncQuantityUi();
    } else {
      okBtn.disabled = false;
      okBtn.classList.remove('is-disabled');
      okBtn.style.opacity = '';
      okBtn.style.pointerEvents = '';
    }
    
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
          okBtn.disabled = false;
          okBtn.classList.remove('is-disabled');
          okBtn.style.opacity = '';
          okBtn.style.pointerEvents = '';
          msgEl.parentNode.querySelector('.modal-purchase-item-row')?.remove();
          msgEl.parentNode.querySelector('.modal-quantity-selector')?.remove();
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
      } else if (e.key === 'ArrowUp' && enableQuantity) {
        e.preventDefault();
        qtyUpBtn?.click();
      } else if (e.key === 'ArrowDown' && enableQuantity) {
        e.preventDefault();
        qtyDownBtn?.click();
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
      if (enableQuantity && selectedQuantity <= 0) return;
      settled = true;
      detachHandlers();

      if (typeof window !== 'undefined' && window.AudioManager) {
        if (isPurchase || (isCostedAction && !isCurrencyGain)) {
          window.AudioManager.playSFX('purchase');
        } else {
          window.AudioManager.playSFX('confirm');
        }
      }
      
      if (isCostedAction) {
        const costContainer = msgEl.parentNode.querySelector('.modal-cost-display');
        if (costContainer) {
          const floatAmount = enableQuantity ? currentTotalCost : cost;
          if (currencyFloatDirection === 'gain') {
            createModalFloatingText(costContainer, `+$${floatAmount}`, '#00FF88', 48, 1.6875, 40, -45);
          } else {
            createModalFloatingText(costContainer, `-$${floatAmount}`, '#FF3963', 32, 1.5, 50, -20);
          }
        }
      }
      
      await cleanup();
      // Quantity purchases resolve to the selected count; all other confirms resolve true/false.
      resolve(enableQuantity ? selectedQuantity : true);
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
      ':scope > .modal, :scope > .wave-complete-hero-graphic:not(.modal-shell-persist), :scope > .character-speech-bubble:not(.modal-shell-persist)'
    )
  );
}

/** Clear animation classes and inline styles left by shell swap fades. */
export function clearModalShellSwapAnimationState(overlayEl) {
  if (!overlayEl) return;
  overlayEl.classList.remove('game-modal-shell-swap-out', 'game-modal-shell-swap-in');
  getModalShellSwapTargets(overlayEl).forEach((el) => {
    const isPersist = el.classList.contains('modal-shell-persist');
    el.style.removeProperty('animation');
    if (!isPersist) {
      // swap-in prep may set inline opacity: 0; restore visible baseline for modal shell only.
      el.style.opacity = '1';
      el.style.removeProperty('transform');
    } else {
      // Hero portrait: never leave inline opacity/transform — CSS classes own layout.
      el.style.removeProperty('opacity');
      el.style.removeProperty('transform');
    }
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
        const isPersist = el.classList.contains('modal-shell-persist');
        el.style.animation = 'none';
        if (!isPersist) {
          el.style.opacity = '1';
          el.style.transform = 'none';
        }
      });
      void overlayEl.offsetWidth;
      getModalShellSwapTargets(overlayEl).forEach((el) => {
        el.style.removeProperty('animation');
        if (!el.classList.contains('modal-shell-persist')) {
          el.style.removeProperty('opacity');
          el.style.removeProperty('transform');
        } else {
          el.style.removeProperty('opacity');
          el.style.removeProperty('transform');
        }
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

