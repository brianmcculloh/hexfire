// Grid System - Manages the hexagonal grid state

import { CONFIG, getFireTypeConfig } from '../config.js';
import { hexKey, isInBounds, getNeighbors, getHexesInRing } from '../utils/hexMath.js';

/**
 * Creates and manages the hexagonal grid
 */
export class GridSystem {
  constructor() {
    this.grid = new Map(); // Map<hexKey, HexData>
    this.townCenterCoords = { q: 0, r: 0 }; // Center of grid
    this.townDamageThisWave = 0;
    // Cached hex lists for performance
    this.allHexesCache = [];
    this.allHexesIndexByKey = new Map();
    this.burningHexCache = [];
    this.burningHexIndexByKey = new Map();
    this.pathHexCache = [];
    this.pathHexIndexByKey = new Map();
    this.townHexesCache = [];
    this.structureVersion = 0; // Increment when structural map data changes
    this.init();
  }

  /**
   * Check if a hex is part of the town (7-hex cluster)
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @returns {boolean} True if hex is part of home base
   */
  isTownHex(q, r) {
    // Town consists of center hex (0,0) plus its 6 immediate neighbors
    const townHexes = [
      { q: 0, r: 0 },    // center
      { q: 1, r: 0 },    // east
      { q: 0, r: -1 },   // northeast
      { q: -1, r: 0 },   // west
      { q: 0, r: 1 },    // southwest
      { q: 1, r: -1 },   // southeast
      { q: -1, r: 1 }    // northwest
    ];
    
    return townHexes.some(hex => hex.q === q && hex.r === r);
  }

