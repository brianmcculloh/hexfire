// Grid System - Manages the hexagonal grid state

import { CONFIG, getExpectedTownMaxHealth, getFireTypeConfig, getPowerUpMultiplier, getHeroPowerTownFireDamageMultiplier, getHeroPowerFireDamageResistanceMultiplier, getEffectiveHealthRegrowRate } from '../config.js';
import { hexKey, isInBounds, getNeighbors, getHexesInRing } from '../utils/hexMath.js';
import { rngLayout } from '../utils/rng.js';

/**
 * Creates and manages the hexagonal grid
 */
// Precomputed town-hex and town-ring-hex lookup sets. These two clusters never
// move (center grove + its 6 neighbors + the 12 hexes one ring further out), so
// we encode them as hexKey() strings once at module load and re-use the Sets for
// every isTownHex / isTownRingHex check. Previously isTownRingHex allocated a
// 12-element array of {q,r} objects via getHexesInRing on *every* call, and the
// 1Hz item spawn checks iterate it 441 times per item system per tick.
const TOWN_HEX_KEYS = new Set([
  hexKey(0, 0),
  hexKey(1, 0),
  hexKey(0, -1),
  hexKey(-1, 0),
  hexKey(0, 1),
  hexKey(1, -1),
  hexKey(-1, 1),
]);
const TOWN_RING_HEX_KEYS = (() => {
  const set = new Set();
  for (const { q, r } of getHexesInRing(0, 0, 2)) {
    set.add(hexKey(q, r));
  }
  return set;
})();

