// Mystery Item System - Manages mystery items that spawn on the map

import { CONFIG, getFireTypeConfig } from '../config.js';
import { getNeighbors } from '../utils/hexMath.js';

let mysteryItemIdCounter = 0;

export class MysteryItemSystem {
  constructor(gridSystem, fireSystem, gameState) {
    this.gridSystem = gridSystem;
    this.fireSystem = fireSystem;
    this.gameState = gameState;
    this.items = new Map(); // Map<itemId, MysteryItemData>
  }

  /**
   * Spawn a mystery item at a location
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {string} itemId - Mystery item ID
   * @returns {string|null} Item ID or null if spawn failed
   */
  spawnMysteryItem(q, r, itemId) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex) return null;
    
    // Can't spawn on town, path, fire spawners, or if hex already has something
    if (hex.isTown || hex.isPath || hex.hasTower || hex.hasWaterTank || hex.isBurning || hex.hasFireSpawner ||
        hex.hasTempPowerUpItem || hex.hasMysteryItem || hex.hasCurrencyItem) {
      return null;
    }
    
    // Check if there's already a mystery item here
    const existingItem = Array.from(this.items.values()).find(item => item.q === q && item.r === r);
    if (existingItem) return null;
    
    const itemConfig = CONFIG.MYSTERY_ITEMS[itemId];
    if (!itemConfig) return null;
    
    const spawnedItemId = `mystery_${mysteryItemIdCounter++}`;
    
    const item = {
      id: spawnedItemId,
      q,
      r,
      itemId, // The config item ID (mystery_common, mystery_uncommon, etc.)
      health: itemConfig.health,
      maxHealth: itemConfig.health,
      isActive: true,
    };
    
    this.items.set(spawnedItemId, item);
    this.gridSystem.placeMysteryItem(q, r, spawnedItemId);
    
    return spawnedItemId;
  }

  /**
   * Get a random mystery item ID based on rarity weights (only available items)
   * @returns {string} Mystery item ID
   */
  getRandomMysteryItemId() {
    const currentWaveGroup = this.gameState.waveSystem?.currentWaveGroup || 1;
    
    // Filter to only available items
    const availableItems = Object.values(CONFIG.MYSTERY_ITEMS).filter(item => {
      const availableAtWaveGroup = item.availableAtWaveGroup || 999;
      return currentWaveGroup >= availableAtWaveGroup;
    });
    
    if (availableItems.length === 0) return null; // No items available yet
    
    const weights = CONFIG.MYSTERY_ITEM_RARITY_WEIGHTS;
    
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
   * Try to spawn a mystery item randomly during wave
   */
  trySpawnRandomItem() {
    if (!this.gameState.wave?.isActive) return; // Only spawn during active waves
    
    // Check if any items are available at current wave group
    const currentWaveGroup = this.gameState.waveSystem?.currentWaveGroup || 1;
    const availableItems = Object.values(CONFIG.MYSTERY_ITEMS).filter(item => {
      const availableAtWaveGroup = item.availableAtWaveGroup || 999;
      return currentWaveGroup >= availableAtWaveGroup;
    });
    if (availableItems.length === 0) return; // No items available yet
    
    // Find the earliest wave group when any item becomes available
    const earliestWaveGroup = Math.min(...availableItems.map(item => item.availableAtWaveGroup || 999));
    
    // Calculate scaled spawn chance based on wave number for each item type
    const currentWave = this.gameState.wave?.number || 1;
    const wavesPerGroup = CONFIG.WAVES_PER_GROUP || 5;
    const minWaveNumber = (earliestWaveGroup - 1) * wavesPerGroup + 1;
    const wavesSinceMin = Math.max(0, currentWave - minWaveNumber + 1);
    const scalingFactor = CONFIG.MYSTERY_ITEM_SPAWN_SCALING || 0.15;
    
    // Get all valid spawn locations
    const validLocations = this.getValidSpawnLocations();
    if (validLocations.length === 0) return;
    
    // Check each available item type for random spawn
    let anySpawned = false;
    availableItems.forEach(itemConfig => {
      // Calculate scaled chance for this item type
      let scaledChance = itemConfig.randomSpawnChance * (1 + wavesSinceMin * scalingFactor);
      
      // Check if we should spawn this item type
      if (Math.random() < scaledChance) {
        // Pick random location
        const randomIndex = Math.floor(Math.random() * validLocations.length);
        const location = validLocations[randomIndex];
        
        // Spawn the item
        const itemId = this.spawnMysteryItem(location.q, location.r, itemConfig.id);
        if (itemId) anySpawned = true;
      }
    });
    
    // Play spawn sound effect only once if any items spawned
    if (anySpawned && window.AudioManager) {
      window.AudioManager.playSFX('mystery_box_spawns');
    }
  }

  /**
   * Get valid spawn locations for mystery items
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
   * Damage a mystery item
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {number} damage - Amount of damage to apply
   * @returns {boolean} True if item was destroyed
   */
  damageItem(q, r, damage) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex || !hex.hasMysteryItem) return false;
    
    const itemId = hex.mysteryItemId;
    const item = this.items.get(itemId);
    if (!item || !item.isActive) return false;
    
    item.health -= damage;
    item.health = Math.max(0, item.health);
    
    // Don't destroy here - let checkCollection handle collection when health reaches 0
    return item.health <= 0;
  }

  /**
   * Collect a mystery item (extinguished by water)
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @returns {boolean} True if item was collected
   */
  collectItem(q, r) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex || !hex.hasMysteryItem) return false;
    
    const itemId = hex.mysteryItemId;
    const item = this.items.get(itemId);
    if (!item || !item.isActive) return false;
    
    const itemConfig = CONFIG.MYSTERY_ITEMS[item.itemId];
    if (!itemConfig) return false;
    
    // Get max items from config
    const maxItems = itemConfig.maxItems || 1;
    
    // Get the 7 hexes: center + 6 neighbors
    const hexes = [{ q, r }, ...getNeighbors(q, r)];
    
    // Filter to only available hexes (not already occupied)
    const availableHexes = hexes.filter(({ q: hexQ, r: hexR }) => {
      const hexData = this.gridSystem.getHex(hexQ, hexR);
      if (!hexData) return false;
      
      // Can't spawn on town, path, or if hex already has something
      if (hexData.isTown || hexData.isPath || hexData.hasTower || hexData.hasWaterTank || 
          hexData.hasTempPowerUpItem || hexData.hasMysteryItem || hexData.hasCurrencyItem) {
        return false;
      }
      
      return true;
    });
    
    // Adjust max items based on available hexes
    const actualMaxItems = Math.min(maxItems, availableHexes.length);
    
    // Randomly choose number of items between 1 and max
    const itemCount = Math.floor(Math.random() * actualMaxItems) + 1;
    
    // Spawn bonus items in the cluster using weighted drop pool
    if (this.gameState.currencyItemSystem && itemConfig.dropPool) {
      this.gameState.currencyItemSystem.spawnCurrencyItemsInCluster(q, r, itemCount, itemConfig.dropPool);
    }
    
    // Play mystery box opened sound
    if (window.AudioManager) {
      window.AudioManager.playSFX('mystery_box_opened');
    }
    
    // Bonus-item particle effect (non-player-placed: mystery boxes)
    if (this.gameState.renderer) {
      this.gameState.renderer.spawnBonusItemCollectionParticles(q, r);
    }
    
    // Remove item from map
    this.destroyItem(itemId);
    
    // Clear the isBeingSprayed flag from the hex to prevent visual glitch
    this.gridSystem.setHex(q, r, { isBeingSprayed: false });
    
    return true;
  }

  /**
   * Check if item should be collected (when health reaches 0 from water damage)
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   */
  checkCollection(q, r) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex || !hex.hasMysteryItem) return;
    
    const itemId = hex.mysteryItemId;
    const item = this.items.get(itemId);
    if (!item || !item.isActive) return;
    
    // Collect when health reaches 0
    if (item.health <= 0) {
      this.collectItem(q, r);
    }
  }

  /**
   * Destroy a mystery item
   * @param {string} itemId - Item ID
   */
  destroyItem(itemId) {
    const item = this.items.get(itemId);
    if (!item) return;
    
    item.isActive = false;
    
    // Clear the isBeingSprayed flag from the hex to prevent visual glitch
    const hex = this.gridSystem.getHex(item.q, item.r);
    if (hex) {
      this.gridSystem.setHex(item.q, item.r, { isBeingSprayed: false });
    }
    
    this.gridSystem.removeMysteryItem(item.q, item.r);
    this.items.delete(itemId);
  }

  /**
   * Update all mystery items (called each game tick)
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
            this.gameState?.renderer?.spawnFireExplosionParticles?.(item.q, item.r, 'mysteryItem');
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
   * Get all mystery items
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
      this.gridSystem.removeMysteryItem(item.q, item.r);
    });
    this.items.clear();
  }
}