  /**
   * Check if a hex is in the town ring (the 12 hexes surrounding the 7-hex town cluster)
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @returns {boolean} True if hex is in the town ring
   */
  isTownRingHex(q, r) {
    // Town ring is ring 2 around the center (0,0)
    // This excludes the center hex (ring 0) and the 6 immediate neighbors (ring 1, which are town hexes)
    // So ring 2 is the 12 hexes that surround the town
    const ringHexes = getHexesInRing(0, 0, 2);
    return ringHexes.some(hex => hex.q === q && hex.r === r);
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
          // Town is now 7 hexes: center (0,0) plus its 6 immediate neighbors
          const isTown = this.isTownHex(q, r);
          const isTownRing = this.isTownRingHex(q, r);
          
          // Check debug flag for all-hexes-on-fire mode
          const isBurning = CONFIG.DEBUG_ALL_HEXES_ON_FIRE && !isTown && !isTownRing;
          
          // Determine fire type: random if both debug flags are enabled, otherwise cinder or none
          let fireType = CONFIG.FIRE_TYPE_NONE;
          if (isBurning) {
            if (CONFIG.DEBUG_ALL_FIRE_TYPES) {
              // Equal probability for all 6 fire types (1/6 chance each)
              const allFireTypes = [
                CONFIG.FIRE_TYPE_CINDER,
                CONFIG.FIRE_TYPE_FLAME,
                CONFIG.FIRE_TYPE_BLAZE,
                CONFIG.FIRE_TYPE_FIRESTORM,
                CONFIG.FIRE_TYPE_INFERNO,
                CONFIG.FIRE_TYPE_CATACLYSM
              ];
              fireType = allFireTypes[Math.floor(Math.random() * allFireTypes.length)];
            } else {
              fireType = CONFIG.FIRE_TYPE_CINDER;
            }
          }
          
          const extinguishProgress = isBurning ? 10 : 0; // Give fires some extinguish time for testing
          const maxExtinguishTime = isBurning ? 10 : 0;
          
          const hexData = {
            q,
            r,
            isTown,
            isPath: false,
            isBurning,
            fireType,
            burnDuration: 0,
            extinguishProgress,
            maxExtinguishTime,
            hasTower: false,
            towerId: null,
            hasSuppressionBomb: false,
            suppressionBombId: null,
            hasWaterTank: false,
            waterTankId: null,
            hasTempPowerUpItem: false,
            tempPowerUpItemId: null,
            hasMysteryItem: false,
            mysteryItemId: null,
            hasCurrencyItem: false,
            currencyItemId: null,
            hasDigSite: false,
            digSiteId: null,
            townHealth: isTown ? CONFIG.TOWN_HEALTH_BASE : 0,
            maxTownHealth: isTown ? CONFIG.TOWN_HEALTH_BASE : 0,
          };
          this.grid.set(key, hexData);
          this.addToAllHexesCache(key, hexData);
          if (hexData.isTown) {
            this.townHexesCache.push(hexData);
        }
          if (hexData.isBurning) {
            this.addToBurningCache(key, hexData);
          }
          if (hexData.isPath) {
            this.addToPathCache(key, hexData);
          }
        }
      }
    }
  }

  addToAllHexesCache(key, hexData) {
    this.allHexesIndexByKey.set(key, this.allHexesCache.length);
    this.allHexesCache.push(hexData);
  }

  addToBurningCache(key, hexData) {
    if (this.burningHexIndexByKey.has(key)) return;
    this.burningHexIndexByKey.set(key, this.burningHexCache.length);
    this.burningHexCache.push(hexData);
  }

  removeFromBurningCache(key) {
    const index = this.burningHexIndexByKey.get(key);
    if (index === undefined) return;
    const lastIndex = this.burningHexCache.length - 1;
    const lastHex = this.burningHexCache[lastIndex];
    this.burningHexCache[index] = lastHex;
    this.burningHexCache.pop();
    this.burningHexIndexByKey.delete(key);
    if (lastHex) {
      const lastKey = hexKey(lastHex.q, lastHex.r);
      if (lastKey !== key) {
        this.burningHexIndexByKey.set(lastKey, index);
      }
    }
  }

  addToPathCache(key, hexData) {
    if (this.pathHexIndexByKey.has(key)) return;
    this.pathHexIndexByKey.set(key, this.pathHexCache.length);
    this.pathHexCache.push(hexData);
  }

  removeFromPathCache(key) {
    const index = this.pathHexIndexByKey.get(key);
    if (index === undefined) return;
    const lastIndex = this.pathHexCache.length - 1;
    const lastHex = this.pathHexCache[lastIndex];
    this.pathHexCache[index] = lastHex;
    this.pathHexCache.pop();
    this.pathHexIndexByKey.delete(key);
    if (lastHex) {
      const lastKey = hexKey(lastHex.q, lastHex.r);
      if (lastKey !== key) {
        this.pathHexIndexByKey.set(lastKey, index);
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
      const prev = this.grid.get(key);
      const next = { ...prev, ...data };
      this.grid.set(key, next);
      const allIndex = this.allHexesIndexByKey.get(key);
      if (allIndex !== undefined) {
        this.allHexesCache[allIndex] = next;
      }

      if (prev && prev.isTown !== next.isTown) {
        if (next.isTown) {
          this.townHexesCache.push(next);
        } else {
          this.townHexesCache = this.townHexesCache.filter(hex => hexKey(hex.q, hex.r) !== key);
        }
      } else if (next.isTown) {
        const townIndex = this.townHexesCache.findIndex(hex => hexKey(hex.q, hex.r) === key);
        if (townIndex !== -1) {
          this.townHexesCache[townIndex] = next;
        }
      }

      if (prev && prev.isBurning !== next.isBurning) {
        if (next.isBurning) {
          this.addToBurningCache(key, next);
        } else {
          this.removeFromBurningCache(key);
        }
      } else if (next.isBurning && this.burningHexIndexByKey.has(key)) {
        const burnIndex = this.burningHexIndexByKey.get(key);
        if (burnIndex !== undefined) {
          this.burningHexCache[burnIndex] = next;
        }
      }

      if (prev && prev.isPath !== next.isPath) {
        if (next.isPath) {
          this.addToPathCache(key, next);
        } else {
          this.removeFromPathCache(key);
        }
      } else if (next.isPath && this.pathHexIndexByKey.has(key)) {
        const pathIndex = this.pathHexIndexByKey.get(key);
        if (pathIndex !== undefined) {
          this.pathHexCache[pathIndex] = next;
        }
      }

      // Only bump structureVersion for changes that affect grid visuals/layout
      const structuralKeys = [
        'isPath',
        'pathColor',
        'isTown',
        'hasTower',
        'hasWaterTank',
        'hasTempPowerUpItem',
        'hasMysteryItem',
        'hasCurrencyItem',
        'hasSuppressionBomb',
        'hasFireSpawner',
        'hasDigSite',
      ];
      if (structuralKeys.some(k => Object.prototype.hasOwnProperty.call(data, k))) {
        this.structureVersion += 1;
      }
    }
  }

  /**
   * Get all hexes as an array
   * @returns {Array<Object>} Array of all hex data
   */
  getAllHexes() {
    return this.allHexesCache;
  }

  /**
   * Get all burning hexes
   * @returns {Array<Object>} Array of burning hex data
   */
  getBurningHexes() {
    return this.burningHexCache;
  }

  /**
   * Get all path hexes
   * @returns {Array<Object>} Array of path hex data
   */
  getPathHexes() {
    return this.pathHexCache;
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
    
    // Can't place on center town hex (0, 0)
    if (q === 0 && r === 0) {
      return false;
    }
    
    // Can place on any hex except hexes with existing towers or water tanks
    return !hex.hasTower && !hex.hasWaterTank && !hex.hasTempPowerUpItem && !hex.hasMysteryItem && !hex.hasCurrencyItem;
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
   * Check if a hex can have a suppression bomb placed on it
   * @param {number} q - Column coordinate
   * @param {number} r - Row coordinate
   * @returns {boolean} True if suppression bomb can be placed
   */
  canPlaceSuppressionBomb(q, r) {
    const hex = this.getHex(q, r);
    if (!hex) return false;
    
    // Can't place on town, existing towers, or existing suppression bombs
    return !hex.isTown && !hex.hasTower && !hex.hasSuppressionBomb;
  }

  /**
   * Mark hex as having a suppression bomb
   * @param {number} q - Column coordinate
   * @param {number} r - Row coordinate
   * @param {string} bombId - ID of the suppression bomb
   */
  placeSuppressionBomb(q, r, bombId) {
    this.setHex(q, r, { hasSuppressionBomb: true, suppressionBombId: bombId });
  }

  /**
   * Remove suppression bomb from hex
   * @param {number} q - Column coordinate
   * @param {number} r - Row coordinate
   */
  removeSuppressionBomb(q, r) {
    this.setHex(q, r, { hasSuppressionBomb: false, suppressionBombId: null });
  }

  /**
   * Mark hex as having a water tank
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {string} tankId - ID of the water tank
   */
  placeWaterTank(q, r, tankId) {
    this.setHex(q, r, { hasWaterTank: true, waterTankId: tankId });
  }

  /**
   * Remove water tank from hex
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   */
  removeWaterTank(q, r) {
    this.setHex(q, r, { hasWaterTank: false, waterTankId: null });
  }

  /**
   * Mark hex as having a dig site
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {string} siteId - ID of the dig site
   */
  placeDigSite(q, r, siteId) {
    this.setHex(q, r, { hasDigSite: true, digSiteId: siteId });
  }

  /**
   * Remove dig site from hex
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   */
  removeDigSite(q, r) {
    this.setHex(q, r, { hasDigSite: false, digSiteId: null });
  }

  /**
   * Mark hex as having a temporary power-up item
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {string} itemId - ID of the temporary power-up item
   */
  placeTempPowerUpItem(q, r, itemId) {
    this.setHex(q, r, { hasTempPowerUpItem: true, tempPowerUpItemId: itemId });
  }

  /**
   * Remove temporary power-up item from hex
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   */
  removeTempPowerUpItem(q, r) {
    this.setHex(q, r, { hasTempPowerUpItem: false, tempPowerUpItemId: null });
  }

  /**
   * Mark hex as having a mystery item
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {string} itemId - ID of the mystery item
   */
  placeMysteryItem(q, r, itemId) {
    this.setHex(q, r, { hasMysteryItem: true, mysteryItemId: itemId });
  }

  /**
   * Remove mystery item from hex
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   */
  removeMysteryItem(q, r) {
    this.setHex(q, r, { hasMysteryItem: false, mysteryItemId: null });
  }

  /**
   * Mark hex as having a currency item
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {string} itemId - ID of the currency item
   */
  placeCurrencyItem(q, r, itemId) {
    this.setHex(q, r, { hasCurrencyItem: true, currencyItemId: itemId });
  }

  /**
   * Remove currency item from hex
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   */
  removeCurrencyItem(q, r) {
    this.setHex(q, r, { hasCurrencyItem: false, currencyItemId: null });
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
        if (hex && !hex.isTown) {
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
   * Get the town center hex (center hex for UI purposes)
   * @returns {Object} Town center hex data
   */
  getTownCenter() {
    return this.getHex(this.townCenterCoords.q, this.townCenterCoords.r);
  }

  /**
   * Get all town hexes (7-hex cluster)
   * @returns {Array} Array of all home base hex data
   */
  getAllTownHexes() {
    return this.townHexesCache;
  }

  /**
   * Check if town is on fire (used for status display)
   * @returns {boolean} True if home base is burning
   */
  isTownOnFire() {
    const townCenter = this.getTownCenter();
    return townCenter ? townCenter.isBurning : false;
  }

  /**
   * Check if town is destroyed (game over condition)
   * @returns {boolean} True if home base health is 0
   */
  isTownDestroyed() {
    const townCenter = this.getTownCenter();
    return townCenter ? townCenter.townHealth <= 0 : false;
  }

  /**
   * Update town health (takes damage from fires burning on town hexes)
   * @param {number} deltaTime - Time elapsed in seconds
   */
  updateTownHealth(deltaTime) {
    const townCenter = this.getTownCenter();
    if (!townCenter) return;
    
    // Get all town hexes
    const townHexes = this.getAllTownHexes();
    
    // Collect unique burning town hexes with their fire types (don't double-count the same fire)
    const burningTownHexes = new Map(); // Map<hexKey, fireType>
    
    townHexes.forEach(townHex => {
      if (townHex.isBurning) {
        const key = hexKey(townHex.q, townHex.r);
        if (!burningTownHexes.has(key)) {
          burningTownHexes.set(key, townHex.fireType);
        }
      }
    });
    
    // Calculate total damage per second from all burning town hexes
    let totalDamagePerSecond = 0;
    burningTownHexes.forEach(fireType => {
      const fireConfig = getFireTypeConfig(fireType);
      const dps = fireConfig ? fireConfig.damagePerSecond : 1;
      totalDamagePerSecond += dps;
    });
    
    if (totalDamagePerSecond > 0) {
      // Take damage based on total DPS from all burning town hexes
      const newHealth = Math.max(0, townCenter.townHealth - (deltaTime * totalDamagePerSecond));
      const damageThisTick = (townCenter.townHealth - newHealth);
      if (damageThisTick > 0) {
        this.townDamageThisWave += damageThisTick;
      }
      // Update health on the center town hex (for UI display)
      this.setHex(townCenter.q, townCenter.r, { townHealth: newHealth });
    } else {
      // Regenerate when no town hexes are burning
      const newHealth = Math.min(townCenter.maxTownHealth, townCenter.townHealth + deltaTime * 0.5);
      this.setHex(townCenter.q, townCenter.r, { townHealth: newHealth });
    }
  }

  /**
   * Restore town health to full
   */
  restoreTownHealth() {
    const townCenter = this.getTownCenter();
    if (!townCenter) return;
    this.setHex(townCenter.q, townCenter.r, { townHealth: townCenter.maxTownHealth });
  }

  /**
   * Get cumulative town damage taken during the current wave
   * @returns {number} Damage amount
   */
  getTownDamageThisWave() {
    return this.townDamageThisWave || 0;
  }

  /**
   * Reset the town damage tracker for a new wave
   */
  resetTownDamageThisWave() {
    this.townDamageThisWave = 0;
  }

  /**
   * Apply a town health upgrade by increasing max and current health
   * across all town hexes
   * @param {number} increment - Amount to increase max health by
   */
  applyTownUpgrade(increment) {
    const townHexes = this.getAllTownHexes();
    townHexes.forEach(hex => {
      const newMax = (hex.maxTownHealth || 0) + increment;
      const newCurrent = (hex.townHealth || 0) + increment;
      this.setHex(hex.q, hex.r, { maxTownHealth: newMax, townHealth: newCurrent });
    });
  }

  /**
   * Set town health to a specific value across all town hexes
   * @param {number} health - Health value to set (both current and max)
   */
  setTownHealth(health) {
    const townHexes = this.getAllTownHexes();
    townHexes.forEach(hex => {
      this.setHex(hex.q, hex.r, { maxTownHealth: health, townHealth: health });
    });
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


