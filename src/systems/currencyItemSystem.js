// Currency Item System - Manages currency items that spawn from mystery boxes

import { CONFIG, getFireTypeConfig } from '../config.js';
import { getNeighbors } from '../utils/hexMath.js';

let currencyItemIdCounter = 0;

export class CurrencyItemSystem {
  constructor(gridSystem, fireSystem, gameState) {
    this.gridSystem = gridSystem;
    this.fireSystem = fireSystem;
    this.gameState = gameState;
    this.items = new Map(); // Map<itemId, CurrencyItemData>
  }

  /**
   * Spawn a bonus item at a location (money or movement token)
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {string} itemType - Type of item: 'money' or 'movement_token'
   * @param {number} value - Value for money items (amount of money), ignored for movement tokens
   * @returns {string|null} Item ID or null if spawn failed
   */
  spawnCurrencyItem(q, r, itemType = 'money', value = 1) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex) return null;
    
    // Can't spawn on town, path, fire spawners, or if hex already has something
    if (hex.isTown || hex.isPath || hex.hasTower || hex.hasWaterTank || hex.isBurning || hex.hasFireSpawner ||
        hex.hasTempPowerUpItem || hex.hasMysteryItem || hex.hasCurrencyItem) {
      return null;
    }
    
    // Check if there's already a currency item here
    const existingItem = Array.from(this.items.values()).find(item => item.q === q && item.r === r);
    if (existingItem) return null;
    
    const itemId = `currency_${currencyItemIdCounter++}`;
    
    const item = {
      id: itemId,
      q,
      r,
      itemType: itemType, // 'money' or 'movement_token'
      value: itemType === 'money' ? (value || 1) : null, // Only money has a value
      health: 20, // Same health as mystery boxes
      maxHealth: 20,
      isActive: true,
    };
    
    this.items.set(itemId, item);
    this.gridSystem.placeCurrencyItem(q, r, itemId);
    
    return itemId;
  }

  /**
   * Spawn multiple bonus items in a hex cluster using weighted drop pool
   * @param {number} centerQ - Center hex q coordinate
   * @param {number} centerR - Center hex r coordinate
   * @param {number} count - Number of items to spawn (1 to max)
   * @param {Array} dropPool - Array of {type, weight, minValue?, maxValue?} objects
   * @returns {number} Number of items actually spawned
   */
  spawnCurrencyItemsInCluster(centerQ, centerR, count, dropPool) {
    // Get the 7 hexes: center + 6 neighbors
    const hexes = [{ q: centerQ, r: centerR }, ...getNeighbors(centerQ, centerR)];
    
    // Filter to only available hexes
    const availableHexes = hexes.filter(({ q, r }) => {
      const hex = this.gridSystem.getHex(q, r);
      if (!hex) return false;
      
      // Can't spawn on town, path, fire spawners, or if hex already has something
      if (hex.isTown || hex.isPath || hex.hasTower || hex.hasWaterTank || hex.hasFireSpawner ||
          hex.hasTempPowerUpItem || hex.hasMysteryItem || hex.hasCurrencyItem) {
        return false;
      }
      
      return true;
    });
    
    // Limit count to available hexes
    const actualCount = Math.min(count, availableHexes.length);
    
    // Shuffle available hexes to randomize placement
    const shuffledHexes = [...availableHexes].sort(() => Math.random() - 0.5);
    
    // Calculate total weight for random selection
    const totalWeight = dropPool.reduce((sum, item) => sum + (item.weight || 1), 0);
    
    // Spawn items
    let spawned = 0;
    for (let i = 0; i < actualCount; i++) {
      const { q, r } = shuffledHexes[i];
      
      // Select item type based on weights
      let roll = Math.random() * totalWeight;
      let selectedItem = null;
      for (const poolItem of dropPool) {
        roll -= (poolItem.weight || 1);
        if (roll <= 0) {
          selectedItem = poolItem;
          break;
        }
      }
      
      // Fallback to first item if something went wrong
      if (!selectedItem) {
        selectedItem = dropPool[0];
      }
      
      let didSpawn = false;
      if (selectedItem.type === 'water_tank') {
        const tankId = this.gameState.waterTankSystem?.spawnWaterTank(q, r);
        didSpawn = !!tankId;
      } else if (selectedItem.type === 'temp_power_up') {
        const powerUpId = this.gameState.tempPowerUpItemSystem?.getRandomPowerUpId();
        if (powerUpId) {
          const itemId = this.gameState.tempPowerUpItemSystem?.spawnTempPowerUpItem(q, r, powerUpId);
          didSpawn = !!itemId;
        }
      } else {
        // money, movement_token, upgrade_plans, etc. go through currency items
        let value = 1;
        if (selectedItem.type === 'money') {
          const minValue = selectedItem.minValue || 1;
          const maxValue = selectedItem.maxValue || 25;
          value = Math.floor(Math.random() * (maxValue - minValue + 1)) + minValue;
        }
        didSpawn = !!this.spawnCurrencyItem(q, r, selectedItem.type, value);
      }
      if (didSpawn) {
        spawned++;
      }
    }
    
    return spawned;
  }

  /**
   * Damage a currency item
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @param {number} damage - Amount of damage to apply
   * @returns {boolean} True if item was destroyed
   */
  damageItem(q, r, damage) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex || !hex.hasCurrencyItem) return false;
    
    const itemId = hex.currencyItemId;
    const item = this.items.get(itemId);
    if (!item || !item.isActive) return false;
    
    item.health -= damage;
    item.health = Math.max(0, item.health);
    
    return item.health <= 0;
  }

  /**
   * Collect a bonus item (extinguished by water)
   * @param {number} q - Hex q coordinate
   * @param {number} r - Hex r coordinate
   * @returns {boolean} True if item was collected
   */
  collectItem(q, r) {
    const hex = this.gridSystem.getHex(q, r);
    if (!hex || !hex.hasCurrencyItem) return false;
    
    const itemId = hex.currencyItemId;
    const item = this.items.get(itemId);
    if (!item || !item.isActive) return false;
    
    // Play collect sound
    if (typeof window !== 'undefined' && window.AudioManager) window.AudioManager.playSFX('collect');
    
    // Award based on item type
    if (item.itemType === 'money') {
      // Award currency
      this.gameState.player.currency = (this.gameState.player.currency || 0) + item.value;
      
      // Show floating currency notification
      if (this.gameState.notificationSystem) {
        this.gameState.notificationSystem.addCurrencyNotification(q, r, item.value);
      }
    } else if (item.itemType === 'movement_token') {
      // Award movement token
      if (!this.gameState.player.movementTokens) {
        this.gameState.player.movementTokens = 0;
      }
      this.gameState.player.movementTokens += 1;
      
      // Show floating movement token notification
      if (this.gameState.notificationSystem) {
        this.gameState.notificationSystem.addMovementTokenNotification(q, r);
      }
    }
    
    // Bonus-item particle effect (non-player-placed: currency, movement tokens, etc.)
    if (this.gameState.renderer) {
      this.gameState.renderer.spawnBonusItemCollectionParticles(q, r);
    }
    
    // Update UI
    if (window.updateUI) {
      window.updateUI();
    }
    
    if (window.updateInventory) {
      window.updateInventory();
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
    if (!hex || !hex.hasCurrencyItem) return;
    
    const itemId = hex.currencyItemId;
    const item = this.items.get(itemId);
    if (!item || !item.isActive) return;
    
    // Collect when health reaches 0
    if (item.health <= 0) {
      this.collectItem(q, r);
    }
  }

  /**
   * Destroy a currency item
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
    
    this.gridSystem.removeCurrencyItem(item.q, item.r);
    this.items.delete(itemId);
  }

  /**
   * Update all currency items (called each game tick)
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
            this.gameState?.renderer?.spawnFireExplosionParticles?.(item.q, item.r, 'currencyItem');
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
  }

  /**
   * Get all currency items
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
      this.gridSystem.removeCurrencyItem(item.q, item.r);
    });
    this.items.clear();
  }
}
