// Suppression Bomb System - Manages suppression bomb placement, detection, and explosions

import { CONFIG, getSuppressionBombRadius, getSuppressionBombCost, getSuppressionBombImpactZone } from '../config.js';
import { getNeighbors } from '../utils/hexMath.js';

let suppressionBombIdCounter = 0;

export class SuppressionBombSystem {
  constructor(gridSystem, fireSystem, gameState) {
    this.gridSystem = gridSystem;
    this.fireSystem = fireSystem;
    this.gameState = gameState;
    this.suppressionBombs = new Map(); // Map<bombId, SuppressionBombData>
    this.explodingBombs = new Map(); // Map<bombId, ExplodingBombData>
  }

  /**
   * Place a suppression bomb
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {number} level - Bomb level (1-4)
   * @returns {string|null} Bomb ID or null if placement failed
   */
  placeSuppressionBomb(q, r, level = 1) {
    // Check if placement is valid
    if (!this.canPlaceSuppressionBomb(q, r)) {
      return null;
    }
    
    const bombId = `suppression_bomb_${suppressionBombIdCounter++}`;
    
    const bomb = {
      id: bombId,
      q,
      r,
      level,
      radius: getSuppressionBombRadius(level),
      isActive: true,
      triggered: false,
      explosionTime: 0,
    };
    
    this.suppressionBombs.set(bombId, bomb);
    this.gridSystem.placeSuppressionBomb(q, r, bombId);
    
    return bombId;
  }

