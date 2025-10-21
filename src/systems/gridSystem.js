// Grid System - Manages the hexagonal grid state

import { CONFIG } from '../config.js';
import { hexKey, isInBounds, getNeighbors } from '../utils/hexMath.js';

/**
 * Creates and manages the hexagonal grid
 */
export class GridSystem {
  constructor() {
    this.grid = new Map(); // Map<hexKey, HexData>
    this.homeBaseCoords = { q: 0, r: 0 }; // Center of grid
    this.init();
  }

  /**
   * Check if a hex is part of the home base (7-hex cluster)
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @returns {boolean} True if hex is part of home base
   */
  isHomeBaseHex(q, r) {
    // Home base consists of center hex (0,0) plus its 6 immediate neighbors
    const homeBaseHexes = [
      { q: 0, r: 0 },    // center
      { q: 1, r: 0 },    // east
      { q: 0, r: -1 },   // northeast
      { q: -1, r: 0 },   // west
      { q: 0, r: 1 },    // southwest
      { q: 1, r: -1 },   // southeast
      { q: -1, r: 1 }    // northwest
    ];
    
    return homeBaseHexes.some(hex => hex.q === q && hex.r === r);
  }

  /**
   * Initialize the grid with all hexes
   */
  init() {
    const halfSize = Math.floor(CONFIG.MAP_SIZE / 2);
    
    for (let q = -halfSize; q <= halfSize; q++) {
      for (let r = -halfSize; r <= halfSize; r++) {
        if (isInBounds(q, r)) {
          const key = hexKey(q, r);
          // Home base is now 7 hexes: center (0,0) plus its 6 immediate neighbors
          const isHomeBase = this.isHomeBaseHex(q, r);
          
          // Check debug flag for all-hexes-on-fire mode
          const isBurning = CONFIG.DEBUG_ALL_HEXES_ON_FIRE && !isHomeBase;
          const fireType = isBurning ? CONFIG.FIRE_TYPE_CINDER : CONFIG.FIRE_TYPE_NONE;
          const extinguishProgress = isBurning ? 10 : 0; // Give fires some extinguish time for testing
          const maxExtinguishTime = isBurning ? 10 : 0;
          
          this.grid.set(key, {
            q,
            r,
            isHomeBase,
            isPath: false,
            isBurning,
            fireType,
            burnDuration: 0,
            extinguishProgress,
            maxExtinguishTime,
            hasTower: false,
            towerId: null,
            homeBaseHealth: isHomeBase ? CONFIG.HOME_BASE_HEALTH : 0,
            maxHomeBaseHealth: isHomeBase ? CONFIG.HOME_BASE_HEALTH : 0,
          });
        }
      }
    }
  }

  /**
   * Get hex data by coordinates
   * @param {number} q - Column coordinate
   * @param {number} r - Row coordinate
   * @returns {Object|null} Hex data or null if not found
   */
  getHex(q, r) {
    return this.grid.get(hexKey(q, r)) || null;
  }

  /**
   * Set hex data
   * @param {number} q - Column coordinate
   * @param {number} r - Row coordinate
   * @param {Object} data - Hex data to set
   */
  setHex(q, r, data) {
    const key = hexKey(q, r);
    if (this.grid.has(key)) {
      this.grid.set(key, { ...this.grid.get(key), ...data });
    }
  }

  /**
   * Get all hexes as an array
   * @returns {Array<Object>} Array of all hex data
   */
  getAllHexes() {
    return Array.from(this.grid.values());
  }

  /**
   * Get all burning hexes
   * @returns {Array<Object>} Array of burning hex data
   */
  getBurningHexes() {
    return this.getAllHexes().filter(hex => hex.isBurning);
  }

  /**
   * Get all path hexes
   * @returns {Array<Object>} Array of path hex data
   */
  getPathHexes() {
    return this.getAllHexes().filter(hex => hex.isPath);
  }

  /**
   * Check if a hex can have a tower placed on it
   * @param {number} q - Column coordinate
   * @param {number} r - Row coordinate
   * @returns {boolean} True if tower can be placed
   */
  canPlaceTower(q, r) {
    const hex = this.getHex(q, r);
    if (!hex) return false;
    
    // Can place on any hex except hexes with existing towers
    // Home base hexes are now allowed for tower placement
    return !hex.hasTower;
  }

  /**
   * Mark hex as having a tower
   * @param {number} q - Column coordinate
   * @param {number} r - Row coordinate
   * @param {string} towerId - ID of the tower
   */
  placeTower(q, r, towerId) {
    this.setHex(q, r, { hasTower: true, towerId });
  }

  /**
   * Remove tower from hex
   * @param {number} q - Column coordinate
   * @param {number} r - Row coordinate
   */
  removeTower(q, r) {
    this.setHex(q, r, { hasTower: false, towerId: null });
  }

