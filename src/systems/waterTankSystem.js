// Water Tank System - Manages water tank spawning, health, and explosions

import {
  CONFIG,
  getFireTypeConfig,
  addPlayerScore,
  getPowerUpMultiplier,
  getWaterTankTypeConfig,
  getWaterTankExplosionHexes,
  getWaterTankScaledSpawnChance,
  pickRandomWaterTankType,
  getHeroPowerFireDamageResistanceMultiplier,
} from '../config.js';
import { isValidMysteryDropHex } from './currencyItemSystem.js';
import { getNeighbors } from '../utils/hexMath.js';

let waterTankIdCounter = 0;

export class WaterTankSystem {
  constructor(gridSystem, fireSystem, gameState) {
    this.gridSystem = gridSystem;
    this.fireSystem = fireSystem;
    this.gameState = gameState;
    this.waterTanks = new Map(); // Map<tankId, WaterTankData>
    this.onWaterTankExploded = null; // Callback(tankId) when tank explodes (e.g. for tutorial)
  }

  /**
   * Spawn water tanks
   * @param {number} count - Number of tanks to spawn (defaults to 1)
   * @returns {number} Number of tanks spawned
   */
  spawnWaterTanks(count = 1) {
    // Number of tanks to spawn (default to 1 per wave)
    let spawned = 0;
    
    // Get all valid spawn locations
    const validLocations = this.getValidSpawnLocations();
    
    // Try to spawn tanks
    for (let i = 0; i < count && validLocations.length > 0; i++) {
      // Pick a random location from valid locations
      const randomIndex = Math.floor(Math.random() * validLocations.length);
      const location = validLocations[randomIndex];
      
      // Remove this location from the list to prevent duplicates
      validLocations.splice(randomIndex, 1);
      
      this.spawnWaterTank(location.q, location.r, { useRandomType: true });
      spawned++;
    }
    
    return spawned;
  }

  /**
   * Check if a hex is adjacent to any path hex
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @returns {boolean} True if adjacent to a path
   */
  isAdjacentToPath(q, r) {
    const neighbors = getNeighbors(q, r);
    return neighbors.some(neighbor => {
      const neighborHex = this.gridSystem.getHex(neighbor.q, neighbor.r);
      return neighborHex && neighborHex.isPath;
    });
  }

  /**
   * Get all valid spawn locations for water tanks
   * @returns {Array} Array of valid hex coordinates
   */
  getValidSpawnLocations() {
    const validLocations = [];
    const halfSize = Math.floor(CONFIG.MAP_SIZE / 2);
    
    for (let q = -halfSize; q <= halfSize; q++) {
      for (let r = -halfSize; r <= halfSize; r++) {
        const hex = this.gridSystem.getHex(q, r);
        if (!hex) continue;
        
        // Can't spawn on town hexes
        if (hex.isTown) continue;
        
        // Can't spawn on path hexes
        if (hex.isPath) continue;
        
        // Can't spawn on existing towers
        if (hex.hasTower) continue;
        
        // Can't spawn on existing fires
        if (hex.isBurning) continue;
        
        // Can't spawn on existing water tanks
        if (hex.hasWaterTank) continue;
        
        // Can't spawn on suppression bombs
        if (hex.hasSuppressionBomb) continue;
        
        // Can't spawn on existing temp power-up items
        if (hex.hasTempPowerUpItem) continue;
        
        // Can't spawn on existing mystery items
        if (hex.hasMysteryItem) continue;

        if (hex.hasArtifactItem) continue;

        if (hex.hasBurningVault || hex.hasDungeonEntrance) continue;
        
        // Can't spawn on existing currency items
        if (hex.hasCurrencyItem) continue;
        
        // Can't spawn on fire spawners
        if (hex.hasFireSpawner) continue;
        
        // Can't spawn on town ring hexes
        if (this.gridSystem.isTownRingHex && this.gridSystem.isTownRingHex(q, r)) continue;
        
        // This is a valid location (can spawn anywhere, not just adjacent to paths)
        validLocations.push({ q, r });
      }
    }
    
    return validLocations;
  }