  /**
   * Check if a suppression bomb can be placed at the given coordinates
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @returns {boolean} True if placement is valid
   */
  canPlaceSuppressionBomb(q, r) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex) return false;
    
    // Can't place on center town hex (0, 0)
    if (q === 0 && r === 0) {
      return false;
    }
    
    // Can't place on town, existing towers, or existing suppression bombs
    if (hex.isTown || hex.hasTower || hex.hasSuppressionBomb) {
      return false;
    }
    
    return true;
  }

  /**
   * Remove a suppression bomb
   * @param {string} bombId - Bomb ID
   */
  removeSuppressionBomb(bombId) {
    const bomb = this.suppressionBombs.get(bombId);
    if (!bomb) return;
    
    this.gridSystem.removeSuppressionBomb(bomb.q, bomb.r);
    this.suppressionBombs.delete(bombId);
  }

  /**
   * Move a suppression bomb to a new location
   * @param {string} bombId - Bomb ID
   * @param {number} newQ - New q coordinate
   * @param {number} newR - New r coordinate
   * @returns {boolean} True if move succeeded
   */
  moveSuppressionBomb(bombId, newQ, newR) {
    const bomb = this.suppressionBombs.get(bombId);
    if (!bomb) return false;
    
    // Check if new position is valid
    if (!this.canPlaceSuppressionBomb(newQ, newR)) {
      return false;
    }
    
    // Remove from old position
    this.gridSystem.removeSuppressionBomb(bomb.q, bomb.r);
    
    // Update bomb position
    bomb.q = newQ;
    bomb.r = newR;
    
    // Place at new position
    this.gridSystem.placeSuppressionBomb(newQ, newR, bombId);
    
    return true;
  }

  /**
   * Check for fire spreading to suppression bomb or adjacent hexes and trigger explosion
   * @param {number} deltaTime - Time elapsed in seconds
   */
  update(deltaTime) {
    // Check each suppression bomb for fire triggers
    this.suppressionBombs.forEach(bomb => {
      if (!bomb.isActive || bomb.triggered) return;
      
      // Check if the bomb's hex is on fire
      const bombHex = this.gridSystem.getHex(bomb.q, bomb.r);
      if (bombHex && bombHex.isBurning) {
        this.triggerExplosion(bomb);
        return;
      }
      
      // Check if any adjacent hex is on fire
      const neighbors = getNeighbors(bomb.q, bomb.r);
      for (const neighbor of neighbors) {
        const neighborHex = this.gridSystem.getHex(neighbor.q, neighbor.r);
        if (neighborHex && neighborHex.isBurning) {
          this.triggerExplosion(bomb);
          return;
        }
      }
    });
    
    // Update exploding bombs
    const bombsToRemove = [];
    this.explodingBombs.forEach((explodingBomb, bombId) => {
      explodingBomb.timeRemaining -= deltaTime;
      
      if (explodingBomb.timeRemaining <= 0) {
        // Time to explode!
        this.explodeSuppressionBomb(explodingBomb.bomb);
        bombsToRemove.push(bombId);
      }
    });
    
    // Remove exploded bombs
    bombsToRemove.forEach(bombId => {
      this.explodingBombs.delete(bombId);
    });
  }

  /**
   * Trigger explosion countdown for a suppression bomb
   * @param {Object} bomb - Suppression bomb data
   */
  triggerExplosion(bomb) {
    if (bomb.triggered) return;
    
    bomb.triggered = true;
    
    // Add to exploding bombs with countdown
    this.explodingBombs.set(bomb.id, {
      bomb: bomb,
      timeRemaining: CONFIG.SUPPRESSION_BOMB_EXPLOSION_DELAY
    });
  }

  /**
   * Explode a suppression bomb and extinguish all fires in radius
   * @param {Object} bomb - Suppression bomb data
   */
  explodeSuppressionBomb(bomb) {
    // Get all hexes in explosion radius
    const impactHexes = getSuppressionBombImpactZone(bomb.q, bomb.r, bomb.level);
    
    // Trigger explosion animation via renderer if available
    try {
      this.gameState?.renderer?.spawnSuppressionBombExplosionParticles?.(bomb, impactHexes);
    } catch (e) {
      // ignore render side errors
    }
    
    // Play explosion sound effect
    if (window.AudioManager) {
      window.AudioManager.playSFX('suppression_bomb_explodes', { volume: 0.7, dedupeMs: 50 });
    }
    
    // Extinguish all fires in the impact zone
    impactHexes.forEach(impactHex => {
      const hex = this.gridSystem.getHex(impactHex.q, impactHex.r);
      if (hex && hex.isBurning) {
        // Instantly extinguish the fire
        const extinguished = this.fireSystem.extinguishHex(
          impactHex.q,
          impactHex.r,
          CONFIG.SUPPRESSION_BOMB_POWER
        );
        
        if (extinguished && this.onFireExtinguished) {
          this.onFireExtinguished(hex.fireType, impactHex.q, impactHex.r);
        }
      }
    });
    
    // Remove the bomb
    this.removeSuppressionBomb(bomb.id);
  }

  /**
   * Get a suppression bomb by ID
   * @param {string} bombId - Bomb ID
   * @returns {Object|null} Bomb data
   */
  getSuppressionBomb(bombId) {
    return this.suppressionBombs.get(bombId) || null;
  }

  /**
   * Get suppression bomb at specific hex coordinates
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @returns {Object|null} Bomb data
   */
  getSuppressionBombAt(q, r) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex || !hex.hasSuppressionBomb) return null;
    
    return this.suppressionBombs.get(hex.suppressionBombId) || null;
  }

  /**
   * Get all suppression bombs as an array
   * @returns {Array} Array of bomb data
   */
  getAllSuppressionBombs() {
    return Array.from(this.suppressionBombs.values());
  }

  /**
   * Get all exploding suppression bombs as an array
   * @returns {Array} Array of exploding bomb data
   */
  getAllExplodingSuppressionBombs() {
    return Array.from(this.explodingBombs.values());
  }

  /**
   * Clear all suppression bombs
   */
  clearAllSuppressionBombs() {
    this.suppressionBombs.forEach(bomb => {
      this.gridSystem.removeSuppressionBomb(bomb.q, bomb.r);
    });
    this.suppressionBombs.clear();
    this.explodingBombs.clear();
  }

  /**
   * Register callback for when fire is extinguished
   * @param {Function} callback - Callback function(fireType, q, r)
   */
  setOnFireExtinguished(callback) {
    this.onFireExtinguished = callback;
  }

  /**
   * Get suppression bomb statistics
   * @returns {Object} Bomb statistics
   */
  getStats() {
    const bombs = this.getAllSuppressionBombs();
    return {
      total: bombs.length,
      byLevel: {
        1: bombs.filter(b => b.level === 1).length,
        2: bombs.filter(b => b.level === 2).length,
        3: bombs.filter(b => b.level === 3).length,
        4: bombs.filter(b => b.level === 4).length,
      },
      exploding: this.explodingBombs.size,
    };
  }
}