  /**
   * Set multiple hexes as path hexes
   * @param {Array<Array<{q: number, r: number, pathColor?: string}>>} paths - Array of path arrays with colors
   */
  setPathHexes(paths) {
    // First, clear all existing paths
    this.getAllHexes().forEach(hex => {
      if (hex.isPath) {
        this.setHex(hex.q, hex.r, { isPath: false, pathColor: null });
      }
    });
    
    // Set new path hexes with colors
    paths.forEach(path => {
      path.forEach(({ q, r, pathColor }) => {
        const hex = this.getHex(q, r);
        if (hex && !hex.isHomeBase) {
          this.setHex(q, r, { isPath: true, pathColor: pathColor || '#1a1a1a' });
        }
      });
    });
  }

  /**
   * Reset the grid to initial state (clear fires, keep structure)
   */
  reset() {
    this.getAllHexes().forEach(hex => {
      this.setHex(hex.q, hex.r, {
        isBurning: false,
        fireType: CONFIG.FIRE_TYPE_NONE,
        burnDuration: 0,
        extinguishProgress: 0,
        maxExtinguishTime: 0,
      });
    });
  }

  /**
   * Get the home base hex (center hex for UI purposes)
   * @returns {Object} Home base hex data
   */
  getHomeBase() {
    return this.getHex(this.homeBaseCoords.q, this.homeBaseCoords.r);
  }

  /**
   * Get all home base hexes (7-hex cluster)
   * @returns {Array} Array of all home base hex data
   */
  getAllHomeBaseHexes() {
    const homeBaseHexes = [];
    const halfSize = Math.floor(CONFIG.MAP_SIZE / 2);
    
    for (let q = -halfSize; q <= halfSize; q++) {
      for (let r = -halfSize; r <= halfSize; r++) {
        if (this.isHomeBaseHex(q, r)) {
          const hex = this.getHex(q, r);
          if (hex) {
            homeBaseHexes.push(hex);
          }
        }
      }
    }
    
    return homeBaseHexes;
  }

  /**
   * Check if home base is on fire (used for status display)
   * @returns {boolean} True if home base is burning
   */
  isHomeBaseOnFire() {
    const homeBase = this.getHomeBase();
    return homeBase ? homeBase.isBurning : false;
  }

  /**
   * Check if home base is destroyed (game over condition)
   * @returns {boolean} True if home base health is 0
   */
  isHomeBaseDestroyed() {
    const homeBase = this.getHomeBase();
    return homeBase ? homeBase.homeBaseHealth <= 0 : false;
  }

  /**
   * Update home base health (takes damage from adjacent fires)
   * @param {number} deltaTime - Time elapsed in seconds
   */
  updateHomeBaseHealth(deltaTime) {
    const homeBase = this.getHomeBase();
    if (!homeBase) return;
    
    // Get all home base hexes
    const homeBaseHexes = this.getAllHomeBaseHexes();
    
    // Count unique adjacent burning hexes (don't double-count the same fire)
    const adjacentFireCoords = new Set();
    
    homeBaseHexes.forEach(homeBaseHex => {
      const neighbors = getNeighbors(homeBaseHex.q, homeBaseHex.r);
      neighbors.forEach(neighbor => {
        const hex = this.getHex(neighbor.q, neighbor.r);
        if (hex && hex.isBurning && !hex.isHomeBase) {
          // Only count fires that are NOT part of the home base itself
          adjacentFireCoords.add(`${neighbor.q},${neighbor.r}`);
        }
      });
    });
    
    const adjacentFireCount = adjacentFireCoords.size;
    
    if (adjacentFireCount > 0) {
      // Take damage based on number of adjacent fires
      const damageRate = adjacentFireCount; // 1 fire = 1x damage, 2 fires = 2x damage, etc.
      const newHealth = Math.max(0, homeBase.homeBaseHealth - (deltaTime * damageRate));
      // Update health on the center home base hex (for UI display)
      this.setHex(homeBase.q, homeBase.r, { homeBaseHealth: newHealth });
    } else {
      // Regenerate when no adjacent fires
      const newHealth = Math.min(homeBase.maxHomeBaseHealth, homeBase.homeBaseHealth + deltaTime * 0.5);
      this.setHex(homeBase.q, homeBase.r, { homeBaseHealth: newHealth });
    }
  }

  /**
   * Restore home base health to full
   */
  restoreHomeBaseHealth() {
    const homeBase = this.getHomeBase();
    if (!homeBase) return;
    this.setHex(homeBase.q, homeBase.r, { homeBaseHealth: homeBase.maxHomeBaseHealth });
  }

  /**
   * Clear all fires from the grid
   */
  clearAllFires() {
    const hexes = this.getAllHexes();
    hexes.forEach(hex => {
      if (hex.isBurning) {
        this.setHex(hex.q, hex.r, {
          isBurning: false,
          fireType: null,
          extinguishProgress: 0,
          maxExtinguishTime: 0,
          isBeingSprayed: false
        });
      }
    });
    
    // Update status panel when all fires are cleared
    if (window.updateUI) {
      window.updateUI();
    }
  }

  /**
   * Get grid statistics
   * @returns {Object} Stats about the grid
   */
  getStats() {
    const hexes = this.getAllHexes();
    return {
      totalHexes: hexes.length,
      burningHexes: hexes.filter(h => h.isBurning).length,
      pathHexes: hexes.filter(h => h.isPath).length,
      towersPlaced: hexes.filter(h => h.hasTower).length,
    };
  }
}

