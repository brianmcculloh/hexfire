// Temporary Power-up Item System - Manages temporary power-up items that spawn on the map

import { CONFIG, getFireTypeConfig } from '../config.js';
import { getNeighbors } from '../utils/hexMath.js';

let tempPowerUpItemIdCounter = 0;

export class TempPowerUpItemSystem {
  constructor(gridSystem, fireSystem, gameState) {
    this.gridSystem = gridSystem;
    this.fireSystem = fireSystem;
    this.gameState = gameState;
    this.items = new Map(); // Map<itemId, TempPowerUpItemData>
  }

  /**
   * Spawn a temporary power-up item at a location
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {string} powerUpId - Power-up ID to grant when collected
   * @returns {string|null} Item ID or null if spawn failed
   */
  spawnTempPowerUpItem(q, r, powerUpId) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex) return null;
    
    // Can't spawn on town, path, fire spawners, or if hex already has something
    if (hex.isTown || hex.isPath || hex.hasTower || hex.hasWaterTank || hex.isBurning || hex.hasFireSpawner) {
      return null;
    }
    
    // Check if there's already a temp power-up item here
    const existingItem = Array.from(this.items.values()).find(item => item.q === q && item.r === r);
    if (existingItem) return null;
    
    const itemConfig = CONFIG.TEMP_POWER_UP_ITEMS[powerUpId];
    if (!itemConfig) return null;
    
    const itemId = `temp_powerup_${tempPowerUpItemIdCounter++}`;
    
    const item = {
      id: itemId,
      q,
      r,
      powerUpId,
      health: itemConfig.health,
      maxHealth: itemConfig.health,
      isActive: true,
    };
    
    this.items.set(itemId, item);
    this.gridSystem.placeTempPowerUpItem(q, r, itemId);
    
    return itemId;
  }

  /**
   * Get a random booster ID based on rarity weights (only available boosters)
   * @returns {string} Booster ID
   */
  getRandomPowerUpId() {
    const currentWaveGroup = this.gameState.waveSystem?.currentWaveGroup || 1;
    
    // Filter to only available boosters
    const availableItems = Object.values(CONFIG.TEMP_POWER_UP_ITEMS).filter(item => {
      const availableAtWaveGroup = item.availableAtWaveGroup || 999;
      return currentWaveGroup >= availableAtWaveGroup;
    });
    
    if (availableItems.length === 0) return null; // No boosters available yet
    
    const weights = CONFIG.TEMP_POWER_UP_RARITY_WEIGHTS;
    
    // Calculate total weight
    let totalWeight = 0;
    availableItems.forEach(item => {
      totalWeight += weights[item.rarity] || 1;
    });
    
    // Random roll
    let roll = Math.random() * totalWeight;
    
    // Find which item this roll corresponds to
    for (const item of availableItems) {
      const weight = weights[item.rarity] || 1;
      roll -= weight;
      if (roll <= 0) {
        return item.id;
      }
    }
    
    // Fallback to first available item
    return availableItems[0].id;
  }

  /**
   * Try to spawn a temporary power-up item randomly
   */
  trySpawnRandomItem() {
    if (!this.gameState.wave?.isActive) return; // Only spawn during active waves
    
    // Check if any boosters are available at current wave group
    const currentWaveGroup = this.gameState.waveSystem?.currentWaveGroup || 1;
    const availableBoosters = Object.values(CONFIG.TEMP_POWER_UP_ITEMS).filter(item => {
      const availableAtWaveGroup = item.availableAtWaveGroup || 999;
      return currentWaveGroup >= availableAtWaveGroup;
    });
    if (availableBoosters.length === 0) return; // No boosters available yet
    
    // Find the earliest wave group when any booster becomes available
    const earliestWaveGroup = Math.min(...availableBoosters.map(item => item.availableAtWaveGroup || 999));
    
    // Calculate scaled spawn chance based on wave number
    const baseChance = CONFIG.TEMP_POWER_UP_SPAWN_CHANCE || 0.001;
    const currentWave = this.gameState.wave?.number || 1;
    const wavesPerGroup = CONFIG.WAVES_PER_GROUP || 5;
    // Calculate which wave number starts the earliest wave group
    const minWaveNumber = (earliestWaveGroup - 1) * wavesPerGroup + 1;
    // Calculate how many waves have passed since the earliest wave group started
    const wavesSinceMin = Math.max(0, currentWave - minWaveNumber + 1);
    const scalingFactor = CONFIG.TEMP_POWER_UP_SPAWN_SCALING || 0.15;
    // Scale chance: base chance increases by scalingFactor (15%) for each wave
    let scaledChance = baseChance * (1 + wavesSinceMin * scalingFactor);
    
    // Apply permanent power-up multiplier for temp power-up spawn chance (stacks multiplicatively)
    const powerUps = this.gameState?.player?.powerUps || {};
    const spawnBoostPowerUp = CONFIG.POWER_UPS.temp_power_up_spawn_boost;
    if (spawnBoostPowerUp && powerUps[spawnBoostPowerUp.id]) {
      const stackCount = powerUps[spawnBoostPowerUp.id] || 0;
      if (stackCount > 0) {
        const multiplier = spawnBoostPowerUp.multiplier || 1.5;
        // Apply multiplier multiplicatively for each stack (1.5^stackCount)
        const totalMultiplier = Math.pow(multiplier, stackCount);
        scaledChance *= totalMultiplier;
      }
    }
    
    // Get all valid spawn locations
    const validLocations = this.getValidSpawnLocations();
    if (validLocations.length === 0) return;
    
    // Calculate how many items to spawn based on spawn chance
    // If chance >= 1.0, spawn floor(chance) guaranteed, plus probability for fractional part
    let spawnCount = 0;
    if (scaledChance >= 1.0) {
      // Spawn guaranteed items (floor of chance)
      spawnCount = Math.floor(scaledChance);
      // Check fractional part for additional spawn
      const fractionalPart = scaledChance - spawnCount;
      if (fractionalPart > 0 && Math.random() < fractionalPart) {
        spawnCount += 1;
      }
    } else {
      // Chance < 1.0, use probability check
      if (Math.random() < scaledChance) {
        spawnCount = 1;
      }
    }
    
    // Limit spawn count to available locations
    spawnCount = Math.min(spawnCount, validLocations.length);
    
    // Spawn the items
    const locationsToUse = [...validLocations]; // Copy array to avoid modifying original
    let anySpawned = false;
    for (let i = 0; i < spawnCount; i++) {
      if (locationsToUse.length === 0) break; // No more valid locations
      
      // Pick random location from remaining valid locations
      const randomIndex = Math.floor(Math.random() * locationsToUse.length);
      const location = locationsToUse.splice(randomIndex, 1)[0]; // Remove used location
      
      // Get random booster ID based on rarity (only available boosters)
      const powerUpId = this.getRandomPowerUpId();
      if (!powerUpId) break; // No boosters available
      
      // Spawn the item
      const itemId = this.spawnTempPowerUpItem(location.q, location.r, powerUpId);
      if (itemId) anySpawned = true;
    }
    
    // Play spawn sound effect only once if any items spawned
    if (anySpawned && window.AudioManager) {
      window.AudioManager.playSFX('water_tank_spawns');
    }
  }

  /**
   * Get valid spawn locations for temporary power-up items
   * @returns {Array} Array of {q, r} coordinates
   */
  getValidSpawnLocations() {
    const validLocations = [];
    const halfSize = Math.floor(CONFIG.MAP_SIZE / 2);
    
    for (let q = -halfSize; q <= halfSize; q++) {
      for (let r = -halfSize; r <= halfSize; r++) {
        const hex = this.gridSystem.getHex(q, r);
        if (!hex) continue;
        
        // Can't spawn on town, path, fire spawners, towers, water tanks, fires, or existing items
        if (hex.isTown || hex.isPath || hex.hasTower || hex.hasWaterTank || hex.hasFireSpawner ||
            hex.isBurning || hex.hasTempPowerUpItem || hex.hasMysteryItem || hex.hasCurrencyItem ||
            this.gridSystem.isTownRingHex(q, r)) {
          continue;
        }
        
        validLocations.push({ q, r });
      }
    }
    
    return validLocations;
  }

  /**
   * Damage a temporary power-up item
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {number} damage - Amount of damage to apply
   * @returns {boolean} True if item was destroyed
   */
  damageItem(q, r, damage) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex || !hex.hasTempPowerUpItem) return false;
    
    const itemId = hex.tempPowerUpItemId;
    const item = this.items.get(itemId);
    if (!item || !item.isActive) return false;
    
    item.health -= damage;
    item.health = Math.max(0, item.health);
    
    // Don't destroy here - let checkCollection handle collection when health reaches 0
    // This allows the item to be collected (grant power-up) rather than just destroyed
    return item.health <= 0;
  }

  /**
   * Collect a temporary power-up item (extinguished by water)
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @returns {boolean} True if item was collected
   */
  collectItem(q, r) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex || !hex.hasTempPowerUpItem) return false;
    
    const itemId = hex.tempPowerUpItemId;
    const item = this.items.get(itemId);
    if (!item || !item.isActive) return false;
    
    // Grant temporary power-up
    const itemConfig = CONFIG.TEMP_POWER_UP_ITEMS[item.powerUpId];
    if (!itemConfig) return false;
    
    const duration = itemConfig.duration;
    const expiresAt = Date.now() + (duration * 1000);
    
    // Add to temporary power-ups list
    if (!this.gameState.player.tempPowerUps) {
      this.gameState.player.tempPowerUps = [];
    }
    
    this.gameState.player.tempPowerUps.push({
      powerUpId: item.powerUpId,
      expiresAt: expiresAt,
    });
    
    // Play power-up active sound
    if (window.AudioManager) {
      window.AudioManager.playSFX('power_up_active');
    }
    
    // Trigger activation animation
    if (this.gameState.renderer) {
      this.gameState.renderer.triggerPowerUpActivation(q, r, item.powerUpId);
      // Disabled: large center-screen notification (now using bottom-edge indicators instead)
      // this.gameState.renderer.triggerLargePowerUpNotification(item.powerUpId, duration);
      // Spawn water explosion particles
      this.gameState.renderer.spawnBonusItemCollectionParticles(q, r);
    }
    
    // Show notification (keep existing toast as well)
    if (this.gameState.notificationSystem) {
      const powerUpConfig = CONFIG.POWER_UPS[item.powerUpId];
      const name = powerUpConfig ? powerUpConfig.name : item.powerUpId;
      this.gameState.notificationSystem.showToast(`${name} +${duration}s!`);
    }
    
    // Remove item from map
    this.destroyItem(itemId);
    
    // Clear the isBeingSprayed flag from the hex to prevent visual glitch
    this.gridSystem.setHex(q, r, { isBeingSprayed: false });
    
    // Only update temp power-up UI, don't touch permanent power-up panel or bottom edge permanent indicators
    // This preserves permanent power-up animations
    if (window.updateTempPowerUpPanel) {
      window.updateTempPowerUpPanel();
    }
    if (window.updateBottomEdgePowerUps) {
      window.updateBottomEdgePowerUps(true); // Only update temp section, preserve permanent power-ups
    }
    
    return true;
  }

  /**
   * Check if item should be collected (when health reaches 0 from water damage)
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   */
  checkCollection(q, r) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex || !hex.hasTempPowerUpItem) return;
    
    const itemId = hex.tempPowerUpItemId;
    const item = this.items.get(itemId);
    if (!item || !item.isActive) return;
    
    // Collect when health reaches 0
    if (item.health <= 0) {
      this.collectItem(q, r);
    }
  }

  /**
   * Destroy a temporary power-up item
   * @param {string} itemId - Item ID
   */
  destroyItem(itemId) {
    const item = this.items.get(itemId);
    if (!item) return;
    
    item.isActive = false;
    
    // No fire explosion particles for temp power-ups (they just disappear when destroyed by fire)
    // Water explosion particles are used when collected (handled in collectItem)
    
    // Clear the isBeingSprayed flag from the hex to prevent visual glitch
    const hex = this.gridSystem.getHex(item.q, item.r);
    if (hex) {
      this.gridSystem.setHex(item.q, item.r, { isBeingSprayed: false });
    }
    
    this.gridSystem.removeTempPowerUpItem(item.q, item.r);
    this.items.delete(itemId);
  }

  /**
   * Update all temporary power-up items (called each game tick)
   * @param {number} deltaTime - Time elapsed in seconds
   */
  update(deltaTime) {
    // Check for items destroyed by fire
    const itemsToRemove = [];
    
    this.items.forEach(item => {
      if (!item.isActive) return;
      
      // Check if item hex is on fire and take damage
      const itemHex = this.gridSystem.getHex(item.q, item.r);
      if (itemHex && itemHex.isBurning) {
        // Get fire type damage per second
        const fireConfig = getFireTypeConfig(itemHex.fireType);
        const damagePerSecond = fireConfig ? fireConfig.damagePerSecond : 1;
        const damageThisTick = deltaTime * damagePerSecond;
        
        // Damage the item
        item.health -= damageThisTick;
        item.health = Math.max(0, item.health);
        
        // Item destroyed by fire
        if (item.health <= 0) {
          try {
            this.gameState?.renderer?.spawnFireExplosionParticles?.(item.q, item.r, 'tempPowerUp');
          } catch (e) {
            // ignore render side errors
          }
          // Play destroyed sound effect
          if (window.AudioManager) {
            window.AudioManager.playSFX('destroyed');
          }
          itemsToRemove.push(item.id);
        }
      }
    });
    
    // Remove destroyed items
    itemsToRemove.forEach(itemId => {
      this.destroyItem(itemId);
    });
    
    // Try to spawn new items
    this.trySpawnRandomItem();
  }

  /**
   * Get all temporary power-up items
   * @returns {Array} Array of item data
   */
  getAllItems() {
    return Array.from(this.items.values());
  }

  /**
   * Get an item by ID
   * @param {string} itemId - Item ID
   * @returns {Object|null} Item data or null
   */
  getItem(itemId) {
    return this.items.get(itemId) || null;
  }

  /**
   * Get item at specific hex coordinates
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @returns {Object|null} Item data or null
   */
  getItemAt(q, r) {
    for (const item of this.items.values()) {
      if (item.q === q && item.r === r && item.isActive) {
        return item;
      }
    }
    return null;
  }

  /**
   * Clear all items
   */
  clearAllItems() {
    this.items.forEach(item => {
      this.gridSystem.removeTempPowerUpItem(item.q, item.r);
    });
    this.items.clear();
  }
}