export class GridSystem {
  constructor() {
    this.grid = new Map(); // Map<hexKey, HexData>
    this.townCenterCoords = { q: 0, r: 0 }; // Center of grid
    this.townDamageThisWave = 0;
    /** Grove HP lost this wave from spread fires only (excludes lightning/random spawns). */
    this.townSpreadDamageThisWave = 0;
    /**
     * True once any fire spreads onto a grove hex or between grove hexes this wave.
     * Direct lightning/random strikes on the grove do not set this (they use isSpawn).
     * Source of truth for the wave-complete "no fire spread" bonus.
     */
    this.townReceivedSpreadFireThisWave = false;
    /** Per-frame water HP/s totals by hex (tooltip display; committed each tower update). */
    this.waterHitRateFrame = new Map();
    this.waterHitRateDisplay = new Map();
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
   * Check if a hex is part of the town (7-hex cluster). Uses a precomputed
   * key Set so the lookup is O(1) with no per-call allocations.
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @returns {boolean} True if hex is part of home base
   */
  isTownHex(q, r) {
    return TOWN_HEX_KEYS.has(hexKey(q, r));
  }

  /**
   * Check if a hex is in the town ring (the 12 hexes surrounding the 7-hex
   * town cluster). Uses a precomputed key Set so the lookup is O(1) and
   * doesn't allocate a fresh ring array per call — important because the
   * 1Hz item-spawn scans hit this 441 times per tick per item system.
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @returns {boolean} True if hex is in the town ring
   */
  isTownRingHex(q, r) {
    return TOWN_RING_HEX_KEYS.has(hexKey(q, r));
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
                CONFIG.FIRE_TYPE_CATACLYSM,
                CONFIG.FIRE_TYPE_BLACKFYRE,
              ];
              fireType = rngLayout().pick(allFireTypes);
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
            hasBurningVault: false,
            burningVaultId: null,
            hasDungeonEntrance: false,
            dungeonEntranceId: null,
            hasVortex: false,
            vortexId: null,
            hasArtifactItem: false,
            artifactItemId: null,
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

      // Only bump structureVersion for changes that actually affect cached
      // structures driven by it. Two consumers read structureVersion:
      //   1. Renderer's gridStaticCache (offscreen canvas) — drawGrid only
      //      branches on isPath/pathColor/isTown/hasTower/hasWaterTank, so
      //      those + hasFireSpawner are the only render-relevant structural
      //      changes. (hasFireSpawner doesn't appear in drawGrid but it's
      //      cheap to include and only changes at wave boundaries.)
      //   2. fireSpawnerSystem.getSpawnCandidates() — filters by
      //      hex.isTown and hex.hasFireSpawner. Those are already covered.
      //
      // Everything else — the per-item "has*" flags (mystery, currency, temp
      // power-up, burning vault, artifact, suppression bomb, dig site) — has
      // its own dynamic draw pass on top of the static cache, and isn't
      // consumed by any structureVersion-keyed cache. Bumping the version on
      // those previously forced a full ~5–10ms grid-cache rebuild every time
      // an item spawned or got destroyed by fire. That accumulates badly
      // during late-game boss waves where purify ignites ~100 hexes every 5s
      // and items continuously spawn → land on fire → destroy → respawn.
      if (
        Object.prototype.hasOwnProperty.call(data, 'isPath') ||
        Object.prototype.hasOwnProperty.call(data, 'pathColor') ||
        Object.prototype.hasOwnProperty.call(data, 'isTown') ||
        Object.prototype.hasOwnProperty.call(data, 'hasTower') ||
        Object.prototype.hasOwnProperty.call(data, 'hasWaterTank') ||
        Object.prototype.hasOwnProperty.call(data, 'hasFireSpawner')
      ) {
        this.structureVersion += 1;
      }
    }
  }

  /**
   * Mutate a non-structural field on an existing hex in place.
   * Skips the spread-copy + cache rewrites that {@link setHex} performs, so it's
   * safe + fast for hot paths that update high-frequency fields like
   * `extinguishProgress`, `burnDuration`, `townHealth`, or `isBeingSprayed`.
   *
   * IMPORTANT: do NOT use this for keys that affect cached structures. Use
   * {@link setHex} for:
   *   - keys that bump structureVersion / invalidate the static grid cache:
   *     isPath, pathColor, isTown, hasTower, hasWaterTank
   *   - isBurning (controls burningHexCache membership)
   *   - any "has*" item flag (hasTempPowerUpItem, hasMysteryItem,
   *     hasCurrencyItem, hasBurningVault, hasDungeonEntrance, hasArtifactItem, hasSuppressionBomb,
   *     hasFireSpawner, hasDigSite) — these no longer bump structureVersion,
   *     but downstream draw passes still expect setHex's spread-copy semantics
   *     for the new hex reference.
   *
   * @param {number} q
   * @param {number} r
   * @param {string} key
   * @param {*} value
   * @returns {boolean} True if mutated, false if hex missing.
   */
  mutateHex(q, r, key, value) {
    const hex = this.grid.get(hexKey(q, r));
    if (!hex) return false;
    hex[key] = value;
    return true;
  }

  /**
   * Mutate multiple non-structural fields in place. Same constraints as
   * {@link mutateHex}.
   * @param {number} q
   * @param {number} r
   * @param {Object} partial
   * @returns {boolean}
   */
  mutateHexFields(q, r, partial) {
    const hex = this.grid.get(hexKey(q, r));
    if (!hex) return false;
    for (const k in partial) {
      hex[k] = partial[k];
    }
    return true;
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
    
    if (hex.hasFireSpawner) return false;
    
    // Same footprint rules as suppression bombs (mutually exclusive occupancy)
    return (
      !hex.hasDigSite &&
      !hex.hasTower &&
      !hex.hasSuppressionBomb &&
      !hex.hasWaterTank &&
      !hex.hasTempPowerUpItem &&
      !hex.hasMysteryItem &&
      !hex.hasCurrencyItem &&
      !hex.hasBurningVault &&
      !hex.hasDungeonEntrance &&
      !hex.hasArtifactItem
    );
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
    // Same footprint as towers (including center grove hex); not on fire spawners
    if (hex.hasFireSpawner) return false;
    return (
      !hex.hasDigSite &&
      !hex.hasTower &&
      !hex.hasWaterTank &&
      !hex.hasTempPowerUpItem &&
      !hex.hasMysteryItem &&
      !hex.hasCurrencyItem &&
      !hex.hasBurningVault &&
      !hex.hasDungeonEntrance &&
      !hex.hasArtifactItem &&
      !hex.hasSuppressionBomb
    );
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
   * @param {string} vaultId - Burning vault instance id
   */
  placeBurningVault(q, r, vaultId) {
    this.setHex(q, r, { hasBurningVault: true, burningVaultId: vaultId });
  }

  removeBurningVault(q, r) {
    this.setHex(q, r, { hasBurningVault: false, burningVaultId: null });
  }

  /**
   * @param {string} dungeonId - Dungeon entrance instance id
   */
  placeDungeonEntrance(q, r, dungeonId) {
    this.setHex(q, r, { hasDungeonEntrance: true, dungeonEntranceId: dungeonId });
  }

  removeDungeonEntrance(q, r) {
    this.setHex(q, r, { hasDungeonEntrance: false, dungeonEntranceId: null });
  }

  /**
   * @param {string} vortexId - Vortex instance id
   */
  placeVortex(q, r, vortexId) {
    this.setHex(q, r, { hasVortex: true, vortexId });
  }

  removeVortex(q, r) {
    this.setHex(q, r, { hasVortex: false, vortexId: null });
  }

  /**
   * @param {string} itemId - Spawned artifact instance id (not config artifact id)
   */
  placeArtifact(q, r, itemId) {
    this.setHex(q, r, { hasArtifactItem: true, artifactItemId: itemId });
  }

  removeArtifact(q, r) {
    this.setHex(q, r, { hasArtifactItem: false, artifactItemId: null });
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
    
    // Set new path hexes with colors (never paint over a dungeon entrance hex)
    paths.forEach(path => {
      path.forEach(({ q, r, pathColor }) => {
        const hex = this.getHex(q, r);
        if (hex && !hex.isTown && !hex.hasDungeonEntrance) {
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
        fireIgnitedBySpawn: false,
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
   * Fast check whether ANY town hex (7-hex grove cluster) is currently under fire
   * threat — either a normal burning fire or a live active vortex. Iterates the small
   * townHexesCache (≤7 entries) instead of the burningHexCache, which can grow to
   * several hundred hexes during late waves. Used per-frame in the render loop and
   * for grove-burning toasts/alarms (vortexes deal the same grove damage + FX).
   *
   * Pass {@link vortexSystem} whenever available so stale `hasVortex` flags (hex still
   * marked after the vortex is gone) are cleared instead of leaving the grove stuck in
   * damage-mode visuals with no DPS.
   *
   * @param {{ getItem?: Function, getItemAt?: Function }|null} [vortexSystem]
   * @returns {boolean}
   */
  isAnyTownHexBurning(vortexSystem = null) {
    const townHexes = this.townHexesCache;
    for (let i = 0; i < townHexes.length; i++) {
      const hex = townHexes[i];
      if (hex.isBurning) return true;
      if (!hex.hasVortex) continue;

      if (!vortexSystem) {
        // No system to validate against — keep legacy flag behavior
        return true;
      }

      const item =
        (hex.vortexId != null ? vortexSystem.getItem?.(hex.vortexId) : null) ||
        vortexSystem.getItemAt?.(hex.q, hex.r);
      if (item?.isActive) return true;

      // Stale flag: vortex gone but hex still marked — clear so borders/alarms recover
      this.removeVortex(hex.q, hex.r);
    }
    return false;
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
   * Canonical grove max HP — highest max across town hexes, or derived from town level if corrupt.
   * @param {number} [townLevel]
   * @returns {number}
   */
  getCanonicalTownMaxHealth(townLevel) {
    const townHexes = this.getAllTownHexes();
    let max = 0;
    for (let i = 0; i < townHexes.length; i++) {
      const hexMax = townHexes[i].maxTownHealth;
      if (typeof hexMax === 'number' && hexMax > max) max = hexMax;
    }
    if (max > 0) return max;
    return getExpectedTownMaxHealth(townLevel);
  }

  /**
   * Keep current/max grove HP consistent on every town hex (center drives gameplay/UI).
   * @param {number} currentHealth
   * @param {number} maxHealth
   */
  syncTownHealthFields(currentHealth, maxHealth) {
    const max = Math.max(CONFIG.TOWN_HEALTH_BASE, Math.round(Number(maxHealth) || 0));
    // Keep fractional HP during per-frame damage ticks; rounding here would discard
    // sub-1 damage each frame (e.g. 6 DPS at 60fps) and leave the grove stuck at full.
    const current = Math.max(0, Math.min(max, Number(currentHealth) || 0));
    const townHexes = this.getAllTownHexes();
    for (let i = 0; i < townHexes.length; i++) {
      const hex = townHexes[i];
      this.setHex(hex.q, hex.r, { maxTownHealth: max, townHealth: current });
    }
  }

  /**
   * Update town health (takes damage from fires burning on town hexes)
   * @param {number} deltaTime - Time elapsed in seconds
   */
  updateTownHealth(deltaTime, gameState = null) {
    const townCenter = this.getTownCenter();
    if (!townCenter) return;

    const maxHealth = this.getCanonicalTownMaxHealth(gameState?.townLevel);
    if ((townCenter.maxTownHealth || 0) !== maxHealth) {
      this.syncTownHealthFields(townCenter.townHealth ?? maxHealth, maxHealth);
    }
    
    const powerUps = gameState?.player?.powerUps || {};
    const tempPowerUps = gameState?.player?.tempPowerUps || [];
    const fireDamageMultiplier = getPowerUpMultiplier('fireDamage', powerUps, tempPowerUps, gameState)
      * getHeroPowerTownFireDamageMultiplier(gameState)
      * getHeroPowerFireDamageResistanceMultiplier(gameState);
    
    // Get all town hexes
    const townHexes = this.getAllTownHexes();
    
    // Collect unique burning town hexes (don't double-count the same fire)
    const burningTownHexes = new Map(); // Map<hexKey, { fireType, fromSpawn }>
    /** @type {Map<string, number>} vortex DPS contributions on town hexes */
    const vortexTownDpsByKey = new Map();

    townHexes.forEach(townHex => {
      const liveHex = this.getHex(townHex.q, townHex.r);
      if (!liveHex) return;
      const key = hexKey(townHex.q, townHex.r);
      if (liveHex.isBurning && !burningTownHexes.has(key)) {
        burningTownHexes.set(key, {
          fireType: liveHex.fireType,
          // Only explicit false counts as spread; missing/true = spawn/direct strike
          fromSpawn: liveHex.fireIgnitedBySpawn !== false,
        });
      }
      if (liveHex.hasVortex && gameState?.vortexSystem) {
        const vortex = gameState.vortexSystem.getItemAt(townHex.q, townHex.r);
        if (vortex?.isActive) {
          const vdps = Math.max(0, Number(vortex.damagePerSecond) || 0) * fireDamageMultiplier;
          if (vdps > 0) vortexTownDpsByKey.set(key, vdps);
        }
      }
    });

    // Calculate total DPS and spread-only DPS (lightning/random spawns excluded from spread total)
    let totalDamagePerSecond = 0;
    let spreadDamagePerSecond = 0;
    burningTownHexes.forEach(({ fireType, fromSpawn }) => {
      const fireConfig = getFireTypeConfig(fireType);
      const dps = (fireConfig ? fireConfig.damagePerSecond : 1) * fireDamageMultiplier;
      totalDamagePerSecond += dps;
      if (!fromSpawn) spreadDamagePerSecond += dps;
    });
    vortexTownDpsByKey.forEach((vdps) => {
      totalDamagePerSecond += vdps;
    });

    const center = this.getTownCenter();
    if (!center) return;

    if (totalDamagePerSecond > 0) {
      // Take damage based on total DPS from all burning town hexes + vortexes
      const newHealth = Math.max(0, (center.townHealth ?? maxHealth) - deltaTime * totalDamagePerSecond);
      const damageThisTick = (center.townHealth ?? maxHealth) - newHealth;
      if (damageThisTick > 0) {
        // Cumulative HP lost while burning (regen does not reduce this); used for grove protection bonus + wave score
        this.townDamageThisWave += damageThisTick;
        // Only adjacent-spread fires count against the grove "no damage" / no-spread bonus
        if (spreadDamagePerSecond > 0) {
          this.townSpreadDamageThisWave += damageThisTick * (spreadDamagePerSecond / totalDamagePerSecond);
        }
      }
      this.syncTownHealthFields(newHealth, maxHealth);
    } else if (
      !this.isAnyTownHexBurning(gameState?.vortexSystem) &&
      vortexTownDpsByKey.size === 0
    ) {
      // Regenerate only when no town hexes are burning / hosting a live vortex
      const regrowRate = getEffectiveHealthRegrowRate(gameState);
      const newHealth = Math.min(maxHealth, (center.townHealth ?? 0) + deltaTime * regrowRate);
      this.syncTownHealthFields(newHealth, maxHealth);
    }
  }

  /**
   * Restore town health to full
   * @param {number} [townLevel] - Used when max HP on hexes is missing/corrupt
   */
  restoreTownHealth(townLevel) {
    const maxHealth = this.getCanonicalTownMaxHealth(townLevel);
    this.syncTownHealthFields(maxHealth, maxHealth);
  }

  /**
   * Cumulative grove HP lost to fire this wave (sum of per-tick damage while burning; not net HP change).
   * @returns {number} Damage amount
   */
  getTownDamageThisWave() {
    return this.townDamageThisWave || 0;
  }

  /**
   * Grove HP lost this wave from fires that spread onto the grove (excludes lightning/random spawns).
   * Used for diagnostics / legacy damage attribution; bonus uses {@link hadTownSpreadFireThisWave}.
   * @returns {number}
   */
  getTownSpreadDamageThisWave() {
    return this.townSpreadDamageThisWave || 0;
  }

  /**
   * Record that fire spread onto or within the Ancient Grove this wave.
   * Call only for adjacent-hex spread (not lightning / random / wave spawn strikes).
   */
  noteTownSpreadFireThisWave() {
    this.townReceivedSpreadFireThisWave = true;
  }

  /**
   * Whether any fire spread onto the grove or between grove hexes this wave.
   * Direct strikes on the grove do not count.
   * @returns {boolean}
   */
  hadTownSpreadFireThisWave() {
    return !!this.townReceivedSpreadFireThisWave;
  }

  /**
   * Reset the town damage tracker for a new wave
   */
  resetTownDamageThisWave() {
    this.townDamageThisWave = 0;
    this.townSpreadDamageThisWave = 0;
    this.townReceivedSpreadFireThisWave = false;
  }

  /** Start a new frame of water-hit rate accumulation (call at start of tower update). */
  beginWaterHitRateFrame() {
    this.waterHitRateFrame.clear();
  }

  /**
   * Accumulate water power (HP/second) currently hitting a hex this frame.
   * @param {number} q
   * @param {number} r
   * @param {number} ratePerSecond
   */
  addWaterHitRate(q, r, ratePerSecond) {
    const rate = Number(ratePerSecond);
    if (!Number.isFinite(rate) || rate <= 0) return;
    const key = hexKey(q, r);
    this.waterHitRateFrame.set(key, (this.waterHitRateFrame.get(key) || 0) + rate);
  }

  /**
   * Publish rate for tooltips immediately (tick-time bursts outside the tower frame loop).
   * Overwritten on the next {@link endWaterHitRateFrame}.
   */
  publishWaterHitRate(q, r, ratePerSecond) {
    const rate = Number(ratePerSecond);
    if (!Number.isFinite(rate) || rate <= 0) return;
    const key = hexKey(q, r);
    this.waterHitRateDisplay.set(key, (this.waterHitRateDisplay.get(key) || 0) + rate);
  }

  /** Publish this frame's rates for tooltips and clear the accumulator. */
  endWaterHitRateFrame() {
    // Double-buffer: swap the two Maps instead of allocating a fresh Map at 60 Hz
    // (per-frame Map churn showed up as GC pressure in profiles).
    const published = this.waterHitRateFrame;
    const recycled = this.waterHitRateDisplay;
    recycled.clear();
    this.waterHitRateDisplay = published;
    this.waterHitRateFrame = recycled;
  }

  /** Clear displayed rates (e.g. when paused so tooltips don't show stale spray). */
  clearWaterHitRateDisplay() {
    this.waterHitRateDisplay.clear();
    this.waterHitRateFrame.clear();
  }

  /**
   * Current water power hitting a hex (HP/second), from the last committed frame.
   * @param {number} q
   * @param {number} r
   * @returns {number}
   */
  getWaterHitRate(q, r) {
    return this.waterHitRateDisplay.get(hexKey(q, r)) || 0;
  }

  /**
   * Apply a town health upgrade by increasing max and current health
   * across all town hexes
   * @param {number} increment - Amount to increase max health by
   */
  applyTownUpgrade(increment, townLevel) {
    const townCenter = this.getTownCenter();
    const maxHealth = this.getCanonicalTownMaxHealth(townLevel) + increment;
    const currentHealth = (townCenter?.townHealth ?? maxHealth - increment) + increment;
    this.syncTownHealthFields(currentHealth, maxHealth);
  }

  /**
   * Set town health across all town hexes.
   * @param {number} currentHealth
   * @param {number} [maxHealth] - Defaults to currentHealth when omitted
   */
  setTownHealth(currentHealth, maxHealth = currentHealth) {
    const max = Math.max(
      CONFIG.TOWN_HEALTH_BASE,
      Math.round(Number(maxHealth ?? currentHealth) || 0),
    );
    const current = Math.max(0, Math.min(max, Math.round(Number(currentHealth) || 0)));
    this.syncTownHealthFields(current, max);
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
          fireIgnitedBySpawn: false,
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
    // Called from updateUI every frame — must not scan the whole grid. Burning and
    // path counts come from the incremental caches; tower count is the only field
    // still requiring a walk, and it iterates (no array allocations / filter passes).
    const hexes = this.allHexesCache;
    let towersPlaced = 0;
    for (let i = 0; i < hexes.length; i++) {
      if (hexes[i].hasTower) towersPlaced++;
    }
    return {
      totalHexes: hexes.length,
      burningHexes: this.burningHexCache.length,
      pathHexes: this.pathHexCache.length,
      towersPlaced,
    };
  }
}


