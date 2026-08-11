// Suppression Bomb System - Manages suppression bomb placement, detection, and explosions

import { CONFIG, getSuppressionBombRadius, getSuppressionBombCost, getSuppressionBombImpactZone, getSuppressionBombTotalUses, getEffectiveSuppressionBombPower, getSuppressionBombMaxLevel, clampSuppressionBombLevel } from '../config.js';
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
   * @param {number} level - Bomb level (1–{@link CONFIG.SUPPRESSION_BOMB_MAX_LEVEL})
   * @returns {string|null} Bomb ID or null if placement failed
   */
  placeSuppressionBomb(q, r, level = 1, options = {}) {
    // Check if placement is valid
    if (!this.canPlaceSuppressionBomb(q, r)) {
      return null;
    }
    
    const safeLevel = clampSuppressionBombLevel(level);
    const bombId = `suppression_bomb_${suppressionBombIdCounter++}`;
    
    const bomb = {
      id: bombId,
      q,
      r,
      level: safeLevel,
      radius: getSuppressionBombRadius(safeLevel),
      totalUses: Math.max(1, Math.floor(options.totalUses ?? getSuppressionBombTotalUses(safeLevel))),
      usesRemaining: Math.max(1, Math.floor(options.usesRemaining ?? getSuppressionBombTotalUses(safeLevel))),
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
    return this.gridSystem.canPlaceSuppressionBomb(q, r);
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
    this.explodingBombs.delete(bombId);
  }

  /**
   * Store a placed suppression bomb back into player inventory.
   * @param {string} bombId - Bomb ID
   * @returns {boolean} True if the bomb was stored
   */
  storeSuppressionBombInInventory(bombId) {
    const bomb = this.getSuppressionBomb(bombId);
    if (!bomb) return false;

    this.removeSuppressionBomb(bombId);

    if (!this.gameState?.player?.inventory?.purchasedSuppressionBombs) {
      this.gameState.player.inventory.purchasedSuppressionBombs = [];
    }

    this.gameState.player.inventory.purchasedSuppressionBombs.push({
      type: 'suppression_bomb',
      level: bomb.level,
      totalUses: bomb.totalUses,
      usesRemaining: bomb.usesRemaining,
    });

    return true;
  }

  /**
   * Store all currently placed suppression bombs into player inventory.
   * @returns {number} Number of bombs stored
   */
  storeAllSuppressionBombsInInventory() {
    const bombIds = Array.from(this.suppressionBombs.keys());
    let storedCount = 0;
    bombIds.forEach((bombId) => {
      if (this.storeSuppressionBombInInventory(bombId)) {
        storedCount++;
      }
    });
    return storedCount;
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
   * Whether a hex should arm adjacent/on-hex suppression bombs.
   * Vortexes are a fire threat even when the tile itself is not `isBurning`.
   * @param {object|null|undefined} hex
   * @returns {boolean}
   */
  _hexTriggersSuppressionBomb(hex) {
    return !!(hex && (hex.isBurning || hex.hasVortex));
  }

  /**
   * Check for fire/vortex on the bomb hex or adjacent hexes and trigger explosion
   * @param {number} deltaTime - Time elapsed in seconds
   */
  update(deltaTime) {
    if (!this.gameState?.wave?.isActive) return;

    // Check each suppression bomb for fire / vortex triggers
    this.suppressionBombs.forEach(bomb => {
      if (!bomb.isActive || bomb.triggered) return;
      
      // Check if the bomb's hex is on fire or hosting a vortex
      const bombHex = this.gridSystem.getHex(bomb.q, bomb.r);
      if (this._hexTriggersSuppressionBomb(bombHex)) {
        this.triggerExplosion(bomb);
        return;
      }
      
      // Check if any adjacent hex is on fire or hosting a vortex
      const neighbors = getNeighbors(bomb.q, bomb.r);
      for (const neighbor of neighbors) {
        const neighborHex = this.gridSystem.getHex(neighbor.q, neighbor.r);
        if (this._hexTriggersSuppressionBomb(neighborHex)) {
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
    if (bomb.triggered || (bomb.usesRemaining || 0) <= 0) return;
    
    bomb.triggered = true;
    
    // Add to exploding bombs with countdown
    this.explodingBombs.set(bomb.id, {
      bomb: bomb,
      timeRemaining: CONFIG.SUPPRESSION_BOMB_EXPLOSION_DELAY
    });
  }

  /**
   * Cancel any armed countdowns without consuming bomb uses.
   * Called when a wave ends before triggered bombs detonate.
   */
  resetPendingExplosions() {
    this.explodingBombs.forEach((explodingBomb) => {
      if (explodingBomb?.bomb) {
        explodingBomb.bomb.triggered = false;
        explodingBomb.bomb.explosionTime = 0;
      }
    });
    this.explodingBombs.clear();
  }

  /**
   * Explode a suppression bomb: extinguish fires in radius and apply water to map items (tanks, temp pickups, mystery, currency, dig sites), matching tower/bomber water behavior.
   * Damage uses {@link CONFIG.SUPPRESSION_BOMB_POWER_LEVEL_1}–{@link CONFIG.SUPPRESSION_BOMB_POWER_LEVEL_5} via getSuppressionBombPower (not affected by Water Pressure / temp water multipliers).
   * @param {Object} bomb - Suppression bomb data
   */
  explodeSuppressionBomb(bomb) {
    this.gameState.runStats?.recordSuppressionBombDetonated?.();
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

    const finalPower = getEffectiveSuppressionBombPower(this.gameState, bomb.level);

    // Fires + anything tower water can hit (same idea as bomber explosion / jet spray)
    impactHexes.forEach(impactHex => {
      const hex = this.gridSystem.getHex(impactHex.q, impactHex.r);
      if (!hex) return;

      const hitsSomething = hex.isBurning || hex.hasWaterTank || hex.hasTempPowerUpItem
        || hex.hasMysteryItem || hex.hasArtifactItem || hex.hasCurrencyItem
        || hex.hasDigSite || hex.hasBurningVault || hex.hasDungeonEntrance || hex.hasVortex;
      if (hitsSomething) {
        hex.isBeingSprayed = true;
      }

      if (hex.isBurning) {
        const extinguished = this.fireSystem.extinguishHex(
          impactHex.q,
          impactHex.r,
          finalPower
        );
        if (extinguished && this.onFireExtinguished) {
          this.onFireExtinguished(hex.fireType, impactHex.q, impactHex.r);
        }
      }

      if (hex.hasWaterTank) {
        this.gameState.waterTankSystem?.damageWaterTank(impactHex.q, impactHex.r, finalPower);
      }
      if (hex.hasTempPowerUpItem) {
        this.gameState.tempPowerUpItemSystem?.damageItem(impactHex.q, impactHex.r, finalPower);
        this.gameState.tempPowerUpItemSystem?.checkCollection(impactHex.q, impactHex.r);
      }
      if (hex.hasMysteryItem) {
        this.gameState.mysteryItemSystem?.damageItem(impactHex.q, impactHex.r, finalPower);
        this.gameState.mysteryItemSystem?.checkCollection(impactHex.q, impactHex.r);
      }
      if (hex.hasArtifactItem) {
        this.gameState.artifactSystem?.damageItem(impactHex.q, impactHex.r, finalPower);
        this.gameState.artifactSystem?.checkCollection(impactHex.q, impactHex.r);
      }
      if (hex.hasCurrencyItem) {
        this.gameState.currencyItemSystem?.damageItem(impactHex.q, impactHex.r, finalPower);
        this.gameState.currencyItemSystem?.checkCollection(impactHex.q, impactHex.r);
      }
      if (hex.hasDigSite) {
        this.gameState.digSiteSystem?.addWaterPower(impactHex.q, impactHex.r, finalPower);
      }
      if (hex.hasBurningVault) {
        this.gameState.burningVaultSystem?.addWaterPower(impactHex.q, impactHex.r, finalPower);
      }
      if (hex.hasDungeonEntrance) {
        this.gameState.dungeonEntranceSystem?.addWaterPower(impactHex.q, impactHex.r, finalPower);
      }
      if (hex.hasVortex) {
        this.gameState.vortexSystem?.addWaterPower(impactHex.q, impactHex.r, finalPower);
      }
    });
    
    bomb.usesRemaining = Math.max(0, (bomb.usesRemaining || 0) - 1);
    bomb.triggered = false;

    // Remove only when all uses are consumed; otherwise the bomb stays on-map for reuse.
    if (bomb.usesRemaining <= 0) {
      this.removeSuppressionBomb(bomb.id);
    }
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
    const byLevel = {};
    const maxLevel = getSuppressionBombMaxLevel();
    for (let lv = 1; lv <= maxLevel; lv++) {
      byLevel[lv] = bombs.filter((b) => b.level === lv).length;
    }
    return {
      total: bombs.length,
      byLevel,
      exploding: this.explodingBombs.size,
    };
  }
}
