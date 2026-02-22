// Shield System - Manages shield placement and application to towers

import { CONFIG, getShieldCost, getShieldHealth } from '../config.js';

export class ShieldSystem {
  constructor(towerSystem, gameState) {
    this.towerSystem = towerSystem;
    this.gameState = gameState;
  }

  /**
   * Apply a shield to a tower
   * @param {string} towerId - Tower ID
   * @param {number} shieldLevel - Shield level (1-4)
   * @returns {boolean} True if shield was applied successfully
   */
  applyShieldToTower(towerId, shieldLevel) {
    const tower = this.towerSystem.getTower(towerId);
    if (!tower) return false;
    
    // Check if tower already has a shield
    if (tower.shield) return false;
    
    // Apply shield using tower system
    return this.towerSystem.applyShield(towerId, shieldLevel);
  }

  /**
   * Check if a tower can receive a shield
   * @param {string} towerId - Tower ID
   * @returns {boolean} True if tower can receive a shield
   */
  canApplyShieldToTower(towerId) {
    const tower = this.towerSystem.getTower(towerId);
    return tower && !tower.shield;
  }

  /**
   * Get shield at specific hex coordinates
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @returns {Object|null} Shield data or null
   */
  getShieldAt(q, r) {
    const tower = this.towerSystem.getTowerAt(q, r);
    return tower?.shield || null;
  }

  /**
   * Check if a hex has a tower with a shield
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @returns {boolean} True if hex has a tower with a shield
   */
  hasShieldAt(q, r) {
    const tower = this.towerSystem.getTowerAt(q, r);
    return tower && tower.shield && tower.shield.health > 0;
  }

  /**
   * Get all towers with shields
   * @returns {Array} Array of towers with shields
   */
  getAllTowersWithShields() {
    const towers = this.towerSystem.getAllTowers();
    return towers.filter(tower => tower.shield && tower.shield.health > 0);
  }

  /**
   * Get shield statistics
   * @returns {Object} Shield statistics
   */
  getStats() {
    const towersWithShields = this.getAllTowersWithShields();
    const stats = {
      total: towersWithShields.length,
      byLevel: {
        1: towersWithShields.filter(t => t.shield.level === 1).length,
        2: towersWithShields.filter(t => t.shield.level === 2).length,
        3: towersWithShields.filter(t => t.shield.level === 3).length,
        4: towersWithShields.filter(t => t.shield.level === 4).length,
      },
      totalHealth: towersWithShields.reduce((sum, t) => sum + t.shield.health, 0),
      totalMaxHealth: towersWithShields.reduce((sum, t) => sum + t.shield.maxHealth, 0),
    };
    
    return stats;
  }
}
