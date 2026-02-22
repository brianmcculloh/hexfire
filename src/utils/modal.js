// Simple reusable confirm modal helper
export function showConfirmModal({ title = 'Confirm', message = 'Are you sure?', confirmText = 'Confirm', cancelText = 'Cancel', confirmButtonClass = 'cta-lime', itemIcon = null, cost = null } = {}) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirmTitle');
    const msgEl = document.getElementById('confirmMessage');
    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');

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
    msgEl.textContent = message;
    msgEl.style.color = '#FFFFFF';
    
    // Check if this is a purchase or upgrade that should show cost
    const isPurchase = confirmText === 'Purchase';
    const isUpgrade = confirmText === 'Upgrade';
    
    if (cost !== null && (isPurchase || isUpgrade)) {
      // Create cost display element with currency icon
      const costContainer = document.createElement('div');
      costContainer.className = 'modal-cost-display';
      costContainer.style.cssText = 'display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 12px; margin-bottom: 8px;';
      
      const currencyIcon = document.createElement('img');
      currencyIcon.src = 'assets/images/misc/total_earned.png';
      currencyIcon.style.cssText = 'width: 32px; height: auto;';
      
      const costText = document.createElement('span');
      costText.textContent = `$${cost}`;
      costText.style.cssText = 'color: #00FF88; font-size: 32px; font-weight: bold;';
      
      costContainer.appendChild(currencyIcon);
      costContainer.appendChild(costText);
      
      // Insert cost display after message
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
    } else {
      okBtn.textContent = confirmText;
    }
    
    cancelBtn.textContent = cancelText;
    
    // Update confirm button class
    okBtn.className = `choice-btn cta-button ${confirmButtonClass}`;
    
    // Set dark overlay background and pointer events like other modals
    overlay.style.background = 'rgba(0, 0, 0, 0.85)';
    overlay.style.pointerEvents = 'auto';
    const modalInner = overlay.querySelector('.modal');
    if (modalInner) {
      modalInner.style.pointerEvents = 'auto';
    }

    // Show modal (CSS centers via flex when 'active')
    overlay.classList.add('active');

    // Handlers
    const cleanup = () => {
      overlay.classList.remove('active');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKeyDown);
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

    const onOk = () => {
      if (typeof window !== 'undefined' && window.AudioManager) {
        if (isPurchase) {
          window.AudioManager.playSFX('purchase');
        } else {
          window.AudioManager.playSFX('confirm');
        }
      }
      
      // Show red floating text for currency spent if cost is provided
      if (cost !== null && (isPurchase || isUpgrade)) {
        // Create floating text showing currency spent (red, negative)
        const costContainer = msgEl.parentNode.querySelector('.modal-cost-display');
        if (costContainer) {
          createModalFloatingText(costContainer, `-$${cost}`, '#FF3963', 32, 1.5, 50, -20);
        }
      }
      
      cleanup();
      resolve(true);
    };
    const onCancel = () => { cleanup(); resolve(false); };
    const onBackdrop = (e) => {
      if (e.target === overlay) { onCancel(); }
    };

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKeyDown);
  });
}

/**
 * Show a custom rename modal prompt
 * @param {string} currentName - Current name to display
 * @param {string} title - Modal title (optional)
 * @returns {Promise<string|null>} The new name or null if cancelled
 */
export function showRenameModal(currentName = '', title = 'Rename Save') {
  return new Promise((resolve) => {
    const overlay = document.getElementById('renameModal');
    const titleEl = document.getElementById('renameTitle');
    const inputEl = document.getElementById('renameInput');
    const okBtn = document.getElementById('renameOkBtn');
    const cancelBtn = document.getElementById('renameCancelBtn');

    if (!overlay || !titleEl || !inputEl || !okBtn || !cancelBtn) {
      // Fallback: use browser prompt if modal elements are missing
      const result = prompt(title, currentName);
      resolve(result && result.trim() ? result.trim() : null);
      return;
    }

    // Set content
    titleEl.textContent = title;
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
    overlay.classList.add('active');

    // Handlers
    const cleanup = () => {
      overlay.classList.remove('active');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onBackdrop);
      inputEl.removeEventListener('keydown', onKeyDown);
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
    z-index: 10000;
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


