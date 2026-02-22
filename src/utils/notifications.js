// Notification System - Floating XP text and visual effects

import { getFireTypeConfig } from '../config.js';

export class NotificationSystem {
  constructor() {
    this.notifications = [];
    this.nextId = 0;
    
    // Toast notification queue
    this.toastQueue = [];
    this.activeToasts = [];
    this.toastContainer = null;
    // Initialize container when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initializeToastContainer());
    } else {
      this.initializeToastContainer();
    }
  }

  /**
   * Initialize the toast notification container
   */
  initializeToastContainer() {
    // Create container if it doesn't exist
    if (!document.getElementById('toast-notification-container')) {
      const canvasContainer = document.querySelector('.canvas-container');
      if (canvasContainer) {
        const container = document.createElement('div');
        container.id = 'toast-notification-container';
        container.className = 'toast-notification-container';
        canvasContainer.appendChild(container);
        this.toastContainer = container;
      }
    } else {
      this.toastContainer = document.getElementById('toast-notification-container');
    }
  }

  /**
   * Show a toast notification message
   * @param {string} message - The message to display
   */
  showToast(message) {
    if (!this.toastContainer) {
      this.initializeToastContainer();
    }
    
    const toastId = this.nextId++;
    const toast = {
      id: toastId,
      message,
      startTime: Date.now(),
      displayDuration: 3000, // 3 seconds
      fadeInDuration: 300, // 300ms fade in
      fadeOutDuration: 300, // 300ms fade out
    };
    
    // Create toast element
    const toastElement = document.createElement('div');
    toastElement.className = 'toast-notification';
    toastElement.id = `toast-${toastId}`;
    toastElement.textContent = message;
    
    // Add to container
    this.toastContainer.appendChild(toastElement);
    this.activeToasts.push({ ...toast, element: toastElement });
    
    // Trigger fade-in animation
    requestAnimationFrame(() => {
      toastElement.classList.add('toast-visible');
    });
    
    // Schedule removal
    setTimeout(() => {
      this.removeToast(toastId);
    }, toast.displayDuration + toast.fadeInDuration);
  }

  /**
   * Remove a toast notification
   * @param {number} toastId - ID of the toast to remove
   */
  removeToast(toastId) {
    const index = this.activeToasts.findIndex(t => t.id === toastId);
    if (index === -1) return;
    
    const toast = this.activeToasts[index];
    toast.element.classList.remove('toast-visible');
    toast.element.classList.add('toast-fading');
    
    // Remove from DOM after fade out
    setTimeout(() => {
      if (toast.element && toast.element.parentNode) {
        toast.element.parentNode.removeChild(toast.element);
      }
      this.activeToasts = this.activeToasts.filter(t => t.id !== toastId);
    }, 300); // Match fadeOutDuration
  }

  /**
   * Create a floating XP notification
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {number} xp - XP amount
   * @param {string} fireType - Fire type that was extinguished (for color matching)
   */
  addXPNotification(q, r, xp, fireType) {
    // Get fire color based on fire type
    const fireConfig = getFireTypeConfig(fireType);
    const color = fireConfig ? fireConfig.color : '#FF00FF'; // Fallback to fuschia if unknown
    
    this.notifications.push({
      id: this.nextId++,
      q,
      r,
      text: `+${xp} XP`,
      color: color, // Color matches the fire type that was extinguished
      life: 0, // Time alive in seconds
      maxLife: 1.5, // Total duration
    });
  }

  /**
   * Create a floating currency notification
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {number} amount - Currency amount
   */
  addCurrencyNotification(q, r, amount) {
    this.notifications.push({
      id: this.nextId++,
      q,
      r,
      text: `+$${amount}`,
      color: '#00FF88', // Green color for currency
      life: 0, // Time alive in seconds
      maxLife: 1.5, // Total duration
    });
  }

  /**
   * Create a floating movement token notification
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   */
  addMovementTokenNotification(q, r) {
    this.notifications.push({
      id: this.nextId++,
      q,
      r,
      text: '+1 token',
      color: '#3FF0D9', // Cyan color for movement tokens
      life: 0, // Time alive in seconds
      maxLife: 1.5, // Total duration
    });
  }

  /**
   * Update notifications per frame (for smooth 60fps animation)
   * @param {number} deltaTime - Time elapsed in seconds
   */
  updateFrame(deltaTime) {
    // Update life and remove expired notifications
    this.notifications = this.notifications.filter(notif => {
      notif.life += deltaTime;
      return notif.life < notif.maxLife;
    });
  }

  /**
   * Create a floating boss ability notification (from screen position, not hex)
   * @param {string} abilityName - Name of the boss ability (e.g., "SCATTER STRIKE")
   * @param {number} screenX - Screen X coordinate (null for bottom right)
   * @param {number} screenY - Screen Y coordinate (null for bottom right)
   */
  addBossAbilityNotification(abilityName, screenX = null, screenY = null) {
    // Default to bottom right corner of canvas if coordinates not provided
    // This is where the boss sprite will appear later
    let finalX, finalY;
    
    if (screenX !== null && screenY !== null) {
      finalX = screenX;
      finalY = screenY;
    } else {
      // Calculate bottom right corner of canvas (use CSS dimensions, not actual pixel dimensions)
      const canvas = document.getElementById('gameCanvas');
      if (canvas) {
        // Canvas has DPR scaling, so use CSS dimensions
        const cssWidth = canvas.clientWidth || (window.innerWidth - 340);
        const cssHeight = canvas.clientHeight || window.innerHeight;
        finalX = cssWidth - 150; // 150px from right edge (CSS pixels)
        finalY = cssHeight - 150; // 150px from bottom edge (CSS pixels)
      } else {
        // Fallback to window dimensions if canvas not found
        finalX = (window.innerWidth - 340) - 150; // Account for side panel
        finalY = window.innerHeight - 150;
      }
    }
    
    this.notifications.push({
      id: this.nextId++,
      q: null, // Use screen coordinates instead
      r: null,
      screenX: finalX, // Screen X coordinate (CSS pixels)
      screenY: finalY, // Screen Y coordinate (CSS pixels)
      text: abilityName,
      color: '#FF4444', // Red/orange color for boss abilities
      life: 0, // Time alive in seconds
      maxLife: 3.0, // Longer duration than XP notifications (3 seconds)
      isBossAbility: true, // Flag to indicate this is a boss ability notification
    });
  }

  /**
   * Get all active notifications
   * @returns {Array} Active notifications
   */
  getNotifications() {
    return this.notifications;
  }

  /**
   * Clear all notifications
   */
  clear() {
    this.notifications = [];
  }
}