  /**
   * Spawn a water tank at specific coordinates
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {{ skipSpawnBounce?: boolean }} [options] - skipSpawnBounce skips drop-in when restoring saves
   * @returns {string|null} Tank ID or null if spawn failed
   */
  spawnWaterTank(q, r, options = {}) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex) return null;

    if (options.fromMystery) {
      if (!isValidMysteryDropHex(hex)) return null;
    } else if (
      hex.isTown ||
      hex.hasTower ||
      hex.isBurning ||
      hex.hasWaterTank ||
      hex.hasSuppressionBomb ||
      hex.hasFireSpawner ||
      hex.hasBurningVault ||
      hex.hasDungeonEntrance ||
      hex.hasArtifactItem
    ) {
      return null;
    }

    const typeId = options.typeId ?? options.type
      ?? (options.useRandomType ? pickRandomWaterTankType() : 'water_bucket');
    const typeConfig = getWaterTankTypeConfig(typeId);
    
    const tankId = `water_tank_${waterTankIdCounter++}`;
    
    const tank = {
      id: tankId,
      typeId: typeConfig.id,
      q,
      r,
      health: typeConfig.health,
      maxHealth: typeConfig.health,
      isActive: true,
      spawnedFromMystery: !!options.fromMystery,
      mysteryLandDropAtMs:
        options?.skipSpawnBounce || typeof performance === 'undefined'
          ? undefined
          : performance.now(),
    };
    
    this.waterTanks.set(tankId, tank);
    this.gridSystem.placeWaterTank(q, r, tankId);
    
    return tankId;
  }

  /**
   * Try to spawn a water tank randomly (timed basis, like temp power-ups)
   */
  trySpawnRandomTank() {
    if (!this.gameState.wave?.isActive) return;
    if (this.gameState.tutorialMode) return;

    const validLocations = this.getValidSpawnLocations();
    if (validLocations.length === 0) return;

    const typeIds = Object.keys(CONFIG.WATER_TANK_TYPES || {});
    for (let i = 0; i < typeIds.length; i++) {
      const typeId = typeIds[i];
      const scaledChance = getWaterTankScaledSpawnChance(typeId, this.gameState);
      if (scaledChance <= 0 || Math.random() > scaledChance) continue;

      const randomIndex = Math.floor(Math.random() * validLocations.length);
      const location = validLocations[randomIndex];
      const tankId = this.spawnWaterTank(location.q, location.r, { typeId });

      if (tankId && window.AudioManager) {
        window.AudioManager.playSFX('water_tank_spawns');
      }
      return;
    }
  }

  /**
   * Per-frame fire/vortex damage so map HP bars track smoothly.
   * @param {number} deltaTime - Frame delta in seconds
   */
  updateHealth(deltaTime) {
    const dt = Math.max(0, Number(deltaTime) || 0);
    if (dt <= 0) return;

    const tanksToRemove = [];

    this.waterTanks.forEach(tank => {
      if (!tank.isActive) return;

      const tankHex = this.gridSystem.getHex(tank.q, tank.r);
      const hasVortexThreat = !!(tankHex && tankHex.hasVortex);
      if (!tankHex || (!tankHex.isBurning && !hasVortexThreat)) return;

      const powerUps = this.gameState?.player?.powerUps || {};
      const tempPowerUps = this.gameState?.player?.tempPowerUps || [];
      const fireDamageMult = getPowerUpMultiplier('fireDamage', powerUps, tempPowerUps, this.gameState)
        * getHeroPowerFireDamageResistanceMultiplier(this.gameState);
      let damagePerSecond = 0;
      if (tankHex.isBurning) {
        const fireConfig = getFireTypeConfig(tankHex.fireType);
        damagePerSecond += (fireConfig ? fireConfig.damagePerSecond : 1) * fireDamageMult;
      }
      if (hasVortexThreat) {
        damagePerSecond +=
          (this.gameState.vortexSystem?.getDamagePerSecondAt?.(tank.q, tank.r) || 0) * fireDamageMult;
      }
      tank.health = Math.max(0, tank.health - dt * damagePerSecond);

      if (tank.health <= 0) {
        if (window.AudioManager) {
          window.AudioManager.playSFX('destroyed');
        }
        tanksToRemove.push(tank.id);
      }
    });

    tanksToRemove.forEach(tankId => {
      this.destroyWaterTank(tankId);
    });
  }

  /**
   * 1 Hz tick — spawning only (HP is applied in {@link updateHealth}).
   * @param {number} _deltaTime - Unused; kept for call-site compatibility
   */
  update(_deltaTime) {
    this.trySpawnRandomTank();
  }

  /**
   * Damage a water tank
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {number} damage - Amount of damage to apply
   * @returns {boolean} True if tank was destroyed
   */
  damageWaterTank(q, r, damage) {
    // Water tanks can be damaged anytime (like temporary power-ups)
    // No pause check needed - if towers can fire, tanks can be damaged
    
    // Ensure damage is a valid positive number
    if (!damage || damage <= 0 || isNaN(damage)) {
      return false;
    }
    
    const tank = this.getWaterTankAt(q, r);
    if (!tank) {
      return false;
    }
    
    if (!tank.isActive) {
      return false;
    }
    
    // Ensure tank has valid health values
    if (!tank.health || tank.health <= 0 || isNaN(tank.health)) {
      const typeConfig = getWaterTankTypeConfig(tank.typeId);
      tank.health = tank.maxHealth || typeConfig.health;
      tank.maxHealth = tank.maxHealth || typeConfig.health;
    }
    
    // Apply damage
    tank.health -= damage;
    tank.health = Math.max(0, tank.health); // Ensure health doesn't go below 0
    
    if (tank.health <= 0) {
      // Tank is destroyed - trigger explosion
      this.explodeWaterTank(tank.id);
      return true;
    }
    
    return false;
  }

  /**
   * Destroy a water tank (destroyed by fire, no explosion)
   * @param {string} tankId - Tank ID
   */
  destroyWaterTank(tankId) {
    const tank = this.waterTanks.get(tankId);
    if (!tank) return;
    
    this.gameState.runStats?.recordWaterTankLostToFire?.();
    // Mark tank as inactive
    tank.isActive = false;
    
    // Trigger fire explosion animation via renderer if available
    try {
      this.gameState?.renderer?.spawnFireExplosionParticles?.(tank.q, tank.r, 'waterTank');
    } catch (e) {
      // ignore render side errors
    }
    
    // Remove the tank from the grid and map (no explosion, no fire extinguishing)
    this.gridSystem.removeWaterTank(tank.q, tank.r);
    this.waterTanks.delete(tankId);
  }

  /**
   * Explode a water tank (triggered by player tower damage)
   * @param {string} tankId - Tank ID
   */
  explodeWaterTank(tankId) {
    const tank = this.waterTanks.get(tankId);
    if (!tank) return;

    const typeConfig = getWaterTankTypeConfig(tank.typeId);

    this.gameState.notificationSystem?.addMapCollectedSpriteFloat?.(tank.q, tank.r, {
      spriteCategory: 'items',
      spriteFilename: typeConfig.sprite,
    });
    
    this.gameState.runStats?.recordWaterTankCollected?.();
    addPlayerScore(this.gameState, 10);
    
    // Mark tank as inactive
    tank.isActive = false;
    
    const explosionHexes = getWaterTankExplosionHexes(tank.q, tank.r, typeConfig.explosionRings);
    
    // Trigger explosion animation via renderer if available
    try {
      this.gameState?.renderer?.spawnWaterTankExplosionParticles?.(tank, explosionHexes);
    } catch (e) {
      // ignore render side errors
    }
    
    // Play water tank explosion sound effect
    if (window.AudioManager) {
      window.AudioManager.playSFX('water_tank_explodes');
    }

    const powerUps = this.gameState?.player?.powerUps || {};
    const tempPowerUps = this.gameState?.player?.tempPowerUps || [];
    const waterPowerMultiplier = getPowerUpMultiplier('waterTowerPower', powerUps, tempPowerUps);
    const itemWaterDamage = typeConfig.explosionDamage * waterPowerMultiplier;
    
    // Apply damage to all hexes in explosion radius
    explosionHexes.forEach(explosionHex => {
      const hex = this.gridSystem.getHex(explosionHex.q, explosionHex.r);
      
      // Damage fires
      if (hex && hex.isBurning) {
        // Apply explosion damage to fire
        const extinguished = this.fireSystem.extinguishHex(
          explosionHex.q,
          explosionHex.r,
          typeConfig.explosionDamage
        );
        
        if (extinguished && this.onFireExtinguished) {
          this.onFireExtinguished(hex.fireType, explosionHex.q, explosionHex.r);
        }
      }
      
      // Check if there are other water tanks that should chain-explode
      if (hex && hex.hasWaterTank) {
        const otherTank = this.getWaterTankAt(explosionHex.q, explosionHex.r);
        if (otherTank && otherTank.isActive && otherTank.id !== tank.id) {
          // Chain explosion - set health to 0 to trigger explosion
          otherTank.health = 0;
          // Recursively explode this tank
          this.explodeWaterTank(otherTank.id);
        }
      }

      // Map pickups / dig sites (same as suppression bomb / tower water)
      if (!hex) return;
      const hitsPickup = hex.hasTempPowerUpItem || hex.hasMysteryItem || hex.hasArtifactItem
        || hex.hasCurrencyItem || hex.hasDigSite || hex.hasBurningVault || hex.hasDungeonEntrance
        || hex.hasVortex || hex.isBurning;
      if (hitsPickup) {
        hex.isBeingSprayed = true;
      }
      if (hex.hasTempPowerUpItem) {
        this.gameState.tempPowerUpItemSystem?.damageItem(explosionHex.q, explosionHex.r, itemWaterDamage);
        this.gameState.tempPowerUpItemSystem?.checkCollection(explosionHex.q, explosionHex.r);
      }
      if (hex.hasMysteryItem) {
        this.gameState.mysteryItemSystem?.damageItem(explosionHex.q, explosionHex.r, itemWaterDamage);
        this.gameState.mysteryItemSystem?.checkCollection(explosionHex.q, explosionHex.r);
      }
      if (hex.hasArtifactItem) {
        this.gameState.artifactSystem?.damageItem(explosionHex.q, explosionHex.r, itemWaterDamage);
        this.gameState.artifactSystem?.checkCollection(explosionHex.q, explosionHex.r);
      }
      if (hex.hasCurrencyItem) {
        this.gameState.currencyItemSystem?.damageItem(explosionHex.q, explosionHex.r, itemWaterDamage);
        this.gameState.currencyItemSystem?.checkCollection(explosionHex.q, explosionHex.r);
      }
      if (hex.hasDigSite) {
        this.gameState.digSiteSystem?.addWaterPower(explosionHex.q, explosionHex.r, itemWaterDamage);
      }
      if (hex.hasBurningVault) {
        this.gameState.burningVaultSystem?.addWaterPower(explosionHex.q, explosionHex.r, itemWaterDamage);
      }
      if (hex.hasDungeonEntrance) {
        this.gameState.dungeonEntranceSystem?.addWaterPower(explosionHex.q, explosionHex.r, itemWaterDamage);
      }
      if (hex.hasVortex) {
        this.gameState.vortexSystem?.addWaterPower(explosionHex.q, explosionHex.r, itemWaterDamage);
      }
    });
    
    // Remove the tank from the grid and map
    this.gridSystem.removeWaterTank(tank.q, tank.r);
    this.waterTanks.delete(tankId);

    this.gameState.bossSystem?.notifyMapItemCollected?.();

    // Notify callback (e.g. for tutorial advancement)
    if (this.onWaterTankExploded) {
      this.onWaterTankExploded(tankId);
    }
  }

  /**
   * Get a water tank by ID
   * @param {string} tankId - Tank ID
   * @returns {Object|null} Tank data
   */
  getWaterTank(tankId) {
    return this.waterTanks.get(tankId) || null;
  }

  /**
   * Check if a water tank can be placed at the given coordinates
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {string} excludeTankId - Tank ID to exclude from check (for moving existing tank)
   * @returns {boolean} True if placement is valid
   */
  canPlaceWaterTank(q, r, excludeTankId = null) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex) return false;
    
    // Can't place on center town hex (0, 0) or fire spawners
    if (q === 0 && r === 0) return false;
    if (hex.hasFireSpawner) return false;
    if (hex.hasDigSite) return false;
    
    // Can't place on town or existing towers
    if (hex.isTown || hex.hasTower) {
      return false;
    }
    
    // Can't place on existing suppression bombs
    if (hex.hasSuppressionBomb) {
      return false;
    }
    
    // Allow placement on burning hexes if debug mode is enabled and movement is allowed
    const allowOnBurning = CONFIG.DEBUG_MODE && CONFIG.ALLOW_TOWER_MOVEMENT_MID_WAVE;
    if (hex.isBurning && !allowOnBurning) {
      return false;
    }
    
    // Can't place on existing water tank (unless it's the one we're moving)
    if (hex.hasWaterTank) {
      if (excludeTankId && hex.waterTankId === excludeTankId) {
        return true; // Same tank, allow moving to same spot
      }
      return false;
    }
    
    return true;
  }

  /**
   * Move a water tank to a new location
   * @param {string} tankId - Tank ID
   * @param {number} newQ - New q coordinate
   * @param {number} newR - New r coordinate
   * @returns {boolean} True if move succeeded
   */
  moveWaterTank(tankId, newQ, newR) {
    const tank = this.waterTanks.get(tankId);
    if (!tank) return false;
    
    // Check if new position is valid
    if (!this.canPlaceWaterTank(newQ, newR, tankId)) {
      return false;
    }
    
    // Remove from old position
    this.gridSystem.removeWaterTank(tank.q, tank.r);
    
    // Update tank position
    tank.q = newQ;
    tank.r = newR;
    
    // Place at new position
    this.gridSystem.placeWaterTank(newQ, newR, tankId);
    
    return true;
  }

  /**
   * Get water tank at specific hex coordinates
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @returns {Object|null} Tank data
   */
  getWaterTankAt(q, r) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex || !hex.hasWaterTank) return null;
    
    return this.waterTanks.get(hex.waterTankId) || null;
  }

  /**
   * Get all water tanks as an array
   * @returns {Array} Array of tank data
   */
  getAllWaterTanks() {
    return Array.from(this.waterTanks.values());
  }

  /**
   * Clear all water tanks
   */
  clearAllWaterTanks() {
    this.waterTanks.forEach(tank => {
      this.gridSystem.removeWaterTank(tank.q, tank.r);
    });
    this.waterTanks.clear();
  }

  /**
   * Register callback for when fire is extinguished
   * @param {Function} callback - Callback function(fireType, q, r)
   */
  setOnFireExtinguished(callback) {
    this.onFireExtinguished = callback;
  }

  /**
   * Get water tank statistics
   * @returns {Object} Tank statistics
   */
  getStats() {
    const tanks = this.getAllWaterTanks();
    return {
      total: tanks.length,
      active: tanks.filter(t => t.isActive).length,
    };
  }
}

