// Notification System - Floating XP text and visual effects

export class NotificationSystem {
  constructor() {
    this.notifications = [];
    this.nextId = 0;
  }

  /**
   * Create a floating XP notification
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {number} xp - XP amount
   */
  addXPNotification(q, r, xp) {
    this.notifications.push({
      id: this.nextId++,
      q,
      r,
      text: `+${xp} XP`,
      color: '#FFD700', // Gold color
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

