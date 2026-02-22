// Water Tank System - Manages water tank spawning, health, and explosions

import { CONFIG, getFireTypeConfig } from '../config.js';
import { getNeighbors, getHexesInRing } from '../utils/hexMath.js';

let waterTankIdCounter = 0;

export class WaterTankSystem {
  constructor(gridSystem, fireSystem, gameState) {
    this.gridSystem = gridSystem;
    this.fireSystem = fireSystem;
    this.gameState = gameState;
    this.waterTanks = new Map(); // Map<tankId, WaterTankData>
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
      
      // Spawn the tank
      this.spawnWaterTank(location.q, location.r);
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
   * @returns {string|null} Tank ID or null if spawn failed
   */
  spawnWaterTank(q, r) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex) return null;
    
    // Double-check validity
    if (hex.isTown || hex.hasTower || hex.isBurning || hex.hasWaterTank || hex.hasSuppressionBomb || hex.hasFireSpawner) {
      return null;
    }
    
    const tankId = `water_tank_${waterTankIdCounter++}`;
    
    const tank = {
      id: tankId,
      q,
      r,
      health: CONFIG.WATER_TANK_HEALTH,
      maxHealth: CONFIG.WATER_TANK_HEALTH,
      isActive: true,
    };
    
    this.waterTanks.set(tankId, tank);
    this.gridSystem.placeWaterTank(q, r, tankId);
    
    return tankId;
  }

  /**
   * Try to spawn a water tank randomly (timed basis, like temp power-ups)
   */
  trySpawnRandomTank() {
    if (!this.gameState.wave?.isActive) return; // Only spawn during active waves
    
    // Check if current wave group meets minimum requirement
    const currentWaveGroup = this.gameState.waveSystem?.currentWaveGroup || 1;
    const minWaveGroup = CONFIG.WATER_TANK_MIN_WAVE_GROUP || 1;
    if (currentWaveGroup < minWaveGroup) return; // Don't spawn until minimum wave group reached
    
    // Calculate scaled spawn chance based on wave number
    const baseChance = CONFIG.WATER_TANK_SPAWN_CHANCE || 0.005;
    const currentWave = this.gameState.wave?.number || 1;
    const wavesPerGroup = CONFIG.WAVES_PER_GROUP || 5;
    // Calculate which wave number starts the minimum wave group
    const minWaveNumber = (minWaveGroup - 1) * wavesPerGroup + 1;
    // Calculate how many waves have passed since the minimum wave group started
    const wavesSinceMin = Math.max(0, currentWave - minWaveNumber + 1);
    const scalingFactor = CONFIG.WATER_TANK_SPAWN_SCALING || 0.15;
    // Scale chance: base chance increases by scalingFactor (15%) for each wave
    let scaledChance = baseChance * (1 + wavesSinceMin * scalingFactor);
    
    // Get all valid spawn locations
    const validLocations = this.getValidSpawnLocations();
    if (validLocations.length === 0) return;
    
    // Check spawn chance (per tick, so chance is per second)
    if (Math.random() > scaledChance) return;
    
    // Pick a random location
    const randomIndex = Math.floor(Math.random() * validLocations.length);
    const location = validLocations[randomIndex];
    
    // Spawn the tank
    const tankId = this.spawnWaterTank(location.q, location.r);
    
    // Play spawn sound effect (only once per tick)
    if (tankId && window.AudioManager) {
      window.AudioManager.playSFX('water_tank_spawns');
    }
  }

  /**
   * Update all water tanks (called each game tick)
   * @param {number} deltaTime - Time elapsed in seconds
   */
  update(deltaTime) {
    // Try to spawn a new water tank (timed basis)
    this.trySpawnRandomTank();
    
    const tanksToRemove = [];
    
    // Process each water tank
    this.waterTanks.forEach(tank => {
      if (!tank.isActive) return;
      
      // Check if water tank hex is on fire and take damage
      const tankHex = this.gridSystem.getHex(tank.q, tank.r);
      if (tankHex && tankHex.isBurning) {
        // Get fire type damage per second
        const fireConfig = getFireTypeConfig(tankHex.fireType);
        const damagePerSecond = fireConfig ? fireConfig.damagePerSecond : 1;
        const damageThisTick = deltaTime * damagePerSecond;
        
        // Damage the tank
        tank.health -= damageThisTick;
        
        // Clamp health to prevent going negative
        tank.health = Math.max(0, tank.health);
        
        // Tank destroyed by fire
        if (tank.health <= 0) {
          // Play destroyed sound effect
          if (window.AudioManager) {
            window.AudioManager.playSFX('destroyed');
          }
          tanksToRemove.push(tank.id);
        }
      }
    });
    
    // Remove destroyed tanks (destroyed by fire, not exploded)
    tanksToRemove.forEach(tankId => {
      this.destroyWaterTank(tankId);
    });
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
      // Reset health if invalid
      tank.health = tank.maxHealth || CONFIG.WATER_TANK_HEALTH;
      tank.maxHealth = tank.maxHealth || CONFIG.WATER_TANK_HEALTH;
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
    
    // Mark tank as inactive
    tank.isActive = false;
    
    // Get all hexes in 2 rings (center + ring 1 + ring 2) for the explosion
    // Ring 0: center hex (1 hex)
    // Ring 1: adjacent hexes (6 hexes)
    // Ring 2: second ring (12 hexes)
    // Total: 19 hexes
    const explosionHexes = [{ q: tank.q, r: tank.r }]; // Center hex
    const ring1Hexes = getHexesInRing(tank.q, tank.r, 1); // First ring
    const ring2Hexes = getHexesInRing(tank.q, tank.r, 2); // Second ring
    explosionHexes.push(...ring1Hexes, ...ring2Hexes);
    
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
    
    // Apply damage to all hexes in explosion radius
    explosionHexes.forEach(explosionHex => {
      const hex = this.gridSystem.getHex(explosionHex.q, explosionHex.r);
      
      // Damage fires
      if (hex && hex.isBurning) {
        // Apply explosion damage to fire
        const extinguished = this.fireSystem.extinguishHex(
          explosionHex.q,
          explosionHex.r,
          CONFIG.WATER_TANK_EXPLOSION_DAMAGE
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
    });
    
    // Remove the tank from the grid and map
    this.gridSystem.removeWaterTank(tank.q, tank.r);
    this.waterTanks.delete(tankId);
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
    
    // Can't place on center town hex (0, 0)
    if (q === 0 && r === 0) {
      return false;
    }
    
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

